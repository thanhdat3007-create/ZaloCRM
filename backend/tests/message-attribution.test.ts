/**
 * message-attribution.test.ts — bộ trường quy trách nhiệm cho tin nhắn gửi đi.
 *
 * Ba bất biến file này giữ, đều là loại sai âm thầm không ai phát hiện cho tới khi khách
 * phàn nàn hoặc bảng lương tính sai:
 *
 *  1. Ánh xạ `sentByKind → sentVia` đúng từ vựng ĐANG có trong DB. Đổi một giá trị là lệch
 *     số liệu của mọi báo cáo đã chạy từ trước, mà không có gì báo lỗi.
 *  2. Tin chiến dịch KHÔNG được mang nhãn `user_crm` — đó chính là lỗi cũ khiến tin bắn hàng
 *     loạt hiện y hệt tin một sale ngồi gõ tay.
 *  3. Tin đồng bộ từ app Zalo KHÔNG được gắn tên người. Nick dùng chung, Zalo không cho biết
 *     ai gõ → gắn tên chủ nick là quy sai trách nhiệm cho người vô can.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMessageAttribution,
  type MessageSource,
} from '../src/shared/message-attribution.js';

describe('buildMessageAttribution — ánh xạ sentVia (hợp đồng tương thích ngược)', () => {
  const CASES: Array<[MessageSource, string | undefined, string]> = [
    [{ kind: 'sale_crm', userId: 'u1', userName: 'Hiên' }, 'user', 'sale_crm'],
    [{ kind: 'sale_outside_crm', nickName: 'Nick A' }, 'user_native', 'sale_outside_crm'],
    [
      { kind: 'sale_bridge', userId: 'u1', userName: 'Hiên', via: 'telegram' },
      'bridge',
      'sale_bridge',
    ],
    [{ kind: 'ai_agent', agentId: 'a1', agentName: 'CSKH' }, 'automation', 'ai_agent'],
    [{ kind: 'automation', label: 'Gợi ý NBA', userId: 'u1' }, 'automation', 'automation'],
    [
      { kind: 'campaign', userId: 'u1', userName: 'Hiên', campaignName: 'Tết' },
      'system',
      'campaign',
    ],
    [{ kind: 'system', label: 'Nhắc việc' }, 'system', 'system'],
    // Tin khách: KHÔNG set sentVia để giữ nguyên default của schema.
    [{ kind: 'contact' }, undefined, 'contact'],
  ];

  it.each(CASES)('%o → sentVia %s', (source, expectedSentVia, expectedKind) => {
    const fields = buildMessageAttribution(source);

    expect(fields.sentByKind).toBe(expectedKind);
    expect(fields.sentVia).toBe(expectedSentVia);
  });
});

describe('buildMessageAttribution — quy được về người', () => {
  it('sale gõ trong CRM: có repliedByUserId để join sang User', () => {
    const f = buildMessageAttribution({ kind: 'sale_crm', userId: 'u1', userName: 'Hiên' });

    expect(f.repliedByUserId).toBe('u1');
    expect(f.metadata.sender).toMatchObject({ kind: 'user_crm', name: 'Hiên' });
  });

  it('sale_crm thiếu userId → ném lỗi ngay lúc lập trình, không ghi rác vào DB', () => {
    expect(() =>
      buildMessageAttribution({ kind: 'sale_crm', userId: '', userName: 'Hiên' }),
    ).toThrow(/userId/);
  });

  it('cầu Telegram không map được user → vẫn ghi tin nhưng bỏ trống FK', () => {
    const f = buildMessageAttribution({
      kind: 'sale_bridge',
      userId: null,
      userName: 'Hiên (Telegram)',
      via: 'telegram',
    });

    expect(f.repliedByUserId).toBeUndefined();
    expect(f.metadata.sender).toMatchObject({ kind: 'bridge' });
  });

  it('gợi ý NBA: máy soạn nhưng người bấm gửi → vẫn giữ FK người bấm', () => {
    const f = buildMessageAttribution({ kind: 'automation', label: 'Gợi ý NBA', userId: 'u9' });

    expect(f.repliedByUserId).toBe('u9');
  });
});

describe('buildMessageAttribution — chống hai lỗi quy sai trách nhiệm đã gặp', () => {
  it('tin chiến dịch KHÔNG mang nhãn user_crm dù có ghi người phát động', () => {
    const f = buildMessageAttribution({
      kind: 'campaign',
      userId: 'u1',
      userName: 'Hiên',
      campaignName: 'Tết',
    });

    // Người phát động vẫn truy được…
    expect(f.repliedByUserId).toBe('u1');
    // …nhưng nhãn phải khác tin sale gõ tay, nếu không UI hiện y hệt nhau.
    expect(f.metadata.sender.kind).not.toBe('user_crm');
    expect(f.metadata.sender).toMatchObject({ campaign: true, detail: 'Chiến dịch: Tết' });
  });

  it('tin đồng bộ từ app Zalo KHÔNG gắn tên người, chỉ ghi tên nick', () => {
    const f = buildMessageAttribution({ kind: 'sale_outside_crm', nickName: 'Nick A' });

    expect(f.repliedByUserId).toBeUndefined();
    expect(f.metadata.sender).toMatchObject({ kind: 'user_native', nickName: 'Nick A' });
    // Bất biến then chốt: không có trường `name` nào để UI lỡ hiển thị thành người gửi.
    expect(f.metadata.sender.name).toBeUndefined();
  });
});

describe('buildMessageAttribution — AI agent', () => {
  it('ghi agentId để đối chiếu với bảng AiAgentRun, không nhân bản chi tiết lượt chạy', () => {
    const f = buildMessageAttribution({ kind: 'ai_agent', agentId: 'a1', agentName: 'CSKH' });

    expect(f.sentByKind).toBe('ai_agent');
    expect(f.repliedByUserId).toBeUndefined(); // AI không phải người, không quy cho ai
    expect(f.metadata.sender).toMatchObject({ kind: 'ai_agent', agentId: 'a1' });
  });
});
