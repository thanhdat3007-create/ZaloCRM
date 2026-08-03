// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi nhóm theo lịch (🟢 Community) — worker xử lý 1 run.
// ════════════════════════════════════════════════════════════════════════
//
// processGroupBroadcast(runId): gửi mẫu tin vào từng nhóm `pending` của run,
// tuần tự, giãn cách ngẫu nhiên, ghi kết quả từng nhóm.
//
// Idempotency: chỉ xử lý target state='pending'. Retry BullMQ hay bấm "Gửi lại
// nhóm lỗi" đều KHÔNG gửi lại nhóm đã 'sent'.
//
// Community feature — KHÔNG import `_ee`.

import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { withTenant, runSystemQuery } from '../../shared/tenant/tenant-context.js';
import { zaloPool } from './zalo-pool.js';
import { zaloRateLimiter } from './zalo-rate-limiter.js';
import { resolveTemplateAttachments } from '../chat/message-template-service.js';
import { sendToGroup, prepareMedia, classifySendError, GroupSendError } from './group-broadcast-send.js';
import { nextOccurrence, scheduleSpecOf } from './group-broadcast-schedule.js';

/** Đạt ngưỡng này thì chiến dịch tự tạm dừng (van an toàn nick chết / bị kick). */
export const AUTO_PAUSE_AFTER_FAILED_RUNS = 3;

/**
 * Socket.IO server để tin gửi hiện LIVE trong /chat. Set 1 lần lúc app start;
 * null trong test/CLI thì chỉ bỏ realtime, không ảnh hưởng việc gửi.
 */
let io: Server | null = null;
export function setGroupBroadcastIo(server: Server | null): void {
  io = server;
}

/**
 * Nghỉ ngẫu nhiên giữa 2 nhóm, theo cấu hình chiến dịch.
 * Sàn an toàn (≥10s) enforce ở route tạo/sửa chiến dịch, không lặp lại ở đây.
 */
