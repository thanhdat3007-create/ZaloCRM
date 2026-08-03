// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi nhóm theo lịch (🟢 Community) — BullMQ queue + worker wiring.
// ════════════════════════════════════════════════════════════════════════
//
// Self-contained COMMUNITY queue, cùng khuôn `group-scan-queue.ts`. KHÔNG dùng
// `_ee` queue-registry — tính năng phải đứng độc lập trong tier Community.
//
// Khác group-scan ở 2 điểm, đều vì gửi tin là TÁC DỤNG PHỤ RA NGOÀI:
//   - attempts 2 (không phải 3): idempotency đã do `GroupBroadcastTarget.state`
//     bảo đảm, retry chỉ để cứu lỗi hạ tầng tạm thời, không phải để gửi lại tin.
//   - jobId = runId → BullMQ chống enqueue trùng cùng một run.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../shared/utils/logger.js';
import { processGroupBroadcast } from './group-broadcast-worker.js';

export const GROUP_BROADCAST_QUEUE = 'group-broadcast';

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 30_000 },
};

export interface GroupBroadcastJobData {
  runId: string;
}

// ── Community Redis connection (BullMQ-tuned) ─────────────────────────────────
let connection: Redis | null = null;
function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    connection = new Redis(url, {
      maxRetriesPerRequest: null, // BullMQ v5 requirement
      enableReadyCheck: false,    // BullMQ workers recommendation
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });
    connection.on('error', (err: Error) => {
      logger.error(`[group-broadcast-queue] redis error: ${err.message}`);
    });
    logger.info('[group-broadcast-queue] redis connection created');
  }
  return connection;
}

// ── Queue singleton ───────────────────────────────────────────────────────────
let queueInstance: Queue<GroupBroadcastJobData> | null = null;
function getQueue(): Queue<GroupBroadcastJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<GroupBroadcastJobData>(GROUP_BROADCAST_QUEUE, {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueInstance.on('error', (err) => {
      logger.error(`[group-broadcast-queue] queue error: ${err.message}`);
    });
    logger.info('[group-broadcast-queue] queue initialized');
  }
  return queueInstance;
}

/**
 * Enqueue 1 run. jobId = `gb-${runId}` → re-enqueue cùng run không tạo job trùng.
 * Gọi NGOÀI transaction tạo run, tránh worker chạy trước khi transaction commit.
 */
export async function enqueueGroupBroadcast(runId: string): Promise<void> {
  const queue = getQueue();
  await queue.add('send-broadcast', { runId }, { jobId: `gb-${runId}` });
  logger.info(`[group-broadcast-queue] enqueued runId=${runId}`);
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────
let workerInstance: Worker<GroupBroadcastJobData> | null = null;
let workerConnection: Redis | null = null;

/** Wire BullMQ Worker → processor. Gọi 1 lần lúc app start. */
export function startGroupBroadcastWorker(): Worker<GroupBroadcastJobData> {
  if (workerInstance) {
    logger.warn('[group-broadcast-worker] already started');
    return workerInstance;
  }
  // Connection riêng cho worker: BullMQ worker chạy blocking command độc chiếm
  // socket — chia sẻ với Queue producer dễ stall queue.add() dưới tải.
  workerConnection = getConnection().duplicate();
  workerInstance = new Worker<GroupBroadcastJobData>(
    GROUP_BROADCAST_QUEUE,
    (job: Job<GroupBroadcastJobData>) => processGroupBroadcast(job.data.runId),
    {
      connection: workerConnection as ConnectionOptions,
      // Concurrency 1: tuần tự TOÀN CỤC. Hai chiến dịch cùng bắn 1 nick song song
      // sẽ đội burst → Zalo anti-spam. Đây cũng là mutex mềm cho run.
      concurrency: 1,
    },
  );
  workerInstance.on('completed', (job) => {
    logger.info(`[group-broadcast-worker] completed runId=${job.data.runId}`);
  });
  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[group-broadcast-worker] failed runId=${job?.data.runId} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  workerInstance.on('error', (err) => {
    logger.error(`[group-broadcast-worker] error: ${err.message}`);
  });
  logger.info('[group-broadcast-worker] started');
  return workerInstance;
}

export async function stopGroupBroadcastWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
  if (workerConnection) {
    await workerConnection.quit();
    workerConnection = null;
  }
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
