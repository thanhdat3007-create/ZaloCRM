// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * ai-agent-routes.ts — CRUD agent, gán tài liệu, gán agent theo nick/nhóm,
 * chạy thử, nhật ký, tạm dừng theo hội thoại.
 *
 * Quyền theo pattern ai-routes.ts: resource 'settings' cho phần cấu hình.
 * Nhật ký (`/runs`) và nút tạm dừng mở cho cả sale (resource 'contact') vì đó là
 * thao tác vận hành hằng ngày trên hội thoại họ đang chăm.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { AiAgentConfigError } from './ai-agent-errors.js';
import { invalidateBindingCache } from './binding-resolver.js';
import { linkDocumentsToAgent, listAgentDocumentIds } from './document-service.js';
import { buildAgentPrompt } from './prompt-builder.js';
import { generateAgentReply } from './agent-runner.js';
import { simulateAgentTurn, type SimulateTurn } from './agent-simulator.js';
import { pauseConversation, resumeConversation, getPauseReason } from './conversation-pause-store.js';
import { AGENT_PROVIDERS, isAgentProvider } from './ai-sdk-model.js';
import { probeRocketAgent } from './rocket-agent-client.js';
import { isValidRocketProfileFormat, listRocketProfiles } from './rocket-profile.js';

const BINDING_SCOPES = ['contact', 'group', 'account_group', 'account_dm'] as const;
const GROUP_TRIGGER_MODES = ['mention', 'keyword', 'mention_or_keyword'] as const;

type AgentBody = {
  name?: string;
  description?: string | null;
  provider?: string;
  model?: string;
  /** Tên profile Hermes khi provider = 'rocket'. Rỗng/null = profile default. */
  rocketProfile?: string | null;
  /** Engine dự phòng khi engine chính lỗi. Rỗng/null = không dự phòng. */
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  enabled?: boolean;
  replyDelayMinMs?: number;
  replyDelayMaxMs?: number;
  maxRepliesPerDay?: number;
  maxRepliesPerConversationDay?: number;
  pauseAfterHumanReplyMinutes?: number;
  handoffKeywords?: string[];
  skipNoisePattern?: string;
};

/**
 * Validate các field mới trước khi ghi — chạy TRƯỚC sanitizeAgentBody vì sanitize chỉ lo
 * trim/mặc định, không từ chối giá trị sai. Trả về thông báo lỗi tiếng Việt, null nếu hợp lệ.
 */
function validateAgentBody(body: AgentBody): string | null {
  if (body.provider !== undefined && !isAgentProvider(body.provider.trim())) {
    return `Provider không hợp lệ, chỉ hỗ trợ: ${AGENT_PROVIDERS.join(', ')}.`;
  }
  if (body.rocketProfile !== undefined) {
    const trimmed = body.rocketProfile?.trim() ?? '';
    if (trimmed && !isValidRocketProfileFormat(trimmed)) {
      return 'Tên profile Rocket không hợp lệ — chỉ chữ thường, số, "-", "_", bắt đầu bằng chữ ' +
        'thường hoặc số, tối đa 64 ký tự, không khoảng trắng.';
    }
  }
  if (body.fallbackProvider !== undefined) {
    const trimmed = body.fallbackProvider?.trim() ?? '';
    if (trimmed) {
      if (!isAgentProvider(trimmed))
        return `Provider dự phòng không hợp lệ, chỉ hỗ trợ: ${AGENT_PROVIDERS.join(', ')}.`;
      // Rocket cho phép model rỗng (dùng model_name mặc định của gateway) — mọi provider
      // khác bắt buộc phải điền model dự phòng, không thì lượt fallback sẽ lỗi cấu hình.
      if (trimmed !== 'rocket' && !body.fallbackModel?.trim())
        return 'Đã chọn provider dự phòng thì phải nhập model dự phòng.';
    }
  }
  return null;
}

