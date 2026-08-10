// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * birthday-routes.ts — Lời chúc sinh nhật tự động (🟢 Community).
 *
 * PREFIX RIÊNG `/api/v1/birthday-greetings`.
 *
 * Quyền: đọc cấu hình cho mọi user đã đăng nhập (sale cần biết hệ thống có tự
 * chúc hay không để khỏi chúc trùng); SỬA cấu hình chỉ owner/admin — cùng mức
 * với các trang cài đặt cấp org khác.
 *
 * Community feature — KHÔNG import `_ee`.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  cancelObsoletePending, planForOrg, templateIdFor, type BirthdayConfig,
} from './birthday-planner.js';
import { sendBirthdayGreeting } from './birthday-sender.js';
import {
  MAX_LATE_TOLERANCE_MINUTES, MAX_OFFSET_DAYS, MIN_OFFSET_DAYS,
  OCCASION_KINDS, OCCASION_LABELS, isOccasionEnabled, validateSchedule, scheduleSpecOf,
} from './birthday-schedule.js';

const BASE = '/api/v1/birthday-greetings';

/** Cùng ngưỡng an toàn với chiến dịch nhắn tệp — nick là tài nguyên dùng chung. */
const MAX_DAILY_QUOTA = 1000;
const MIN_DELAY_SEC = 5;
const MAX_DELAY_SEC = 600;
const MAX_NICKS = 20;

const CONFIG_SELECT = {
  id: true, orgId: true, enabled: true, timezone: true, sendTime: true,
  lateToleranceMinutes: true,
  beforeEnabled: true, beforeDays: true, beforeTemplateId: true,
  onDayEnabled: true, onDayTemplateId: true,
  afterEnabled: true, afterDays: true, afterTemplateId: true,
  senderMode: true, zaloAccountIds: true,
  dailyQuota: true, perNickDailyQuota: true,
  minDelaySec: true, maxDelaySec: true, createdById: true,
} as const;

/** Cấu hình mặc định khi org chưa từng mở trang này. Không ghi DB. */
function defaultConfig(orgId: string): BirthdayConfig {
  return {
    id: '', orgId, enabled: false,
    timezone: 'Asia/Ho_Chi_Minh', sendTime: '09:00', lateToleranceMinutes: 180,
    beforeEnabled: false, beforeDays: 3, beforeTemplateId: null,
    onDayEnabled: true, onDayTemplateId: null,
    afterEnabled: false, afterDays: 1, afterTemplateId: null,
    senderMode: 'assigned', zaloAccountIds: [],
    dailyQuota: 200, perNickDailyQuota: 40, minDelaySec: 30, maxDelaySec: 90,
    createdById: null,
  };
}

interface SettingsBody {
  enabled?: unknown;
  timezone?: unknown;
  sendTime?: unknown;
  lateToleranceMinutes?: unknown;
  beforeEnabled?: unknown;
  beforeDays?: unknown;
  beforeTemplateId?: unknown;
  onDayEnabled?: unknown;
  onDayTemplateId?: unknown;
  afterEnabled?: unknown;
  afterDays?: unknown;
  afterTemplateId?: unknown;
  senderMode?: unknown;
  zaloAccountIds?: unknown;
  dailyQuota?: unknown;
  perNickDailyQuota?: unknown;
  minDelaySec?: unknown;
  maxDelaySec?: unknown;
}

function toBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function toInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toNullableId(raw: unknown, fallback: string | null): string | null {
  if (raw === undefined) return fallback;
  if (raw === null || raw === '') return null;
  return typeof raw === 'string' ? raw : fallback;
}

type ValidateOutcome =
  | { ok: true; value: BirthdayConfig }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Gộp body vào cấu hình hiện tại rồi validate TOÀN BỘ kết quả.
 *
 * Validate trên kết quả gộp (không phải trên riêng body) vì các trường ràng buộc
 * lẫn nhau: bật `before` mà `beforeDays` vẫn là giá trị cũ không hợp lệ thì phải
 * chặn, dù request không hề gửi `beforeDays`.
 */
