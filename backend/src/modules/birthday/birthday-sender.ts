// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Chúc sinh nhật (🟢 Community) — gửi MỘT lời chúc.
// ════════════════════════════════════════════════════════════════════════
//
// Dùng lại nguyên khối gửi 1-1 của chiến dịch nhắn tệp (`sendToUser`): cùng
// chuỗi bước chữ → album ảnh → từng video/tệp, cùng cách ghi Message để sale
// thấy trong /chat, cùng cách phân loại lỗi. Ở đây chỉ khác hai chỗ:
//
//   1. Chọn nick theo QUAN HỆ SẴN CÓ (`senderMode='assigned'`): lời chúc nên đến
//      từ đúng người khách vẫn nhắn, không phải một nick lạ trong vòng xoay.
//   2. Thay biến trong mẫu tin: gọi hook EE trước, rồi bộ thay biến tối thiểu của
//      core dọn phần còn lại — lời chúc sai tên tệ hơn không chúc.
//
// Community feature — KHÔNG import `_ee`.

import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { renderTemplate } from '../../shared/ee-registry/automation.js';
import { resolveTemplateAttachments } from '../chat/message-template-service.js';
import { prepareMedia, classifySendError } from '../zalo/group-broadcast-send.js';
import { digitsOf, sendToUser } from '../zalo/list-broadcast-send.js';
import {
  dayBoundsUtc, isTooLate, isOccasionEnabled, scheduleSpecOf,
  OCCASION_KINDS, OCCASION_LABELS, type OccasionKind,
} from './birthday-schedule.js';
import { renderBirthdayFallback } from './birthday-template.js';
import { templateIdFor, type BirthdayConfig } from './birthday-planner.js';

/** Hội thoại "ảo" chưa có UID thật — externalThreadId là mã nội bộ, gửi sẽ hỏng. */
const VIRTUAL_THREAD_PREFIX = 'virtual:';

let io: Server | null = null;
export function setBirthdayIo(server: Server | null): void {
  io = server;
}

/** Nick còn kết nối và chưa chạm hạn mức Zalo — kiểm ngay trước khi gửi. */
async function nickReady(nickId: string): Promise<boolean> {
  const instance = zaloPool.getInstance(nickId);
  if (!instance?.api || instance.status !== 'connected') return false;
  const limits = await zaloRateLimiter.checkLimits(nickId, 'message');
  return limits.allowed;
}

/** Nick còn hạn mức lời chúc trong ngày. Đếm trên TOÀN ORG vì nick dùng chung. */
async function nickHasQuota(
  orgId: string, nickId: string, perNickDailyQuota: number, day: { start: Date; end: Date },
): Promise<boolean> {
  const sentToday = await prisma.birthdayGreeting.count({
    where: {
      orgId, zaloAccountId: nickId, state: 'sent',
      sentAt: { gte: day.start, lt: day.end },
    },
  });
  return sentToday < perNickDailyQuota;
}

/** Nick bật chat và chưa lưu trữ. Nick "chỉ nhận" gửi tin nào cũng hỏng. */
async function nickSendable(orgId: string, nickId: string): Promise<boolean> {
  const acc = await prisma.zaloAccount.findFirst({
    where: { id: nickId, orgId, archivedAt: null, chatEnabled: true },
    select: { id: true },
  });
  return acc !== null;
}

export interface ResolvedSender {
  nickId: string;
  /** UID theo GÓC NHÌN của `nickId` — UID của nick khác sẽ bị Zalo từ chối. */
  uid: string;
  globalId: string | null;
}

/**
 * Nick đang có hội thoại 1-1 với khách, mới nhất trước.
 * `externalThreadId` của hội thoại CHÍNH LÀ UID theo góc nhìn nick đó → khỏi tra cứu.
 */
async function pickAssignedNick(
  contactId: string, config: BirthdayConfig, day: { start: Date; end: Date },
): Promise<ResolvedSender | null> {
  const conversations = await prisma.conversation.findMany({
    where: {
      orgId: config.orgId,
      contactId,
      threadType: 'user',
      deletedAt: null,
      externalThreadId: { not: null },
    },
    select: { zaloAccountId: true, externalThreadId: true },
    orderBy: { lastMessageAt: 'desc' },
    take: 10,
  });

  for (const conv of conversations) {
    const uid = conv.externalThreadId ?? '';
    if (!uid || uid.startsWith(VIRTUAL_THREAD_PREFIX)) continue;
    if (!(await nickSendable(config.orgId, conv.zaloAccountId))) continue;
    if (!(await nickHasQuota(config.orgId, conv.zaloAccountId, config.perNickDailyQuota, day))) continue;
    if (!(await nickReady(conv.zaloAccountId))) continue;
    return { nickId: conv.zaloAccountId, uid, globalId: null };
  }
  return null;
}

