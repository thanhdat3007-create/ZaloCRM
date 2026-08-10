// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * birthday-cron.ts — Bộ chạy lời chúc sinh nhật (🟢 Community).
 *
 * Hai nhịp tách rời:
 *   - LẬP KẾ HOẠCH (10 phút/lần): đọc Contact, dựng hàng đợi cho ngày hôm nay.
 *     Rẻ và idempotent nên chạy thưa cũng đủ; bật tính năng lúc 6h sáng vẫn kịp
 *     lên lịch cho 9h.
 *   - GỬI (1 phút/lần): nhặt các lời chúc đã tới `dueAt`, gửi tuần tự, có giãn
 *     cách ngẫu nhiên giữa hai người.
 *
 * Vì sao KHÔNG dùng BullMQ như gửi tệp: lời chúc sinh nhật là vài chục tin/ngày,
 * và bảng `birthday_greetings` đã là hàng đợi bền vững có khoá chống trùng. Thêm
 * một queue Redis nữa chỉ tăng thứ phải vận hành mà không giải quyết vấn đề nào.
 *
 * Trần `MAX_SENDS_PER_TICK` giữ mỗi tick ngắn: backend restart giữa chừng chỉ mất
 * phần đang gửi, phần còn lại vẫn `pending` và tick sau đi tiếp.
 *
 * Community feature — KHÔNG import `_ee`.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { loadEnabledConfigs, planForOrg, type BirthdayConfig } from './birthday-planner.js';
import { sendBirthdayGreeting } from './birthday-sender.js';

const PLAN_SCHEDULE = '*/10 * * * *';
const SEND_SCHEDULE = '* * * * *';

/**
 * Trần lời chúc gửi mỗi tick. Với giãn cách 30-90s thì một tick kéo dài tối đa
 * ~7 phút — đủ ngắn để restart không mất nhiều, đủ dài để không phí tick.
 */
export const MAX_SENDS_PER_TICK = 5;

let planRunning = false;
let sendRunning = false;
let planTask: ReturnType<typeof cron.schedule> | null = null;
let sendTask: ReturnType<typeof cron.schedule> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nghỉ ngẫu nhiên giữa hai lời chúc, theo cấu hình của org. */
function gapMs(minSec: number, maxSec: number): number {
  const lo = Math.max(0, minSec);
  const hi = Math.max(lo, maxSec);
  return (lo + Math.random() * (hi - lo)) * 1000;
}

/** 1 tick lập kế hoạch: dựng hàng đợi hôm nay cho mọi org đang bật. */
export async function runPlanTick(now: Date = new Date()): Promise<number> {
  const configs = await runSystemQuery(loadEnabledConfigs);

  let created = 0;
  for (const config of configs) {
    await withTenant(config.orgId, async () => {
      try {
        const result = await planForOrg(config, now);
        created += result.created;
        if (result.created > 0) {
          logger.info(
            `[birthday-cron] org=${config.orgId} lên lịch ${result.created} lời chúc`,
          );
        }
      } catch (err) {
        logger.error(
          `[birthday-cron] lập kế hoạch lỗi (org=${config.orgId}): ${(err as Error).message}`,
        );
      }
    });
  }
  return created;
}

interface DueGreeting {
  id: string;
  orgId: string;
  configId: string;
}

/** Lời chúc đã tới giờ, cũ nhất trước — không để người đến hạn sớm bị đói. */
async function findDueGreetings(now: Date, take: number): Promise<DueGreeting[]> {
  return runSystemQuery(() =>
    prisma.birthdayGreeting.findMany({
      where: { state: 'pending', dueAt: { lte: now } },
      select: { id: true, orgId: true, configId: true },
      orderBy: { dueAt: 'asc' },
      take,
    }),
  );
}

/**
 * Cấu hình theo id, nạp thẳng (KHÔNG lọc `enabled`).
 *
 * Cố ý nạp cả cấu hình đã tắt: phần gửi cần thấy nó để chốt bản ghi thành
 * `skipped/CONFIG_DISABLED`. Bỏ qua ở đây sẽ để lại `pending` treo mãi.
 */
