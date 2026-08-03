// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * agent-runner.ts — gọi model sinh câu trả lời.
 *
 * Hai engine, một hợp đồng chung (`AgentReply`):
 *   - openrouter: `generateObject` ép model trả cấu trúc {reply, handoff, handoffReason}
 *     — nếu chỉ nhận text tự do thì không có cách nào phân biệt "trả lời được" với
 *     "không biết nên bịa đại".
 *   - rocket: gửi text thuần tới hermes-agent (`rocket-agent-client.ts` chọn CLI hay cổng
 *     HTTP theo ROCKET_AGENT_TRANSPORT). KHÔNG dùng schema — api_server của Hermes không
 *     đọc response_format nên generateObject luôn parse fail ở đường này. KHÔNG có cờ handoff do model tự quyết (quyết định #2 kiến
 *     trúc) — cấu hình binding/handoffKeywords mới là nơi quyết ai xử lý hội thoại.
 *
 * Vòng dự phòng (fallback) sâu ĐÚNG 1 CẤP: engine chính lỗi → thử engine dự phòng nếu
 * agent có cấu hình `fallbackProvider` + `fallbackModel`. Kích hoạt với MỌI lỗi của
 * engine chính, kể cả lỗi cấu hình (sai profile, sai key) — khách không được bỏ rơi vì
 * lỗi cấu hình phía admin. Lỗi gốc luôn giữ lại trong `AgentReply.primaryError` để
 * worker ghi vào AiAgentRun.error — không có cờ này thì Rocket có thể chết cả tuần mà
 * chỉ thấy hoá đơn OpenRouter tăng, không ai biết vì sao.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import type { AiAgent } from '@prisma/client';
import type { ModelMessage } from 'ai';
import { logger } from '../../shared/utils/logger.js';
import { resolveAgentModel } from './ai-sdk-model.js';
import { callRocketAgent, RocketAgentError, type RocketChatMessage } from './rocket-agent-client.js';
import { AiAgentConfigError } from './ai-agent-errors.js';
import type { BuiltPrompt } from './prompt-builder.js';

/** Timeout 1 lượt gọi model openrouter. Khách đợi lâu hơn ngần này là hỏng trải nghiệm.
 * Rocket dùng timeout riêng, dài hơn nhiều (config.rocketAgentTimeoutMs, mặc định 90s)
 * — agent Rocket chạy vòng lặp có tool, không so sánh được với 1 lượt sinh text thuần.
 *
 * 45s chứ không phải 20s như trước: model reasoning (deepseek-v4-flash, gpt-5, o-series…)
 * nghĩ xong mới xuất JSON, đo thực tế 18-32s cho một câu trả lời 3 dòng. Trần 20s cắt
 * ngay giữa lượt nghĩ → retry → tốn gấp đôi tiền VÀ gấp đôi thời gian chờ, tệ hơn hẳn so
 * với chờ thẳng một lượt. Model không reasoning vẫn trả trong 2-5s nên trần cao không
 * làm chúng chậm đi. */
const GENERATE_TIMEOUT_MS = 45_000;
/** Tin Zalo dài bất thường là dấu hiệu model loạn → cắt cứng, áp dụng cho cả 2 engine. */
const MAX_REPLY_CHARS = 1500;

/**
 * Mô tả các field là chỗ model đọc để quyết định — phải khớp với quy tắc cứng trong
 * prompt-builder.ts, nếu không model nghe schema và bỏ prompt.
 *
 * `handoff` cố ý mô tả HẸP: bật cờ này là khách KHÔNG nhận được tin nào cả (worker bỏ
 * hẳn `reply`, tạm dừng hội thoại, báo nhân viên). Mô tả cũ "không đủ thông tin để trả
 * lời" khiến model bàn giao mọi câu hỏi nằm ngoài tài liệu — kể cả lời chào — nên agent
 * chưa gắn tài liệu thì im lặng 100%. Câu hỏi ngoài tài liệu đã có lối xử lý riêng ở quy
 * tắc #4 (trả lời là sẽ kiểm tra lại rồi báo sau), KHÔNG phải lý do bàn giao.
 */
