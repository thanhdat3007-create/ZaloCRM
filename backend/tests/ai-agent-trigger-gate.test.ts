/**
 * ai-agent-trigger-gate.test.ts — các cổng quyết định agent có trả lời không.
 *
 * Mỗi cổng ở đây tương ứng một cách tính năng có thể gây hại thật: spam nhóm,
 * vòng lặp AI↔AI, nick bị Zalo khoá, hoặc AI chen ngang khi sale đang xử lý.
 * Mỗi skipReason có ít nhất 1 case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  aiConfig: { findUnique: vi.fn() },
  zaloAccount: { findFirst: vi.fn(), findUnique: vi.fn() },
  message: { findFirst: vi.fn(), count: vi.fn() },
  aiAgentRun: { count: vi.fn() },
};
const pauseMock = { getPauseReason: vi.fn() };

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/ai-agent/conversation-pause-store.js', () => pauseMock);

const { evaluateGates, isDirectedAtNick, foldVietnamese } = await import(
  '../src/modules/ai-agent/trigger-gate.js'
);

const AGENT = {
  id: 'agent-1',
  name: 'Tư vấn',
  enabled: true,
  handoffKeywords: ['gặp nhân viên'],
  skipNoisePattern: '^(ok|oke|uhm)\\s*$',
  pauseAfterHumanReplyMinutes: 0,
  maxRepliesPerDay: 500,
  maxRepliesPerConversationDay: 30,
};

const BINDING = {
  id: 'b-1',
  enabled: true,
  groupTriggerMode: 'mention_or_keyword',
  triggerKeywords: ['báo giá'],
  replyToAllMention: false,
};

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org-1',
    agent: { ...AGENT },
    binding: { ...BINDING },
    conversationId: 'conv-1',
    zaloAccountId: 'nick-1',
    zaloUid: 'uid-nick',
    threadType: 'user',
    message: {
      id: 'msg-1',
      senderType: 'contact',
      senderUid: 'uid-khach',
      content: 'Cho em hỏi giá căn 2 phòng ngủ ạ',
      contentType: 'text',
      isDeleted: false,
      isLocal: false,
      mentions: null,
      quoteOwnerUid: null,
    },
    ...overrides,
  } as never;
}

/** Mọi cổng cần I/O đều PASS — để test cô lập đúng cổng đang xét. */
function allowAllIo(): void {
  prismaMock.aiConfig.findUnique.mockResolvedValue({ enabled: true });
  prismaMock.zaloAccount.findFirst.mockResolvedValue(null); // người gửi không phải nick nội bộ
  prismaMock.zaloAccount.findUnique.mockResolvedValue({ dailyMessageCap: 300 });
  prismaMock.message.findFirst.mockResolvedValue(null); // sale chưa trả lời gần đây
  prismaMock.message.count.mockResolvedValue(0);
  prismaMock.aiAgentRun.count.mockResolvedValue(0);
  pauseMock.getPauseReason.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  allowAllIo();
});

describe('foldVietnamese', () => {
  it('bỏ dấu và đ/Đ để so từ khoá không dấu', () => {
    expect(foldVietnamese('Báo Giá')).toBe('bao gia');
    expect(foldVietnamese('Đặt cọc')).toBe('dat coc');
    expect(foldVietnamese('CĂN HỘ')).toBe('can ho');
  });
});

describe('evaluateGates — chat 1-1', () => {
  it('tin khách bình thường → cho chạy', async () => {
    await expect(evaluateGates(ctx())).resolves.toEqual({ ok: true });
  });

  it('agent tắt → agent_disabled', async () => {
    const res = await evaluateGates(ctx({ agent: { ...AGENT, enabled: false } }));
    expect(res).toEqual({ ok: false, reason: 'agent_disabled' });
  });

  it('binding tắt → binding_disabled', async () => {
    const res = await evaluateGates(ctx({ binding: { ...BINDING, enabled: false } }));
    expect(res).toEqual({ ok: false, reason: 'binding_disabled' });
  });

  it('tin do chính nick gửi (kể cả tin AI vừa gửi) → not_inbound, chống tự kích hoạt', async () => {
    const res = await evaluateGates(
      ctx({ message: { ...ctx().message, senderType: 'self' } }),
    );
    expect(res).toEqual({ ok: false, reason: 'not_inbound' });
  });

  it('tin ảnh/sticker → unsupported_type', async () => {
    const res = await evaluateGates(ctx({ message: { ...ctx().message, contentType: 'image' } }));
    expect(res).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('tin rác "ok" → noise, KHÔNG gọi model', async () => {
    const res = await evaluateGates(ctx({ message: { ...ctx().message, content: 'ok' } }));
    expect(res).toEqual({ ok: false, reason: 'noise' });
  });

  it('regex hỏng do admin nhập sai → fail-open, không chặn oan tin khách', async () => {
    const res = await evaluateGates(ctx({ agent: { ...AGENT, skipNoisePattern: '([unclosed' } }));
    expect(res).toEqual({ ok: true });
  });

  it('khách xin gặp nhân viên (không dấu vẫn khớp) → handoff_keyword', async () => {
    const res = await evaluateGates(
      ctx({ message: { ...ctx().message, content: 'cho em gap nhan vien voi a' } }),
    );
    expect(res).toEqual({ ok: false, reason: 'handoff_keyword' });
  });

  it('kill switch org tắt → org_disabled', async () => {
    prismaMock.aiConfig.findUnique.mockResolvedValue({ enabled: false });
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: false, reason: 'org_disabled' });
  });

  it('org chưa cấu hình AI bao giờ → org_disabled (không tự ý chạy)', async () => {
    prismaMock.aiConfig.findUnique.mockResolvedValue(null);
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: false, reason: 'org_disabled' });
  });

  it('người gửi là nick khác của cùng org → internal_nick (chống vòng lặp AI↔AI)', async () => {
    prismaMock.zaloAccount.findFirst.mockResolvedValue({ id: 'nick-2' });
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: false, reason: 'internal_nick' });
  });

  it('hội thoại đang tạm dừng thủ công → conversation_paused', async () => {
    pauseMock.getPauseReason.mockResolvedValue('manual');
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: false, reason: 'conversation_paused' });
  });

  it('đang chờ nhân viên xử lý sau handoff → handoff_active', async () => {
    pauseMock.getPauseReason.mockResolvedValue('handoff');
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: false, reason: 'handoff_active' });
  });

  it('sale vừa trả lời trong khoảng nhường → human_active', async () => {
    prismaMock.message.findFirst.mockResolvedValue({ id: 'msg-sale' });
    const res = await evaluateGates(ctx({ agent: { ...AGENT, pauseAfterHumanReplyMinutes: 10 } }));
    expect(res).toEqual({ ok: false, reason: 'human_active' });
  });

  it('pauseAfterHumanReplyMinutes = 0 → KHÔNG kiểm tra tin của sale', async () => {
    prismaMock.message.findFirst.mockResolvedValue({ id: 'msg-sale' });
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: true });
    expect(prismaMock.message.findFirst).not.toHaveBeenCalled();
  });

  it('chạm hạn mức ngày của agent → quota', async () => {
    prismaMock.aiAgentRun.count.mockResolvedValue(500);
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: false, reason: 'quota' });
  });

  it('nick chạm trần tin/ngày → nick_cap', async () => {
    prismaMock.message.count.mockResolvedValue(300);
    const res = await evaluateGates(ctx());
    expect(res).toEqual({ ok: false, reason: 'nick_cap' });
  });
});