/** Chỉ nhận field hợp lệ + kẹp giá trị vào khoảng an toàn (chống nick bị khoá). */
function sanitizeAgentBody(body: AgentBody) {
  const data: Prisma.AiAgentUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.provider !== undefined) data.provider = body.provider.trim();
  if (body.model !== undefined) data.model = body.model.trim();
  if (body.rocketProfile !== undefined) data.rocketProfile = body.rocketProfile?.trim() || null;
  if (body.fallbackProvider !== undefined) data.fallbackProvider = body.fallbackProvider?.trim() || null;
  if (body.fallbackModel !== undefined) data.fallbackModel = body.fallbackModel?.trim() || null;
  if (body.systemPrompt !== undefined) data.systemPrompt = body.systemPrompt;
  if (body.temperature !== undefined) data.temperature = Math.min(2, Math.max(0, body.temperature));
  if (body.maxTokens !== undefined) data.maxTokens = Math.min(4000, Math.max(50, Math.round(body.maxTokens)));
  if (body.enabled !== undefined) data.enabled = !!body.enabled;
  // Độ trễ tối thiểu 1s: gửi tức thì là dấu hiệu bot rõ nhất với Zalo.
  if (body.replyDelayMinMs !== undefined)
    data.replyDelayMinMs = Math.min(600_000, Math.max(1000, Math.round(body.replyDelayMinMs)));
  if (body.replyDelayMaxMs !== undefined)
    data.replyDelayMaxMs = Math.min(600_000, Math.max(1000, Math.round(body.replyDelayMaxMs)));
  if (body.maxRepliesPerDay !== undefined)
    data.maxRepliesPerDay = Math.min(5000, Math.max(0, Math.round(body.maxRepliesPerDay)));
  if (body.maxRepliesPerConversationDay !== undefined)
    data.maxRepliesPerConversationDay = Math.min(500, Math.max(0, Math.round(body.maxRepliesPerConversationDay)));
  if (body.pauseAfterHumanReplyMinutes !== undefined)
    data.pauseAfterHumanReplyMinutes = Math.min(1440, Math.max(0, Math.round(body.pauseAfterHumanReplyMinutes)));
  if (body.handoffKeywords !== undefined)
    data.handoffKeywords = body.handoffKeywords.map((k) => String(k).trim()).filter(Boolean);
  if (body.skipNoisePattern !== undefined) data.skipNoisePattern = body.skipNoisePattern;
  return data;
}

/** Regex do người dùng nhập phải compile được, nếu không gate sẽ luôn fail-open. */
function invalidRegex(pattern: string | undefined): boolean {
  if (pattern === undefined) return false;
  try {
    new RegExp(pattern, 'i');
    return false;
  } catch {
    return true;
  }
}

