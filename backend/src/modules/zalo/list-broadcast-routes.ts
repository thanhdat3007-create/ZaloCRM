// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * list-broadcast-routes.ts — Chiến dịch nhắn tin hàng loạt cho tệp KH (🟢 Community).
 *
 * PREFIX RIÊNG `/api/v1/list-broadcasts` + `/api/v1/list-broadcast-runs`.
 * Bundle EE dùng `/automation/*` → không đụng nhau.
 *
 * RBAC: dùng lại resource `broadcast` (đã có trong RESOURCES) — cùng bản chất
 * "gửi hàng loạt", không cần thêm resource mới và phân quyền lại từ đầu.
 * Không có `broadcast.view_all` → chỉ thấy chiến dịch mình tạo.
 *
 * Community feature — KHÔNG import `_ee`.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { getEffectiveLimit } from './sdk-limit-service.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';
import { CHAT_DISABLED_BLOCK, isChatDisabled } from './zalo-scope.js';
import { resolveTemplateAttachments } from '../chat/message-template-service.js';
import {
  estimateListBroadcastCost, quotaExceededMessage, totalNickBudget, windowTooShortWarning,
  MAX_DAILY_QUOTA, MAX_DELAY_SEC, MAX_NICKS_PER_BROADCAST, MIN_DELAY_SEC,
} from './list-broadcast-cost.js';
import {
  nextWindowOpen, validateWindow, windowLengthMinutes, windowSpecOf,
} from './list-broadcast-window.js';
import {
  countRecipientsByState, findEligibleEntries, requeueFailed, syncRecipients,
} from './list-broadcast-recipients.js';
import { materializeRun } from './list-broadcast-cron.js';

const BASE = '/api/v1/list-broadcasts';
const RUNS_BASE = '/api/v1/list-broadcast-runs';
const MAX_NAME_LENGTH = 120;
/** Người nhận thử quá số lần này thì không đưa lại vào hàng đợi nữa. */
const MAX_RECIPIENT_ATTEMPTS = 3;

interface BroadcastBody {
  name?: unknown;
  customerListId?: unknown;
  templateId?: unknown;
  zaloAccountIds?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
  daysOfWeek?: unknown;
  timezone?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  dailyQuota?: unknown;
  perNickDailyQuota?: unknown;
  minDelaySec?: unknown;
  maxDelaySec?: unknown;
}

function userIdOf(request: FastifyRequest): string {
  const user = request.user as unknown as { userId?: string; id?: string };
  return user.userId ?? user.id ?? '';
}

function toDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const d = new Date(raw as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIntArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => Number(n)).filter((n) => Number.isInteger(n));
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string');
}

/** Chỉ thấy chiến dịch của mình khi thiếu grant `broadcast.view_all`. */
async function ownerScopeWhere(request: FastifyRequest): Promise<{ createdById?: string }> {
  const canViewAll = await userHasGrant(userIdOf(request), 'broadcast', 'view_all');
  return canViewAll ? {} : { createdById: userIdOf(request) };
}

interface ValidatedInput {
  name: string;
  customerListId: string;
  templateId: string;
  zaloAccountIds: string[];
  windowStart: string;
  windowEnd: string;
  daysOfWeek: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
  dailyQuota: number;
  perNickDailyQuota: number;
  minDelaySec: number;
  maxDelaySec: number;
}

type ValidateOutcome =
  | { ok: true; value: ValidatedInput }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Validate toàn bộ input tạo/sửa chiến dịch: tệp, mẫu tin, nick, khung giờ,
 * hạn mức, nhịp gửi. Dùng chung cho POST, PATCH và activate.
 */
