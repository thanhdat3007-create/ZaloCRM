// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * agent-run-cleanup-cron.ts — dọn nhật ký AiAgentRun cũ.
 *
 * Mỗi tin đến trong hội thoại có agent đều sinh 1 dòng (kể cả `skipped`), nên
 * bảng này phình rất nhanh. Giữ 90 ngày là đủ để truy vết khiếu nại của khách.
 * Chạy 03:15 giờ VN — sau các cron thống kê, trước giờ làm việc.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';

const RETENTION_DAYS = 90;
const CRON_SCHEDULE = '15 3 * * *';
const TIMEZONE = 'Asia/Ho_Chi_Minh';

let cronTask: ReturnType<typeof cron.schedule> | null = null;
let running = false;

export function startAgentRunCleanupCron(): void {
  if (cronTask) return;
  cronTask = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (running) return;
      running = true;
      try {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
        // Dọn xuyên org → chạy ngoài tenant context có chủ đích.
        const res = await runSystemQuery(() =>
          prisma.aiAgentRun.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        );
        if (res.count > 0) {
          logger.info('[ai-agent-cleanup] xoá %d dòng nhật ký cũ hơn %d ngày', res.count, RETENTION_DAYS);
        }
      } catch (err) {
        logger.warn('[ai-agent-cleanup] lỗi: %s', (err as Error).message);
      } finally {
        running = false;
      }
    },
    { timezone: TIMEZONE },
  );
  logger.info('[ai-agent-cleanup] cron đã bật (giữ %d ngày)', RETENTION_DAYS);
}

export function stopAgentRunCleanupCron(): void {
  cronTask?.stop();
  cronTask = null;
}
