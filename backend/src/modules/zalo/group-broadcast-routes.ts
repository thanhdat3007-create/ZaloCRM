// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * group-broadcast-routes.ts — Chiến dịch gửi nhóm theo lịch (🟢 Community).
 *
 * PREFIX RIÊNG `/api/v1/group-broadcasts` + `/api/v1/group-broadcast-runs`.
 * Bundle EE dùng `/automation/*` → không đụng nhau.
 *
 * RBAC: resource `broadcast` đã có sẵn trong RESOURCES — không thêm resource mới.
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
import { zaloOps } from '../../shared/zalo-operations.js';
import { zaloPool } from './zalo-pool.js';
import { getEffectiveLimit } from './sdk-limit-service.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';
import { CHAT_DISABLED_BLOCK, isChatDisabled } from './zalo-scope.js';
import { resolveTemplateAttachments, type ResolvedAttachment } from '../chat/message-template-service.js';
import {
  validateSchedule, normalizeSchedule, nextOccurrence, scheduleSpecOf, type ScheduleKind,
} from './group-broadcast-schedule.js';
import {
  estimateBroadcastCost, safeBudget, budgetExceededMessage, minGapBetweenTimesSec,
  MAX_GROUPS_PER_BROADCAST, MIN_DELAY_SEC, MAX_DELAY_SEC,
} from './group-broadcast-cost.js';
import { materializeRun } from './group-broadcast-cron.js';
import { enqueueGroupBroadcast } from './group-broadcast-queue.js';

const BASE = '/api/v1/group-broadcasts';
const RUNS_BASE = '/api/v1/group-broadcast-runs';
const MAX_NAME_LENGTH = 120;
/** Target thử quá số lần này thì bỏ khỏi lượt gửi lại — tránh bám mãi nhóm hỏng. */
const MAX_TARGET_ATTEMPTS = 3;

const SCHEDULE_KINDS: ScheduleKind[] = ['now', 'daily', 'weekly', 'monthly'];