async function validateSettings(
  orgId: string, current: BirthdayConfig, body: SettingsBody,
): Promise<ValidateOutcome> {
  const fail = (status: number, out: Record<string, unknown>): ValidateOutcome =>
    ({ ok: false, status, body: out });

  const next: BirthdayConfig = {
    ...current,
    enabled: toBool(body.enabled, current.enabled),
    timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : current.timezone,
    sendTime: typeof body.sendTime === 'string' && body.sendTime ? body.sendTime : current.sendTime,
    lateToleranceMinutes: toInt(body.lateToleranceMinutes, current.lateToleranceMinutes),
    beforeEnabled: toBool(body.beforeEnabled, current.beforeEnabled),
    beforeDays: toInt(body.beforeDays, current.beforeDays),
    beforeTemplateId: toNullableId(body.beforeTemplateId, current.beforeTemplateId),
    onDayEnabled: toBool(body.onDayEnabled, current.onDayEnabled),
    onDayTemplateId: toNullableId(body.onDayTemplateId, current.onDayTemplateId),
    afterEnabled: toBool(body.afterEnabled, current.afterEnabled),
    afterDays: toInt(body.afterDays, current.afterDays),
    afterTemplateId: toNullableId(body.afterTemplateId, current.afterTemplateId),
    senderMode: body.senderMode === 'pool' || body.senderMode === 'assigned'
      ? body.senderMode
      : current.senderMode,
    zaloAccountIds: Array.isArray(body.zaloAccountIds)
      ? body.zaloAccountIds.filter((s): s is string => typeof s === 'string')
      : current.zaloAccountIds,
    dailyQuota: toInt(body.dailyQuota, current.dailyQuota),
    perNickDailyQuota: toInt(body.perNickDailyQuota, current.perNickDailyQuota),
    minDelaySec: toInt(body.minDelaySec, current.minDelaySec),
    maxDelaySec: toInt(body.maxDelaySec, current.maxDelaySec),
  };

  const schedule = validateSchedule(scheduleSpecOf(next));
  if (!schedule.ok) {
    return fail(400, {
      error: 'schedule_invalid',
      details: schedule.errors,
      hint:
        `Kiểm tra múi giờ, giờ gửi 'HH:mm', số ngày trước/sau ` +
        `(${MIN_OFFSET_DAYS}-${MAX_OFFSET_DAYS}), độ trễ cho phép ` +
        `(0-${MAX_LATE_TOLERANCE_MINUTES} phút) và phải bật ít nhất một dịp.`,
    });
  }

  if (next.dailyQuota < 1 || next.dailyQuota > MAX_DAILY_QUOTA) {
    return fail(400, { error: 'daily_quota_invalid', hint: `Từ 1 đến ${MAX_DAILY_QUOTA} tin/ngày` });
  }
  if (next.perNickDailyQuota < 1 || next.perNickDailyQuota > MAX_DAILY_QUOTA) {
    return fail(400, { error: 'per_nick_quota_invalid', hint: `Từ 1 đến ${MAX_DAILY_QUOTA} tin/ngày/nick` });
  }
  if (next.minDelaySec < MIN_DELAY_SEC || next.maxDelaySec > MAX_DELAY_SEC) {
    return fail(400, {
      error: 'delay_invalid',
      hint: `Giãn cách phải từ ${MIN_DELAY_SEC} đến ${MAX_DELAY_SEC} giây`,
    });
  }
  if (next.minDelaySec > next.maxDelaySec) {
    return fail(400, { error: 'delay_range_invalid', hint: 'Giãn cách tối thiểu phải ≤ tối đa' });
  }
  if (next.zaloAccountIds.length > MAX_NICKS) {
    return fail(400, { error: 'too_many_nicks', hint: `Tối đa ${MAX_NICKS} nick` });
  }

  // Nick phải thuộc org và còn dùng được — chọn nick của org khác là lỗ hổng.
  if (next.zaloAccountIds.length > 0) {
    const found = await prisma.zaloAccount.count({
      where: { id: { in: next.zaloAccountIds }, orgId, archivedAt: null },
    });
    if (found !== new Set(next.zaloAccountIds).size) {
      return fail(400, { error: 'nick_invalid', hint: 'Có nick không thuộc tổ chức hoặc đã lưu trữ' });
    }
  }

  // Chế độ 'pool' KHÔNG có nick nào thì không bao giờ gửi được → chặn ngay lúc lưu
  // thay vì để admin phát hiện qua một hàng đợi im lặng.
  if (next.enabled && next.senderMode === 'pool' && next.zaloAccountIds.length === 0) {
    return fail(400, { error: 'nick_required', hint: 'Chế độ "luân phiên nick" cần chọn ít nhất 1 nick' });
  }

  // Dịp đã bật thì bắt buộc có mẫu tin.
  const spec = scheduleSpecOf(next);
  for (const occasion of OCCASION_KINDS) {
    if (!isOccasionEnabled(spec, occasion)) continue;
    const templateId = templateIdFor(next, occasion);
    if (!templateId) {
      return fail(400, {
        error: 'template_required',
        occasion,
        hint: `Dịp "${OCCASION_LABELS[occasion]}" đang bật nhưng chưa chọn mẫu tin`,
      });
    }
    const template = await prisma.messageTemplate.findFirst({
      where: { id: templateId, orgId, archivedAt: null },
      select: { id: true },
    });
    if (!template) {
      return fail(400, {
        error: 'template_invalid',
        occasion,
        hint: `Mẫu tin của dịp "${OCCASION_LABELS[occasion]}" không tồn tại hoặc đã xoá`,
      });
    }
  }

  return { ok: true, value: next };
}