function groupGapMs(minSec: number, maxSec: number): number {
  const lo = Math.max(0, minSec);
  const hi = Math.max(lo, maxSec);
  return (lo + Math.random() * (hi - lo)) * 1000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Kiểm tra nick còn gửi được không. Trả `null` khi OK, hoặc skipReason.
 * Chạy trước lượt gửi VÀ lặp lại trước mỗi nhóm — nick có thể rớt giữa chừng.
 */
async function checkNickReady(zaloAccountId: string): Promise<string | null> {
  const instance = zaloPool.getInstance(zaloAccountId);
  if (!instance?.api || instance.status !== 'connected') return 'NICK_OFFLINE';
  const limits = await zaloRateLimiter.checkLimits(zaloAccountId, 'message');
  if (!limits.allowed) return 'RATE_LIMIT';
  return null;
}

export async function processGroupBroadcast(runId: string): Promise<void> {
  // Chưa biết org trước khi đọc run → lookup ở chế độ system rồi mới vào tenant scope.
  const runHeader = await runSystemQuery(() =>
    prisma.groupBroadcastRun.findUnique({ where: { id: runId }, select: { orgId: true } }),
  );
  if (!runHeader) {
    logger.warn(`[group-broadcast-worker] run ${runId} không tồn tại — bỏ qua`);
    return;
  }
  await withTenant(runHeader.orgId, () => processRunInTenant(runId));
}

async function processRunInTenant(runId: string): Promise<void> {
  const run = await prisma.groupBroadcastRun.findUnique({
    where: { id: runId },
    include: {
      broadcast: {
        include: {
          template: { select: { content: true, attachments: true } },
          zaloAccount: { select: { id: true, archivedAt: true, chatEnabled: true } },
        },
      },
    },
  });
  if (!run) return;
  // Run đã kết thúc (completed/partial/failed/skipped) → job trùng, không làm gì.
  if (run.state !== 'pending' && run.state !== 'running') {
    logger.info(`[group-broadcast-worker] run=${runId} state=${run.state} — bỏ qua`);
    return;
  }

  const { broadcast } = run;
  const orgId = run.orgId;

  // ── Gate trước khi gửi ────────────────────────────────────────────────────
  const skipReason = await resolveSkipReason(run, broadcast);
  if (skipReason) {
    await prisma.groupBroadcastRun.update({
      where: { id: run.id },
      data: { state: 'skipped', skipReason, completedAt: new Date() },
    });
    logger.info(`[group-broadcast-worker] run=${runId} skipped: ${skipReason}`);
    return;
  }

  await prisma.groupBroadcastRun.update({
    where: { id: run.id },
    data: { state: 'running', startedAt: new Date() },
  });

  // ── Nội dung gửi ──────────────────────────────────────────────────────────
  const text = (broadcast.template.content ?? '').trim();
  const attachments = await resolveTemplateAttachments(orgId, broadcast.template.attachments);
  const usableAttachments = attachments.filter((a) => !a.missing);
  if (!text && usableAttachments.length === 0) {
    await prisma.groupBroadcastRun.update({
      where: { id: run.id },
      data: { state: 'failed', skipReason: 'TEMPLATE_EMPTY', completedAt: new Date() },
    });
    logger.warn(`[group-broadcast-worker] run=${runId} mẫu tin rỗng — failed`);
    return;
  }

  // ── Vòng gửi ──────────────────────────────────────────────────────────────
  const targets = await prisma.groupBroadcastTarget.findMany({
    where: { runId: run.id, state: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  let abortReason: string | null = null;
  // Tải media MỘT LẦN cho cả lượt — dùng lại cho mọi nhóm.
  const media = await prepareMedia(attachments);

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (i > 0) await sleep(groupGapMs(broadcast.minDelaySec, broadcast.maxDelaySec));

      // Nick có thể rớt / chạm trần giữa chừng → dừng, giữ nhóm còn lại ở 'pending'
      // để "Gửi lại nhóm lỗi" bù đúng phần thiếu.
      const notReady = await checkNickReady(broadcast.zaloAccountId);
      if (notReady) {
        abortReason = notReady;
        break;
      }

      try {
        const result = await sendToGroup({
          orgId,
          zaloAccountId: broadcast.zaloAccountId,
          groupId: target.groupId,
          groupName: target.groupName,
          text,
          media,
          broadcastName: broadcast.name,
          // Người bấm phát chiến dịch — để tin bắn hàng loạt vẫn truy được về người chịu
          // trách nhiệm, dù nhãn hiển thị khác hẳn tin sale gõ tay.
          broadcastCreatedById: broadcast.createdById,
          // Bỏ qua các bước đã ra khỏi máy ở lần thử trước.
          skipSteps: target.sentSteps,
          io,
        });
        await prisma.groupBroadcastTarget.update({
          where: { id: target.id },
          data: {
            state: 'sent',
            sentAt: new Date(),
            attempts: target.attempts + 1,
            sentSteps: result.stepsDone,
            zaloMsgIds: [...target.zaloMsgIds, ...result.zaloMsgIds],
            errorCode: null,
            errorMessage: result.warnings.length > 0 ? result.warnings.join('; ').slice(0, 500) : null,
          },
        });
      } catch (err) {
        // 1 nhóm hỏng KHÔNG chặn nhóm còn lại — không throw.
        const { errorCode, errorMessage } = classifySendError(err);
        // Lưu tiến độ từng phần: lần gửi lại sẽ bỏ qua phần đã gửi thành công,
        // nếu không nhóm nhận trùng đoạn chữ.
        const partial = err instanceof GroupSendError ? err : null;
        await prisma.groupBroadcastTarget.update({
          where: { id: target.id },
          data: {
            state: 'failed',
            attempts: target.attempts + 1,
            ...(partial
              ? {
                  sentSteps: partial.stepsDone,
                  zaloMsgIds: [...target.zaloMsgIds, ...partial.zaloMsgIds],
                }
              : {}),
            errorCode,
            errorMessage,
          },
        });
        logger.warn(
          `[group-broadcast-worker] run=${runId} group=${target.groupId} lỗi [${errorCode}]: ${errorMessage}`,
        );
      }
    }
  } finally {
    await media.cleanup();
  }

  // ── Kết run ───────────────────────────────────────────────────────────────
  // Cộng dồn với số đã gửi ở lần chạy trước (retry-failed chạy lại cùng run).
  const totals = await prisma.groupBroadcastTarget.groupBy({
    by: ['state'],
    where: { runId: run.id },
    _count: { _all: true },
  });
  const totalSent = totals.find((t) => t.state === 'sent')?._count._all ?? 0;
  const totalFailed = totals.find((t) => t.state === 'failed')?._count._all ?? 0;

  let finalState: string;
  if (abortReason) finalState = totalSent > 0 ? 'partial' : 'failed';
  else if (totalFailed === 0) finalState = 'completed';
  else if (totalSent > 0) finalState = 'partial';
  else finalState = 'failed';

  await prisma.groupBroadcastRun.update({
    where: { id: run.id },
    data: {
      state: finalState,
      sentCount: totalSent,
      failedCount: totalFailed,
      skipReason: abortReason,
      completedAt: new Date(),
    },
  });

  await finalizeBroadcast(broadcast, totalSent);
  logger.info(
    `[group-broadcast-worker] run=${runId} ${finalState} sent=${totalSent} failed=${totalFailed}` +
      (abortReason ? ` (dừng: ${abortReason})` : ''),
  );
}

/** Gate trước khi gửi — trả skipReason hoặc null. */
async function resolveSkipReason(
  run: { id: string; scheduledFor: Date; triggeredBy: string },
  broadcast: {
    id: string;
    state: string;
    zaloAccountId: string;
    minDelaySec: number;
    maxDelaySec: number;
    targetGroupIds: string[];
    zaloAccount: { archivedAt: Date | null; chatEnabled?: boolean };
  },
): Promise<string | null> {
  // 'manual' là hành động sale chủ động → cho bắn thử cả khi chiến dịch chưa bật
  // lịch ('draft') hoặc đang tạm dừng ('paused'). Danh sách này phải khớp điều
  // kiện của route run-now, nếu không nút "Gửi ngay" báo thành công rồi im lặng.
  const allowedStates = run.triggeredBy === 'schedule' ? ['active'] : ['active', 'draft', 'paused'];
  if (!allowedStates.includes(broadcast.state)) return 'BROADCAST_INACTIVE';
  if (broadcast.zaloAccount.archivedAt) return 'NICK_ARCHIVED';
  // Nick CHỈ NHẬN (2026-08-03): bỏ lượt gửi thay vì để từng tin fail ở zaloOps.
  if (broadcast.zaloAccount.chatEnabled === false) return 'NICK_CHAT_DISABLED';

  // Chống chồng lấn: 50 nhóm × ~32s ≈ 27 phút. Hai lượt quá gần nhau sẽ dồn tin
  // vào cùng nhóm trong thời gian ngắn → dễ bị Zalo khoá. Bỏ lượt mới an toàn
  // hơn xếp hàng.
  const olderActive = await prisma.groupBroadcastRun.findFirst({
    where: {
      broadcastId: broadcast.id,
      id: { not: run.id },
      state: { in: ['pending', 'running'] },
      scheduledFor: { lt: run.scheduledFor },
    },
    select: { id: true },
  });
  if (olderActive) return 'PREVIOUS_RUN_ACTIVE';

  // Lượt trước có thể đã KẾT THÚC trước khi lượt này chạy (VD sale bấm "Gửi ngay"
  // lúc 07:59, lượt 08:00 theo lịch tới sau) — guard trên không bắt được vì không
  // còn run nào 'running'. Chặn theo thời gian: nếu vừa có lượt gửi xong trong
  // khoảng thời lượng ước tính của 1 lượt thì bỏ lượt theo lịch này.
  if (run.triggeredBy === 'schedule') {
    const cooldownMs = estimatedRunDurationMs(broadcast);
    const recent = await prisma.groupBroadcastRun.findFirst({
      where: {
        broadcastId: broadcast.id,
        id: { not: run.id },
        startedAt: { gte: new Date(run.scheduledFor.getTime() - cooldownMs) },
      },
      select: { id: true },
    });
    if (recent) return 'RECENT_RUN';
  }

  return checkNickReady(broadcast.zaloAccountId);
}

/**
 * Thời lượng ước tính 1 lượt (ms) — chỉ tính giãn cách giữa nhóm (thành phần
 * chiếm gần hết thời gian). Dùng làm cửa sổ chống gửi trùng, không cần chính xác.
 */
function estimatedRunDurationMs(b: {
  minDelaySec: number; maxDelaySec: number; targetGroupIds: string[];
}): number {
  const avgGap = (b.minDelaySec + b.maxDelaySec) / 2;
  return Math.max(0, b.targetGroupIds.length - 1) * avgGap * 1000;
}

/**
 * Cập nhật chiến dịch sau 1 lượt: bộ đếm hỏng liên tiếp, auto-pause, nextRunAt.
 *
 * Run 'skipped' KHÔNG đi qua đây — nick offline tạm thời không phải là chiến dịch
 * hỏng, không được tính vào bộ đếm auto-pause.
 */
async function finalizeBroadcast(
  broadcast: {
    id: string;
    scheduleKind: string;
    timesOfDay: string[];
    daysOfWeek: number[];
    daysOfMonth: number[];
    timezone: string;
    startDate: Date | null;
    endDate: Date | null;
    consecutiveFailedRuns: number;
  },
  sentCount: number,
): Promise<void> {
  const now = new Date();

  if (sentCount === 0) {
    const consecutiveFailedRuns = broadcast.consecutiveFailedRuns + 1;
    if (consecutiveFailedRuns >= AUTO_PAUSE_AFTER_FAILED_RUNS) {
      await prisma.groupBroadcast.update({
        where: { id: broadcast.id },
        data: {
          consecutiveFailedRuns,
          state: 'paused',
          pausedReason: 'CONSECUTIVE_FAILURES',
          nextRunAt: null,
          lastRunAt: now,
        },
      });
      logger.warn(
        `[group-broadcast-worker] chiến dịch ${broadcast.id} tự tạm dừng sau ${consecutiveFailedRuns} lượt hỏng liên tiếp`,
      );
      return;
    }
    await prisma.groupBroadcast.update({
      where: { id: broadcast.id },
      data: { consecutiveFailedRuns, lastRunAt: now },
    });
  } else {
    await prisma.groupBroadcast.update({
      where: { id: broadcast.id },
      data: { consecutiveFailedRuns: 0, lastRunAt: now },
    });
  }

  if (broadcast.scheduleKind === 'now') {
    await prisma.groupBroadcast.update({
      where: { id: broadcast.id },
      data: { state: 'completed', nextRunAt: null },
    });
    return;
  }
  await prisma.groupBroadcast.update({
    where: { id: broadcast.id },
    data: { nextRunAt: nextOccurrence(scheduleSpecOf(broadcast), now) },
  });
}
