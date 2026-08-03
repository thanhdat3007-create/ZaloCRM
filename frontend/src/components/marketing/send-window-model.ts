// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * send-window-model.ts — Model khung giờ + hạn mức của chiến dịch nhắn tệp KH.
 *
 * Tách khỏi `schedule-model.ts` (mốc giờ của gửi nhóm) vì hai tính năng trả lời
 * hai câu hỏi khác nhau: gửi nhóm hỏi "gửi vào những lúc nào", gửi tệp hỏi
 * "được phép gửi trong khoảng nào và mỗi ngày bao nhiêu".
 */
export interface SendWindowModel {
  /** 'HH:mm' giờ tường tại timezone của org. */
  windowStart: string;
  windowEnd: string;
  /** 0=CN..6=T7. Rỗng = cả tuần. */
  daysOfWeek: number[];
  startDate: string | null;
  endDate: string | null;
  dailyQuota: number;
  perNickDailyQuota: number;
  minDelaySec: number;
  maxDelaySec: number;
}

/** Sàn giãn cách — khớp `MIN_DELAY_SEC` phía server, dưới mức này server từ chối. */
export const MIN_DELAY_SEC = 20;
export const MAX_DELAY_SEC = 900;
export const MAX_DAILY_QUOTA = 2000;

export const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function defaultSendWindow(): SendWindowModel {
  return {
    windowStart: '08:00',
    windowEnd: '17:00',
    daysOfWeek: [],
    startDate: null,
    endDate: null,
    dailyQuota: 100,
    perNickDailyQuota: 40,
    minDelaySec: 45,
    maxDelaySec: 90,
  };
}