async function validateInput(
  request: FastifyRequest,
  reply: FastifyReply,
  body: BroadcastBody,
  current?: ValidatedInput,
): Promise<ValidateOutcome> {
  const orgId = request.user!.orgId;
  const fail = (status: number, bodyOut: Record<string, unknown>): ValidateOutcome =>
    ({ ok: false, status, body: bodyOut });

  // ── 1. Tên ──────────────────────────────────────────────────────────────
  const rawName = body.name === undefined ? current?.name : body.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) return fail(422, { error: 'Tên chiến dịch là bắt buộc', code: 'NAME_REQUIRED' });
  if (name.length > MAX_NAME_LENGTH) {
    return fail(422, { error: `Tên chiến dịch tối đa ${MAX_NAME_LENGTH} ký tự`, code: 'NAME_TOO_LONG' });
  }

  // ── 2. Tệp khách hàng ───────────────────────────────────────────────────
  const customerListId =
    typeof body.customerListId === 'string' ? body.customerListId : current?.customerListId;
  if (!customerListId) return fail(422, { error: 'Thiếu tệp khách hàng', code: 'LIST_REQUIRED' });
  const list = await prisma.customerList.findFirst({
    where: { id: customerListId, orgId },
    select: { id: true, archivedAt: true },
  });
  if (!list) return fail(404, { error: 'Không tìm thấy tệp khách hàng', code: 'LIST_NOT_FOUND' });
  if (list.archivedAt) {
    return fail(409, { error: 'Tệp này đã lưu trữ — đưa khỏi lưu trữ trước khi gửi', code: 'LIST_ARCHIVED' });
  }

  // ── 3. Mẫu tin ──────────────────────────────────────────────────────────
  const templateId = typeof body.templateId === 'string' ? body.templateId : current?.templateId;
  if (!templateId) return fail(422, { error: 'Thiếu mẫu tin', code: 'TEMPLATE_REQUIRED' });
  const template = await prisma.messageTemplate.findFirst({
    where: { id: templateId, orgId, archivedAt: null },
    select: { content: true, attachments: true },
  });
  if (!template) return fail(404, { error: 'Không tìm thấy mẫu tin', code: 'TEMPLATE_NOT_FOUND' });
  const attachments = await resolveTemplateAttachments(orgId, template.attachments);
  const hasText = (template.content ?? '').trim().length > 0;
  if (!hasText && attachments.filter((a) => !a.missing).length === 0) {
    return fail(422, { error: 'Mẫu tin rỗng — không có gì để gửi', code: 'TEMPLATE_EMPTY' });
  }

  // ── 4. Nick gửi ─────────────────────────────────────────────────────────
  const rawNicks = body.zaloAccountIds === undefined ? current?.zaloAccountIds : body.zaloAccountIds;
  const zaloAccountIds = [...new Set(toStringArray(rawNicks))];
  if (zaloAccountIds.length === 0) {
    return fail(422, { error: 'Chọn ít nhất 1 nick Zalo để gửi', code: 'NICKS_REQUIRED' });
  }
  if (zaloAccountIds.length > MAX_NICKS_PER_BROADCAST) {
    return fail(422, {
      error: `Tối đa ${MAX_NICKS_PER_BROADCAST} nick mỗi chiến dịch`,
      code: 'TOO_MANY_NICKS',
    });
  }
  for (const nickId of zaloAccountIds) {
    const account = await resolveAccount(nickId, orgId); // ném 404 nếu khác org
    if (account.archivedAt) {
      return fail(409, { error: `Nick "${account.displayName ?? nickId}" đã bị xoá`, code: 'NICK_ARCHIVED' });
    }
    // Nick CHỈ NHẬN → chặn ngay lúc cấu hình, không để chiến dịch chạy rồi mới fail.
    if (isChatDisabled(account)) return fail(409, { ...CHAT_DISABLED_BLOCK });
    if (!(await checkAccess(request, reply, nickId, 'chat'))) {
      return fail(0, {}); // checkAccess đã gửi 403
    }
  }

  // ── 5. Khung giờ ────────────────────────────────────────────────────────
  const windowStart =
    (typeof body.windowStart === 'string' && body.windowStart) || current?.windowStart || '08:00';
  const windowEnd =
    (typeof body.windowEnd === 'string' && body.windowEnd) || current?.windowEnd || '17:00';
  const daysOfWeek = [
    ...new Set(body.daysOfWeek === undefined ? (current?.daysOfWeek ?? []) : toIntArray(body.daysOfWeek)),
  ].sort((a, b) => a - b);
  const timezone =
    (typeof body.timezone === 'string' && body.timezone) || current?.timezone || 'Asia/Ho_Chi_Minh';
  const startDate = body.startDate === undefined ? (current?.startDate ?? null) : toDate(body.startDate);
  const endDate = body.endDate === undefined ? (current?.endDate ?? null) : toDate(body.endDate);

  const spec = { windowStart, windowEnd, daysOfWeek, timezone, startDate, endDate };
  const windowCheck = validateWindow(spec);
  if (!windowCheck.ok) {
    return fail(422, { error: 'Khung giờ không hợp lệ', code: 'INVALID_WINDOW', errors: windowCheck.errors });
  }

  // ── 6. Hạn mức ──────────────────────────────────────────────────────────
  const dailyQuota = Number(body.dailyQuota ?? current?.dailyQuota ?? 100);
  const perNickDailyQuota = Number(body.perNickDailyQuota ?? current?.perNickDailyQuota ?? 40);
  if (!Number.isFinite(dailyQuota) || dailyQuota < 1 || dailyQuota > MAX_DAILY_QUOTA) {
    return fail(422, {
      error: `Hạn mức ngày phải nằm giữa 1 và ${MAX_DAILY_QUOTA} tin`,
      code: 'INVALID_DAILY_QUOTA',
    });
  }
  if (!Number.isFinite(perNickDailyQuota) || perNickDailyQuota < 1) {
    return fail(422, { error: 'Hạn mức mỗi nick phải ≥ 1 tin/ngày', code: 'INVALID_NICK_QUOTA' });
  }

  // ── 7. Nhịp gửi ─────────────────────────────────────────────────────────
  const minDelaySec = Number(body.minDelaySec ?? current?.minDelaySec ?? 45);
  const maxDelaySec = Number(body.maxDelaySec ?? current?.maxDelaySec ?? 90);
  if (!Number.isFinite(minDelaySec) || minDelaySec < MIN_DELAY_SEC) {
    return fail(422, {
      error: `Giãn cách tối thiểu ${MIN_DELAY_SEC} giây để nick không bị Zalo khoá`,
      code: 'DELAY_TOO_SHORT',
    });
  }
  if (!Number.isFinite(maxDelaySec) || maxDelaySec < minDelaySec || maxDelaySec > MAX_DELAY_SEC) {
    return fail(422, {
      error: `Giãn cách tối đa phải nằm giữa ${minDelaySec} và ${MAX_DELAY_SEC} giây`,
      code: 'INVALID_DELAY_RANGE',
    });
  }

  // ── 8. Ngân sách hạn mức ngày (ràng buộc chính) ─────────────────────────
  const cost = estimateListBroadcastCost({
    recipientCount: 0, attachments, hasText, dailyQuota, minDelaySec, maxDelaySec,
  });
  const limits = await Promise.all(
    zaloAccountIds.map(async (id) => (await getEffectiveLimit(id, 'message')).daily),
  );
  const budget = totalNickBudget(limits, perNickDailyQuota);
  if (cost.opsPerDay > budget) {
    return fail(422, {
      error: quotaExceededMessage({
        opsPerDay: cost.opsPerDay, budget,
        opsPerRecipient: cost.opsPerRecipient, nickCount: zaloAccountIds.length,
      }),
      code: 'DAILY_BUDGET_EXCEEDED',
      estimate: { ...cost, budget },
    });
  }

  return {
    ok: true,
    value: {
      name, customerListId, templateId, zaloAccountIds,
      windowStart, windowEnd, daysOfWeek, timezone, startDate, endDate,
      dailyQuota, perNickDailyQuota, minDelaySec, maxDelaySec,
    },
  };
}

