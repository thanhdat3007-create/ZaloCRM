// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * rocket-http-client.ts — gọi cổng OpenAI-compatible của Rocket Agent
 * (`hermes-agent`, chạy local, `http://127.0.0.1:8642`). Một trong hai đường vận chuyển;
 * đường còn lại là `rocket-cli-client.ts`, chọn bằng `ROCKET_AGENT_TRANSPORT`
 * (dispatcher: `rocket-agent-client.ts`).
 *
 * Dùng `fetch` thuần thay vì Vercel AI SDK: `api_server` của Hermes KHÔNG đọc
 * `response_format` (đã grep xác nhận trong source 5693 dòng, 0 kết quả) — schema
 * gửi xuống bị bỏ qua im lặng, nên `generateObject` luôn parse fail. Bỏ structured
 * output thì AI SDK hết giá trị ở đường này; `fetch` thuần = 0 dependency mới, tự
 * kiểm soát được timeout riêng cho engine này và phân loại lỗi rõ ràng cho tầng
 * fallback phía trên (agent-runner.ts).
 */
import { config } from '../../config/index.js';
import { resolveRocketEndpoint } from './rocket-profile-store.js';
import {
  RocketAgentError,
  type RocketCallInput,
  type RocketProbeResult,
  type RocketReply,
} from './rocket-types.js';

/**
 * Host được phép gọi tới. Rocket dispatch agent có tool quyền hệ thống (đọc file, chạy
 * terminal…) — trỏ địa chỉ ra domain public là remote code execution, không phải lỗi cấu
 * hình vô hại. Chốt chặn này đứng độc lập với việc Rocket có bind đúng hay không.
 *
 * `host.docker.internal` nằm trong danh sách vì backend chạy trong container: 127.0.0.1
 * lúc đó là chính container, còn tên này là bí danh Docker cấp cho MÁY HOST — vẫn là
 * "cùng máy", không mở ra mạng ngoài.
 */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** @throws RocketAgentError('no_base_url') nếu URL sai định dạng hoặc trỏ ra ngoài máy. */
