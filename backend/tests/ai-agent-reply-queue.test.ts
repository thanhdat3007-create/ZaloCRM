/**
 * ai-agent-reply-queue.test.ts — gom tin + kill switch tiến trình.
 *
 * Nếu gom tin hỏng: khách gõ 3 tin liền sẽ nhận 3 câu trả lời — vừa tốn tiền
 * model vừa là hành vi bot lộ liễu khiến nick Zalo bị gắn cờ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queueMock = {
  add: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  close: vi.fn(),
};
const configMock = {
  config: { aiAgentEnabled: true, aiAgentWorkerConcurrency: 3 },
};

// Queue/Worker/Redis được gọi bằng `new` → mock phải là constructor thật.
vi.mock('bullmq', () => ({
  Queue: class { constructor() { return queueMock; } },
  Worker: class { on = vi.fn(); close = vi.fn(); },
}));
vi.mock('ioredis', () => ({
  Redis: class {
    on = vi.fn();
    quit = vi.fn();
    duplicate = vi.fn(() => new (this.constructor as new () => unknown)());
  },
}));
vi.mock('../src/config/index.js', () => configMock);
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { enqueueAgentReply, agentJobId, startAgentReplyWorker } = await import(
  '../src/modules/ai-agent/agent-reply-queue.js'
);

const JOB = {
  orgId: 'org-1',
  conversationId: 'conv-1',
  zaloAccountId: 'nick-1',
  messageId: 'msg-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  configMock.config.aiAgentEnabled = true;
});

describe('agentJobId', () => {
  it('dùng dấu gạch ngang — BullMQ v5 cấm ký tự ":"', () => {
    const id = agentJobId('conv-1');
    expect(id).toBe('ai-agent-conv-1');
    expect(id).not.toContain(':');
  });
});

describe('enqueueAgentReply', () => {
  it('xoá job đang chờ cùng hội thoại trước khi thêm (gom tin)', async () => {
    await enqueueAgentReply(JOB);
    expect(queueMock.remove).toHaveBeenCalledWith('ai-agent-conv-1');
    expect(queueMock.add).toHaveBeenCalledTimes(1);
  });

  it('3 tin liên tiếp chỉ để lại 1 job (cùng jobId, luôn remove trước)', async () => {
    await enqueueAgentReply(JOB);
    await enqueueAgentReply({ ...JOB, messageId: 'msg-2' });
    await enqueueAgentReply({ ...JOB, messageId: 'msg-3' });

    expect(queueMock.remove).toHaveBeenCalledTimes(3);
    const jobIds = queueMock.add.mock.calls.map((c) => (c[2] as { jobId: string }).jobId);
    expect(new Set(jobIds).size).toBe(1);
  });

  it('delay nằm trong khoảng của agent (giống người thật, giảm cờ spam)', async () => {
    for (let i = 0; i < 20; i++) {
      await enqueueAgentReply(JOB, { minMs: 4000, maxMs: 6000 });
    }
    for (const call of queueMock.add.mock.calls) {
      const { delay } = call[2] as { delay: number };
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(6000);
    }
  });

  it('không truyền khoảng trễ → dùng mặc định 3–12s', async () => {
    await enqueueAgentReply(JOB);
    const { delay } = queueMock.add.mock.calls[0][2] as { delay: number };
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(12_000);
  });

  it('AI_AGENT_ENABLED=false → no-op hoàn toàn, không chạm hàng đợi', async () => {
    configMock.config.aiAgentEnabled = false;
    await enqueueAgentReply(JOB);
    expect(queueMock.add).not.toHaveBeenCalled();
    expect(queueMock.remove).not.toHaveBeenCalled();
  });
});

describe('startAgentReplyWorker', () => {
  it('AI_AGENT_ENABLED=false → worker KHÔNG khởi động', () => {
    configMock.config.aiAgentEnabled = false;
    expect(startAgentReplyWorker()).toBeNull();
  });
});
