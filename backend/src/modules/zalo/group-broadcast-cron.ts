// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * group-broadcast-cron.ts — Bộ lập lịch chiến dịch gửi nhóm (🟢 Community).
 *
 * Mỗi phút quét chiến dịch `active`, tính các mốc giờ đã đến hạn, tạo
 * `GroupBroadcastRun` + `GroupBroadcastTarget`, rồi enqueue job.
 *
 * Chống trùng: `@@unique([broadcastId, scheduledFor])`. Nhiều instance backend
 * cùng cron, hay cron chạy lại cùng phút, đều bị DB chặn — P2002 nuốt im lặng.
 *
 * Catch-up sau restart: bù các mốc đã lỡ trong 10 phút gần nhất. Quá 10 phút thì
 * bỏ (chỉ log) — dội một loạt tin lúc khởi động nguy hiểm hơn là lỡ một lượt.
 *
 * Sweeper (mỗi 5 phút) dọn run kẹt khi Redis chết / worker không chạy.
 *
 * Community feature — KHÔNG import `_ee`.
 */
import cron from 'node-cron';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { enqueueGroupBroadcast } from './group-broadcast-queue.js';
import { nextOccurrence, occurrencesBetween, scheduleSpecOf } from './group-broadcast-schedule.js';

const CRON_SCHEDULE = '* * * * *';
const SWEEPER_SCHEDULE = '*/5 * * * *';

/** Cửa sổ bù mốc đã lỡ sau restart. */
export const CATCH_UP_MS = 10 * 60 * 1000;
/** Trần run tạo mỗi tick — chặn tick quá nặng. */
export const MAX_RUNS_PER_TICK = 20;
/** Run `pending` quá ngưỡng này = queue không nhận job → coi như hỏng. */
const PENDING_TIMEOUT_MS = 30 * 60 * 1000;
/** Run `running` quá ngưỡng này = worker chết giữa chừng. */
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
  targetGroupIds: string[];
  groupNamesSnapshot: unknown;
  scheduleKind: string;
  timesOfDay: string[];
  daysOfWeek: number[];
  daysOfMonth: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
  nextRunAt: Date | null;
};

/**
 * Tạo 1 run + target trong 1 transaction, rồi enqueue.
 *
 * Dùng chung với route "Gửi ngay" và "Gửi lại nhóm lỗi" (Phase 05).
 * Enqueue NGOÀI transaction — job chạy trước khi commit sẽ không thấy run.
 * `tenantTransaction` (không phải `$transaction` trần) để RLS `set_config` áp
 * đúng org lên connection của transaction.
 *
 * @param groupIds Tập nhóm cho run này. Mặc định toàn bộ nhóm của chiến dịch;
 *                 "Gửi lại nhóm lỗi" truyền riêng danh sách nhóm cần bù.
 * @throws P2002 khi đã có run cùng `scheduledFor` — caller quyết định bỏ qua
 *         (cron) hay trả 409 (route).
 */
export async function materializeRun(
  broadcast: Pick<BroadcastRow, 'id' | 'orgId' | 'targetGroupIds' | 'groupNamesSnapshot'>,
  scheduledFor: Date,
  triggeredBy: 'schedule' | 'manual' | 'retry',
  groupIds?: string[],
): Promise<{ id: string }> {
  const names = (broadcast.groupNamesSnapshot ?? {}) as Record<string, string>;
  const targetIds = groupIds ?? broadcast.targetGroupIds;
  const run = await tenantTransaction(async (tx) => {
    const created = await tx.groupBroadcastRun.create({
      data: {
        orgId: broadcast.orgId,
        broadcastId: broadcast.id,
        scheduledFor,
        triggeredBy,
        totalTargets: targetIds.length,
      },
      select: { id: true },
    });
    await tx.groupBroadcastTarget.createMany({
      data: targetIds.map((groupId) => ({
        orgId: broadcast.orgId,
        runId: created.id,
        groupId,
        groupName: names[groupId] ?? groupId,
      })),
    });
    return created;
  });

  await enqueueGroupBroadcast(run.id);
  return run;
}

