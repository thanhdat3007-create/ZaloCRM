// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Chúc sinh nhật (🟢 Community) — lịch gửi. THUẦN HÀM, không chạm DB.
// ════════════════════════════════════════════════════════════════════════
//
// Ba dịp gửi quanh ngày sinh, tất cả cùng một giờ gửi trong ngày:
//   before  → gửi HÔM NAY, sinh nhật rơi vào hôm nay + beforeDays
//   on_day  → gửi HÔM NAY, sinh nhật đúng hôm nay
//   after   → gửi HÔM NAY, sinh nhật đã qua hôm nay − afterDays
//
// Vì vậy mọi thứ quy về một phép tính: từ NGÀY GỬI suy ra NGÀY SINH cần dò.
// Dò theo 'MM-DD' (bỏ năm) — khách sinh 1990 hay 2000 đều khớp.
//
// Ngày 29/02: năm không nhuận thì ngày đó không tồn tại. Nếu bỏ qua, nhóm khách
// này KHÔNG BAO GIỜ được chúc. Nên năm không nhuận, ngày dò 28/02 khớp luôn cả
// '02-29' — họ nhận lời chúc vào 28/02.

import { zonedDateParts, zonedWallClockToUtc } from '../zalo/group-broadcast-schedule.js';
import { minutesOfDay } from '../zalo/list-broadcast-window.js';

const MS_PER_DAY = 86_400_000;

export type OccasionKind = 'before' | 'on_day' | 'after';

/** Thứ tự hiển thị + thứ tự lập kế hoạch (sớm → muộn so với ngày sinh). */
export const OCCASION_KINDS: OccasionKind[] = ['before', 'on_day', 'after'];

export const OCCASION_LABELS: Record<OccasionKind, string> = {
  before: 'Trước sinh nhật',
  on_day: 'Đúng ngày sinh nhật',
  after: 'Sau sinh nhật',
};

/** Giới hạn số ngày lệch cho dịp trước/sau — quá xa thì không còn là lời chúc. */
export const MIN_OFFSET_DAYS = 1;
export const MAX_OFFSET_DAYS = 30;
/** Trần trễ cho phép: quá 24h thì gửi bù không còn ý nghĩa. */
export const MAX_LATE_TOLERANCE_MINUTES = 1440;

export interface BirthdayScheduleSpec {
  timezone: string;
  /** 'HH:mm' giờ tường tại `timezone`. */
  sendTime: string;
  lateToleranceMinutes: number;
  beforeEnabled: boolean;
  beforeDays: number;
  onDayEnabled: boolean;
  afterEnabled: boolean;
  afterDays: number;
}

/** Rút `BirthdayScheduleSpec` từ row cấu hình (hoặc body request đã chuẩn hoá). */
export function scheduleSpecOf(c: BirthdayScheduleSpec): BirthdayScheduleSpec {
  return {
    timezone: c.timezone,
    sendTime: c.sendTime,
    lateToleranceMinutes: c.lateToleranceMinutes,
    beforeEnabled: c.beforeEnabled,
    beforeDays: c.beforeDays,
    onDayEnabled: c.onDayEnabled,
    afterEnabled: c.afterEnabled,
    afterDays: c.afterDays,
  };
}

/**
 * Số ngày từ NGÀY GỬI tới NGÀY SINH. Dương = sinh nhật còn ở phía trước.
 * 'after' âm vì sinh nhật đã qua.
 */
export function occasionOffsetDays(spec: BirthdayScheduleSpec, occasion: OccasionKind): number {
  if (occasion === 'before') return spec.beforeDays;
  if (occasion === 'after') return -spec.afterDays;
  return 0;
}