/**
 * Nick trong danh sách cấu hình, thử lần lượt. UID tra theo thứ tự rẻ → đắt:
 * Friend (đã kết bạn, chuẩn nhất) → hội thoại sẵn có → `findUser` (tốn hạn mức).
 */
async function pickPoolNick(
  contactId: string, phone: string | null, config: BirthdayConfig, day: { start: Date; end: Date },
): Promise<ResolvedSender | null> {
  for (const nickId of config.zaloAccountIds) {
    if (!(await nickSendable(config.orgId, nickId))) continue;
    if (!(await nickHasQuota(config.orgId, nickId, config.perNickDailyQuota, day))) continue;
    if (!(await nickReady(nickId))) continue;

    const friend = await prisma.friend.findFirst({
      where: { orgId: config.orgId, zaloAccountId: nickId, contactId },
      select: { zaloUidInNick: true, zaloGlobalId: true },
    });
    if (friend?.zaloUidInNick) {
      return { nickId, uid: friend.zaloUidInNick, globalId: friend.zaloGlobalId };
    }

    const conv = await prisma.conversation.findFirst({
      where: {
        orgId: config.orgId, contactId, zaloAccountId: nickId, threadType: 'user',
        deletedAt: null, externalThreadId: { not: null },
      },
      select: { externalThreadId: true },
      orderBy: { lastMessageAt: 'desc' },
    });
    const convUid = conv?.externalThreadId ?? '';
    if (convUid && !convUid.startsWith(VIRTUAL_THREAD_PREFIX)) {
      return { nickId, uid: convUid, globalId: null };
    }

    if (!phone) continue;
    try {
      const found = (await zaloOps.findUser(nickId, digitsOf(phone))) as Record<string, unknown> | null;
      const uid = String(found?.uid ?? found?.userId ?? '') || null;
      if (uid) return { nickId, uid, globalId: String(found?.globalId ?? '') || null };
    } catch (err) {
      // Nick rớt / chạm hạn mức tra cứu là vấn đề của NICK — thử nick kế tiếp.
      logger.warn(
        `[birthday-sender] findUser lỗi (nick=${nickId}): ${(err as Error).message}`,
      );
    }
  }
  return null;
}

/**
 * Chọn nick + UID để gửi.
 *
 * `senderMode='assigned'` vẫn RƠI VỀ pool khi khách chưa có hội thoại dùng được:
 * thà gửi bằng nick khác còn hơn bỏ sinh nhật của khách.
 */
export async function resolveSender(
  contactId: string, phone: string | null, config: BirthdayConfig, day: { start: Date; end: Date },
): Promise<ResolvedSender | null> {
  if (config.senderMode === 'assigned') {
    const assigned = await pickAssignedNick(contactId, config, day);
    if (assigned) return assigned;
  }
  return pickPoolNick(contactId, phone, config, day);
}

/**
 * Nội dung gửi cho một khách: thay biến rồi trả chữ đã sẵn sàng.
 *
 * Hook EE chạy trước (bộ biến đầy đủ), core dọn phần còn sót. Bản Community
 * không có hook → hook trả nguyên văn và core làm toàn bộ việc thay biến.
 */
export async function renderGreetingText(args: {
  raw: string;
  contactId: string;
  nickId: string;
  contact: Parameters<typeof renderBirthdayFallback>[1]['contact'];
  saleFullName: string | null;
  now: Date;
}): Promise<string> {
  let text = args.raw;
  try {
    text = await renderTemplate(text, args.contactId, args.nickId);
  } catch (err) {
    logger.warn(`[birthday-sender] renderTemplate lỗi: ${(err as Error).message}`);
  }
  return renderBirthdayFallback(text, {
    contact: args.contact,
    saleFullName: args.saleFullName,
    now: args.now,
  }).trim();
}

export type SendOutcome =
  | { kind: 'sent' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; errorCode: string };

/**
 * Gửi một lời chúc đang `pending`. Gọi trong `withTenant(orgId)`.
 *
 * Mọi nhánh đều CHỐT trạng thái bản ghi (sent/skipped/failed) — không để lại
 * `pending` treo, nếu không cron sẽ thử lại vô hạn cùng một bản ghi hỏng.
 */
