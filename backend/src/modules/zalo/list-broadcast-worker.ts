// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi tệp khách hàng (🟢 Community) — worker xử lý MỘT LÁT gửi.
// ════════════════════════════════════════════════════════════════════════
//
// Một lát = tối đa `MAX_RECIPIENTS_PER_RUN` khách, hoặc tới khi: hết hạn mức ngày,
// ra ngoài khung giờ, hoặc không còn nick nào gửi được. Phần chưa gửi vẫn nằm
// `pending` trong hàng đợi → cron tạo lát tiếp theo, hết ngày thì mai gửi tiếp.
//
// Vì sao chia lát thay vì một job chạy suốt khung giờ: job BullMQ ôm 9 tiếng sẽ
// mất trắng khi backend restart giữa ngày, và lock renewal treo là hỏng cả ngày gửi.
//
// Idempotency: chỉ xử lý recipient `pending`. Retry BullMQ hay bấm "Gửi lại người
// lỗi" đều KHÔNG gửi lại người đã `sent`.
//
// Community feature — KHÔNG import `_ee`.

import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { withTenant, runSystemQuery } from '../../shared/tenant/tenant-context.js';
import { zaloPool } from './zalo-pool.js';
import { zaloRateLimiter } from './zalo-rate-limiter.js';
import { resolveTemplateAttachments } from '../chat/message-template-service.js';
import { prepareMedia, classifySendError, GroupSendError } from './group-broadcast-send.js';
import { resolveUidForNick, sendToUser } from './list-broadcast-send.js';
import { dayBoundsUtc, isWithinWindow, windowSpecOf } from './list-broadcast-window.js';
import { MAX_RECIPIENTS_PER_RUN } from './list-broadcast-cost.js';

/** Đạt ngưỡng này thì chiến dịch tự tạm dừng (van an toàn nick chết / bị khoá). */
export const AUTO_PAUSE_AFTER_FAILED_RUNS = 3;
/** Lỗi thuộc về NICK chứ không phải khách — đổi nick rồi thử lại chính khách đó. */
const NICK_LEVEL_ERRORS = new Set(['NICK_OFFLINE', 'RATE_LIMIT']);

/**
 * Socket.IO server để tin gửi hiện LIVE trong /chat. Set 1 lần lúc app start;
 * null trong test/CLI thì chỉ bỏ realtime, không ảnh hưởng việc gửi.
 */