export async function aiAgentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/ai-agents',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest) => {
      const items = await prisma.aiAgent.findMany({
        where: { orgId: request.user!.orgId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { bindings: true, documents: true } } },
      });
      return { items };
    },
  );

  app.post(
    '/api/v1/ai-agents',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as AgentBody;
      if (!body.name?.trim()) return reply.status(400).send({ error: 'Thiếu tên agent' });
      // model được để trống khi provider = rocket — Rocket dùng model_name mặc định
      // cấu hình sẵn trong gateway của nó (quyết định #9 kiến trúc). openrouter vẫn
      // bắt buộc phải chọn model vì không có cấu hình mặc định phía nào khác bù vào.
      const effectiveProvider = body.provider?.trim() || 'openrouter';
      if (effectiveProvider !== 'rocket' && !body.model?.trim())
        return reply.status(400).send({ error: 'Chưa chọn model' });
      if (!body.systemPrompt?.trim()) return reply.status(400).send({ error: 'Thiếu system prompt' });
      if (invalidRegex(body.skipNoisePattern))
        return reply.status(400).send({ error: 'Regex bỏ qua tin rác không hợp lệ' });
      const bodyError = validateAgentBody(body);
      if (bodyError) return reply.status(400).send({ error: bodyError });

      const data = sanitizeAgentBody(body);
      try {
        const agent = await prisma.aiAgent.create({
          data: {
            orgId: request.user!.orgId,
            name: String(data.name),
            // model có thể vắng mặt khi provider = rocket (xem check phía trên) —
            // sanitizeAgentBody chỉ set field khi body.model !== undefined.
            model: typeof data.model === 'string' ? data.model : '',
            systemPrompt: String(data.systemPrompt),
            ...data,
          } as Prisma.AiAgentUncheckedCreateInput,
        });
        invalidateBindingCache();
        return reply.status(201).send(agent);
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002')
          return reply.status(409).send({ error: 'Đã có agent trùng tên' });
        throw err;
      }
    },
  );

  app.get(
    '/api/v1/ai-agents/:id',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const agent = await prisma.aiAgent.findFirst({ where: { id, orgId: request.user!.orgId } });
      if (!agent) return reply.status(404).send({ error: 'Không tìm thấy agent' });
      return agent;
    },
  );

  app.put(
    '/api/v1/ai-agents/:id',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as AgentBody;
      if (invalidRegex(body.skipNoisePattern))
        return reply.status(400).send({ error: 'Regex bỏ qua tin rác không hợp lệ' });
      const bodyError = validateAgentBody(body);
      if (bodyError) return reply.status(400).send({ error: bodyError });

      const existing = await prisma.aiAgent.findFirst({
        where: { id, orgId: request.user!.orgId },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Không tìm thấy agent' });

      try {
        const agent = await prisma.aiAgent.update({ where: { id }, data: sanitizeAgentBody(body) });
        invalidateBindingCache();
        return agent;
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002')
          return reply.status(409).send({ error: 'Đã có agent trùng tên' });
        throw err;
      }
    },
  );

  app.delete(
    '/api/v1/ai-agents/:id',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const res = await prisma.aiAgent.deleteMany({ where: { id, orgId: request.user!.orgId } });
      if (res.count === 0) return reply.status(404).send({ error: 'Không tìm thấy agent' });
      invalidateBindingCache();
      return { ok: true };
    },
  );

  // ── Gán tài liệu ──────────────────────────────────────────────────────────

  app.get(
    '/api/v1/ai-agents/:id/documents',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return { documentIds: await listAgentDocumentIds(request.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/ai-agents/:id/documents',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { documentIds?: string[] };
      if (!Array.isArray(body.documentIds))
        return reply.status(400).send({ error: 'documentIds phải là mảng' });
      const linked = await linkDocumentsToAgent(request.user!.orgId, id, body.documentIds);
      return { linked };
    },
  );

  // ── Chạy thử (KHÔNG gửi Zalo) ─────────────────────────────────────────────

  app.post(
    '/api/v1/ai-agents/:id/test',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { question?: string; conversationId?: string };
      if (!body.question?.trim()) return reply.status(400).send({ error: 'Thiếu câu hỏi' });

      const orgId = request.user!.orgId;
      const agent = await prisma.aiAgent.findFirst({ where: { id, orgId } });
      if (!agent) return reply.status(404).send({ error: 'Không tìm thấy agent' });

      // Chạy thử KHÔNG dựa vào hội thoại thật: build prompt với đúng câu hỏi,
      // gọi model, trả kèm chunk tài liệu đã dùng để tinh chỉnh prompt.
      try {
        const context = await buildTestPrompt(orgId, agent.id, body.question, body.conversationId);
        const reply_ = await generateAgentReply(orgId, agent, context.prompt);
        return {
          reply: reply_.reply,
          handoff: reply_.handoff,
          handoffReason: reply_.handoffReason,
          latencyMs: reply_.latencyMs,
          promptTokens: reply_.promptTokens,
          completionTokens: reply_.completionTokens,
          chunkIds: context.prompt.chunkIds,
          chunks: context.chunks,
          system: context.prompt.system,
        };
      } catch (err) {
        if (err instanceof AiAgentConfigError) return reply.status(400).send({ error: err.message });
        logger.warn('[ai-agent] chạy thử lỗi: %s', (err as Error).message);
        return reply.status(502).send({ error: `Gọi model lỗi: ${(err as Error).message}` });
      }
    },
  );

  /*
   * Mô phỏng 1 lượt chat: chạy đúng chuỗi binding → cổng → prompt → model của
   * luồng thật nhưng KHÔNG ghi DB và KHÔNG gửi tin ra Zalo.
   */
  app.post(
    '/api/v1/ai-agents/simulate',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as {
        zaloAccountId?: string;
        threadType?: string;
        text?: string;
        history?: SimulateTurn[];
        senderName?: string;
        mentionsNick?: boolean;
        mentionsAll?: boolean;
        replyToNick?: boolean;
      };
      if (!body.zaloAccountId) return reply.status(400).send({ error: 'Thiếu nick Zalo' });
      if (!body.text?.trim()) return reply.status(400).send({ error: 'Thiếu nội dung tin nhắn' });
      const threadType = body.threadType === 'group' ? 'group' : 'user';

      try {
        return await simulateAgentTurn({
          orgId: request.user!.orgId,
          zaloAccountId: body.zaloAccountId,
          threadType,
          text: body.text,
          history: Array.isArray(body.history) ? body.history.slice(-20) : [],
          senderName: body.senderName?.trim() || null,
          mentionsNick: body.mentionsNick === true,
          mentionsAll: body.mentionsAll === true,
          replyToNick: body.replyToNick === true,
        });
      } catch (err) {
        if (err instanceof AiAgentConfigError) return reply.status(400).send({ error: err.message });
        logger.warn('[ai-agent] mô phỏng lỗi: %s', (err as Error).message);
        return reply.status(502).send({ error: `Gọi model lỗi: ${(err as Error).message}` });
      }
    },
  );

  // ── Rocket: dò kết nối ────────────────────────────────────────────────────

  /*
   * Nút "Kiểm tra kết nối" trên UI: cho admin biết gateway Rocket có sống và profile
   * có tồn tại KHÔNG cần chờ khách nhắn tin rồi phát hiện qua AiAgentRun.status='failed'.
   * Luôn 200 kể cả khi ok=false — đây là kết quả chẩn đoán (gateway tắt / sai profile /
   * sai key), không phải lỗi của bản thân request này. Chỉ format sai (path-injection)
   * mới là lỗi request thật sự → 400.
   */
  app.get(
    '/api/v1/ai-agents/rocket/probe',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { profile?: string };
      const profile = query.profile?.trim() || '';
      if (profile && !isValidRocketProfileFormat(profile)) {
        return reply.status(400).send({
          error: 'Tên profile Rocket không hợp lệ — chỉ chữ thường, số, "-", "_", tối đa 64 ký tự.',
        });
      }
      return probeRocketAgent(profile || null);
    },
  );

  /*
   * Danh sách profile cho dropdown "Profile Rocket" — đọc thẳng thư mục cấu hình của
   * Rocket vì cổng OpenAI-compatible không có endpoint liệt kê (rocket-profile.ts giải
   * thích rõ). Luôn 200 như /rocket/probe: thư mục chưa mount là chẩn đoán để hiện cho
   * admin, không phải lỗi request; UI vẫn cho gõ tay tên profile khi danh sách rỗng.
   *
   * `?refresh=1` = admin bấm "tải lại danh sách" → bỏ cache 30s để thấy ngay profile vừa
   * tạo bên Rocket.
   */
  app.get(
    '/api/v1/ai-agents/rocket/profiles',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest) => {
      const query = request.query as { refresh?: string };
      return listRocketProfiles(query.refresh === '1' || query.refresh === 'true');
    },
  );

  // ── Binding (gán agent theo nick / nhóm) ──────────────────────────────────

  app.get(
    '/api/v1/ai-agents/bindings',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest) => {
      // Lọc theo agentId để màn hình "Phạm vi" hỏi đúng thứ nó cần. Không có filter này
      // thì client phải tải toàn bộ binding của tổ chức rồi tự lọc — org nhiều nick +
      // nhiều nhóm là kéo về hàng trăm dòng chỉ để hiện vài dòng.
      const query = request.query as { zaloAccountId?: string; agentId?: string };
      const items = await prisma.aiAgentBinding.findMany({
        where: {
          orgId: request.user!.orgId,
          ...(query.zaloAccountId ? { zaloAccountId: query.zaloAccountId } : {}),
          ...(query.agentId ? { agentId: query.agentId } : {}),
        },
        include: { agent: { select: { id: true, name: true, enabled: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return { items };
    },
  );

  app.put(
    '/api/v1/ai-agents/bindings',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const body = (request.body ?? {}) as {
        agentId?: string;
        zaloAccountId?: string;
        scope?: string;
        targetThreadId?: string | null;
        enabled?: boolean;
        groupTriggerMode?: string;
        triggerKeywords?: string[];
        replyToAllMention?: boolean;
      };

      if (!body.agentId) return reply.status(400).send({ error: 'Thiếu agentId' });
      if (!body.zaloAccountId) return reply.status(400).send({ error: 'Thiếu zaloAccountId' });
      if (!body.scope || !(BINDING_SCOPES as readonly string[]).includes(body.scope))
        return reply.status(400).send({ error: 'scope không hợp lệ' });
      if ((body.scope === 'contact' || body.scope === 'group') && !body.targetThreadId)
        return reply.status(400).send({ error: 'scope này cần targetThreadId' });
      if (body.groupTriggerMode && !(GROUP_TRIGGER_MODES as readonly string[]).includes(body.groupTriggerMode))
        return reply.status(400).send({ error: 'groupTriggerMode không hợp lệ' });

      const agentId = body.agentId;
      const zaloAccountId = body.zaloAccountId;

      const { agentFound, accountFound } = await findAgentAndAccountInOrg(prisma, orgId, agentId, zaloAccountId);
      if (!agentFound) return reply.status(404).send({ error: 'Không tìm thấy agent' });
      if (!accountFound) return reply.status(404).send({ error: 'Không tìm thấy nick Zalo' });

      const targetThreadId =
        body.scope === 'account_dm' || body.scope === 'account_group' ? null : body.targetThreadId!;

      const { binding } = await upsertBinding(prisma, {
        orgId,
        zaloAccountId,
        scope: body.scope,
        targetThreadId,
        payload: buildBindingPayload({
          agentId,
          enabled: body.enabled,
          groupTriggerMode: body.groupTriggerMode,
          triggerKeywords: body.triggerKeywords,
          replyToAllMention: body.replyToAllMention,
        }),
      });
      invalidateBindingCache(zaloAccountId);
      return binding;
    },
  );

  /*
   * Gán 1 agent cho NHIỀU nhóm cùng lúc (tab "Phạm vi" trên UI agent) — thay vì admin
   * phải mở từng nhóm gọi PUT /bindings 20 lần. Giai đoạn này CHỈ hỗ trợ scope 'group':
   * account_dm/account_group vốn đã là 1 dòng duy nhất (không có gì để "hàng loạt"),
   * còn scope 'contact' chưa có UI tạo (quyết định #11 kiến trúc — YAGNI).
   */
  app.put(
    '/api/v1/ai-agents/bindings/bulk',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const body = (request.body ?? {}) as {
        agentId?: string;
        zaloAccountId?: string;
        scope?: string;
        targetThreadIds?: string[];
        enabled?: boolean;
        groupTriggerMode?: string;
        triggerKeywords?: string[];
        replyToAllMention?: boolean;
        replaceMissing?: boolean;
      };

      if (!body.agentId) return reply.status(400).send({ error: 'Thiếu agentId' });
      if (!body.zaloAccountId) return reply.status(400).send({ error: 'Thiếu zaloAccountId' });
      if (body.scope !== 'group')
        return reply.status(400).send({ error: 'Gán hàng loạt hiện chỉ hỗ trợ scope "group"' });
      if (!Array.isArray(body.targetThreadIds))
        return reply.status(400).send({ error: 'targetThreadIds phải là mảng' });
      if (body.targetThreadIds.length > 200)
        return reply.status(400).send({ error: 'Tối đa 200 nhóm cho mỗi lần gán hàng loạt' });
      if (body.groupTriggerMode && !(GROUP_TRIGGER_MODES as readonly string[]).includes(body.groupTriggerMode))
        return reply.status(400).send({ error: 'groupTriggerMode không hợp lệ' });

      const agentId = body.agentId;
      const zaloAccountId = body.zaloAccountId;

      const { agentFound, accountFound } = await findAgentAndAccountInOrg(prisma, orgId, agentId, zaloAccountId);
      if (!agentFound) return reply.status(404).send({ error: 'Không tìm thấy agent' });
      if (!accountFound) return reply.status(404).send({ error: 'Không tìm thấy nick Zalo' });

      // Loại trùng lặp + chuỗi rỗng trước khi ghi — unique index (zaloAccountId, scope,
      // targetThreadId) sẽ đụng lock nếu gửi trùng trong cùng transaction.
      const targetThreadIds = Array.from(
        new Set(body.targetThreadIds.map((v) => String(v).trim()).filter(Boolean)),
      );
      const payload = buildBindingPayload({
        agentId,
        enabled: body.enabled,
        groupTriggerMode: body.groupTriggerMode,
        triggerKeywords: body.triggerKeywords,
        replyToAllMention: body.replyToAllMention,
      });

      // MỘT transaction duy nhất: N upsert + (tuỳ chọn) xoá binding thừa cùng chạy atomic
      // — nửa vời (vd tạo được 15/20 nhóm rồi lỗi) sẽ để lại trạng thái gán dở dang khó
      // debug. invalidateBindingCache() gọi ĐÚNG 1 LẦN sau khi commit, không phải trong
      // vòng lặp — mỗi lần gọi vô hiệu cache toàn bộ nick, gọi N lần chỉ tốn kém vô ích.
      const result = await tenantTransaction(async (tx) => {
        let created = 0;
        let updated = 0;
        for (const targetThreadId of targetThreadIds) {
          const { created: wasCreated } = await upsertBinding(tx, {
            orgId,
            zaloAccountId,
            scope: 'group',
            targetThreadId,
            payload,
          });
          if (wasCreated) created++;
          else updated++;
        }

        let removed = 0;
        if (body.replaceMissing) {
          // Chỉ gỡ binding CỦA CHÍNH agent này. Màn hình "Phạm vi" của agent A liệt kê mọi
          // nhóm của nick, nhóm đang thuộc agent B hiện ra ở trạng thái chưa tick — nếu
          // xoá theo nick thì mỗi lần A lưu là B mất sạch nhóm, âm thầm, không ai báo.
          // Muốn chuyển nhóm từ B sang A thì tick nhóm đó: vòng upsert phía trên đổi
          // agentId (index unique theo nick+nhóm bảo đảm mỗi nhóm chỉ 1 agent).
          // `notIn: []` (khi targetThreadIds rỗng) khớp mọi hàng — hỗ trợ ca "bỏ chọn hết".
          const del = await tx.aiAgentBinding.deleteMany({
            where: { orgId, zaloAccountId, agentId, scope: 'group', targetThreadId: { notIn: targetThreadIds } },
          });
          removed = del.count;
        }

        return { created, updated, removed };
      });

      invalidateBindingCache(zaloAccountId);
      return result;
    },
  );

  app.delete(
    '/api/v1/ai-agents/bindings/:id',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.aiAgentBinding.findFirst({
        where: { id, orgId: request.user!.orgId },
        select: { zaloAccountId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Không tìm thấy cấu hình gán' });
      await prisma.aiAgentBinding.delete({ where: { id } });
      invalidateBindingCache(existing.zaloAccountId);
      return { ok: true };
    },
  );

  // ── Nhật ký ───────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/ai-agents/runs',
    { preHandler: requireGrant('contact', 'view_all') },
    async (request: FastifyRequest) => {
      const q = request.query as {
        agentId?: string;
        conversationId?: string;
        status?: string;
        from?: string;
        to?: string;
        limit?: string;
        skip?: string;
        /** Lọc lượt chạy bằng engine dự phòng — cách duy nhất phát hiện Rocket chết
         * âm thầm mà fallback đang gánh hết, thay vì chỉ thấy hoá đơn OpenRouter tăng. */
        fallbackUsed?: string;
      };
      const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
      const skip = Math.max(0, Number(q.skip ?? 0));
      const where: Prisma.AiAgentRunWhereInput = {
        orgId: request.user!.orgId,
        ...(q.agentId ? { agentId: q.agentId } : {}),
        ...(q.conversationId ? { conversationId: q.conversationId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.fallbackUsed !== undefined ? { fallbackUsed: q.fallbackUsed === 'true' } : {}),
        ...(q.from || q.to
          ? {
              createdAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        prisma.aiAgentRun.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip,
          include: { agent: { select: { id: true, name: true } } },
        }),
        prisma.aiAgentRun.count({ where }),
      ]);
      return { items, total };
    },
  );

  // ── Tạm dừng agent theo hội thoại ─────────────────────────────────────────

  app.get(
    '/api/v1/ai-agents/conversations/:id/pause',
    { preHandler: requireGrant('contact', 'view_all') },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return { pausedReason: await getPauseReason(id) };
    },
  );

  app.post(
    '/api/v1/ai-agents/conversations/:id/pause',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { minutes?: number | null };
      const conv = await prisma.conversation.findFirst({
        where: { id, orgId: request.user!.orgId },
        select: { id: true },
      });
      if (!conv) return reply.status(404).send({ error: 'Không tìm thấy hội thoại' });
      const minutes = body.minutes === null || body.minutes === undefined ? null : Number(body.minutes);
      await pauseConversation(id, minutes);
      return { ok: true, minutes };
    },
  );

  app.delete(
    '/api/v1/ai-agents/conversations/:id/pause',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const conv = await prisma.conversation.findFirst({
        where: { id, orgId: request.user!.orgId },
        select: { id: true },
      });
      if (!conv) return reply.status(404).send({ error: 'Không tìm thấy hội thoại' });
      await resumeConversation(id);
      return { ok: true };
    },
  );
}