function assertLocalBaseUrl(rawBaseUrl: string): string {
  const trimmed = trimTrailingSlash(rawBaseUrl.trim());
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new RocketAgentError(`Địa chỉ Rocket không phải URL hợp lệ: "${rawBaseUrl}".`, 'no_base_url');
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new RocketAgentError(
      `Địa chỉ Rocket phải nằm trên cùng máy (127.0.0.1 / localhost / ::1 / host.docker.internal), ` +
        `nhận được host "${parsed.hostname}". Rocket Agent chạy tool có quyền hệ thống — trỏ ra ` +
        `ngoài là lỗ hổng remote-code-execution, không được phép. Sửa ROCKET_AGENT_HOST / ` +
        `ROCKET_AGENT_BASE_URL trong .env.`,
      'no_base_url',
    );
  }
  return trimmed;
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Không gắn header Authorization khi key rỗng — Rocket vẫn từ chối (guard riêng phía
  // server), nhưng gửi "Bearer undefined"/"Bearer " chỉ làm log rối thêm.
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/**
 * Gộp mọi lỗi `fetch` (network refused, DNS, abort do timeout…) thành `RocketAgentError`
 * có `kind` — tầng fallback phía trên (agent-runner) quyết theo `kind`, không theo message
 * tự do. `AbortSignal.timeout()` ném `TimeoutError`/`AbortError` tuỳ runtime, gộp cả hai.
 */
function toRocketError(err: unknown): RocketAgentError {
  if (err instanceof RocketAgentError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new RocketAgentError(
      'Rocket Agent không phản hồi trong thời gian chờ (timeout).',
      'timeout',
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new RocketAgentError(`Không kết nối được tới Rocket Agent: ${message}`, 'connection');
}

/**
 * Gọi 1 lượt chat text thuần tới Rocket Agent. KHÔNG dùng session (`X-Hermes-Session-Id`)
 * — ZaloCRM tự gửi lại lịch sử hội thoại mỗi lượt (prompt-builder.ts), bật session Hermes
 * sẽ tạo 2 nguồn lịch sử lệch nhau. KHÔNG cắt độ dài `text` — `MAX_REPLY_CHARS` là việc
 * của agent-runner, client này chỉ chuyển tiếp nguyên văn.
 */
export async function callRocketAgentHttp(input: RocketCallInput): Promise<RocketReply> {
  // Mỗi profile Rocket là một api_server RIÊNG trên một cổng riêng — không có gateway đa
  // profile định tuyến theo path, nên tên profile phải được giải thành cổng + khoá của
  // chính nó trước khi gọi (rocket-profile-store.ts).
  const endpoint = await resolveRocketEndpoint(input.profile);
  if (!endpoint.ok) throw new RocketAgentError(endpoint.message, 'no_base_url');

  const baseUrl = assertLocalBaseUrl(endpoint.baseUrl);
  const model = input.model.trim();
  const url = `${baseUrl}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    stream: false,
    messages: [{ role: 'system', content: input.system }, ...input.messages],
  };
  // model rỗng → bỏ hẳn field khỏi body để Rocket tự dùng model_name mặc định của
  // api_server, thay vì gửi model: "" khiến gateway hiểu nhầm là alias không tồn tại.
  if (model) body.model = model;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(endpoint.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.timeoutMs ?? config.rocketAgentTimeoutMs),
    });
  } catch (err) {
    throw toRocketError(err);
  }

  if (!res.ok) {
    // Đọc body lỗi tốt-nỗ-lực để log rõ hơn — không throw thêm nếu bản thân việc đọc fail.
    const detail = await res.text().catch(() => '');
    throw new RocketAgentError(
      `Rocket Agent trả về HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
      'http',
      res.status,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const text = (json.choices?.[0]?.message?.content ?? '').trim();
  if (!text) {
    throw new RocketAgentError('Rocket Agent trả về nội dung rỗng.', 'empty');
  }

  return {
    text,
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
    model: json.model || model,
  };
}

/**
 * Dò xem gateway Rocket có sống và profile có tồn tại không — dùng cho nút "Kiểm tra
 * kết nối" trên UI. Chủ động để admin biết TRƯỚC khi khách nhắn tin, thay vì phát hiện
 * qua AiAgentRun.status = 'failed' sau khi khách đã bị im lặng.
 */
export async function probeRocketAgentHttp(profile: string | null): Promise<RocketProbeResult> {
  const trimmedProfile = profile?.trim() || '';

  // Profile tồn tại nhưng chưa bật api_server là ca thường gặp nhất (Rocket tạo profile
  // KHÔNG kèm cổng HTTP) — bắt ở đây để báo đúng việc phải làm, thay vì để nó biến thành
  // một lỗi mạng khó hiểu.
  const endpoint = await resolveRocketEndpoint(trimmedProfile || null);
  if (!endpoint.ok) {
    return { ok: false, status: 'unknown_profile', message: endpoint.message, models: [] };
  }

  let baseUrl: string;
  try {
    baseUrl = assertLocalBaseUrl(endpoint.baseUrl);
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      message: err instanceof RocketAgentError ? err.message : 'Cấu hình địa chỉ Rocket không hợp lệ.',
      models: [],
    };
  }

  const url = `${baseUrl}/v1/models`;

  let res: Response;
  try {
    // Timeout ngắn: đây là nút bấm tương tác trên UI, admin không nên chờ 90s để biết
    // gateway có sống không.
    res = await fetch(url, { headers: buildHeaders(endpoint.apiKey), signal: AbortSignal.timeout(5000) });
  } catch {
    return {
      ok: false,
      status: 'unreachable',
      message:
        `Không kết nối được tới ${baseUrl}. Gateway của profile này chưa chạy — bật bằng: ` +
        `hermes gateway start${trimmedProfile ? ` (profile ${trimmedProfile})` : ''}`,
      models: [],
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      status: 'unknown_profile',
      message:
        `${baseUrl} có phản hồi nhưng không phải cổng OpenAI-compatible của Rocket ` +
        '(không có /v1/models). Kiểm tra platforms.api_server.extra.port trong config.yaml ' +
        'của profile có đúng cổng này không.',
      models: [],
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      status: 'unauthorized',
      message: endpoint.source === 'profile'
        ? `Gateway từ chối khoá của profile "${trimmedProfile}" — khoá trong config.yaml ` +
          '(platforms.api_server.extra.key) có thể đã đổi sau khi gateway khởi động. Chạy lại: hermes gateway restart'
        : 'Sai ROCKET_AGENT_API_KEY trong .env — không khớp key của api_server bên Rocket.',
      models: [],
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: 'error',
      message: `Rocket Agent trả về HTTP ${res.status}.`,
      models: [],
    };
  }

  try {
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { ok: true, status: 'ok', message: 'Kết nối Rocket Agent thành công.', models };
  } catch {
    return {
      ok: false,
      status: 'error',
      message: 'Rocket Agent trả về dữ liệu không đọc được (không phải JSON hợp lệ).',
      models: [],
    };
  }
}
