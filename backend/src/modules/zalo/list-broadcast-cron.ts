// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * list-broadcast-cron.ts — Bộ lập lịch chiến dịch nhắn tệp khách hàng (🟢 Community).
 *
 * Mỗi phút quét chiến dịch `active` và tạo LÁT gửi kế tiếp cho những chiến dịch:
 *   - đang trong khung giờ làm việc,
 *   - còn hạn mức ngày,
 *   - còn người trong hàng đợi,
 *   - và không có lát nào đang chạy.
 *
 * Chống trùng: `@@unique([broadcastId, scheduledFor])` với `scheduledFor` làm tròn
 * xuống phút. Nhiều instance backend cùng cron đều bị DB chặn — P2002 nuốt im lặng.
 *
 * KHÔNG có catch-up như gửi nhóm: chiến dịch này không có "mốc giờ bị lỡ". Lỡ vài
 * phút thì lát kế tiếp gửi bù, hàng đợi vẫn còn nguyên.
 *
 * Sweeper (mỗi 5 phút) dọn lát kẹt khi Redis chết / worker không chạy.
 *
 * Community feature — KHÔNG import `_ee`.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { enqueueListBroadcast } from './list-broadcast-queue.js';
import { dayBoundsUtc, isWithinWindow, windowSpecOf } from './list-broadcast-window.js';

const CRON_SCHEDULE = '* * * * *';
const SWEEPER_SCHEDULE = '*/5 * * * *';

/** Trần lát tạo mỗi tick — chặn tick quá nặng khi org có nhiều chiến dịch. */
export const MAX_RUNS_PER_TICK = 20;
/**
 * Nghỉ trước khi tạo lát mới sau một lát KHÔNG gửi được gì (nick offline, hết nick).
 * Không có ngưỡng này thì cron đẻ một hàng lát rỗng mỗi phút suốt cả khung giờ.
 */
const IDLE_RUN_COOLDOWN_MS = 5 * 60 * 1000;
/** Lát `pending` quá ngưỡng này = queue không nhận job → coi như hỏng. */
const PENDING_TIMEOUT_MS = 30 * 60 * 1000;
/** Lát `running` quá ngưỡng này = worker chết giữa chừng. */
const RUNNING_TIMEOUT_MS = 2 * 60 * 60 * 1000;

let cronRunning = false;
let sweeperRunning = false;
let cronTask: ReturnType<typeof cron.schedule> | null = null;
let sweeperTask: ReturnType<typeof cron.schedule> | null = null;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002';
}

type BroadcastRow = {
  id: string;
  orgId: string;
  name: string;
  dailyQuota: number;
  windowStart: string;
  windowEnd: string;
  daysOfWeek: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
};

/**
 * Tạo 1 lát gửi rồi enqueue.
 *
 * Enqueue NGOÀI transaction — job chạy trước khi commit sẽ không thấy lát.
 * @throws P2002 khi đã có lát cùng `scheduledFor` — caller quyết định bỏ qua
 *         (cron) hay trả 409 (route).
 */
export async function materializeRun(
  broadcast: Pick<BroadcastRow, 'id' | 'orgId'>,
  scheduledFor: Date,
  triggeredBy: 'schedule' | 'manual',
): Promise<{ id: string }> {
  const run = await prisma.listBroadcastRun.create({
    data: {
      orgId: broadcast.orgId,
      broadcastId: broadcast.id,
      scheduledFor,
      triggeredBy,
    },
    select: { id: true },
  });
  await enqueueListBroadcast(run.id);
  return run;
}

/**
 * Chiến dịch này có nên chạy lát mới ngay bây giờ không.
 * Trả lý do bỏ qua (để log/debug) hoặc null khi nên tạo lát.
 *
 * Cố ý lặp lại một phần gate của worker: kiểm ở đây rẻ hơn nhiều so với đẻ ra
 * một lát rỗng, đẩy qua Redis rồi để worker kết luận "không có gì để gửi".
 */
async function shouldStartRun(broadcast: BroadcastRow, now: Date): Promise<string | null> {
  const spec = windowSpecOf(broadcast);
  if (!isWithinWindow(spec, now)) return 'OUT_OF_WINDOW';

  const active = await prisma.listBroadcastRun.findFirst({
    where: { broadcastId: broadcast.id, state: { in: ['pending', 'running'] } },
    select: { id: true },
  });
  if (active) return 'RUN_IN_PROGRESS';

  const pending = await prisma.listBroadcastRecipient.count({
    where: { broadcastId: broadcast.id, state: 'pending' },
  });
  if (pending === 0) return 'NO_PENDING';

  const day = dayBoundsUtc(spec, now);
  const sentToday = await prisma.listBroadcastRecipient.count({
    where: { broadcastId: broadcast.id, sentAt: { gte: day.start, lt: day.end } },
  });
  if (sentToday >= broadcast.dailyQuota) return 'DAILY_QUOTA_REACHED';

  // Lát trước không gửi được gì → nghỉ một nhịp thay vì thử lại mỗi phút.
  const lastRun = await prisma.listBroadcastRun.findFirst({
    where: { broadcastId: broadcast.id },
    orderBy: { scheduledFor: 'desc' },
    select: { sentCount: true, completedAt: true },
  });
  if (
    lastRun &&
    lastRun.sentCount === 0 &&
    lastRun.completedAt &&
    now.getTime() - lastRun.completedAt.getTime() < IDLE_RUN_COOLDOWN_MS
  ) {
    return 'IDLE_COOLDOWN';
  }

  return null;
}