let io: Server | null = null;
export function setListBroadcastIo(server: Server | null): void {
  io = server;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nghỉ ngẫu nhiên giữa 2 khách, theo cấu hình chiến dịch. */
function recipientGapMs(minSec: number, maxSec: number): number {
  const lo = Math.max(0, minSec);
  const hi = Math.max(lo, maxSec);
  return (lo + Math.random() * (hi - lo)) * 1000;
}

interface UsableNick {
  id: string;
  displayName: string | null;
  /** Số tin nick này còn được gửi hôm nay theo `perNickDailyQuota`. */
  remainingToday: number;
}

/**
 * Dựng danh sách nick còn dùng được cho lát này.
 *
 * Hạn mức nick tính trên TOÀN ORG (mọi chiến dịch nhắn tệp), không riêng chiến
 * dịch này — nick là tài nguyên dùng chung, hai chiến dịch cùng nhắm một nick mà
 * mỗi bên tự đếm thì cộng lại vẫn quá tay.
 */
async function loadUsableNicks(
  zaloAccountIds: string[], perNickDailyQuota: number, day: { start: Date; end: Date },
): Promise<UsableNick[]> {
  if (zaloAccountIds.length === 0) return [];
  const accounts = await prisma.zaloAccount.findMany({
    where: { id: { in: zaloAccountIds }, archivedAt: null },
    select: { id: true, displayName: true, chatEnabled: true },
  });

  const out: UsableNick[] = [];
  for (const acc of accounts) {
    // Nick CHỈ NHẬN → bỏ hẳn khỏi vòng xoay thay vì để từng tin fail ở zaloOps.
    if (acc.chatEnabled === false) continue;
    const sentToday = await prisma.listBroadcastRecipient.count({
      where: { zaloAccountId: acc.id, sentAt: { gte: day.start, lt: day.end } },
    });
    const remainingToday = perNickDailyQuota - sentToday;
    if (remainingToday <= 0) continue;
    out.push({ id: acc.id, displayName: acc.displayName, remainingToday });
  }
  // Giữ đúng thứ tự sale đã chọn để vòng xoay dễ đoán.
  return zaloAccountIds
    .map((id) => out.find((n) => n.id === id))
    .filter((n): n is UsableNick => n !== undefined);
}

/** Nick còn kết nối và chưa chạm hạn mức Zalo — kiểm lại trước MỖI lần gửi. */
async function nickReady(nickId: string): Promise<boolean> {
  const instance = zaloPool.getInstance(nickId);
  if (!instance?.api || instance.status !== 'connected') return false;
  const limits = await zaloRateLimiter.checkLimits(nickId, 'message');
  return limits.allowed;
}

export async function processListBroadcast(runId: string): Promise<void> {
  // Chưa biết org trước khi đọc run → lookup ở chế độ system rồi mới vào tenant scope.
  const runHeader = await runSystemQuery(() =>
    prisma.listBroadcastRun.findUnique({ where: { id: runId }, select: { orgId: true } }),
  );
  if (!runHeader) {
    logger.warn(`[list-broadcast-worker] lát ${runId} không tồn tại — bỏ qua`);
    return;
  }
  await withTenant(runHeader.orgId, () => processRunInTenant(runId));
}

async function processRunInTenant(runId: string): Promise<void> {
  const run = await prisma.listBroadcastRun.findUnique({
    where: { id: runId },
    include: {
      broadcast: {
        include: { template: { select: { content: true, attachments: true } } },
      },
    },
  });
  if (!run) return;
  // Lát đã kết thúc → job trùng, không làm gì.
  if (run.state !== 'pending' && run.state !== 'running') {
    logger.info(`[list-broadcast-worker] lát=${runId} state=${run.state} — bỏ qua`);
    return;
  }

  const { broadcast } = run;
  const orgId = run.orgId;
  const now = new Date();

  const finishSkipped = async (skipReason: string) => {
    await prisma.listBroadcastRun.update({
      where: { id: run.id },
      data: { state: 'skipped', skipReason, completedAt: new Date() },
    });
    logger.info(`[list-broadcast-worker] lát=${runId} skipped: ${skipReason}`);
  };

  // ── Gate trước khi gửi ────────────────────────────────────────────────────
  // 'manual' là hành động sale chủ động → cho bắn thử cả khi chiến dịch chưa bật
  // lịch ('draft') hoặc đang tạm dừng ('paused').
  const allowedStates = run.triggeredBy === 'schedule' ? ['active'] : ['active', 'draft', 'paused'];
  if (!allowedStates.includes(broadcast.state)) return finishSkipped('BROADCAST_INACTIVE');

  const spec = windowSpecOf(broadcast);
  // Lát theo lịch phải nằm trong khung giờ; bấm "Gửi thử ngay" thì bỏ qua ràng buộc này.
  if (run.triggeredBy === 'schedule' && !isWithinWindow(spec, now)) {
    return finishSkipped('OUT_OF_WINDOW');
  }

  const day = dayBoundsUtc(spec, now);
  const sentToday = await prisma.listBroadcastRecipient.count({
    where: { broadcastId: broadcast.id, sentAt: { gte: day.start, lt: day.end } },
  });
  const dailyRemaining = broadcast.dailyQuota - sentToday;
  if (dailyRemaining <= 0) return finishSkipped('DAILY_QUOTA_REACHED');

  // ── Nội dung gửi ──────────────────────────────────────────────────────────
  const text = (broadcast.template.content ?? '').trim();
  const attachments = await resolveTemplateAttachments(orgId, broadcast.template.attachments);
  const usableAttachments = attachments.filter((a) => !a.missing);
  if (!text && usableAttachments.length === 0) {
    await prisma.listBroadcastRun.update({
      where: { id: run.id },
      data: { state: 'failed', skipReason: 'TEMPLATE_EMPTY', completedAt: new Date() },
    });
    logger.warn(`[list-broadcast-worker] lát=${runId} mẫu tin rỗng — failed`);
    return;
  }

  // ── Người nhận của lát này ────────────────────────────────────────────────
  const take = Math.min(MAX_RECIPIENTS_PER_RUN, dailyRemaining);
  const recipients = await prisma.listBroadcastRecipient.findMany({
    where: { broadcastId: broadcast.id, state: 'pending' },
    orderBy: { createdAt: 'asc' },
    take,
  });
  if (recipients.length === 0) {
    await finishSkipped('NO_PENDING');
    await closeIfDrained(broadcast.id);
    return;
  }

  let nicks = await loadUsableNicks(broadcast.zaloAccountIds, broadcast.perNickDailyQuota, day);
  if (nicks.length === 0) return finishSkipped('NO_USABLE_NICK');

  await prisma.listBroadcastRun.update({
    where: { id: run.id },
    data: { state: 'running', startedAt: new Date(), plannedCount: recipients.length },
  });

  // ── Vòng gửi ──────────────────────────────────────────────────────────────
  let abortReason: string | null = null;
  let sent = 0;
  let failed = 0;
  let anyAttempt = false;
  let cursor = 0; // vị trí vòng xoay nick

  // Tải media MỘT LẦN cho cả lát — dùng lại cho mọi khách.
  const media = await prepareMedia(attachments);

  try {
    for (const recipient of recipients) {
      if (run.triggeredBy === 'schedule' && !isWithinWindow(spec, new Date())) {
        abortReason = 'OUT_OF_WINDOW';
        break;
      }

      // Thử lần lượt các nick còn dùng được cho CHÍNH khách này: lỗi cấp nick
      // (rớt mạng, chạm hạn mức) không phải lỗi của khách, đổi nick là gửi được.
      let delivered = false;
      for (let attempt = 0; attempt < nicks.length && !delivered; attempt++) {
        const nick = await pickNick(nicks, cursor);
        if (!nick) {
          abortReason = 'NO_USABLE_NICK';
          break;
        }
        cursor = nick.index + 1;

        if (anyAttempt) {
          await sleep(recipientGapMs(broadcast.minDelaySec, broadcast.maxDelaySec));
        }
        anyAttempt = true;

        const outcome = await deliverOne({
          orgId,
          broadcast,
          recipient,
          nick: nick.nick,
          text,
          media,
        });

        if (outcome.kind === 'sent') {
          delivered = true;
          sent++;
          nick.nick.remainingToday--;
          if (nick.nick.remainingToday <= 0) nicks = nicks.filter((n) => n.id !== nick.nick.id);
        } else if (outcome.kind === 'nick_error') {
          // Bỏ nick khỏi vòng xoay của lát này, khách giữ nguyên `pending`.
          nicks = nicks.filter((n) => n.id !== nick.nick.id);
          if (nicks.length === 0) {
            abortReason = 'NO_USABLE_NICK';
            break;
          }
        } else {
          delivered = true; // đã kết luận về khách này (failed) — không đổi nick nữa
          failed++;
        }
      }

      if (abortReason) break;
    }
  } finally {
    await media.cleanup();
  }

  // ── Kết lát ───────────────────────────────────────────────────────────────
  let finalState: string;
  if (sent === 0 && failed === 0) finalState = 'skipped';
  else if (failed === 0 && !abortReason) finalState = 'completed';
  else if (sent > 0) finalState = 'partial';
  else finalState = 'failed';

  await prisma.listBroadcastRun.update({
    where: { id: run.id },
    data: {
      state: finalState,
      sentCount: sent,
      failedCount: failed,
      skipReason: abortReason,
      completedAt: new Date(),
    },
  });

  await finalizeBroadcast(broadcast.id, broadcast.consecutiveFailedRuns, sent, failed);
  logger.info(
    `[list-broadcast-worker] lát=${runId} ${finalState} sent=${sent} failed=${failed}` +
      (abortReason ? ` (dừng: ${abortReason})` : ''),
  );
}

/** Chọn nick khả dụng kế tiếp theo vòng xoay, kiểm tra kết nối + hạn mức tại chỗ. */
async function pickNick(
  nicks: UsableNick[], cursor: number,
): Promise<{ nick: UsableNick; index: number } | null> {
  for (let i = 0; i < nicks.length; i++) {
    const index = (cursor + i) % nicks.length;
    const nick = nicks[index];
    if (nick.remainingToday <= 0) continue;
    if (await nickReady(nick.id)) return { nick, index };
  }
  return null;
}

type DeliverOutcome =
  | { kind: 'sent' }
  | { kind: 'failed'; errorCode: string }
  /** Lỗi thuộc về nick — khách giữ `pending` để nick khác gửi. */
  | { kind: 'nick_error'; errorCode: string };

/** Gửi cho 1 khách bằng 1 nick và ghi kết quả vào hàng đợi. */
async function deliverOne(args: {
  orgId: string;
  broadcast: {
    id: string; name: string; createdById: string;
  };
  recipient: {
    id: string; entryId: string; phoneE164: string; displayName: string | null;
    contactId: string | null; attempts: number; sentSteps: number; zaloMsgIds: string[];
  };
  nick: UsableNick;
  text: string;
  media: Awaited<ReturnType<typeof prepareMedia>>;
}): Promise<DeliverOutcome> {
  const { orgId, broadcast, recipient, nick, text, media } = args;

  // ── Tìm UID theo góc nhìn của chính nick này ────────────────────────────
  let resolved;
  try {
    resolved = await resolveUidForNick({
      orgId,
      zaloAccountId: nick.id,
      entryId: recipient.entryId,
      phoneE164: recipient.phoneE164,
      contactId: recipient.contactId,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code === 'RATE_LIMITED' ? 'RATE_LIMIT' : 'NICK_OFFLINE';
    logger.warn(
      `[list-broadcast-worker] nick=${nick.id} không tra cứu được (${code}) — chuyển nick khác`,
    );
    return { kind: 'nick_error', errorCode: code };
  }

  if (!resolved) {
    // Nick này không thấy khách. Đánh dấu `failed` (không phải `skipped`) để sale
    // bấm "Gửi lại người lỗi" là hệ thống thử lại bằng nick khác trong vòng xoay.
    await prisma.listBroadcastRecipient.update({
      where: { id: recipient.id },
      data: {
        state: 'failed',
        attempts: recipient.attempts + 1,
        zaloAccountId: nick.id,
        errorCode: 'UID_NOT_FOUND',
        errorMessage: `Nick "${nick.displayName ?? nick.id}" không tìm được Zalo của số này`,
      },
    });
    await prisma.listBroadcast.update({
      where: { id: broadcast.id },
      data: { failedCount: { increment: 1 } },
    });
    return { kind: 'failed', errorCode: 'UID_NOT_FOUND' };
  }

  // ── Gửi ─────────────────────────────────────────────────────────────────
  try {
    const result = await sendToUser({
      orgId,
      zaloAccountId: nick.id,
      uid: resolved.uid,
      contactId: resolved.contactId,
      globalId: resolved.globalId,
      displayName: recipient.displayName,
      text,
      media,
      broadcastName: broadcast.name,
      broadcastCreatedById: broadcast.createdById,
      skipSteps: recipient.sentSteps,
      io,
    });
    await prisma.listBroadcastRecipient.update({
      where: { id: recipient.id },
      data: {
        state: 'sent',
        sentAt: new Date(),
        attempts: recipient.attempts + 1,
        sentSteps: result.stepsDone,
        zaloAccountId: nick.id,
        zaloUidUsed: resolved.uid,
        zaloMsgIds: [...recipient.zaloMsgIds, ...result.zaloMsgIds],
        errorCode: null,
        errorMessage: result.warnings.length > 0 ? result.warnings.join('; ').slice(0, 500) : null,
      },
    });
    await prisma.listBroadcast.update({
      where: { id: broadcast.id },
      data: { sentCount: { increment: 1 } },
    });
    return { kind: 'sent' };
  } catch (err) {
    const { errorCode, errorMessage } = classifySendError(err);
    const partial = err instanceof GroupSendError ? err : null;

    if (NICK_LEVEL_ERRORS.has(errorCode)) {
      // Nick hỏng giữa chừng: giữ khách `pending`, nhưng LƯU tiến độ từng phần —
      // nếu không, nick sau sẽ gửi lại đoạn chữ khách đã nhận.
      if (partial && partial.stepsDone > recipient.sentSteps) {
        await prisma.listBroadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            sentSteps: partial.stepsDone,
            zaloAccountId: nick.id,
            zaloUidUsed: resolved.uid,
            zaloMsgIds: [...recipient.zaloMsgIds, ...partial.zaloMsgIds],
          },
        });
      }
      logger.warn(
        `[list-broadcast-worker] nick=${nick.id} lỗi [${errorCode}] — chuyển nick khác: ${errorMessage}`,
      );
      return { kind: 'nick_error', errorCode };
    }

    await prisma.listBroadcastRecipient.update({
      where: { id: recipient.id },
      data: {
        state: 'failed',
        attempts: recipient.attempts + 1,
        zaloAccountId: nick.id,
        zaloUidUsed: resolved.uid,
        ...(partial
          ? {
              sentSteps: partial.stepsDone,
              zaloMsgIds: [...recipient.zaloMsgIds, ...partial.zaloMsgIds],
            }
          : {}),
        errorCode,
        errorMessage,
      },
    });
    await prisma.listBroadcast.update({
      where: { id: broadcast.id },
      data: { failedCount: { increment: 1 } },
    });
    logger.warn(
      `[list-broadcast-worker] khách=${recipient.id} lỗi [${errorCode}]: ${errorMessage}`,
    );
    return { kind: 'failed', errorCode };
  }
}

