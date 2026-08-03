/**
 * ai-agent-simulator.test.ts — khung chat giả lập.
 *
 * Hai bảo đảm quan trọng nhất, vì sai là người dùng tin nhầm vào kết quả test:
 *   1. Mô phỏng KHÔNG ghi gì vào DB (không tạo conversation/message/run giả).
 *   2. Cờ @mention / @all / reply được dịch đúng sang cổng kích hoạt thật, để
 *      "thử trong nhóm thấy chạy" đồng nghĩa với "chạy thật cũng chạy".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  zaloAccount: { findFirst: vi.fn() },
  aiConfig: { findUnique: vi.fn() },
  aiAgentDocumentChunk: { findMany: vi.fn() },
  conversation: { create: vi.fn(), findUnique: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn() },
  aiAgentRun: { create: vi.fn(), count: vi.fn() },
};
const resolverMock = { resolveAgentForConversation: vi.fn() };
const promptMock = { assemblePrompt: vi.fn(), buildSimulationContextBlock: vi.fn(() => '<boi_canh>x</boi_canh>') };
const runnerMock = { generateAgentReply: vi.fn() };

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/ai-agent/binding-resolver.js', () => resolverMock);
vi.mock('../src/modules/ai-agent/prompt-builder.js', () => promptMock);
vi.mock('../src/modules/ai-agent/agent-runner.js', () => runnerMock);

const { simulateAgentTurn, __testing } = await import('../src/modules/ai-agent/agent-simulator.js');

const AGENT = {
  id: 'agent-1',
  name: 'Tư vấn',
  enabled: true,
  handoffKeywords: ['gặp nhân viên'],
  skipNoisePattern: '^(ok|oke)\\s*$',
} as any;

const BINDING = {
  id: 'b-1',
  scope: 'account_dm',
  enabled: true,
  groupTriggerMode: 'mention_or_keyword',
  triggerKeywords: ['báo giá'],
  replyToAllMention: false,
} as any;

function baseInput(over: Partial<Parameters<typeof simulateAgentTurn>[0]> = {}) {
  return {
    orgId: 'org-1',
    zaloAccountId: 'acc-1',
    threadType: 'user' as const,
    text: 'cho em hỏi giá',
    history: [],
    senderName: null,
    mentionsNick: false,
    mentionsAll: false,
    replyToNick: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.zaloAccount.findFirst.mockResolvedValue({
    id: 'acc-1',
    displayName: 'Sale 01',
    zaloUid: 'uid-nick',
  });
  prismaMock.aiConfig.findUnique.mockResolvedValue({ enabled: true });
  prismaMock.aiAgentDocumentChunk.findMany.mockResolvedValue([]);
  resolverMock.resolveAgentForConversation.mockResolvedValue({ agent: AGENT, binding: BINDING });
  promptMock.assemblePrompt.mockResolvedValue({ system: 'SYS', messages: [], chunkIds: [] });
  runnerMock.generateAgentReply.mockResolvedValue({
    reply: 'Dạ giá 500k ạ',
    handoff: false,
    handoffReason: null,
    promptTokens: 10,
    completionTokens: 5,
    latencyMs: 120,
  });
});

describe('simulateAgentTurn — không chạm dữ liệu thật', () => {
  it('không tạo conversation/message/run nào trong DB', async () => {
    await simulateAgentTurn(baseInput());

    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
    expect(prismaMock.aiAgentRun.create).not.toHaveBeenCalled();
  });

  it('trả về câu trả lời + số liệu của model khi mọi cổng đều mở', async () => {
    const res = await simulateAgentTurn(baseInput());

    expect(res.gate).toEqual({ ok: true, reason: null });
    expect(res.reply?.text).toBe('Dạ giá 500k ạ');
    expect(res.reply?.latencyMs).toBe(120);
    expect(res.binding?.agentName).toBe('Tư vấn');
    expect(res.binding?.scope).toBe('account_dm');
  });
});

describe('simulateAgentTurn — dừng đúng chỗ khi cấu hình thiếu', () => {
  it('nick chưa gán agent → no_binding, không gọi model', async () => {
    resolverMock.resolveAgentForConversation.mockResolvedValue(null);

    const res = await simulateAgentTurn(baseInput());

    expect(res.binding).toBeNull();
    expect(res.gate).toEqual({ ok: false, reason: 'no_binding' });
    expect(runnerMock.generateAgentReply).not.toHaveBeenCalled();
  });

  it('agent tắt → agent_disabled, không tốn tiền gọi model', async () => {
    resolverMock.resolveAgentForConversation.mockResolvedValue({
      agent: { ...AGENT, enabled: false },
      binding: BINDING,
    });

    const res = await simulateAgentTurn(baseInput());

    expect(res.gate.reason).toBe('agent_disabled');
    expect(runnerMock.generateAgentReply).not.toHaveBeenCalled();
  });

  it('kill switch org tắt → org_disabled', async () => {
    prismaMock.aiConfig.findUnique.mockResolvedValue({ enabled: false });

    const res = await simulateAgentTurn(baseInput());

    expect(res.gate.reason).toBe('org_disabled');
    expect(runnerMock.generateAgentReply).not.toHaveBeenCalled();
  });

  it('tin trúng regex nhiễu → noise', async () => {
    const res = await simulateAgentTurn(baseInput({ text: 'ok' }));
    expect(res.gate.reason).toBe('noise');
  });

  it('khách xin gặp nhân viên → handoff_keyword', async () => {
    const res = await simulateAgentTurn(baseInput({ text: 'cho tôi gặp nhân viên' }));
    expect(res.gate.reason).toBe('handoff_keyword');
  });

  it('nick không tồn tại trong org → ném lỗi cấu hình', async () => {
    prismaMock.zaloAccount.findFirst.mockResolvedValue(null);
    await expect(simulateAgentTurn(baseInput())).rejects.toThrow(/Không tìm thấy nick/);
  });
});

describe('simulateAgentTurn — cổng nhóm khớp luồng thật', () => {
  const groupInput = (over = {}) =>
    baseInput({ threadType: 'group', text: 'cho em hỏi thêm', ...over });

  it('nhóm không @nhắc, không trúng từ khoá → not_mentioned', async () => {
    const res = await simulateAgentTurn(groupInput());
    expect(res.gate.reason).toBe('not_mentioned');
    expect(runnerMock.generateAgentReply).not.toHaveBeenCalled();
  });

  it('nhóm có @nhắc đúng nick → cổng mở', async () => {
    const res = await simulateAgentTurn(groupInput({ mentionsNick: true }));
    expect(res.gate.ok).toBe(true);
  });

  it('nhóm trúng từ khoá binding → cổng mở dù không @nhắc', async () => {
    const res = await simulateAgentTurn(groupInput({ text: 'cho xin bao gia voi' }));
    expect(res.gate.ok).toBe(true);
  });

  it('@all bị chặn khi binding không cho tính @all', async () => {
    const res = await simulateAgentTurn(groupInput({ mentionsAll: true }));
    expect(res.gate.reason).toBe('not_mentioned');
  });

  it('@all được tính khi binding bật replyToAllMention', async () => {
    resolverMock.resolveAgentForConversation.mockResolvedValue({
      agent: AGENT,
      binding: { ...BINDING, replyToAllMention: true },
    });

    const res = await simulateAgentTurn(groupInput({ mentionsAll: true }));
    expect(res.gate.ok).toBe(true);
  });

  it('khách bấm "Trả lời" tin của nick → cổng mở', async () => {
    const res = await simulateAgentTurn(groupInput({ replyToNick: true }));
    expect(res.gate.ok).toBe(true);
  });
});

describe('toHistoryTurns', () => {
  it('gắn tin đang gõ vào cuối lịch sử và map role sang senderType của luồng thật', () => {
    const turns = __testing.toHistoryTurns(
      baseInput({
        text: 'câu mới',
        history: [
          { role: 'customer', content: 'câu cũ' },
          { role: 'agent', content: 'trả lời cũ' },
        ],
        senderName: 'Chị Lan',
      }) as any,
    );

    expect(turns.map((t) => t.senderType)).toEqual(['contact', 'self', 'contact']);
    expect(turns.at(-1)?.content).toBe('câu mới');
    expect(turns[0].senderName).toBe('Chị Lan');
  });
});