export async function sendBirthdayGreeting(
  greetingId: string, config: BirthdayConfig, now: Date = new Date(),
): Promise<SendOutcome> {
  const greeting = await prisma.birthdayGreeting.findFirst({
    where: { id: greetingId, orgId: config.orgId },
    select: {
      id: true, contactId: true, occasion: true, dueAt: true, state: true, attempts: true,
      contact: {
        select: {
          fullName: true, crmName: true, gender: true, phone: true, email: true,
          occupation: true, birthYear: true, birthDate: true,
          assignedUser: { select: { fullName: true } },
        },
      },
    },
  });
  // Job trùng hoặc bản ghi đã bị huỷ khi admin sửa cấu hình.
  if (!greeting || greeting.state !== 'pending') return { kind: 'skipped', reason: 'NOT_PENDING' };

  const occasion = greeting.occasion as OccasionKind;
  const finishSkipped = async (reason: string): Promise<SendOutcome> => {
    await prisma.birthdayGreeting.update({
      where: { id: greeting.id },
      data: { state: 'skipped', errorCode: reason },
    });
    return { kind: 'skipped', reason };
  };

  // ── Gate ────────────────────────────────────────────────────────────────
  if (!OCCASION_KINDS.includes(occasion)) return finishSkipped('UNKNOWN_OCCASION');
  if (!config.enabled) return finishSkipped('CONFIG_DISABLED');
  if (!isOccasionEnabled(scheduleSpecOf(config), occasion)) {
    return finishSkipped('OCCASION_DISABLED');
  }
  if (isTooLate(scheduleSpecOf(config), greeting.dueAt, now)) return finishSkipped('TOO_LATE');

  const templateId = templateIdFor(config, occasion);
  if (!templateId) return finishSkipped('NO_TEMPLATE');

  const day = dayBoundsUtc(config.timezone, now);
  const sentToday = await prisma.birthdayGreeting.count({
    where: { orgId: config.orgId, state: 'sent', sentAt: { gte: day.start, lt: day.end } },
  });
  // Giữ `pending` (không chốt `skipped`): hết hạn mức là vấn đề SỨC CHỨA tạm thời,
  // không phải lời chúc hỏng. Admin nâng hạn mức trong khung trễ là gửi được ngay;
  // hết khung trễ thì `TOO_LATE` ở trên tự dọn.
  if (sentToday >= config.dailyQuota) return { kind: 'skipped', reason: 'DAILY_QUOTA_REACHED' };

  // ── Nội dung ────────────────────────────────────────────────────────────
  const template = await prisma.messageTemplate.findFirst({
    where: { id: templateId, orgId: config.orgId, archivedAt: null },
    select: { content: true, attachments: true },
  });
  if (!template) return finishSkipped('NO_TEMPLATE');

  const attachments = await resolveTemplateAttachments(config.orgId, template.attachments);
  const usableAttachments = attachments.filter((a) => !a.missing);
  const rawText = (template.content ?? '').trim();
  if (!rawText && usableAttachments.length === 0) return finishSkipped('TEMPLATE_EMPTY');

  // ── Nick + UID ──────────────────────────────────────────────────────────
  const sender = await resolveSender(greeting.contactId, greeting.contact.phone, config, day);
  // Giữ `pending`: nick có thể kết nối lại trong khung trễ cho phép, tick sau thử tiếp.
  if (!sender) return { kind: 'skipped', reason: 'NO_USABLE_NICK' };

  const text = rawText
    ? await renderGreetingText({
        raw: rawText,
        contactId: greeting.contactId,
        nickId: sender.nickId,
        contact: greeting.contact,
        saleFullName: greeting.contact.assignedUser?.fullName ?? null,
        now,
      })
    : '';
  if (!text && usableAttachments.length === 0) return finishSkipped('TEMPLATE_EMPTY');

  // ── Gửi ─────────────────────────────────────────────────────────────────
  const media = await prepareMedia(attachments);
  try {
    const result = await sendToUser({
      orgId: config.orgId,
      zaloAccountId: sender.nickId,
      uid: sender.uid,
      contactId: greeting.contactId,
      globalId: sender.globalId,
      displayName: greeting.contact.fullName,
      text,
      media,
      broadcastName: OCCASION_LABELS[occasion],
      broadcastCreatedById: config.createdById ?? '',
      io,
    });
    await prisma.birthdayGreeting.update({
      where: { id: greeting.id },
      data: {
        state: 'sent',
        sentAt: new Date(),
        attempts: greeting.attempts + 1,
        zaloAccountId: sender.nickId,
        zaloUidUsed: sender.uid,
        zaloMsgIds: result.zaloMsgIds,
        errorCode: null,
        errorMessage: result.warnings.length > 0 ? result.warnings.join('; ').slice(0, 500) : null,
      },
    });
    return { kind: 'sent' };
  } catch (err) {
    const { errorCode, errorMessage } = classifySendError(err);
    await prisma.birthdayGreeting.update({
      where: { id: greeting.id },
      data: {
        state: 'failed',
        attempts: greeting.attempts + 1,
        zaloAccountId: sender.nickId,
        zaloUidUsed: sender.uid,
        errorCode,
        errorMessage,
      },
    });
    logger.warn(
      `[birthday-sender] lời chúc=${greeting.id} lỗi [${errorCode}]: ${errorMessage}`,
    );
    return { kind: 'failed', errorCode };
  } finally {
    await media.cleanup();
  }
}