const ReplySchema = z.object({
  reply: z
    .string()
    .describe(
      'Câu trả lời gửi cho khách. LUÔN phải có nội dung — kể cả khi chưa đủ thông tin ' +
        '(trả lời là sẽ kiểm tra lại rồi báo sau) hoặc khi handoff=true (câu giữ chân khách).',
    ),
  handoff: z
    .boolean()
    .describe(
      'CHỈ true khi bắt buộc cần nhân viên thật: khách đòi gặp người thật, khiếu nại/bức xúc, ' +
        'hoặc việc vượt quyền quyết định (giảm giá, hoàn tiền, ngoại lệ hợp đồng). ' +
        'Câu hỏi nằm ngoài tài liệu KHÔNG phải lý do bàn giao — cứ trả lời là sẽ kiểm tra lại.',
    ),
  handoffReason: z.string().optional().describe('Lý do ngắn gọn cần chuyển nhân viên.'),
});

export interface AgentReply {
  reply: string;
  handoff: boolean;
  handoffReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  /** Model thực sự đã trả lời (khác agent.model khi rơi sang fallback). */
  usedModel: string;
  fallbackUsed: boolean;
  /** Thông điệp lỗi của engine chính khi lượt này rơi sang fallback; null khi không fallback. */
  primaryError: string | null;
}

/**
 * Lỗi cuối cùng khi engine chính là rocket, nguyên nhân là TIMEOUT, và không có (hoặc
 * không cứu được) fallback. `agent-reply-queue.ts` bắt riêng lớp này để chặn BullMQ retry:
 * Rocket timeout mặc định 90s, retry thêm 1 lần + backoff 5s tốn gần 3 phút vô ích, trong
 * khi agent Rocket chạy tool có side effect — chạy lại tự động có thể lặp hành động đã
 * làm ở lượt trước (gửi mail, ghi CRM…). `message` vẫn giữ đủ nội dung lỗi gốc (và lỗi
 * fallback nếu có) để ghi vào AiAgentRun.error như bình thường.
 */
export class RocketTimeoutExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RocketTimeoutExhaustedError';
  }
}

