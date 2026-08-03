// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * list-broadcast-cost.ts — Ngân sách chiến dịch nhắn tệp khách hàng (🟢 Community).
 *
 * Khác gửi nhóm: ràng buộc không phải "một lượt gửi hết bao nhiêu nhóm" mà là
 * **hạn mức ngày** so với tổng hạn mức `message` của TẤT CẢ nick được chọn.
 * Một khách tốn nhiều hơn 1 lệnh gửi: mẫu "chữ + album ảnh + 1 tệp" = 3 lệnh.
 *
 * Giữ 40% hạn mức cho sale chat tay — dùng lại đúng `BUDGET_RATIO`/`safeBudget`
 * của gửi nhóm để hai tính năng không đặt ra hai định nghĩa "an toàn" khác nhau.
 *
 * Thuần hàm, không chạm DB → route và test dùng chung.
 */
import type { ResolvedAttachment } from '../chat/message-template-service.js';
import { safeBudget } from './group-broadcast-cost.js';

/** Trần người nhận mỗi chiến dịch — trên mức này nên chia tệp ra. */
export const MAX_RECIPIENTS_PER_BROADCAST = 20_000;
/** Trần nick mỗi chiến dịch. Nhiều hơn thì việc theo dõi nick nào gửi ai thành vô nghĩa. */
export const MAX_NICKS_PER_BROADCAST = 10;
/** Sàn giãn cách giữa 2 khách (giây). Nhắn 1-1 dễ bị báo xấu hơn nhắn nhóm nên cao hơn. */
export const MIN_DELAY_SEC = 20;
export const MAX_DELAY_SEC = 900;
/** Trần hạn mức ngày người dùng được đặt — chặn gõ nhầm 10000. */
export const MAX_DAILY_QUOTA = 2000;
/** Số khách tối đa xử lý trong MỘT lát gửi. Lát ngắn để job không chạy hàng giờ. */
export const MAX_RECIPIENTS_PER_RUN = 25;
/** Nghỉ trung bình giữa 2 lệnh gửi cho CÙNG một khách (0.8–2.5s → 1.65s). */
const INTRA_THREAD_DELAY_SEC = 1.65;

export interface ListBroadcastCost {
  /** (chữ?1:0) + (có ảnh?1:0) + số video + số tệp. Nhiều ảnh gộp 1 album = 1 lệnh. */
  opsPerRecipient: number;
  /** Lệnh gửi tiêu tốn mỗi ngày khi chạy hết hạn mức. */
  opsPerDay: number;
  /** Số ngày dự kiến để gửi hết hàng đợi. */
  daysToFinish: number;
  /** Thời lượng ước tính để gửi hết hạn mức của 1 ngày (giây). */
  dailyDurationSec: number;
}

export function estimateListBroadcastCost(args: {
  recipientCount: number;
  attachments: ResolvedAttachment[];
  hasText: boolean;
  dailyQuota: number;
  minDelaySec: number;
  maxDelaySec: number;
}): ListBroadcastCost {
  const usable = args.attachments.filter((a) => !a.missing);
  const hasImage = usable.some((a) => a.kind === 'image');
  const videoCount = usable.filter((a) => a.kind === 'video').length;
  const fileCount = usable.filter((a) => a.kind === 'file').length;

  const opsPerRecipient = (args.hasText ? 1 : 0) + (hasImage ? 1 : 0) + videoCount + fileCount;
  const quota = Math.max(1, args.dailyQuota);
  const opsPerDay = quota * opsPerRecipient;

  const avgGap = (args.minDelaySec + args.maxDelaySec) / 2;
  // Khách đầu tiên không phải chờ → (n-1) khoảng nghỉ giữa khách.
  const dailyDurationSec = Math.round(
    Math.max(0, quota - 1) * avgGap + opsPerDay * INTRA_THREAD_DELAY_SEC,
  );

  return {
    opsPerRecipient,
    opsPerDay,
    daysToFinish: Math.ceil(args.recipientCount / quota),
    dailyDurationSec,
  };
}

/**
 * Ngân sách gửi/ngày của cả chiến dịch = tổng 60% hạn mức ngày của từng nick,
 * nhưng mỗi nick không vượt quá `perNickDailyQuota` mà sale tự đặt.
 *
 * Lấy min của hai con số cho từng nick chứ không lấy min ở tổng: một nick hạn mức
 * cao không được phép "gánh" cho nick đang bị siết.
 */
export function totalNickBudget(
  dailyLimits: number[], perNickDailyQuota: number,
): number {
  return dailyLimits.reduce((sum, daily) => sum + Math.min(safeBudget(daily), perNickDailyQuota), 0);
}

/** Thông báo vượt ngân sách kèm số liệu và cách sửa (hiện thẳng cho sale). */
export function quotaExceededMessage(args: {
  opsPerDay: number;
  budget: number;
  opsPerRecipient: number;
  nickCount: number;
}): string {
  const maxRecipients = args.opsPerRecipient > 0 ? Math.floor(args.budget / args.opsPerRecipient) : 0;
  return (
    `Hạn mức ngày cần ${args.opsPerDay} lệnh gửi, vượt ngưỡng an toàn ${args.budget} lệnh của ` +
    `${args.nickCount} nick đã chọn. Giảm hạn mức còn ≤ ${maxRecipients} tin/ngày, ` +
    `thêm nick gửi, hoặc bớt đính kèm trong mẫu tin.`
  );
}

/**
 * Cảnh báo khi hạn mức ngày không thể rải hết trong khung giờ.
 * Trả chuỗi cảnh báo, hoặc null khi khung giờ đủ rộng.
 */
export function windowTooShortWarning(args: {
  dailyDurationSec: number;
  windowMinutes: number;
}): string | null {
  const windowSec = args.windowMinutes * 60;
  if (windowSec <= 0 || args.dailyDurationSec <= windowSec) return null;
  return (
    `Khung giờ dài ${Math.round(args.windowMinutes / 60)} tiếng nhưng gửi hết hạn mức ngày mất ` +
    `khoảng ${Math.round(args.dailyDurationSec / 3600)} tiếng. Phần dư sẽ tự dồn sang hôm sau — ` +
    `nới khung giờ, giảm giãn cách hoặc giảm hạn mức nếu muốn xong trong ngày.`
  );
}
