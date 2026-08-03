/**
 * analysis-service.test.ts — lớp truy vấn phục vụ phân tích hội thoại.
 *
 * Tập trung vào phần tính toán, không phải phần gọi Prisma: thời gian phản hồi
 * đo từ tin ĐẦU TIÊN của chuỗi khách chưa được trả lời (khách nhắn liền 3 tin thì
 * đồng hồ chạy từ tin đầu, không phải tin cuối) — đo sai chỗ này sẽ khiến báo cáo
 * chất lượng chăm sóc đẹp hơn thực tế.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  organization: { findUnique: vi.fn() },
  conversation: { findFirst: vi.fn() },
  message: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { getConversationMetrics, getTranscript, formatInOrgTimezone } = await import(
  '../src/modules/analysis/analysis-service.js'
);

const at = (isoUtc: string) => new Date(isoUtc);

const CONVERSATION = {
  id: 'conv-1',
  threadType: 'user',
  groupName: null,
  isReplied: true,
  unreadCount: 0,
  contact: { fullName: 'Nguyễn Văn A', crmName: null, phone: '0900000001' },
  zaloAccount: { displayName: 'Nick Sale 1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.conversation.findFirst.mockResolvedValue(CONVERSATION);
  prismaMock.organization.findUnique.mockResolvedValue({ timezone: '+07:00' });
});

describe('formatInOrgTimezone', () => {
  it('đổi sang giờ địa phương theo offset của tổ chức', () => {
    expect(formatInOrgTimezone(at('2026-08-01T02:05:00Z'), '+07:00')).toBe('2026-08-01 09:05');
  });

  it('xử lý offset âm và bắc qua ranh giới ngày', () => {
    expect(formatInOrgTimezone(at('2026-08-01T02:00:00Z'), '-05:00')).toBe('2026-07-31 21:00');
  });

  it('rơi về +07:00 khi tổ chức chưa đặt múi giờ', () => {
    expect(formatInOrgTimezone(at('2026-08-01T02:05:00Z'), null)).toBe('2026-08-01 09:05');
  });
});

describe('getConversationMetrics', () => {
  // Khách nhắn 2 tin liền lúc 09:00 và 09:01, sale trả lời 09:05 → chờ 300s (từ 09:00),
  // KHÔNG phải 240s (từ 09:01). Lượt 2: hỏi 10:00, trả lời 10:02 → 120s.
  // Tin cuối 12:00 của khách chưa ai trả lời → khách đang chờ.
  const MESSAGES = [
    { sentAt: at('2026-08-01T02:00:00Z'), senderType: 'contact', sentVia: 'user' },
    { sentAt: at('2026-08-01T02:01:00Z'), senderType: 'contact', sentVia: 'user' },
    { sentAt: at('2026-08-01T02:05:00Z'), senderType: 'self', sentVia: 'user' },
    { sentAt: at('2026-08-01T03:00:00Z'), senderType: 'contact', sentVia: 'user' },
    { sentAt: at('2026-08-01T03:02:00Z'), senderType: 'ai_assistant', sentVia: 'automation' },
    { sentAt: at('2026-08-01T05:00:00Z'), senderType: 'contact', sentVia: 'user' },
  ];

  it('đếm tin theo chiều và tách riêng tin do máy gửi', async () => {
    prismaMock.message.findMany.mockResolvedValue(MESSAGES);

    const metrics = await getConversationMetrics('org-1', 'conv-1');

    expect(metrics.totalMessages).toBe(6);
    expect(metrics.inboundMessages).toBe(4);
    expect(metrics.outboundMessages).toBe(2);
    expect(metrics.automatedOutboundMessages).toBe(1);
  });

  // Dữ liệu thật dùng 'user_native' cho tin sale gõ thẳng trong app Zalo và
  // 'bridge' cho tin trả lời qua Telegram. Cả hai là NGƯỜI gửi; gộp vào nhóm máy
  // sẽ báo cáo sai tỉ lệ tự động hoá gần như toàn bộ.
  it('chỉ tính automation/system là máy gửi, không tính user_native và bridge', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      { sentAt: at('2026-08-01T02:00:00Z'), senderType: 'self', sentVia: 'user' },
      { sentAt: at('2026-08-01T02:01:00Z'), senderType: 'self', sentVia: 'user_native' },
      { sentAt: at('2026-08-01T02:02:00Z'), senderType: 'self', sentVia: 'bridge' },
      { sentAt: at('2026-08-01T02:03:00Z'), senderType: 'self', sentVia: 'automation' },
      { sentAt: at('2026-08-01T02:04:00Z'), senderType: 'self', sentVia: 'system' },
    ]);

    const metrics = await getConversationMetrics('org-1', 'conv-1');

    expect(metrics.outboundMessages).toBe(5);
    expect(metrics.automatedOutboundMessages).toBe(2);
    expect(metrics.outboundByChannel).toEqual({
      user: 1, user_native: 1, bridge: 1, automation: 1, system: 1,
    });
  });

  it('tính thời gian phản hồi từ tin đầu của chuỗi khách chưa được trả lời', async () => {
    prismaMock.message.findMany.mockResolvedValue(MESSAGES);

    const metrics = await getConversationMetrics('org-1', 'conv-1');

    expect(metrics.responseTimeSeconds).toMatchObject({
      samples: 2,
      average: 210,   // (300 + 120) / 2
      fastest: 120,
      slowest: 300,
      median: 120,
      p90: 300,
    });
  });

  it('báo khoảng im lặng dài nhất và thời gian khách đang chờ', async () => {
    prismaMock.message.findMany.mockResolvedValue(MESSAGES);
    vi.setSystemTime(at('2026-08-01T05:10:00Z'));

    const metrics = await getConversationMetrics('org-1', 'conv-1');

    expect(metrics.longestSilenceSeconds).toBe(7080); // 03:02 → 05:00
    expect(metrics.awaitingReplySeconds).toBe(600);   // 05:00 → 05:10
    vi.useRealTimers();
  });

  it('không còn ai đang chờ khi tin cuối là của nhân viên', async () => {
    prismaMock.message.findMany.mockResolvedValue(MESSAGES.slice(0, 3));

    const metrics = await getConversationMetrics('org-1', 'conv-1');

    expect(metrics.awaitingReplySeconds).toBeNull();
  });

  it('trả kết quả rỗng có chú thích khi hội thoại chưa có tin', async () => {
    prismaMock.message.findMany.mockResolvedValue([]);

    const metrics = await getConversationMetrics('org-1', 'conv-1');

    expect(metrics.totalMessages).toBe(0);
    expect(metrics.note).toContain('chưa có tin nhắn');
  });

  it('báo lỗi 404 khi hội thoại không thuộc tổ chức', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null);

    await expect(getConversationMetrics('org-1', 'conv-x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('getTranscript', () => {
  const ROWS = [
    {
      id: 'm2', senderType: 'self', senderName: 'Trang', content: 'Dạ em chào anh',
      contentType: 'text', attachments: [], sentAt: at('2026-08-01T02:05:00Z'),
      sentVia: 'user', editedAt: null, seenAt: null, deliveredAt: null,
    },
    {
      id: 'm1', senderType: 'contact', senderName: 'Nguyễn Văn A', content: 'Chào shop',
      contentType: 'text', attachments: [], sentAt: at('2026-08-01T02:00:00Z'),
      sentVia: 'user', editedAt: null, seenAt: null, deliveredAt: null,
    },
  ];

  it('trả tin theo thứ tự cũ → mới kèm dòng text đọc thẳng được', async () => {
    prismaMock.message.count.mockResolvedValue(2);
    prismaMock.message.findMany.mockResolvedValue(ROWS);

    const transcript = await getTranscript('org-1', 'conv-1');

    expect(transcript.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(transcript.text).toContain('[2026-08-01 09:00] KH Nguyễn Văn A: Chào shop');
    expect(transcript.text).toContain('[2026-08-01 09:05] NV Trang: Dạ em chào anh');
    expect(transcript.truncated).toBe(false);
  });

  it('đánh dấu truncated khi hội thoại dài hơn số tin lấy về', async () => {
    prismaMock.message.count.mockResolvedValue(500);
    prismaMock.message.findMany.mockResolvedValue(ROWS);

    const transcript = await getTranscript('org-1', 'conv-1', { limit: 2 });

    expect(transcript.truncated).toBe(true);
    expect(transcript.totalMatching).toBe(500);
    expect(transcript.returned).toBe(2);
  });

  it('thay tin phi văn bản bằng nhãn ngắn để transcript không đứt mạch', async () => {
    prismaMock.message.count.mockResolvedValue(3);
    prismaMock.message.findMany.mockResolvedValue([
      {
        id: 'a1', senderType: 'contact', senderName: 'A', content: null,
        contentType: 'image', attachments: [{ name: 'x.jpg' }, { name: 'y.jpg' }],
        sentAt: at('2026-08-01T02:00:00Z'), sentVia: 'user',
        editedAt: null, seenAt: null, deliveredAt: null,
      },
      {
        id: 'a2', senderType: 'contact', senderName: 'A', content: '',
        contentType: 'file', attachments: [{ name: 'hopdong.pdf' }],
        sentAt: at('2026-08-01T02:01:00Z'), sentVia: 'user',
        editedAt: null, seenAt: null, deliveredAt: null,
      },
      {
        id: 'a3', senderType: 'contact', senderName: 'A', content: null,
        contentType: 'voice', attachments: [],
        sentAt: at('2026-08-01T02:02:00Z'), sentVia: 'user',
        editedAt: null, seenAt: null, deliveredAt: null,
      },
    ]);

    const transcript = await getTranscript('org-1', 'conv-1', { order: 'desc' });
    const texts = transcript.messages.map((m) => m.text);

    expect(texts).toContain('[2 ảnh]');
    expect(texts).toContain('[file: hopdong.pdf]');
    expect(texts).toContain('[tin thoại]');
  });

  it('từ chối mốc thời gian không hợp lệ thay vì lọc sai âm thầm', async () => {
    prismaMock.message.count.mockResolvedValue(0);
    prismaMock.message.findMany.mockResolvedValue([]);

    await expect(getTranscript('org-1', 'conv-1', { since: 'hôm qua' })).rejects.toThrow(/since/);
  });
});
