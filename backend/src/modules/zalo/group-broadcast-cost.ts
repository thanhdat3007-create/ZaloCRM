// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * group-broadcast-cost.ts — Ngân sách lượt gửi của chiến dịch nhóm (🟢 Community).
 *
 * Trần chiến dịch KHÔNG phải con số nhóm cứng mà là **ngân sách lượt gửi** so với
 * hạn mức `SdkLimit` category `message` của nick. Một nhóm tốn nhiều hơn 1 lượt:
 * mẫu "chữ + album ảnh + 1 tệp" = 3 lệnh gửi.
 *
 * Giữ 40% hạn mức cho sale chat tay — broadcast không được ăn hết quota nick.
 *
 * Thuần hàm, không chạm DB → route và test dùng chung.
 */
import type { ResolvedAttachment } from '../chat/message-template-service.js';

/** Phần hạn mức ngày mà broadcast được phép dùng. */
export const BUDGET_RATIO = 0.6;
/** Trần cứng phụ số nhóm/chiến dịch. Ràng buộc chính vẫn là ngân sách lượt gửi. */
export const MAX_GROUPS_PER_BROADCAST = 50;
/** Sàn giãn cách giữa 2 nhóm (giây) — dưới ngưỡng này nick dễ bị Zalo khoá. */
export const MIN_DELAY_SEC = 10;
/** Trần giãn cách (giây). */
export const MAX_DELAY_SEC = 600;
/** Nghỉ trung bình giữa 2 lệnh trong CÙNG nhóm (0.8–2.5s → 1.65s). */
const INTRA_GROUP_DELAY_SEC = 1.65;

export interface BroadcastCost {
  /** (chữ?1:0) + (có ảnh?1:0) + số video + số tệp. Nhiều ảnh gộp 1 album = 1 lượt. */
  opsPerGroup: number;
  opsPerRun: number;
  opsPerDay: number;
  /** Thời lượng ước tính 1 lượt (giây) — dùng để cảnh báo 2 mốc giờ quá gần. */
  runDurationSec: number;
}

export function estimateBroadcastCost(args: {
  groupCount: number;
  attachments: ResolvedAttachment[];
  hasText: boolean;
  /** `timesOfDay.length`; scheduleKind='now' → 1. */
  timesPerDay: number;
  minDelaySec: number;
  maxDelaySec: number;
}): BroadcastCost {
  const usable = args.attachments.filter((a) => !a.missing);
  const hasImage = usable.some((a) => a.kind === 'image');
  const videoCount = usable.filter((a) => a.kind === 'video').length;
  const fileCount = usable.filter((a) => a.kind === 'file').length;

  const opsPerGroup = (args.hasText ? 1 : 0) + (hasImage ? 1 : 0) + videoCount + fileCount;
  const opsPerRun = args.groupCount * opsPerGroup;
  const opsPerDay = opsPerRun * Math.max(1, args.timesPerDay);

  const avgGap = (args.minDelaySec + args.maxDelaySec) / 2;
  // Nhóm đầu không phải chờ → (n-1) khoảng nghỉ giữa nhóm.
  const runDurationSec =
    Math.max(0, args.groupCount - 1) * avgGap + opsPerRun * INTRA_GROUP_DELAY_SEC;

  return { opsPerGroup, opsPerRun, opsPerDay, runDurationSec: Math.round(runDurationSec) };
}

/** Ngưỡng an toàn = 60% hạn mức ngày của nick. */
export function safeBudget(dailyLimit: number): number {
  return Math.floor(dailyLimit * BUDGET_RATIO);
}

/**
 * Số nhóm tối đa còn nằm trong ngân sách — dùng để gợi ý sửa cho sale.
 * Trả 0 khi mẫu tin không tốn lượt nào (không thể xảy ra với mẫu hợp lệ).
 */
export function maxGroupsWithinBudget(
  budget: number, opsPerGroup: number, timesPerDay: number,
): number {
  const perGroupPerDay = opsPerGroup * Math.max(1, timesPerDay);
  if (perGroupPerDay <= 0) return 0;
  return Math.floor(budget / perGroupPerDay);
}

/** Thông báo vượt ngân sách kèm số liệu và cách sửa (hiện thẳng cho sale). */
export function budgetExceededMessage(args: {
  opsPerDay: number; budget: number; dailyLimit: number;
  opsPerGroup: number; timesPerDay: number;
}): string {
  const maxGroups = maxGroupsWithinBudget(args.budget, args.opsPerGroup, args.timesPerDay);
  return (
    `Ước tính ${args.opsPerDay} lượt gửi/ngày, vượt ngưỡng an toàn ${args.budget} lượt ` +
    `(${Math.round(BUDGET_RATIO * 100)}% hạn mức ${args.dailyLimit} của nick). ` +
    `Giảm còn ≤ ${maxGroups} nhóm, hoặc bớt mốc giờ, hoặc bớt đính kèm.`
  );
}

/**
 * Khoảng cách NHỎ NHẤT giữa 2 mốc giờ liền kề (giây), tính vòng qua nửa đêm.
 * Trả `Infinity` khi chỉ có 0-1 mốc.
 */
export function minGapBetweenTimesSec(timesOfDay: string[]): number {
  const mins = timesOfDay
    .map((t) => /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]) * 60 + Number(m[2]))
    .sort((a, b) => a - b);
  if (mins.length < 2) return Infinity;

  let smallest = Infinity;
  for (let i = 1; i < mins.length; i++) smallest = Math.min(smallest, mins[i] - mins[i - 1]);
  // Vòng qua nửa đêm: mốc cuối hôm nay → mốc đầu ngày mai.
  smallest = Math.min(smallest, 24 * 60 - mins[mins.length - 1] + mins[0]);
  return smallest * 60;
}