/** Cấu hình hiện tại, hoặc mặc định (chưa ghi DB) khi org chưa cấu hình lần nào. */
async function loadOrDefault(orgId: string): Promise<BirthdayConfig> {
  const row = await prisma.birthdayGreetingConfig.findUnique({
    where: { orgId },
    select: CONFIG_SELECT,
  });
  return row ?? defaultConfig(orgId);
}

function isAdmin(request: FastifyRequest): boolean {
  return ['owner', 'admin'].includes(request.user?.role ?? '');
}

export async function birthdayRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /settings — cấu hình hiện tại ───────────────────────────────────
  app.get(`${BASE}/settings`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user!.orgId;
      const config = await loadOrDefault(orgId);
      // Chưa có mẫu tin nào thì UI phải mời tạo mẫu trước, không để admin bật rồi
      // mới phát hiện không chọn được gì.
      const templateCount = await prisma.messageTemplate.count({
        where: { orgId, archivedAt: null },
      });
      return { ...config, canEdit: isAdmin(request), templateCount };
    } catch (err) {
      logger.error('[birthday] settings get lỗi:', err);
      return reply.status(500).send({ error: 'Không tải được cài đặt sinh nhật' });
    }
  });

  // ── PUT /settings — lưu cấu hình ────────────────────────────────────────
  app.put(`${BASE}/settings`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user!.orgId;
      const userId = request.user!.id;
      if (!isAdmin(request)) return reply.status(403).send({ error: 'forbidden' });

      const current = await loadOrDefault(orgId);
      const outcome = await validateSettings(orgId, current, (request.body ?? {}) as SettingsBody);
      if (!outcome.ok) return reply.status(outcome.status).send(outcome.body);
      const next = outcome.value;

      const saved = await prisma.birthdayGreetingConfig.upsert({
        where: { orgId },
        create: {
          orgId,
          enabled: next.enabled,
          timezone: next.timezone,
          sendTime: next.sendTime,
          lateToleranceMinutes: next.lateToleranceMinutes,
          beforeEnabled: next.beforeEnabled,
          beforeDays: next.beforeDays,
          beforeTemplateId: next.beforeTemplateId,
          onDayEnabled: next.onDayEnabled,
          onDayTemplateId: next.onDayTemplateId,
          afterEnabled: next.afterEnabled,
          afterDays: next.afterDays,
          afterTemplateId: next.afterTemplateId,
          senderMode: next.senderMode,
          zaloAccountIds: next.zaloAccountIds,
          dailyQuota: next.dailyQuota,
          perNickDailyQuota: next.perNickDailyQuota,
          minDelaySec: next.minDelaySec,
          maxDelaySec: next.maxDelaySec,
          createdById: userId,
        },
        update: {
          enabled: next.enabled,
          timezone: next.timezone,
          sendTime: next.sendTime,
          lateToleranceMinutes: next.lateToleranceMinutes,
          beforeEnabled: next.beforeEnabled,
          beforeDays: next.beforeDays,
          beforeTemplateId: next.beforeTemplateId,
          onDayEnabled: next.onDayEnabled,
          onDayTemplateId: next.onDayTemplateId,
          afterEnabled: next.afterEnabled,
          afterDays: next.afterDays,
          afterTemplateId: next.afterTemplateId,
          senderMode: next.senderMode,
          zaloAccountIds: next.zaloAccountIds,
          dailyQuota: next.dailyQuota,
          perNickDailyQuota: next.perNickDailyQuota,
          minDelaySec: next.minDelaySec,
          maxDelaySec: next.maxDelaySec,
          createdById: userId,
        },
        select: CONFIG_SELECT,
      });

      // Dựng lại hàng đợi NGAY để admin thấy kết quả của thay đổi mình vừa lưu,
      // không phải chờ tới tick lập kế hoạch kế tiếp.
      const cancelled = await cancelObsoletePending(saved);
      const planned = await planForOrg(saved);

      return { ...saved, canEdit: true, cancelled, planned: planned.created };
    } catch (err) {
      logger.error('[birthday] settings put lỗi:', err);
      return reply.status(500).send({ error: 'Lưu cài đặt sinh nhật thất bại' });
    }
  });

  // ── GET /upcoming — hàng đợi lời chúc (mặc định 14 ngày gần đây) ─────────
  app.get(`${BASE}/upcoming`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user!.orgId;
      const { state = '', limit = '50' } = request.query as Record<string, string>;
      const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const since = new Date(Date.now() - 14 * 86_400_000);

      const rows = await prisma.birthdayGreeting.findMany({
        where: {
          orgId,
          dueAt: { gte: since },
          ...(state ? { state } : {}),
        },
        select: {
          id: true, occasion: true, birthdayOn: true, dueAt: true, state: true,
          sentAt: true, errorCode: true, errorMessage: true,
          // `zaloAccountId` trần (không relation) — cùng khuôn với hàng đợi gửi tệp;
          // FE đã có danh sách nick nên tự tra tên, khỏi join thêm ở đây.
          zaloAccountId: true,
          contact: { select: { id: true, fullName: true, phone: true, birthDate: true } },
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take,
      });

      return {
        items: rows.map((r) => ({
          ...r,
          occasionLabel: OCCASION_LABELS[r.occasion as keyof typeof OCCASION_LABELS] ?? r.occasion,
        })),
      };
    } catch (err) {
      logger.error('[birthday] upcoming lỗi:', err);
      return reply.status(500).send({ error: 'Không tải được danh sách lời chúc' });
    }
  });

  // ── POST /:id/send-now — gửi ngay, bỏ qua giờ hẹn ───────────────────────
  app.post(`${BASE}/:id/send-now`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user!.orgId;
      if (!isAdmin(request)) return reply.status(403).send({ error: 'forbidden' });
      const { id } = request.params as { id: string };

      const greeting = await prisma.birthdayGreeting.findFirst({
        where: { id, orgId },
        select: { id: true, state: true, configId: true },
      });
      if (!greeting) return reply.status(404).send({ error: 'not_found' });
      if (greeting.state !== 'pending') {
        return reply.status(409).send({ error: 'not_pending', state: greeting.state });
      }

      const config = await prisma.birthdayGreetingConfig.findFirst({
        where: { id: greeting.configId, orgId },
        select: CONFIG_SELECT,
      });
      if (!config) return reply.status(404).send({ error: 'config_not_found' });

      // Gửi tay là quyết định có chủ đích của admin → bỏ trần trễ, giữ nguyên
      // các gate còn lại (hạn mức, mẫu tin, nick).
      const outcome = await sendBirthdayGreeting(
        greeting.id,
        { ...config, lateToleranceMinutes: MAX_LATE_TOLERANCE_MINUTES },
        new Date(),
      );
      return { outcome };
    } catch (err) {
      logger.error('[birthday] send-now lỗi:', err);
      return reply.status(500).send({ error: 'Gửi lời chúc thất bại' });
    }
  });
}
