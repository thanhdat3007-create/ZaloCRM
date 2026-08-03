// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * agent-reply-queue.ts — hàng đợi BullMQ cho lượt trả lời của agent.
 *
 * Hai lý do phải qua hàng đợi thay vì trả lời thẳng trong listener:
 *   1. GOM TIN — khách gõ 3 tin liền chỉ nên nhận 1 câu trả lời. jobId cố định
 *      theo hội thoại + remove job đang chờ trước khi add → luôn còn đúng 1 job.
 *   2. ĐỘ TRỄ NGẪU NHIÊN — trả lời tức thì 24/7 là dấu hiệu bot rõ nhất; delay
 *      3–12s giống người thật, giảm rủi ro nick bị Zalo khoá.
 *
 * jobId dùng dấu GẠCH NGANG (BullMQ v5 cấm ký tự ':').
 */
import { Queue, Worker, UnrecoverableError, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

export const AI_AGENT_QUEUE = 'ai-agent-reply';

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 5_000 },
};

export interface AgentReplyJobData {
  orgId: string;
  conversationId: string;
  zaloAccountId: string;
  /** Tin kích hoạt. Worker VẪN đọc lại tin mới nhất từ DB — payload chỉ để truy vết. */
  messageId: string;
}

// ── Redis connection (BullMQ-tuned) ─────────────────────────────────────────
let connection: Redis | null = null;
function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    connection = new Redis(url, {
      maxRetriesPerRequest: null, // BullMQ v5 requirement
      enableReadyCheck: false, // BullMQ workers recommendation
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });
    connection.on('error', (err: Error) => {
      logger.error(`[ai-agent-queue] redis error: ${err.message}`);
    });
  }
  return connection;
}

let queueInstance: Queue<AgentReplyJobData> | null = null;
function getQueue(): Queue<AgentReplyJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<AgentReplyJobData>(AI_AGENT_QUEUE, {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueInstance.on('error', (err) => {
      logger.error(`[ai-agent-queue] queue error: ${err.message}`);
    });
  }
  return queueInstance;
}

/** Job id cố định theo hội thoại — nền tảng của cơ chế gom tin. */
export function agentJobId(conversationId: string): string {
  return `ai-agent-${conversationId}`;
}

function randomDelayMs(minMs: number, maxMs: number): number {
  const lo = Math.max(0, minMs);
  const hi = Math.max(lo, maxMs);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Đưa 1 lượt trả lời vào hàng đợi. Fire-and-forget từ listener.
 *
 * Delay lấy từ agent nếu resolver đã biết agent nào phụ trách; chưa biết thì
 * dùng khoảng mặc định (worker sẽ tự resolve lại và bỏ qua nếu không có binding).
 */
export async function enqueueAgentReply(
  input: AgentReplyJobData,
  delayRange?: { minMs: number; maxMs: number },
): Promise<void> {
  if (!config.aiAgentEnabled) return;

  const queue = getQueue();
  const jobId = agentJobId(input.conversationId);

  // Xoá job cùng hội thoại đang CHỜ (delayed/waiting) → khách gõ liên tiếp chỉ
  // sinh 1 lượt trả lời, và lượt đó dùng tin mới nhất. Job đang chạy dở không
  // xoá được — worker vì thế luôn đọc lại tin mới nhất từ DB.
  await queue.remove(jobId).catch(() => {});

  const delay = randomDelayMs(delayRange?.minMs ?? 3000, delayRange?.maxMs ?? 12_000);
  await queue.add('reply', input, { jobId, delay });
}

// ── Worker lifecycle ────────────────────────────────────────────────────────
let workerInstance: Worker<AgentReplyJobData> | null = null;
let workerConnection: Redis | null = null;

/** Wire worker → processor. Gọi 1 lần lúc app start (đã gate bởi AI_AGENT_ENABLED). */
export function startAgentReplyWorker(): Worker<AgentReplyJobData> | null {
  if (!config.aiAgentEnabled) {
    logger.info('[ai-agent-worker] AI_AGENT_ENABLED=false — worker KHÔNG khởi động');
    return null;
  }
  if (workerInstance) return workerInstance;

  // Worker chạy blocking command (BRPOPLPUSH) độc chiếm socket → phải dùng
  // connection riêng, không chia sẻ với producer.
  workerConnection = getConnection().duplicate();
  workerInstance = new Worker<AgentReplyJobData>(
    AI_AGENT_QUEUE,
    async (job: Job<AgentReplyJobData>) => {
      // Import động để file queue không kéo cả worker (và Prisma/AI SDK) vào lúc
      // enqueue — chỉ tải khi thật sự xử lý 1 job. agent-reply-worker.js đã tự import
      // agent-runner.js nên lần import thứ 2 dưới đây lấy thẳng từ cache module, không
      // tốn thêm chi phí.
      const [{ processAgentReply }, { RocketTimeoutExhaustedError }] = await Promise.all([
        import('./agent-reply-worker.js'),
        import('./agent-runner.js'),
      ]);
      try {
        return await processAgentReply(job.data);
      } catch (err) {
        if (err instanceof RocketTimeoutExhaustedError) {
          // Rocket timeout đã hết đường cứu (không cấu hình fallback hoặc fallback cũng
          // lỗi): KHÔNG đáng retry — timeout 90s + backoff exponential của BullMQ tốn
          // thêm gần 3 phút vô ích, còn agent Rocket chạy tool có side effect nên chạy
          // lại tự động có thể lặp hành động đã làm ở lượt trước. AiAgentRun đã được
          // agent-reply-worker.ts ghi status='failed' xong; ném UnrecoverableError để
          // BullMQ dừng hẳn (không thêm attempt) nhưng job vẫn hiện đúng "failed" trên
          // Bull Board thay vì bị giấu thành "completed".
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    {
      connection: workerConnection as ConnectionOptions,
      concurrency: Math.max(1, config.aiAgentWorkerConcurrency),
    },
  );
  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[ai-agent-worker] failed conv=${job?.data.conversationId} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  workerInstance.on('error', (err) => {
    logger.error(`[ai-agent-worker] error: ${err.message}`);
  });
  logger.info('[ai-agent-worker] started concurrency=%d', config.aiAgentWorkerConcurrency);
  return workerInstance;
}

export async function stopAgentReplyWorker(): Promise<void> {
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

/** Queue instance cho Bull Board. null khi tính năng đang tắt. */
export function getAgentReplyQueue(): Queue<AgentReplyJobData> | null {
  return config.aiAgentEnabled ? getQueue() : null;
}