interface BroadcastBody {
  name?: unknown;
  zaloAccountId?: unknown;
  templateId?: unknown;
  targetGroupIds?: unknown;
  scheduleKind?: unknown;
  timesOfDay?: unknown;
  daysOfWeek?: unknown;
  daysOfMonth?: unknown;
  timezone?: unknown;
  startDate?: unknown;
  endDate?: unknown;
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

/**
 * Lấy danh sách nhóm THẬT của nick + tên nhóm.
 * Server tự lấy tên, không tin `groupNamesSnapshot` client gửi.
 */
async function fetchGroupNames(
  accountId: string, wantedIds: string[],
): Promise<{ joinedIds: Set<string>; names: Record<string, string> }> {
  type GInfo = { name?: string; groupName?: string };
  const all = (await zaloOps.getAllGroups(accountId)) as {
    gridVerMap?: Record<string, unknown>;
    gridInfoMap?: Record<string, GInfo>;
  } | null;
  const joinedIds = new Set(Object.keys(all?.gridVerMap ?? all?.gridInfoMap ?? {}));

  const infoMap: Record<string, GInfo> = { ...(all?.gridInfoMap ?? {}) };
  const missing = wantedIds.filter((id) => joinedIds.has(id) && !(infoMap[id]?.name || infoMap[id]?.groupName));
  // wantedIds tối đa 50 → 1 chunk là đủ, giữ vòng lặp cho an toàn nếu trần đổi.
  for (let i = 0; i < missing.length; i += 50) {
    try {
      const more = (await zaloOps.getGroupInfo(accountId, missing.slice(i, i + 50))) as {
        gridInfoMap?: Record<string, GInfo>;
      };
      Object.assign(infoMap, more?.gridInfoMap ?? {});
    } catch {
      // Thiếu tên không chặn tạo chiến dịch — fallback dùng groupId làm tên.
    }
  }

  const names: Record<string, string> = {};
  for (const id of wantedIds) {
    if (!joinedIds.has(id)) continue;
    names[id] = infoMap[id]?.name || infoMap[id]?.groupName || id;
  }
  return { joinedIds, names };
}

interface ValidatedInput {
  name: string;
  zaloAccountId: string;
  templateId: string;
  targetGroupIds: string[];
  groupNamesSnapshot: Record<string, string>;
  scheduleKind: ScheduleKind;
  timesOfDay: string[];
  daysOfWeek: number[];
  daysOfMonth: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
  minDelaySec: number;
  maxDelaySec: number;
}

type ValidateOutcome =
  | { ok: true; value: ValidatedInput; attachments: ResolvedAttachment[]; hasText: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Validate toàn bộ input tạo/sửa chiến dịch: nick, mẫu tin, nhóm, lịch, nhịp gửi,
 * và ngân sách lượt gửi. Dùng chung cho POST, PATCH và activate.
 */
async function validateBroadcastInput(
  request: FastifyRequest,
  reply: FastifyReply,
  body: BroadcastBody,
  current?: {
    name: string; zaloAccountId: string; templateId: string; targetGroupIds: string[];
    groupNamesSnapshot: unknown; scheduleKind: string; timesOfDay: string[];
    daysOfWeek: number[]; daysOfMonth: number[]; timezone: string;
    startDate: Date | null; endDate: Date | null; minDelaySec: number; maxDelaySec: number;
  },
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

  // ── 2. Nick ─────────────────────────────────────────────────────────────
  const zaloAccountId = typeof body.zaloAccountId === 'string' ? body.zaloAccountId : current?.zaloAccountId;
  if (!zaloAccountId) return fail(422, { error: 'Thiếu nick Zalo', code: 'ACCOUNT_REQUIRED' });
  const account = await resolveAccount(zaloAccountId, orgId); // ném 404 nếu khác org
  if (account.archivedAt) {
    return fail(409, { error: 'Nick này đã bị xoá', code: 'NICK_ARCHIVED' });
  }
  // Nick CHỈ NHẬN (2026-08-03) → chặn ngay lúc cấu hình, không để chiến dịch chạy rồi mới fail.
  if (isChatDisabled(account)) {
    return fail(409, { ...CHAT_DISABLED_BLOCK });
  }
  if (!(await checkAccess(request, reply, zaloAccountId, 'chat'))) {
    return fail(0, {}); // checkAccess đã gửi 403
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

  // ── 4. Nhóm đích ────────────────────────────────────────────────────────
  const rawGroups = body.targetGroupIds === undefined ? current?.targetGroupIds : body.targetGroupIds;
  const targetGroupIds = [...new Set(toStringArray(rawGroups))];
  if (targetGroupIds.length === 0) {
    return fail(422, { error: 'Chọn ít nhất 1 nhóm', code: 'GROUPS_REQUIRED' });
  }
  if (targetGroupIds.length > MAX_GROUPS_PER_BROADCAST) {
    return fail(422, {
      error: `Tối đa ${MAX_GROUPS_PER_BROADCAST} nhóm mỗi chiến dịch`,
      code: 'TOO_MANY_GROUPS',
    });
  }

  // ── 5. Xác thực nhóm có thật (cần nick online) ──────────────────────────
  let groupNamesSnapshot: Record<string, string>;
  const groupsUnchanged =
    current !== undefined &&
    body.targetGroupIds === undefined &&
    (body.zaloAccountId === undefined || body.zaloAccountId === current.zaloAccountId);
  if (groupsUnchanged) {
    // Không đổi nick/nhóm → giữ snapshot cũ, không cần nick online để sửa tên/lịch.
    groupNamesSnapshot = (current.groupNamesSnapshot ?? {}) as Record<string, string>;
  } else {
    const instance = zaloPool.getInstance(zaloAccountId);
    if (!instance?.api || instance.status !== 'connected') {
      return fail(400, {
        error: 'Bật nick Zalo để tải danh sách nhóm',
        code: 'NICK_NOT_CONNECTED',
      });
    }
    const { joinedIds, names } = await fetchGroupNames(zaloAccountId, targetGroupIds);
    const notJoined = targetGroupIds.filter((id) => !joinedIds.has(id));
    if (notJoined.length > 0) {
      return fail(422, {
        error: 'Nick không tham gia một số nhóm đã chọn',
        code: 'GROUP_NOT_JOINED',
        groupIds: notJoined,
      });
    }
    groupNamesSnapshot = names;
  }

  // ── 6. Lịch ─────────────────────────────────────────────────────────────
  const rawKind = body.scheduleKind === undefined ? current?.scheduleKind : body.scheduleKind;
  const scheduleKind = (typeof rawKind === 'string' && SCHEDULE_KINDS.includes(rawKind as ScheduleKind)
    ? rawKind
    : 'now') as ScheduleKind;
  const normalized = normalizeSchedule({
    timesOfDay: body.timesOfDay === undefined ? current?.timesOfDay : toStringArray(body.timesOfDay),
    daysOfWeek: body.daysOfWeek === undefined ? current?.daysOfWeek : toIntArray(body.daysOfWeek),
    daysOfMonth: body.daysOfMonth === undefined ? current?.daysOfMonth : toIntArray(body.daysOfMonth),
  });
  const timezone =
    (typeof body.timezone === 'string' && body.timezone) || current?.timezone || 'Asia/Ho_Chi_Minh';
  const startDate = body.startDate === undefined ? (current?.startDate ?? null) : toDate(body.startDate);
  const endDate = body.endDate === undefined ? (current?.endDate ?? null) : toDate(body.endDate);

  const spec = {
    scheduleKind, timezone, startDate, endDate,
    timesOfDay: normalized.timesOfDay,
    daysOfWeek: normalized.daysOfWeek,
    daysOfMonth: normalized.daysOfMonth,
  };
  const scheduleCheck = validateSchedule(spec);
  if (!scheduleCheck.ok) {
    return fail(422, { error: 'Lịch không hợp lệ', code: 'INVALID_SCHEDULE', errors: scheduleCheck.errors });
  }

  // ── 7. Nhịp gửi ─────────────────────────────────────────────────────────
  const minDelaySec = Number(body.minDelaySec ?? current?.minDelaySec ?? 20);
  const maxDelaySec = Number(body.maxDelaySec ?? current?.maxDelaySec ?? 45);
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

  // ── 8. Ngân sách lượt gửi (ràng buộc chính) ─────────────────────────────
  const timesPerDay = scheduleKind === 'now' ? 1 : normalized.timesOfDay.length;
  const cost = estimateBroadcastCost({
    groupCount: targetGroupIds.length, attachments, hasText, timesPerDay, minDelaySec, maxDelaySec,
  });
  const limit = await getEffectiveLimit(zaloAccountId, 'message');
  const budget = safeBudget(limit.daily);
  if (cost.opsPerDay > budget) {
    return fail(422, {
      error: budgetExceededMessage({
        opsPerDay: cost.opsPerDay, budget, dailyLimit: limit.daily,
        opsPerGroup: cost.opsPerGroup, timesPerDay,
      }),
      code: 'DAILY_BUDGET_EXCEEDED',
      estimate: { ...cost, dailyLimit: limit.daily, budget },
    });
  }

  const minGapSec = minGapBetweenTimesSec(normalized.timesOfDay);
  if (minGapSec < cost.runDurationSec) {
    return fail(422, {
      error:
        `Hai mốc giờ cách nhau ${Math.round(minGapSec / 60)} phút nhưng một lượt gửi mất khoảng ` +
        `${Math.round(cost.runDurationSec / 60)} phút. Giãn mốc giờ ra, hoặc bớt nhóm.`,
      code: 'SCHEDULE_TOO_TIGHT',
      estimate: { ...cost, dailyLimit: limit.daily, budget },
    });
  }

  return {
    ok: true,
    attachments,
    hasText,
    value: {
      name, zaloAccountId, templateId, targetGroupIds, groupNamesSnapshot,
      scheduleKind, timezone, startDate, endDate, minDelaySec, maxDelaySec,
      timesOfDay: normalized.timesOfDay,
      daysOfWeek: normalized.daysOfWeek,
      daysOfMonth: normalized.daysOfMonth,
    },
  };
}

export async function groupBroadcastRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── List ──────────────────────────────────────────────────────────────────
  app.get(
    BASE,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const query = request.query as { state?: string; zaloAccountId?: string };
      try {
        const broadcasts = await prisma.groupBroadcast.findMany({
          where: {
            orgId,
            ...(await ownerScopeWhere(request)),
            ...(query.state ? { state: query.state } : {}),
            ...(query.zaloAccountId ? { zaloAccountId: query.zaloAccountId } : {}),
          },
          orderBy: { updatedAt: 'desc' },
          include: {
            zaloAccount: { select: { id: true, displayName: true } },
            template: { select: { id: true, name: true } },
            _count: { select: { runs: true } },
          },
        });
        return { broadcasts };
      } catch (err) {
        return handleError(reply, err, 'listGroupBroadcasts');
      }
    },
  );

  // ── Estimate (chỉ đọc, cho UI hiện realtime) ──────────────────────────────
  // Đăng ký TRƯỚC `/:id` để không bị nuốt thành id='estimate'.
  app.post(
    `${BASE}/estimate`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const body = (request.body ?? {}) as BroadcastBody & { groupCount?: unknown };
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

        const groupCount = Array.isArray(body.targetGroupIds)
          ? body.targetGroupIds.length
          : Number(body.groupCount) || 0;
        const kindRaw = typeof body.scheduleKind === 'string' ? body.scheduleKind : 'now';
        const timesOfDay = toStringArray(body.timesOfDay);
        const timesPerDay = kindRaw === 'now' ? 1 : timesOfDay.length;
        const minDelaySec = Number(body.minDelaySec ?? 20);
        const maxDelaySec = Number(body.maxDelaySec ?? 45);

        const cost = estimateBroadcastCost({
          groupCount, attachments, hasText, timesPerDay, minDelaySec, maxDelaySec,
        });

        // `getEffectiveLimit` tự suy org TỪ chính nick → phải chốt nick thuộc org
        // của người gọi trước, nếu không đây là đường đọc hạn mức của tenant khác.
        const zaloAccountId = typeof body.zaloAccountId === 'string' ? body.zaloAccountId : '';
        if (zaloAccountId) await resolveAccount(zaloAccountId, orgId);
        const limit = zaloAccountId
          ? await getEffectiveLimit(zaloAccountId, 'message')
          : { daily: 200, burst: 20, burstWindowMs: 30_000 };
        const budget = safeBudget(limit.daily);

        const warnings: string[] = [];
        if (cost.opsPerDay > budget) {
          warnings.push(budgetExceededMessage({
            opsPerDay: cost.opsPerDay, budget, dailyLimit: limit.daily,
            opsPerGroup: cost.opsPerGroup, timesPerDay,
          }));
        }
        const minGapSec = minGapBetweenTimesSec(timesOfDay);
        if (minGapSec < cost.runDurationSec) {
          warnings.push(
            `Hai mốc giờ cách nhau ${Math.round(minGapSec / 60)} phút nhưng một lượt gửi mất ` +
            `khoảng ${Math.round(cost.runDurationSec / 60)} phút.`,
          );
        }

        return { ...cost, dailyLimit: limit.daily, budget, warnings };
      } catch (err) {
        return handleError(reply, err, 'estimateGroupBroadcast');
      }
    },
  );

  // ── Create ────────────────────────────────────────────────────────────────
  app.post(
    BASE,
    { preHandler: requireGrant('broadcast', 'create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      try {
        const result = await validateBroadcastInput(request, reply, (request.body ?? {}) as BroadcastBody);
        if (!result.ok) {
          if (result.status === 0) return; // checkAccess đã trả 403
          return reply.status(result.status).send(result.body);
        }
        const broadcast = await prisma.groupBroadcast.create({
          data: { ...result.value, orgId, state: 'draft', createdById: userIdOf(request) },
        });
        return reply.status(201).send({ broadcast });
      } catch (err) {
        return handleError(reply, err, 'createGroupBroadcast');
      }
    },
  );

  // ── Detail ────────────────────────────────────────────────────────────────
  app.get(
    `${BASE}/:id`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const broadcast = await prisma.groupBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          include: {
            zaloAccount: { select: { id: true, displayName: true } },
            template: true,
          },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        const attachments = await resolveTemplateAttachments(orgId, broadcast.template.attachments);
        return { broadcast, attachments };
      } catch (err) {
        return handleError(reply, err, 'getGroupBroadcast');
      }
    },
  );

  // ── Update ────────────────────────────────────────────────────────────────
  app.patch(
    `${BASE}/:id`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.groupBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });

        const result = await validateBroadcastInput(
          request, reply, (request.body ?? {}) as BroadcastBody, current,
        );
        if (!result.ok) {
          if (result.status === 0) return;
          return reply.status(result.status).send(result.body);
        }

        // Sửa lúc đang chạy KHÔNG ảnh hưởng run đang chạy — worker đã snapshot
        // target lúc materialize. Chỉ tính lại nextRunAt cho lượt sau.
        const nextRunAt =
          current.state === 'active' ? nextOccurrence(scheduleSpecOf(result.value), new Date()) : current.nextRunAt;

        const broadcast = await prisma.groupBroadcast.update({
          where: { id },
          data: { ...result.value, nextRunAt },
        });
        return { broadcast };
      } catch (err) {
        return handleError(reply, err, 'updateGroupBroadcast');
      }
    },
  );

  // ── Cancel (không xoá cứng — giữ lịch sử run) ─────────────────────────────
  app.delete(
    `${BASE}/:id`,
    { preHandler: requireGrant('broadcast', 'delete') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.groupBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        const broadcast = await prisma.groupBroadcast.update({
          where: { id },
          data: { state: 'cancelled', nextRunAt: null },
        });
        return { broadcast };
      } catch (err) {
        return handleError(reply, err, 'cancelGroupBroadcast');
      }
    },
  );

  // ── Activate ──────────────────────────────────────────────────────────────
  app.post(
    `${BASE}/:id/activate`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.groupBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        if (!['draft', 'paused'].includes(current.state)) {
          return reply.status(409).send({
            error: `Không bật được chiến dịch đang ở trạng thái ${current.state}`,
            code: 'INVALID_STATE',
          });
        }

        // Bật lịch = kiểm lại ngân sách; cấu hình có thể đã đổi (mẫu tin thêm ảnh,
        // hạn mức nick bị siết) kể từ lúc lưu nháp.
        const result = await validateBroadcastInput(request, reply, {}, current);
        if (!result.ok) {
          if (result.status === 0) return;
          return reply.status(result.status).send(result.body);
        }

        const broadcast = await prisma.groupBroadcast.update({
          where: { id },
          data: {
            state: 'active',
            pausedReason: null,
            consecutiveFailedRuns: 0,
            nextRunAt: nextOccurrence(scheduleSpecOf(current), new Date()),
          },
        });

        // scheduleKind='now' không có mốc giờ nào và cron cố tình bỏ qua nó, nên
        // "bật lịch" phải tạo lượt gửi NGAY — nếu không chiến dịch nằm `active`
        // vĩnh viễn mà chẳng bao giờ gửi. Worker sẽ tự đóng `completed` sau lượt.
        if (current.scheduleKind === 'now') {
          try {
            const run = await materializeRun(
              current, new Date(Math.floor(Date.now() / 1000) * 1000), 'schedule',
            );
            return { broadcast, run };
          } catch (err) {
            // Đã có lượt cùng giây (bấm 2 lần) → coi như bật thành công.
            if ((err as { code?: string })?.code !== 'P2002') throw err;
          }
        }
        return { broadcast };
      } catch (err) {
        return handleError(reply, err, 'activateGroupBroadcast');
      }
    },
  );

  // ── Pause ─────────────────────────────────────────────────────────────────
  app.post(
    `${BASE}/:id/pause`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const current = await prisma.groupBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true, state: true },
        });
        if (!current) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        if (current.state !== 'active') {
          return reply.status(409).send({ error: 'Chiến dịch không ở trạng thái đang chạy', code: 'INVALID_STATE' });
        }
        const broadcast = await prisma.groupBroadcast.update({
          where: { id },
          data: { state: 'paused', pausedReason: null, nextRunAt: null },
        });
        return { broadcast };
      } catch (err) {
        return handleError(reply, err, 'pauseGroupBroadcast');
      }
    },
  );

  // ── Run now ───────────────────────────────────────────────────────────────
  app.post(
    `${BASE}/:id/run-now`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const broadcast = await prisma.groupBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true, orgId: true, state: true, targetGroupIds: true, groupNamesSnapshot: true },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        if (['cancelled', 'completed'].includes(broadcast.state)) {
          return reply.status(409).send({ error: 'Chiến dịch đã kết thúc', code: 'INVALID_STATE' });
        }

        // Làm tròn xuống giây → 2 lần bấm trong cùng giây đụng unique constraint.
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
        return handleError(reply, err, 'runGroupBroadcastNow');
      }
    },
  );

  // ── Runs của 1 chiến dịch ─────────────────────────────────────────────────
  app.get(
    `${BASE}/:id/runs`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      const query = request.query as { limit?: string; offset?: string };
      try {
        const broadcast = await prisma.groupBroadcast.findFirst({
          where: { id, orgId, ...(await ownerScopeWhere(request)) },
          select: { id: true },
        });
        if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
        const runs = await prisma.groupBroadcastRun.findMany({
          where: { broadcastId: id, orgId },
          orderBy: { scheduledFor: 'desc' },
          take: Math.min(Number(query.limit) || 20, 100),
          skip: Number(query.offset) || 0,
        });
        return { runs };
      } catch (err) {
        return handleError(reply, err, 'listGroupBroadcastRuns');
      }
    },
  );

  // ── Chi tiết 1 run (bảng từng nhóm) ───────────────────────────────────────
  app.get(
    `${RUNS_BASE}/:runId`,
    { preHandler: requireGrant('broadcast', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { runId } = request.params as { runId: string };
      try {
        const run = await prisma.groupBroadcastRun.findFirst({
          where: { id: runId, orgId, broadcast: await ownerScopeWhere(request) },
          include: {
            targets: { orderBy: { createdAt: 'asc' } },
            broadcast: { select: { id: true, name: true } },
          },
        });
        if (!run) return reply.status(404).send({ error: 'Không tìm thấy lượt gửi' });
        return { run };
      } catch (err) {
        return handleError(reply, err, 'getGroupBroadcastRun');
      }
    },
  );

  // ── Gửi lại nhóm lỗi ──────────────────────────────────────────────────────
  app.post(
    `${RUNS_BASE}/:runId/retry-failed`,
    { preHandler: requireGrant('broadcast', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const { runId } = request.params as { runId: string };
      try {
        const run = await prisma.groupBroadcastRun.findFirst({
          where: { id: runId, orgId, broadcast: await ownerScopeWhere(request) },
          select: {
            id: true,
            broadcast: {
              select: { id: true, orgId: true, targetGroupIds: true, groupNamesSnapshot: true },
            },
          },
        });
        if (!run) return reply.status(404).send({ error: 'Không tìm thấy lượt gửi' });

        const failed = await prisma.groupBroadcastTarget.findMany({
          where: { runId, state: 'failed' },
          select: { id: true, groupId: true, groupName: true, attempts: true, sentSteps: true },
        });
        if (failed.length === 0) {
          return reply.status(400).send({ error: 'Không có nhóm nào bị lỗi', code: 'NO_FAILED_TARGETS' });
        }

        // Nhóm đã thử quá 3 lần → bỏ khỏi lượt gửi lại, trả về để UI báo rõ.
        const retryable = failed.filter((t) => t.attempts < MAX_TARGET_ATTEMPTS);
        const skipped = failed.filter((t) => t.attempts >= MAX_TARGET_ATTEMPTS);
        if (retryable.length === 0) {
          return reply.status(400).send({
            error: `Mọi nhóm lỗi đều đã thử quá ${MAX_TARGET_ATTEMPTS} lần`,
            code: 'TOO_MANY_ATTEMPTS',
            skipped,
          });
        }

        // Tạo run MỚI thay vì mở lại run cũ. Enqueue dùng `jobId = gb-<runId>`
        // và job của run cũ còn nằm trong Redis (removeOnComplete giữ 24h), nên
        // re-enqueue cùng runId bị BullMQ nuốt im lặng → run kẹt `pending`, chặn
        // cả lịch bằng PREVIOUS_RUN_ACTIVE. Run mới cũng giữ nguyên lịch sử lượt cũ.
        const scheduledFor = new Date(Math.floor(Date.now() / 1000) * 1000);
        let newRun: { id: string };
        try {
          newRun = await materializeRun(
            run.broadcast, scheduledFor, 'retry', retryable.map((t) => t.groupId),
          );
        } catch (err) {
          if ((err as { code?: string })?.code === 'P2002') {
            return reply.status(409).send({ error: 'Lượt gửi lại vừa được xếp hàng', code: 'RUN_ALREADY_QUEUED' });
          }
          throw err;
        }

        // Chuyển tiếp tiến độ từng phần: nhóm đã gửi được đoạn chữ rồi thì lượt
        // mới bỏ qua đúng số bước đó, không gửi trùng.
        for (const t of retryable.filter((x) => x.sentSteps > 0)) {
          await prisma.groupBroadcastTarget.updateMany({
            where: { runId: newRun.id, groupId: t.groupId },
            data: { sentSteps: t.sentSteps, attempts: t.attempts },
          });
        }

        logger.info(
          `[group-broadcast-routes] retry-failed run=${runId} → run mới ${newRun.id} ` +
          `retry=${retryable.length} skip=${skipped.length}`,
        );
        return { runId: newRun.id, retried: retryable.length, skipped };
      } catch (err) {
        return handleError(reply, err, 'retryFailedTargets');
      }
    },
  );
}