async function loadConfig(configId: string): Promise<BirthdayConfig | null> {
  return prisma.birthdayGreetingConfig.findUnique({
    where: { id: configId },
    select: {
      id: true, orgId: true, enabled: true, timezone: true, sendTime: true,
      lateToleranceMinutes: true,
      beforeEnabled: true, beforeDays: true, beforeTemplateId: true,
      onDayEnabled: true, onDayTemplateId: true,
      afterEnabled: true, afterDays: true, afterTemplateId: true,
      senderMode: true, zaloAccountIds: true,
      dailyQuota: true, perNickDailyQuota: true,
      minDelaySec: true, maxDelaySec: true, createdById: true,
    },
  });
}

export interface SendTickResult {
  sent: number;
  failed: number;
  skipped: number;
}

/** 1 tick gửi: tối đa `MAX_SENDS_PER_TICK` lời chúc, tuần tự, có giãn cách. */
export async function runSendTick(now: Date = new Date()): Promise<SendTickResult> {
  const due = await findDueGreetings(now, MAX_SENDS_PER_TICK);
  const result: SendTickResult = { sent: 0, failed: 0, skipped: 0 };
  if (due.length === 0) return result;

  // Nhiều lời chúc thường cùng một org → nạp cấu hình 1 lần cho cả tick.
  const configCache = new Map<string, BirthdayConfig | null>();
  // Giãn cách chỉ tính từ lần GỬI THẬT gần nhất. Bản ghi bị bỏ qua (quá trễ,
  // thiếu mẫu tin) không chạm Zalo nên không cần nghỉ — nếu nghỉ, một loạt bản
  // ghi cũ tồn đọng sẽ ăn hết tick mà chẳng gửi được ai.
  let sentSomething = false;

  for (const greeting of due) {
    await withTenant(greeting.orgId, async () => {
      try {
        if (!configCache.has(greeting.configId)) {
          configCache.set(greeting.configId, await loadConfig(greeting.configId));
        }
        const config = configCache.get(greeting.configId) ?? null;
        if (!config) return; // cấu hình vừa bị xoá → bản ghi cũng đã cascade

        if (sentSomething) await sleep(gapMs(config.minDelaySec, config.maxDelaySec));

        const outcome = await sendBirthdayGreeting(greeting.id, config, new Date());
        // 'failed' cũng tính là đã chạm Zalo → vẫn phải giãn cách trước lượt sau.
        if (outcome.kind === 'sent' || outcome.kind === 'failed') sentSomething = true;
        if (outcome.kind === 'sent') result.sent++;
        else if (outcome.kind === 'failed') result.failed++;
        else result.skipped++;
      } catch (err) {
        logger.error(
          `[birthday-cron] gửi lỗi (lời chúc=${greeting.id}): ${(err as Error).message}`,
        );
        result.failed++;
      }
    });
  }

  if (result.sent > 0 || result.failed > 0) {
    logger.info(
      `[birthday-cron] tick gửi: ${result.sent} thành công, ${result.failed} lỗi, ${result.skipped} bỏ qua`,
    );
  }
  return result;
}

/** Start cron lập kế hoạch + cron gửi. Idempotent. */
export function startBirthdayCron(): void {
  if (planTask) {
    logger.info('[birthday-cron] đã start, bỏ qua');
    return;
  }
  planTask = cron.schedule(PLAN_SCHEDULE, async () => {
    if (planRunning) return;
    planRunning = true;
    try {
      await runPlanTick();
    } catch (err) {
      logger.error('[birthday-cron] tick lập kế hoạch lỗi:', err);
    } finally {
      planRunning = false;
    }
  });
  sendTask = cron.schedule(SEND_SCHEDULE, async () => {
    // Tick trước còn đang rải tin (giãn cách 30-90s/người) → bỏ tick này.
    if (sendRunning) return;
    sendRunning = true;
    try {
      await runSendTick();
    } catch (err) {
      logger.error('[birthday-cron] tick gửi lỗi:', err);
    } finally {
      sendRunning = false;
    }
  });
  logger.info(
    `[birthday-cron] started, lập kế hoạch="${PLAN_SCHEDULE}" gửi="${SEND_SCHEDULE}"`,
  );
}

/** Stop cron (test cleanup / graceful shutdown). */
export function stopBirthdayCron(): void {
  planTask?.stop();
  planTask = null;
  sendTask?.stop();
  sendTask = null;
  planRunning = false;
  sendRunning = false;
}