/** Hàng đợi hết `pending` → đóng chiến dịch. */
async function closeIfDrained(broadcastId: string): Promise<void> {
  const pending = await prisma.listBroadcastRecipient.count({
    where: { broadcastId, state: 'pending' },
  });
  if (pending > 0) return;
  await prisma.listBroadcast.updateMany({
    where: { id: broadcastId, state: 'active' },
    data: { state: 'completed' },
  });
}

/**
 * Cập nhật chiến dịch sau một lát: bộ đếm hỏng liên tiếp, auto-pause, đóng khi hết hàng đợi.
 *
 * Lát 'skipped' KHÔNG đi qua đây — ngoài khung giờ hay hết hạn mức là hoạt động
 * BÌNH THƯỜNG, không được tính vào bộ đếm auto-pause.
 */
async function finalizeBroadcast(
  broadcastId: string, consecutiveFailedRuns: number, sent: number, failed: number,
): Promise<void> {
  const now = new Date();

  if (sent === 0 && failed > 0) {
    const nextCount = consecutiveFailedRuns + 1;
    if (nextCount >= AUTO_PAUSE_AFTER_FAILED_RUNS) {
      await prisma.listBroadcast.update({
        where: { id: broadcastId },
        data: {
          consecutiveFailedRuns: nextCount,
          state: 'paused',
          pausedReason: 'CONSECUTIVE_FAILURES',
          lastRunAt: now,
        },
      });
      logger.warn(
        `[list-broadcast-worker] chiến dịch ${broadcastId} tự tạm dừng sau ${nextCount} lát hỏng liên tiếp`,
      );
      return;
    }
    await prisma.listBroadcast.update({
      where: { id: broadcastId },
      data: { consecutiveFailedRuns: nextCount, lastRunAt: now },
    });
    return;
  }

  await prisma.listBroadcast.update({
    where: { id: broadcastId },
    data: { consecutiveFailedRuns: 0, lastRunAt: now },
  });
  await closeIfDrained(broadcastId);
}