function isRetryable(err: unknown): boolean {
  const status = (err as { statusCode?: number; status?: number })?.statusCode
    ?? (err as { status?: number })?.status;
  // 4xx = cấu hình/quyền sai, retry vô ích. 5xx + lỗi mạng thì thử lại 1 lần.
  if (typeof status === 'number') return status >= 500;
  return true;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Điều kiện coi là đã bật dự phòng, khác nhau theo provider:
 *   - openrouter: phải có model. Không có model thì không gọi được gì.
 *   - rocket: model KHÔNG bắt buộc — bỏ trống là dùng `model_name` mặc định trong
 *     api_server của Hermes (giống engine chính).
 * Nếu đòi model cho cả hai thì cấu hình "dự phòng = Rocket, model để trống" — thứ giao
 * diện cho phép nhập — sẽ bị tắt âm thầm: admin tưởng có lưới an toàn mà thực ra không có.
 */
function hasFallbackConfigured(agent: AiAgent): boolean {
  const provider = agent.fallbackProvider?.trim();
  if (!provider) return false;
  if (provider === 'rocket') return true;
  return !!agent.fallbackModel?.trim();
}

/**
 * Map lịch sử của BuiltPrompt sang định dạng Rocket. Trong dự án này prompt-builder chỉ
 * sinh message role 'user'/'assistant' với content luôn là string — bỏ qua role khác để
 * an toàn kiểu, dù thực tế nhánh này không xảy ra.
 */
function toRocketMessages(messages: ModelMessage[]): RocketChatMessage[] {
  const out: RocketChatMessage[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    out.push({ role: m.role, content: String(m.content) });
  }
  return out;
}

/**
 * Engine OpenRouter — `generateObject` ép schema {reply, handoff, handoffReason}.
 * `modelId` tách riêng khỏi `agent.model` để vòng fallback gọi được model KHÁC (fallback
 * dùng `agent.fallbackModel`) mà không phải đọc lại field theo provider hiện tại.
 * Provider luôn hardcode 'openrouter' khi resolve key — hàm này CHÍNH LÀ engine
 * openrouter dù đang chạy vai trò chính hay dự phòng, `agent.provider` (provider của
 * ENGINE CHÍNH) không liên quan ở đây.
 */
async function runOpenRouterEngine(
  orgId: string,
  agent: AiAgent,
  prompt: BuiltPrompt,
  modelId: string,
): Promise<AgentReply> {
  const model = await resolveAgentModel(orgId, 'openrouter', modelId);
  const startedAt = Date.now();

  const call = () =>
    generateObject({
      model,
      schema: ReplySchema,
      system: prompt.system,
      messages: prompt.messages,
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokens,
      abortSignal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });

  let result: Awaited<ReturnType<typeof call>>;
  try {
    result = await call();
  } catch (err) {
    // Retry CHỈ áp dụng cho openrouter: 1 lượt sinh text không có side effect ngoài hệ
    // thống, gọi lại an toàn khi lỗi tạm thời (mạng, 5xx). Engine rocket KHÔNG có bước
    // này — xem runRocketEngine.
    if (!isRetryable(err)) throw err;
    logger.warn('[ai-agent-runner] gọi model lỗi, thử lại 1 lần: %s', (err as Error).message);
    result = await call();
  }

  const latencyMs = Date.now() - startedAt;
  const object = result.object;
  const reply = (object.reply ?? '').trim().slice(0, MAX_REPLY_CHARS);
  // Reply rỗng mà model không tự đặt cờ → vẫn coi là handoff, tuyệt đối không
  // gửi tin trắng cho khách.
  const handoff = object.handoff || reply.length === 0;

  return {
    reply,
    handoff,
    handoffReason: object.handoffReason?.trim() || (handoff ? 'Không đủ thông tin để trả lời' : null),
    promptTokens: result.usage?.inputTokens ?? null,
    completionTokens: result.usage?.outputTokens ?? null,
    latencyMs,
    usedModel: modelId,
    fallbackUsed: false,
    primaryError: null,
  };
}

/**
 * Engine Rocket — gửi text thuần tới hermes-agent qua profile của agent (quyết định #4
 * kiến trúc: 1 AiAgent ↔ 1 rocketProfile cố định, không có khái niệm "profile dự phòng"
 * riêng). Vì vậy hàm này LUÔN dùng `agent.rocketProfile` + `agent.model`, kể cả khi được
 * gọi ở vai trò fallback — schema DB không có cột fallback riêng cho rocket
 * (`fallbackModel` chỉ có ý nghĩa khi `fallbackProvider` là 'openrouter', trường hợp
 * fallback='rocket' vẫn chạy được về mặt code nhưng hiếm dùng, đúng brief).
 *
 * KHÔNG retry: agent Rocket chạy vòng lặp có tool (đọc skill, tra memory, gọi terminal)
 * — chạy lại lượt hỏng có thể lặp hành động đã làm (side effect), khác hẳn 1 lượt sinh
 * text thuần của openrouter.
 */
async function runRocketEngine(agent: AiAgent, prompt: BuiltPrompt): Promise<AgentReply> {
  const startedAt = Date.now();
  const rocketReply = await callRocketAgent({
    profile: agent.rocketProfile,
    model: agent.model,
    system: prompt.system,
    messages: toRocketMessages(prompt.messages),
  });
  const latencyMs = Date.now() - startedAt;

  return {
    // callRocketAgent đã ném RocketAgentError(kind:'empty') nếu content rỗng — tới đây
    // chắc chắn có nội dung, chỉ còn việc cắt trần độ dài dùng chung với openrouter.
    reply: rocketReply.text.slice(0, MAX_REPLY_CHARS),
    handoff: false,
    handoffReason: null,
    promptTokens: rocketReply.promptTokens,
    completionTokens: rocketReply.completionTokens,
    latencyMs,
    usedModel: rocketReply.model,
    fallbackUsed: false,
    primaryError: null,
  };
}

/** Chọn + chạy 1 engine theo tên provider. Dùng chung cho lượt chính lẫn lượt dự phòng. */
function runEngine(
  orgId: string,
  agent: AiAgent,
  prompt: BuiltPrompt,
  provider: string,
  modelId: string,
): Promise<AgentReply> {
  if (provider === 'rocket') return runRocketEngine(agent, prompt);
  if (provider === 'openrouter') return runOpenRouterEngine(orgId, agent, prompt, modelId);
  return Promise.reject(new AiAgentConfigError(`Provider agent không hỗ trợ: "${provider}".`, 'no_api_key'));
}

/**
 * Quyết định object lỗi cuối cùng ném ra khỏi generateAgentReply.
 *   - Engine chính là rocket + lỗi gốc là timeout → bọc RocketTimeoutExhaustedError,
 *     giữ nguyên message của `toThrow` (đã gộp lỗi fallback nếu có).
 *   - Còn lại → ném nguyên `toThrow`, giữ đúng instance/stack gốc — quan trọng nhất khi
 *     `toThrow` là AiAgentConfigError: worker (agent-reply-worker.ts) dựa vào
 *     `instanceof AiAgentConfigError` để ghi 'skipped' thay vì 'failed' + retry.
 */
function toFinalError(agent: AiAgent, primaryErr: unknown, toThrow: unknown): unknown {
  if (agent.provider === 'rocket' && primaryErr instanceof RocketAgentError && primaryErr.kind === 'timeout') {
    return new RocketTimeoutExhaustedError(describeError(toThrow));
  }
  return toThrow;
}

export async function generateAgentReply(
  orgId: string,
  agent: AiAgent,
  prompt: BuiltPrompt,
): Promise<AgentReply> {
  try {
    return await runEngine(orgId, agent, prompt, agent.provider, agent.model);
  } catch (primaryErr) {
    if (!hasFallbackConfigured(agent)) {
      throw toFinalError(agent, primaryErr, primaryErr);
    }

    const primaryMessage = describeError(primaryErr);
    try {
      const fallbackReply = await runEngine(
        orgId,
        agent,
        prompt,
        agent.fallbackProvider!,
        agent.fallbackModel!,
      );
      return { ...fallbackReply, fallbackUsed: true, primaryError: primaryMessage };
    } catch (fallbackErr) {
      if (fallbackErr instanceof AiAgentConfigError) {
        // Dự phòng KHÔNG khả dụng (thường là org chưa nhập API key OpenRouter) — coi
        // như chưa cấu hình fallback: giữ nguyên lỗi GỐC của engine chính, đừng nuốt
        // thành lỗi cấu hình khiến worker bỏ qua nhầm một lượt lỗi thật sự tạm thời.
        throw toFinalError(agent, primaryErr, primaryErr);
      }
      const combined = new Error(
        `Engine chính (${agent.provider}) lỗi: ${primaryMessage}. ` +
          `Engine dự phòng (${agent.fallbackProvider}) cũng lỗi: ${describeError(fallbackErr)}`,
      );
      throw toFinalError(agent, primaryErr, combined);
    }
  }
}

export const __testing = {
  ReplySchema,
  isRetryable,
  MAX_REPLY_CHARS,
  GENERATE_TIMEOUT_MS,
  hasFallbackConfigured,
  toRocketMessages,
  runOpenRouterEngine,
  runRocketEngine,
  runEngine,
  toFinalError,
};