// ── Helper dùng chung cho gán binding đơn + hàng loạt ─────────────────────────

/**
 * Model delegate cần dùng để thao tác binding — thoả bởi CẢ `prisma` (gán đơn, không
 * cần transaction) LẪN `tx` bên trong `tenantTransaction` (gán hàng loạt). Khai báo hẹp
 * thay vì kiểu `TxClient` suy ra từ `$transaction` để tránh phải export type nội bộ của
 * prisma-client.ts, đồng thời cho phép gọi cùng helper ở cả 2 ngữ cảnh.
 */
type BindingDb = Pick<typeof prisma, 'aiAgent' | 'zaloAccount' | 'aiAgentBinding'>;

/** Agent + nick phải cùng org — chặn gán chéo tenant qua body. Dùng chung cho gán đơn
 * và gán hàng loạt. */
async function findAgentAndAccountInOrg(
  db: BindingDb,
  orgId: string,
  agentId: string,
  zaloAccountId: string,
): Promise<{ agentFound: boolean; accountFound: boolean }> {
  const [agent, account] = await Promise.all([
    db.aiAgent.findFirst({ where: { id: agentId, orgId }, select: { id: true } }),
    db.zaloAccount.findFirst({ where: { id: zaloAccountId, orgId }, select: { id: true } }),
  ]);
  return { agentFound: !!agent, accountFound: !!account };
}

