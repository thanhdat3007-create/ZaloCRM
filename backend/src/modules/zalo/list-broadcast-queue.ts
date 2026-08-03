// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi tệp khách hàng (🟢 Community) — BullMQ queue + worker wiring.
// ════════════════════════════════════════════════════════════════════════
//
// Queue RIÊNG với gửi nhóm dù cùng khuôn: hai tính năng có nhịp rất khác nhau
// (nhóm gửi dồn một lượt rồi nghỉ, tệp rải cả ngày). Chung queue thì một lượt gửi
// nhóm dài sẽ chặn lát gửi tệp và ngược lại, vì cả hai đều chạy concurrency 1.
//
// attempts 2: idempotency đã do `ListBroadcastRecipient.state` bảo đảm, retry chỉ
// để cứu lỗi hạ tầng tạm thời — không phải để gửi lại tin.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../shared/utils/logger.js';
import { processListBroadcast } from './list-broadcast-worker.js';

export const LIST_BROADCAST_QUEUE = 'list-broadcast';

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 30_000 },
};

export interface ListBroadcastJobData {
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
      logger.error(`[list-broadcast-queue] redis error: ${err.message}`);
    });
    logger.info('[list-broadcast-queue] redis connection created');
  }
  return connection;
}

// ── Queue singleton ───────────────────────────────────────────────────────────
let queueInstance: Queue<ListBroadcastJobData> | null = null;
function getQueue(): Queue<ListBroadcastJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<ListBroadcastJobData>(LIST_BROADCAST_QUEUE, {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueInstance.on('error', (err) => {
      logger.error(`[list-broadcast-queue] queue error: ${err.message}`);
    });
    logger.info('[list-broadcast-queue] queue initialized');
  }
  return queueInstance;
}

/**
 * Enqueue 1 lát gửi. jobId = `lb-${runId}` → re-enqueue cùng lát không tạo job trùng.
 * Gọi NGOÀI transaction tạo run, tránh worker chạy trước khi transaction commit.
 */
export async function enqueueListBroadcast(runId: string): Promise<void> {
  const queue = getQueue();
  await queue.add('send-list-broadcast', { runId }, { jobId: `lb-${runId}` });
  logger.info(`[list-broadcast-queue] enqueued runId=${runId}`);
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────
let workerInstance: Worker<ListBroadcastJobData> | null = null;
let workerConnection: Redis | null = null;

/** Wire BullMQ Worker → processor. Gọi 1 lần lúc app start. */
export function startListBroadcastWorker(): Worker<ListBroadcastJobData> {
  if (workerInstance) {
    logger.warn('[list-broadcast-worker] already started');
    return workerInstance;
  }
  // Connection riêng cho worker: BullMQ worker chạy blocking command độc chiếm
  // socket — chia sẻ với Queue producer dễ stall queue.add() dưới tải.
  workerConnection = getConnection().duplicate();
  workerInstance = new Worker<ListBroadcastJobData>(
    LIST_BROADCAST_QUEUE,
    (job: Job<ListBroadcastJobData>) => processListBroadcast(job.data.runId),
    {
      connection: workerConnection as ConnectionOptions,
      // Concurrency 1: tuần tự TOÀN CỤC. Hai chiến dịch cùng bắn một nick song song
      // sẽ đội burst → Zalo anti-spam. Đây cũng là mutex mềm cho lát gửi.
      concurrency: 1,
    },
  );
  workerInstance.on('completed', (job) => {
    logger.info(`[list-broadcast-worker] completed runId=${job.data.runId}`);
  });
  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[list-broadcast-worker] failed runId=${job?.data.runId} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  workerInstance.on('error', (err) => {
    logger.error(`[list-broadcast-worker] error: ${err.message}`);
  });
  logger.info('[list-broadcast-worker] started');
  return workerInstance;
}

export async function stopListBroadcastWorker(): Promise<void> {
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