/** 1 tick: quét chiến dịch đến hạn → materialize run. */
export async function runScheduleTick(now: Date = new Date()): Promise<number> {
  const broadcasts = (await runSystemQuery(() =>
    prisma.groupBroadcast.findMany({
      where: { state: 'active', scheduleKind: { not: 'now' } },
      select: {
        id: true, orgId: true, name: true, targetGroupIds: true, groupNamesSnapshot: true,
        scheduleKind: true, timesOfDay: true, daysOfWeek: true, daysOfMonth: true,
        timezone: true, startDate: true, endDate: true, nextRunAt: true,
      },
    }),
  )) as BroadcastRow[];

  let created = 0;
  for (const broadcast of broadcasts) {
    if (created >= MAX_RUNS_PER_TICK) {
      // Trần này bỏ HẲN các chiến dịch còn lại của tick — mốc của chúng có thể
      // rơi ra ngoài CATCH_UP_MS ở tick sau, nên phải log rõ thay vì im lặng.
      logger.warn(
        `[group-broadcast-cron] chạm trần ${MAX_RUNS_PER_TICK} run/tick — ` +
        `bỏ qua ${broadcasts.length - broadcasts.indexOf(broadcast)} chiến dịch còn lại ở tick này`,
      );
      break;
    }
    const spec = scheduleSpecOf(broadcast);
    await withTenant(broadcast.orgId, async () => {
      const due = occurrencesBetween(spec, new Date(now.getTime() - CATCH_UP_MS), now);
      for (const at of due) {
        if (created >= MAX_RUNS_PER_TICK) {
          logger.warn(
            `[group-broadcast-cron] chiến dịch ${broadcast.id}: bỏ mốc ${at.toISOString()} vì chạm trần run/tick`,
          );
          break;
        }
        try {
          await materializeRun(broadcast, at, 'schedule');
          created++;
        } catch (err) {
          // Tick trước / instance khác đã tạo run cho mốc này — đúng như thiết kế.
          if (isUniqueViolation(err)) continue;
          logger.error(
            `[group-broadcast-cron] materializeRun lỗi (broadcast=${broadcast.id} at=${at.toISOString()}): ${(err as Error).message}`,
          );
        }
      }

      // Chỉ ghi khi ĐỔI: cron chạy mỗi phút, ghi vô điều kiện sẽ bump `updatedAt`
      // 1440 lần/ngày/chiến dịch và làm thứ tự danh sách (sort theo updatedAt)
      // thành nhiễu cron thay vì hoạt động của người dùng.
      const next = nextOccurrence(spec, now);
      if (!next) {
        // Hết lịch (quá endDate) → đóng chiến dịch, không quét nữa.
        await prisma.groupBroadcast.update({
          where: { id: broadcast.id },
          data: { nextRunAt: null, state: 'completed' },
        });
      } else if (next.getTime() !== broadcast.nextRunAt?.getTime()) {
        await prisma.groupBroadcast.update({
          where: { id: broadcast.id },
          data: { nextRunAt: next },
        });
      }
    });
  }
  return created;
}

/**
 * Dọn run kẹt. KHÔNG đụng `consecutiveFailedRuns`: bộ đếm auto-pause chỉ do
 * worker cập nhật sau một lượt gửi thật — Redis chết không phải "chiến dịch hỏng".
 */
export async function sweepStuckRuns(now: Date = new Date()): Promise<{ timedOut: number; stalled: number }> {
  const timedOut = await runSystemQuery(() =>
    prisma.groupBroadcastRun.updateMany({
      where: { state: 'pending', createdAt: { lt: new Date(now.getTime() - PENDING_TIMEOUT_MS) } },
      data: { state: 'failed', skipReason: 'QUEUE_TIMEOUT', completedAt: now },
    }),
  );
  // Target 'sent' giữ nguyên → "Gửi lại nhóm lỗi" chỉ bù phần thiếu.
  const stalled = await runSystemQuery(() =>
    prisma.groupBroadcastRun.updateMany({
      where: { state: 'running', startedAt: { lt: new Date(now.getTime() - RUNNING_TIMEOUT_MS) } },
      data: { state: 'partial', skipReason: 'WORKER_STALLED', completedAt: now },
    }),
  );
  if (timedOut.count > 0 || stalled.count > 0) {
    logger.warn(
      `[group-broadcast-cron] sweeper: ${timedOut.count} run QUEUE_TIMEOUT, ${stalled.count} run WORKER_STALLED`,
    );
  }
  return { timedOut: timedOut.count, stalled: stalled.count };
}

/** Start cron lập lịch + sweeper. Idempotent. */
export function startGroupBroadcastCron(): void {
  if (cronTask) {
    logger.info('[group-broadcast-cron] đã start, bỏ qua');
    return;
  }
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) {
      logger.warn('[group-broadcast-cron] tick trước còn chạy — bỏ tick này');
      return;
    }
    cronRunning = true;
    try {
      await runScheduleTick();
    } catch (err) {
      logger.error('[group-broadcast-cron] tick lỗi:', err);
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
      logger.error('[group-broadcast-cron] sweeper lỗi:', err);
    } finally {
      sweeperRunning = false;
    }
  });
  logger.info(`[group-broadcast-cron] started, schedule="${CRON_SCHEDULE}"`);
}

/** Stop cron (test cleanup / graceful shutdown). */
export function stopGroupBroadcastCron(): void {
  cronTask?.stop();
  cronTask = null;
  sweeperTask?.stop();
  sweeperTask = null;
  cronRunning = false;
  sweeperRunning = false;
}