describe('isDirectedAtNick — nhóm mặc định im lặng', () => {
  it('không mention, không từ khoá → không được gọi', () => {
    expect(isDirectedAtNick(ctx({ threadType: 'group' }))).toBe(false);
  });

  it('@mention đúng uid của nick → được gọi', () => {
    const c = ctx({
      threadType: 'group',
      message: { ...ctx().message, mentions: [{ uid: 'uid-nick', pos: 0, len: 5, type: 0 }] },
    });
    expect(isDirectedAtNick(c)).toBe(true);
  });

  it('@mention người khác → KHÔNG được gọi', () => {
    const c = ctx({
      threadType: 'group',
      message: { ...ctx().message, mentions: [{ uid: 'uid-nguoi-khac', pos: 0, len: 5, type: 0 }] },
    });
    expect(isDirectedAtNick(c)).toBe(false);
  });

  it('@all mặc định KHÔNG tính (tránh spam nhóm đông)', () => {
    const c = ctx({
      threadType: 'group',
      message: { ...ctx().message, mentions: [{ uid: 'all', pos: 0, len: 4, type: 1 }] },
    });
    expect(isDirectedAtNick(c)).toBe(false);
  });

  it('@all được tính khi binding bật replyToAllMention', () => {
    const c = ctx({
      threadType: 'group',
      binding: { ...BINDING, replyToAllMention: true },
      message: { ...ctx().message, mentions: [{ uid: 'all', pos: 0, len: 4, type: 1 }] },
    });
    expect(isDirectedAtNick(c)).toBe(true);
  });

  it('khách reply vào tin của nick → được gọi', () => {
    const c = ctx({
      threadType: 'group',
      message: { ...ctx().message, quoteOwnerUid: 'uid-nick' },
    });
    expect(isDirectedAtNick(c)).toBe(true);
  });

  it('từ khoá không dấu vẫn khớp', () => {
    const c = ctx({
      threadType: 'group',
      message: { ...ctx().message, content: 'shop oi cho minh xin bao gia voi' },
    });
    expect(isDirectedAtNick(c)).toBe(true);
  });

  it('chế độ chỉ-mention → từ khoá KHÔNG kích hoạt', () => {
    const c = ctx({
      threadType: 'group',
      binding: { ...BINDING, groupTriggerMode: 'mention' },
      message: { ...ctx().message, content: 'cho xin bao gia' },
    });
    expect(isDirectedAtNick(c)).toBe(false);
  });

  it('chế độ chỉ-từ-khoá → mention KHÔNG kích hoạt', () => {
    const c = ctx({
      threadType: 'group',
      binding: { ...BINDING, groupTriggerMode: 'keyword' },
      message: { ...ctx().message, mentions: [{ uid: 'uid-nick', pos: 0, len: 5, type: 0 }] },
    });
    expect(isDirectedAtNick(c)).toBe(false);
  });
});

describe('evaluateGates — nhóm', () => {
  it('nhóm không được gọi → not_mentioned, KHÔNG chạm DB (tiết kiệm tiền)', async () => {
    const res = await evaluateGates(ctx({ threadType: 'group' }));
    expect(res).toEqual({ ok: false, reason: 'not_mentioned' });
    expect(prismaMock.aiConfig.findUnique).not.toHaveBeenCalled();
  });

  it('nhóm có mention đúng nick → cho chạy', async () => {
    const res = await evaluateGates(
      ctx({
        threadType: 'group',
        message: { ...ctx().message, mentions: [{ uid: 'uid-nick', pos: 0, len: 5, type: 0 }] },
      }),
    );
    expect(res).toEqual({ ok: true });
  });
});
