/**
 * list-broadcast-cost.test.ts — Ngân sách chiến dịch nhắn tệp KH.
 * Thuần hàm, không DB, không mock.
 */
import { describe, it, expect } from 'vitest';
import type { ResolvedAttachment } from '../src/modules/chat/message-template-service.js';
import {
  estimateListBroadcastCost,
  quotaExceededMessage,
  totalNickBudget,
  windowTooShortWarning,
} from '../src/modules/zalo/list-broadcast-cost.js';

function att(kind: 'image' | 'video' | 'file', missing = false): ResolvedAttachment {
  return { mediaAssetId: `${kind}-${missing}`, kind, missing } as ResolvedAttachment;
}

describe('estimateListBroadcastCost', () => {
  it('chỉ chữ = 1 lệnh mỗi khách', () => {
    const got = estimateListBroadcastCost({
      recipientCount: 100, attachments: [], hasText: true,
      dailyQuota: 50, minDelaySec: 45, maxDelaySec: 90,
    });
    expect(got.opsPerRecipient).toBe(1);
    expect(got.opsPerDay).toBe(50);
    expect(got.daysToFinish).toBe(2);
  });

  it('nhiều ảnh gộp 1 album = 1 lệnh; video và tệp tính từng cái', () => {
    const got = estimateListBroadcastCost({
      recipientCount: 10,
      attachments: [att('image'), att('image'), att('image'), att('video'), att('file')],
      hasText: true, dailyQuota: 10, minDelaySec: 45, maxDelaySec: 90,
    });
    // chữ 1 + album 1 + video 1 + tệp 1 = 4
    expect(got.opsPerRecipient).toBe(4);
    expect(got.opsPerDay).toBe(40);
  });

  it('bỏ qua đính kèm đã xoá khỏi kho', () => {
    const got = estimateListBroadcastCost({
      recipientCount: 1, attachments: [att('video', true), att('file', true)], hasText: true,
      dailyQuota: 1, minDelaySec: 45, maxDelaySec: 90,
    });
    expect(got.opsPerRecipient).toBe(1);
  });

  it('mẫu chỉ có ảnh, không chữ', () => {
    const got = estimateListBroadcastCost({
      recipientCount: 1, attachments: [att('image')], hasText: false,
      dailyQuota: 1, minDelaySec: 45, maxDelaySec: 90,
    });
    expect(got.opsPerRecipient).toBe(1);
  });

  it('daysToFinish làm tròn LÊN — 101 khách, 50/ngày = 3 ngày', () => {
    const got = estimateListBroadcastCost({
      recipientCount: 101, attachments: [], hasText: true,
      dailyQuota: 50, minDelaySec: 45, maxDelaySec: 90,
    });
    expect(got.daysToFinish).toBe(3);
  });

  it('thời lượng ngày tính (n-1) khoảng nghỉ — khách đầu không phải chờ', () => {
    const got = estimateListBroadcastCost({
      recipientCount: 10, attachments: [], hasText: true,
      dailyQuota: 10, minDelaySec: 60, maxDelaySec: 60,
    });
    // 9 khoảng × 60s + 10 lệnh × 1.65s
    expect(got.dailyDurationSec).toBe(Math.round(9 * 60 + 10 * 1.65));
  });
});

describe('totalNickBudget', () => {
  it('mỗi nick lấy min(60% hạn mức, hạn mức nick sale đặt)', () => {
    // safeBudget(200) = 120 → bị perNick 40 chặn; safeBudget(50) = 30 → 30 thắng.
    expect(totalNickBudget([200, 50], 40)).toBe(40 + 30);
  });

  it('nick hạn mức cao KHÔNG gánh cho nick bị siết', () => {
    // Nếu lấy min ở tổng thì sẽ ra 80; đúng phải là 40 + 6.
    expect(totalNickBudget([200, 10], 40)).toBe(40 + 6);
  });

  it('không có nick nào thì ngân sách bằng 0', () => {
    expect(totalNickBudget([], 40)).toBe(0);
  });
});

describe('quotaExceededMessage', () => {
  it('gợi ý số tin/ngày tối đa còn nằm trong ngân sách', () => {
    const msg = quotaExceededMessage({
      opsPerDay: 300, budget: 120, opsPerRecipient: 3, nickCount: 2,
    });
    expect(msg).toContain('300');
    expect(msg).toContain('120');
    expect(msg).toContain('≤ 40 tin/ngày');
  });
});

describe('windowTooShortWarning', () => {
  it('khung đủ rộng → không cảnh báo', () => {
    expect(windowTooShortWarning({ dailyDurationSec: 3600, windowMinutes: 540 })).toBeNull();
  });

  it('gửi lâu hơn khung giờ → cảnh báo phần dư dồn sang hôm sau', () => {
    const msg = windowTooShortWarning({ dailyDurationSec: 12 * 3600, windowMinutes: 540 });
    expect(msg).toContain('dồn sang hôm sau');
  });

  it('khung giờ bằng 0 (cấu hình hỏng) không sinh cảnh báo nhiễu', () => {
    expect(windowTooShortWarning({ dailyDurationSec: 100, windowMinutes: 0 })).toBeNull();
  });
});