export function isOccasionEnabled(spec: BirthdayScheduleSpec, occasion: OccasionKind): boolean {
  if (occasion === 'before') return spec.beforeEnabled;
  if (occasion === 'after') return spec.afterEnabled;
  return spec.onDayEnabled;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTC midnight của một ngày lịch — mốc chuẩn cho cột `@db.Date` và cộng/trừ ngày. */
export function calendarDateUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export interface PlannedOccasion {
  occasion: OccasionKind;
  /** Ngày sinh nhật (UTC midnight) của năm chứa dịp này — khoá chống trùng theo năm. */
  birthdayOn: Date;
  /**
   * Các 'MM-DD' cần dò trong `Contact.birthDate`. Thường 1 phần tử; thành 2 khi
   * ngày dò là 28/02 của năm không nhuận (gộp người sinh 29/02).
   */
  monthDays: string[];
  /** Thời điểm tới hạn gửi (UTC). */
  dueAt: Date;
}

/**
 * Các dịp cần gửi TRONG NGÀY LỊCH chứa `now` (theo `spec.timezone`).
 *
 * Trả cả những dịp có `dueAt` còn ở tương lai — người gọi tạo bản ghi trước, cron
 * gửi chỉ nhặt khi tới hạn. Nhờ vậy bật tính năng lúc 6h sáng vẫn kịp lên lịch
 * cho 9h, và có bản ghi để UI xem trước "hôm nay sẽ chúc những ai".
 */
export function plannedOccasionsFor(
  spec: BirthdayScheduleSpec,
  now: Date,
): PlannedOccasion[] {
  const minutes = minutesOfDay(spec.sendTime);
  if (minutes === null) return [];

  const sendDay = zonedDateParts(now, spec.timezone);
  const dueAt = zonedWallClockToUtc(
    sendDay.year, sendDay.month, sendDay.day,
    Math.floor(minutes / 60), minutes % 60,
    spec.timezone,
  );
  const sendDayUtc = calendarDateUtc(sendDay.year, sendDay.month, sendDay.day);

  const out: PlannedOccasion[] = [];
  for (const occasion of OCCASION_KINDS) {
    if (!isOccasionEnabled(spec, occasion)) continue;
    const offset = occasionOffsetDays(spec, occasion);
    // Cộng ngày trên mốc UTC midnight → không dính DST của múi giờ gốc.
    const birthdayOn = new Date(sendDayUtc.getTime() + offset * MS_PER_DAY);
    const month = birthdayOn.getUTCMonth() + 1;
    const day = birthdayOn.getUTCDate();

    const monthDays = [`${pad2(month)}-${pad2(day)}`];
    if (month === 2 && day === 28 && !isLeapYear(birthdayOn.getUTCFullYear())) {
      monthDays.push('02-29');
    }

    out.push({ occasion, birthdayOn, monthDays, dueAt });
  }
  return out;
}

/** Đã tới giờ gửi chưa. */
export function isDue(dueAt: Date, now: Date): boolean {
  return now.getTime() >= dueAt.getTime();
}

/**
 * Mốc đầu/cuối của NGÀY chứa `at` theo lịch `timezone`, quy về UTC.
 *
 * Dùng để đếm "hôm nay đã chúc bao nhiêu người". Đếm theo ngày UTC sẽ lệch 7
 * tiếng với VN: hạn mức reset lúc 7h sáng thay vì nửa đêm.
 */
export function dayBoundsUtc(timezone: string, at: Date): { start: Date; end: Date } {
  const day = zonedDateParts(at, timezone);
  const start = zonedWallClockToUtc(day.year, day.month, day.day, 0, 0, timezone);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
}

/**
 * Trễ quá mức cho phép → BỎ dịp này thay vì gửi bù.
 *
 * Không có ngưỡng này thì backend chết cả ngày, sống lại lúc 3h sáng sẽ bắn một
 * loạt lời chúc vào giờ ngủ — hại hơn là không chúc.
 */
export function isTooLate(spec: BirthdayScheduleSpec, dueAt: Date, now: Date): boolean {
  return now.getTime() > dueAt.getTime() + spec.lateToleranceMinutes * 60_000;
}

export interface ScheduleValidation {
  ok: boolean;
  errors: string[];
}

export function validateSchedule(spec: BirthdayScheduleSpec): ScheduleValidation {
  const errors: string[] = [];

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: spec.timezone });
  } catch {
    errors.push('INVALID_TIMEZONE');
  }

  if (minutesOfDay(spec.sendTime) === null) errors.push('INVALID_SEND_TIME');

  if (
    !Number.isInteger(spec.lateToleranceMinutes) ||
    spec.lateToleranceMinutes < 0 ||
    spec.lateToleranceMinutes > MAX_LATE_TOLERANCE_MINUTES
  ) {
    errors.push('INVALID_LATE_TOLERANCE');
  }

  const offsetInvalid = (n: number) =>
    !Number.isInteger(n) || n < MIN_OFFSET_DAYS || n > MAX_OFFSET_DAYS;
  if (spec.beforeEnabled && offsetInvalid(spec.beforeDays)) errors.push('INVALID_BEFORE_DAYS');
  if (spec.afterEnabled && offsetInvalid(spec.afterDays)) errors.push('INVALID_AFTER_DAYS');

  if (!spec.beforeEnabled && !spec.onDayEnabled && !spec.afterEnabled) {
    errors.push('NO_OCCASION_ENABLED');
  }

  return { ok: errors.length === 0, errors };
}