type BindingPayload = {
  agentId: string;
  enabled: boolean;
  groupTriggerMode: string;
  triggerKeywords: string[];
  replyToAllMention: boolean;
};

/** Dựng phần dữ liệu chung (không gồm khoá scope/target) cho 1 binding — tách ra để gán
 * đơn và gán hàng loạt không lặp lại logic mặc định + chuẩn hoá triggerKeywords (DRY). */
function buildBindingPayload(input: {
  agentId: string;
  enabled?: boolean;
  groupTriggerMode?: string;
  triggerKeywords?: string[];
  replyToAllMention?: boolean;
}): BindingPayload {
  return {
    agentId: input.agentId,
    enabled: input.enabled ?? true,
    groupTriggerMode: input.groupTriggerMode ?? 'mention_or_keyword',
    triggerKeywords: (input.triggerKeywords ?? []).map((k) => String(k).trim()).filter(Boolean),
    replyToAllMention: input.replyToAllMention ?? false,
  };
}

/**
 * Tìm-rồi-update/create 1 binding. KHÔNG dùng `upsert`: khoá tổng hợp
 * (zaloAccountId, scope, targetThreadId) có targetThreadId nullable, mà Prisma bắt buộc
 * `where` của upsert phải non-null. Tìm rồi tách nhánh update/create; index unique (kèm
 * partial index cho nhánh targetThreadId NULL) vẫn là chốt chặn cuối ở DB nếu có race.
 */