/** 1 tick: quét chiến dịch đang chạy → tạo lát gửi kế tiếp. */
export async function runScheduleTick(now: Date = new Date()): Promise<number> {
  const broadcasts = (await runSystemQuery(() =>
    prisma.listBroadcast.findMany({
      where: { state: 'active' },
      select: {
        id: true, orgId: true, name: true, dailyQuota: true,
        windowStart: true, windowEnd: true, daysOfWeek: true,
        timezone: true, startDate: true, endDate: true,
      },
    }),
  )) as BroadcastRow[];

  let created = 0;
  for (const broadcast of broadcasts) {
    if (created >= MAX_RUNS_PER_TICK) {
      logger.warn(
        `[list-broadcast-cron] chạm trần ${MAX_RUNS_PER_TICK} lát/tick — ` +
        `bỏ qua ${broadcasts.length - broadcasts.indexOf(broadcast)} chiến dịch còn lại ở tick này`,
      );
      break;
    }
    await withTenant(broadcast.orgId, async () => {
      const skip = await shouldStartRun(broadcast, now);
      if (skip) return;
      // Làm tròn xuống giây → hai instance cùng phút đụng unique constraint.
      const scheduledFor = new Date(Math.floor(now.getTime() / 1000) * 1000);
      try {
        await materializeRun(broadcast, scheduledFor, 'schedule');
        created++;
      } catch (err) {
        if (isUniqueViolation(err)) return; // instance khác đã tạo lát này
        logger.error(
          `[list-broadcast-cron] materializeRun lỗi (broadcast=${broadcast.id}): ${(err as Error).message}`,
        );
      }
    });
  }
  return created;
}

/**
 * Dọn lát kẹt. KHÔNG đụng `consecutiveFailedRuns`: bộ đếm auto-pause chỉ do worker
 * cập nhật sau một lát gửi thật — Redis chết không phải "chiến dịch hỏng".
 *
 * Người nhận đang `pending` giữ nguyên → lát sau gửi tiếp đúng phần thiếu.
 */
export async function sweepStuckRuns(
  now: Date = new Date(),
): Promise<{ timedOut: number; stalled: number }> {
  const timedOut = await runSystemQuery(() =>
    prisma.listBroadcastRun.updateMany({
      where: { state: 'pending', createdAt: { lt: new Date(now.getTime() - PENDING_TIMEOUT_MS) } },
      data: { state: 'failed', skipReason: 'QUEUE_TIMEOUT', completedAt: now },
    }),
  );
  const stalled = await runSystemQuery(() =>
    prisma.listBroadcastRun.updateMany({
      where: { state: 'running', startedAt: { lt: new Date(now.getTime() - RUNNING_TIMEOUT_MS) } },
      data: { state: 'partial', skipReason: 'WORKER_STALLED', completedAt: now },
    }),
  );
  if (timedOut.count > 0 || stalled.count > 0) {
    logger.warn(
      `[list-broadcast-cron] sweeper: ${timedOut.count} lát QUEUE_TIMEOUT, ${stalled.count} lát WORKER_STALLED`,
    );
  }
  return { timedOut: timedOut.count, stalled: stalled.count };
}

/** Start cron lập lịch + sweeper. Idempotent. */
export function startListBroadcastCron(): void {
  if (cronTask) {
    logger.info('[list-broadcast-cron] đã start, bỏ qua');
    return;
  }
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) {
      logger.warn('[list-broadcast-cron] tick trước còn chạy — bỏ tick này');
      return;
    }
    cronRunning = true;
    try {
      await runScheduleTick();
    } catch (err) {
      logger.error('[list-broadcast-cron] tick lỗi:', err);
    } finally {
      cronRunning = false;
    }
  });
  sweeperTask = cron.schedule(SWEEPER_SCHEDULE, async () => {
    if (sweeperRunning) return;
    sweeperRunning = true;
    try {
      await sweepStuckRuns();
    } catch (err) {
      logger.error('[list-broadcast-cron] sweeper lỗi:', err);
    } finally {
      sweeperRunning = false;
    }
  });
  logger.info(`[list-broadcast-cron] started, schedule="${CRON_SCHEDULE}"`);
}

/** Stop cron (test cleanup / graceful shutdown). */
export function stopListBroadcastCron(): void {
  cronTask?.stop();
  cronTask = null;
  sweeperTask?.stop();
  sweeperTask = null;
  cronRunning = false;
  sweeperRunning = false;
}