export async function listBroadcastRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── Danh sách ─────────────────────────────────────────────────────────────
  app.get(
    BASE,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const query = request.query as { state?: string; customerListId?: string };
      try {
        const broadcasts = await prisma.listBroadcast.findMany({
          where: {
            orgId,
            ...(await ownerScopeWhere(request)),
            ...(query.state ? { state: query.state } : {}),
            ...(query.customerListId ? { customerListId: query.customerListId } : {}),
          },
          orderBy: { updatedAt: 'desc' },
          include: {
            customerList: { select: { id: true, name: true } },
            template: { select: { id: true, name: true } },
            _count: { select: { runs: true } },
          },
        });
        // `nextRunAt` không lưu trong DB: khung giờ suy ra được, lưu thêm cột chỉ
        // tạo thêm một nguồn dữ liệu phải giữ đồng bộ.
        const now = new Date();
        return {
          broadcasts: broadcasts.map((b) => ({
            ...b,
            nextRunAt: b.state === 'active' ? nextWindowOpen(windowSpecOf(b), now) : null,
          })),
        };
      } catch (err) {
        return handleError(reply, err, 'listListBroadcasts');
      }
    },
  );

  // ── Ước tính (chỉ đọc, cho UI hiện realtime) ──────────────────────────────
  // Đăng ký TRƯỚC `/:id` để không bị nuốt thành id='estimate'.
  app.post(
    `${BASE}/estimate`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const body = (request.body ?? {}) as BroadcastBody;
      try {
        const templateId = typeof body.templateId === 'string' ? body.templateId : '';
        const template = templateId
          ? await prisma.messageTemplate.findFirst({
              where: { id: templateId, orgId, archivedAt: null },
              select: { content: true, attachments: true },
            })
          : null;
        const attachments = template
          ? await resolveTemplateAttachments(orgId, template.attachments)
          : [];
        const hasText = (template?.content ?? '').trim().length > 0;

        // Số người nhận lấy từ chính tệp — sale cần thấy "gửi cho bao nhiêu người"
        // trước khi bật, không phải sau khi hàng đợi đã dựng.
        const customerListId = typeof body.customerListId === 'string' ? body.customerListId : '';
        let recipientCount = 0;
        if (customerListId) {
          const list = await prisma.customerList.findFirst({
            where: { id: customerListId, orgId },
            select: { id: true },
          });
          if (list) recipientCount = (await findEligibleEntries(customerListId)).length;
        }

        const dailyQuota = Math.max(1, Number(body.dailyQuota ?? 100));
        const perNickDailyQuota = Math.max(1, Number(body.perNickDailyQuota ?? 40));
        const minDelaySec = Number(body.minDelaySec ?? 45);
        const maxDelaySec = Number(body.maxDelaySec ?? 90);

        const cost = estimateListBroadcastCost({
          recipientCount, attachments, hasText, dailyQuota, minDelaySec, maxDelaySec,
        });

        // `getEffectiveLimit` tự suy org TỪ chính nick → phải chốt nick thuộc org
        // của người gọi trước, nếu không đây là đường đọc hạn mức của tenant khác.
        const zaloAccountIds = [...new Set(toStringArray(body.zaloAccountIds))];
        const limits: number[] = [];
        for (const id of zaloAccountIds) {
          await resolveAccount(id, orgId);
          limits.push((await getEffectiveLimit(id, 'message')).daily);
        }
        const budget = totalNickBudget(limits, perNickDailyQuota);

        const warnings: string[] = [];
        if (zaloAccountIds.length > 0 && cost.opsPerDay > budget) {
          warnings.push(quotaExceededMessage({
            opsPerDay: cost.opsPerDay, budget,
            opsPerRecipient: cost.opsPerRecipient, nickCount: zaloAccountIds.length,
          }));
        }
        const windowMinutes = windowLengthMinutes({
          windowStart: typeof body.windowStart === 'string' ? body.windowStart : '08:00',
          windowEnd: typeof body.windowEnd === 'string' ? body.windowEnd : '17:00',
          daysOfWeek: [], timezone: 'Asia/Ho_Chi_Minh', startDate: null, endDate: null,
        });
        const windowWarning = windowTooShortWarning({
          dailyDurationSec: cost.dailyDurationSec, windowMinutes,
        });
        if (windowWarning) warnings.push(windowWarning);

        return { ...cost, recipientCount, budget, warnings };
      } catch (err) {
        return handleError(reply, err, 'estimateListBroadcast');
      }
    },
  );

  // ── Tạo ───────────────────────────────────────────────────────────────────
  app.post(
    BASE,
    { preHandler: requireGrant('broadcast', 'create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      try {
        const result = await validateInput(request, reply, (request.body ?? {}) as BroadcastBody);
        if (!result.ok) {
          if (result.status === 0) return; // checkAccess đã trả 403
          return reply.status(result.status).send(result.body);
        }
        const broadcast = await prisma.listBroadcast.create({
          data: { ...result.value, orgId, state: 'draft', createdById: userIdOf(request) },
        });
        return reply.status(201).send({ broadcast });
      } catch (err) {
        return handleError(reply, err, 'createListBroadcast');
      }
    },
  );

  // ── Chi tiết ──────────────────────────────────────────────────────────────
  app.get(
    `${BASE}/:id`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const broadcast = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          include: {
            customerList: { select: { id: true, name: true, totalEntries: true, hasZaloEntries: true } },
            template: true,
          },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });

        const [attachments, counts, nicks] = await Promise.all([
          resolveTemplateAttachments(orgId, broadcast.template.attachments),
          countRecipientsByState(id),
          prisma.zaloAccount.findMany({
            where: { id: { in: broadcast.zaloAccountIds }, orgId },
            select: { id: true, displayName: true, phone: true, archivedAt: true },
          }),
        ]);

        return {
          broadcast: {
            ...broadcast,
            nextRunAt: broadcast.state === 'active'
              ? nextWindowOpen(windowSpecOf(broadcast), new Date())
              : null,
          },
          attachments,
          counts,
          nicks,
        };
      } catch (err) {
        return handleError(reply, err, 'getListBroadcast');
      }
    },
  );

  // ── Sửa ───────────────────────────────────────────────────────────────────
  app.patch(
    `${BASE}/:id`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });

        const result = await validateInput(
          request, reply, (request.body ?? {}) as BroadcastBody, current,
        );
        if (!result.ok) {
          if (result.status === 0) return;
          return reply.status(result.status).send(result.body);
        }

        // Đổi tệp khi hàng đợi đã dựng sẽ trộn hai tệp vào một chiến dịch — chặn
        // hẳn thay vì cố hợp nhất, vì "đã gửi cho ai" sẽ không còn giải thích được.
        if (
          result.value.customerListId !== current.customerListId &&
          current.totalRecipients > 0
        ) {
          return reply.status(409).send({
            error: 'Chiến dịch đã dựng danh sách nhận — tạo chiến dịch mới nếu muốn đổi tệp',
            code: 'LIST_LOCKED',
          });
        }

        const broadcast = await prisma.listBroadcast.update({
          where: { id },
          data: result.value,
        });
        return { broadcast };
      } catch (err) {
        return handleError(reply, err, 'updateListBroadcast');
      }
    },
  );

  // ── Huỷ (không xoá cứng — giữ lịch sử gửi) ───────────────────────────────
  app.delete(
    `${BASE}/:id`,
    { preHandler: requireGrant('broadcast', 'delete') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        const broadcast = await prisma.listBroadcast.update({
          where: { id },
          data: { state: 'cancelled' },
        });
        return { broadcast };
      } catch (err) {
        return handleError(reply, err, 'cancelListBroadcast');
      }
    },
  );

  // ── Bật lịch ──────────────────────────────────────────────────────────────
  app.post(
    `${BASE}/:id/activate`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        if (!['draft', 'paused', 'completed'].includes(current.state)) {
          return reply.status(409).send({
            error: `Không bật được chiến dịch đang ở trạng thái ${current.state}`,
            code: 'INVALID_STATE',
          });
        }

        // Bật lịch = kiểm lại toàn bộ cấu hình; mẫu tin có thể đã thêm ảnh hoặc
        // hạn mức nick bị siết kể từ lúc lưu nháp.
        const result = await validateInput(request, reply, {}, current);
        if (!result.ok) {
          if (result.status === 0) return;
          return reply.status(result.status).send(result.body);
        }

        // Dựng/bổ sung hàng đợi TRƯỚC khi bật — bật một chiến dịch không có ai
        // để gửi chỉ tạo ra một hàng lát rỗng.
        const sync = await syncRecipients(current);
        const counts = await countRecipientsByState(id);
        if ((counts.pending ?? 0) === 0) {
          return reply.status(422).send({
            error:
              sync.total === 0
                ? 'Tệp chưa có khách nào xác nhận có Zalo — bấm "Quét lại Zalo" ở trang tệp trước'
                : 'Đã gửi hết danh sách. Bấm "Gửi lại người lỗi" hoặc cập nhật tệp trước khi bật lại.',
            code: 'NO_PENDING_RECIPIENTS',
            counts,
          });
        }

        const broadcast = await prisma.listBroadcast.update({
          where: { id },
          data: { state: 'active', pausedReason: null, consecutiveFailedRuns: 0 },
        });
        return { broadcast, sync, counts };
      } catch (err) {
        return handleError(reply, err, 'activateListBroadcast');
      }
    },
  );

  // ── Tạm dừng ──────────────────────────────────────────────────────────────
  app.post(
    `${BASE}/:id/pause`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true, state: true },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        if (current.state !== 'active') {
          return reply.status(409).send({ error: 'Chiến dịch không ở trạng thái đang chạy', code: 'INVALID_STATE' });
        }
        const broadcast = await prisma.listBroadcast.update({
          where: { id },
          data: { state: 'paused', pausedReason: null },
        });
        return { broadcast };
      } catch (err) {
        return handleError(reply, err, 'pauseListBroadcast');
      }
    },
  );

  // ── Gửi thử ngay (1 lát, bỏ qua ràng buộc khung giờ) ─────────────────────
  app.post(
    `${BASE}/:id/run-now`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const broadcast = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true, orgId: true, state: true, customerListId: true, totalRecipients: true },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        if (['cancelled'].includes(broadcast.state)) {
          return reply.status(409).send({ error: 'Chiến dịch đã huỷ', code: 'INVALID_STATE' });
        }

        // Nháp chưa dựng hàng đợi thì dựng luôn — nếu không "Gửi thử" báo thành công
        // rồi im lặng vì không có ai trong hàng đợi.
        if (broadcast.totalRecipients === 0) await syncRecipients(broadcast);

        const scheduledFor = new Date(Math.floor(Date.now() / 1000) * 1000);
        try {
          const run = await materializeRun(broadcast, scheduledFor, 'manual');
          return reply.status(201).send({ run });
        } catch (err) {
          if ((err as { code?: string })?.code === 'P2002') {
            return reply.status(409).send({ error: 'Lượt gửi vừa được xếp hàng', code: 'RUN_ALREADY_QUEUED' });
          }
          throw err;
        }
      } catch (err) {
        return handleError(reply, err, 'runListBroadcastNow');
      }
    },
  );

  // ── Cập nhật danh sách nhận từ tệp ───────────────────────────────────────
  app.post(
    `${BASE}/:id/sync-recipients`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const broadcast = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true, orgId: true, customerListId: true },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        const sync = await syncRecipients(broadcast);
        return { ...sync, counts: await countRecipientsByState(id) };
      } catch (err) {
        return handleError(reply, err, 'syncListBroadcastRecipients');
      }
    },
  );

  // ── Gửi lại người lỗi ─────────────────────────────────────────────────────
  app.post(
    `${BASE}/:id/retry-failed`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const broadcast = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });

        const requeued = await requeueFailed(id, MAX_RECIPIENT_ATTEMPTS);
        if (requeued === 0) {
          return reply.status(400).send({
            error: `Không còn người nào gửi lại được (đã thử quá ${MAX_RECIPIENT_ATTEMPTS} lần hoặc không có ai lỗi)`,
            code: 'NO_RETRYABLE_RECIPIENTS',
          });
        }
        logger.info(`[list-broadcast-routes] retry-failed broadcast=${id} requeued=${requeued}`);
        return { requeued, counts: await countRecipientsByState(id) };
      } catch (err) {
        return handleError(reply, err, 'retryFailedRecipients');
      }
    },
  );

  // ── Danh sách người nhận (phân trang) ────────────────────────────────────
  app.get(
    `${BASE}/:id/recipients`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      const query = request.query as { state?: string; limit?: string; offset?: string };
      try {
        const broadcast = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });

        const where = { broadcastId: id, ...(query.state ? { state: query.state } : {}) };
        const [recipients, total] = await Promise.all([
          prisma.listBroadcastRecipient.findMany({
            where,
            orderBy: [{ sentAt: 'desc' }, { createdAt: 'asc' }],
            take: Math.min(Number(query.limit) || 50, 200),
            skip: Number(query.offset) || 0,
          }),
          prisma.listBroadcastRecipient.count({ where }),
        ]);
        return { recipients, total, counts: await countRecipientsByState(id) };
      } catch (err) {
        return handleError(reply, err, 'listBroadcastRecipients');
      }
    },
  );

  // ── Lịch sử lát gửi ───────────────────────────────────────────────────────
  app.get(
    `${BASE}/:id/runs`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      const query = request.query as { limit?: string; offset?: string };
      try {
        const broadcast = await prisma.listBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        const runs = await prisma.listBroadcastRun.findMany({
          where: { broadcastId: id, orgId },
          orderBy: { scheduledFor: 'desc' },
          take: Math.min(Number(query.limit) || 20, 100),
          skip: Number(query.offset) || 0,
        });
        return { runs };
      } catch (err) {
        return handleError(reply, err, 'listListBroadcastRuns');
      }
    },
  );

  // ── Chi tiết 1 lát ────────────────────────────────────────────────────────
  app.get(
    `${RUNS_BASE}/:runId`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { runId } = request.params as { runId: string };
      try {
        const run = await prisma.listBroadcastRun.findFirst({
          where: { id: runId, orgId, broadcast: await ownerScopeWhere(request) },
          include: { broadcast: { select: { id: true, name: true } } },
        });
        if (!run) return reply.status(404).send({ error: 'Không tìm thấy lượt gửi' });
        return { run };
      } catch (err) {
        return handleError(reply, err, 'getListBroadcastRun');
      }
    },
  );
}