async function upsertBinding(
  db: BindingDb,
  params: {
    orgId: string;
    zaloAccountId: string;
    scope: string;
    targetThreadId: string | null;
    payload: BindingPayload;
  },
) {
  const existing = await db.aiAgentBinding.findFirst({
    where: {
      orgId: params.orgId,
      zaloAccountId: params.zaloAccountId,
      scope: params.scope,
      targetThreadId: params.targetThreadId,
    },
    select: { id: true },
  });
  if (existing) {
    const binding = await db.aiAgentBinding.update({ where: { id: existing.id }, data: params.payload });
    return { binding, created: false };
  }
  const binding = await db.aiAgentBinding.create({
    data: {
      orgId: params.orgId,
      zaloAccountId: params.zaloAccountId,
      scope: params.scope,
      targetThreadId: params.targetThreadId,
      ...params.payload,
    },
  });
  return { binding, created: true };
}

/**
 * Dựng prompt cho khung chạy thử. Không có hội thoại thật thì tự tạo ngữ cảnh
 * tối thiểu từ chính câu hỏi, để admin tinh chỉnh prompt trước khi bật agent.
 */
async function buildTestPrompt(
  orgId: string,
  agentId: string,
  question: string,
  conversationId?: string,
) {
  const agent = await prisma.aiAgent.findFirstOrThrow({ where: { id: agentId, orgId } });

  if (conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: { id: true, threadType: true },
    });
    if (conv) {
      const prompt = await buildAgentPrompt({
        orgId,
        agent,
        conversationId: conv.id,
        threadType: conv.threadType === 'group' ? 'group' : 'user',
        queryOverride: question,
      });
      return { prompt, chunks: await loadChunks(orgId, prompt.chunkIds) };
    }
  }

  const { retrieveContext } = await import('./document-retriever.js');
  const context = await retrieveContext({ orgId, agentId, query: question });
  const system = [agent.systemPrompt.trim(), context.text].filter(Boolean).join('\n\n');
  return {
    prompt: {
      system,
      messages: [{ role: 'user' as const, content: question }],
      chunkIds: context.chunkIds,
    },
    chunks: await loadChunks(orgId, context.chunkIds),
  };
}

async function loadChunks(orgId: string, chunkIds: string[]) {
  if (chunkIds.length === 0) return [];
  const chunks = await prisma.aiAgentDocumentChunk.findMany({
    where: { orgId, id: { in: chunkIds } },
    select: {
      id: true,
      heading: true,
      content: true,
      document: { select: { title: true } },
    },
  });
  return chunks.map((c) => ({
    id: c.id,
    heading: c.heading,
    content: c.content,
    docTitle: c.document.title,
  }));
}
