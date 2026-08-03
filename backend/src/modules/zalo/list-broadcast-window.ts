// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi tệp khách hàng (🟢 Community) — khung giờ làm việc. THUẦN HÀM, không chạm DB.
// ════════════════════════════════════════════════════════════════════════
//
// Chiến dịch nhắn tệp KHÔNG chạy theo "mốc giờ" như gửi nhóm mà theo **khung giờ**:
// trong [windowStart, windowEnd) của những ngày được chọn thì rải tin cho tới khi
// chạm hạn mức ngày. Vì vậy câu hỏi cần trả lời chỉ có hai:
//   - "Bây giờ có được gửi không?"           → isWithinWindow
//   - "Hôm nay tính từ mốc nào?"             → dayBoundsUtc (đếm hạn mức theo NGÀY
//                                              của timezone chiến dịch, không phải UTC)
//
// Dùng lại `zonedDateParts` / `zonedWallClockToUtc` của lịch gửi nhóm — cùng cách
// bù offset bằng Intl, zero-dependency.

import { zonedDateParts, zonedWallClockToUtc } from './group-broadcast-schedule.js';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;
/** Số ngày tối đa dò tới khi tìm phiên gửi kế tiếp (hơn 1 năm → coi như hết lịch). */
const MAX_LOOKAHEAD_DAYS = 400;

export interface WindowSpec {
  /** 'HH:mm' giờ tường tại `timezone`. */
  windowStart: string;
  windowEnd: string;
  /** 0=CN..6=T7. Rỗng = mọi ngày. */
  daysOfWeek: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
}

/** Rút `WindowSpec` từ row `ListBroadcast` (hoặc body request đã chuẩn hoá). */
export function windowSpecOf(b: {
  windowStart: string;
  windowEnd: string;
  daysOfWeek: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
}): WindowSpec {
  return {
    windowStart: b.windowStart,
    windowEnd: b.windowEnd,
    daysOfWeek: b.daysOfWeek,
    timezone: b.timezone,
    startDate: b.startDate,
    endDate: b.endDate,
  };
}

/** 'HH:mm' → số phút từ nửa đêm. Trả null nếu sai định dạng. */
export function minutesOfDay(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Số nguyên so sánh được cho 1 ngày lịch: 20260804. */
function dayKey(d: { year: number; month: number; day: number }): number {
  return d.year * 10000 + d.month * 100 + d.day;
}

/** Ngày này có nằm trong `daysOfWeek` + `startDate`/`endDate` không. */
function dayAllowed(spec: WindowSpec, at: Date): boolean {
  const day = zonedDateParts(at, spec.timezone);
  if (spec.daysOfWeek.length > 0 && !spec.daysOfWeek.includes(day.weekday)) return false;
  const key = dayKey(day);
  if (spec.startDate && key < dayKey(zonedDateParts(spec.startDate, spec.timezone))) return false;
  if (spec.endDate && key > dayKey(zonedDateParts(spec.endDate, spec.timezone))) return false;
  return true;
}

/**
 * Mốc đầu và cuối của NGÀY chứa `at`, theo lịch của `spec.timezone`, quy về UTC.
 *
 * Dùng để đếm "đã gửi bao nhiêu tin hôm nay". Đếm theo ngày UTC sẽ sai lệch 7 tiếng
 * với VN: hạn mức reset lúc 07:00 sáng thay vì nửa đêm.
 */
export function dayBoundsUtc(spec: WindowSpec, at: Date): { start: Date; end: Date } {
  const day = zonedDateParts(at, spec.timezone);
  const start = zonedWallClockToUtc(day.year, day.month, day.day, 0, 0, spec.timezone);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
}

/**
 * Bây giờ có được gửi không.
 *
 * `windowEnd <= windowStart` (VD 22:00→02:00) coi là khung QUA ĐÊM: hợp lệ khi giờ
 * hiện tại ≥ start HOẶC < end. Ngày được xét là ngày lịch của chính thời điểm `at`,
 * nên phần sau nửa đêm tính vào ngày mới — đúng với cách hạn mức reset theo ngày.
 */
export function isWithinWindow(spec: WindowSpec, at: Date): boolean {
  const start = minutesOfDay(spec.windowStart);
  const end = minutesOfDay(spec.windowEnd);
  if (start === null || end === null) return false;
  if (!dayAllowed(spec, at)) return false;

  const day = zonedDateParts(at, spec.timezone);
  const midnight = zonedWallClockToUtc(day.year, day.month, day.day, 0, 0, spec.timezone);
  const nowMinutes = Math.floor((at.getTime() - midnight.getTime()) / 60_000);

  if (end > start) return nowMinutes >= start && nowMinutes < end;
  // Khung qua đêm.
  return nowMinutes >= start || nowMinutes < end;
}

/**
 * Thời điểm phiên gửi kế tiếp mở cửa, tính từ `from`. Trả null khi đã quá `endDate`.
 *
 * Đang trong khung → trả về chính `from` (đang gửi được ngay). Dùng để hiện
 * "Lượt gửi kế tiếp" trên UI, không dùng để quyết định gửi (việc đó do `isWithinWindow`).
 */
export function nextWindowOpen(spec: WindowSpec, from: Date): Date | null {
  const start = minutesOfDay(spec.windowStart);
  if (start === null) return null;
  if (isWithinWindow(spec, from)) return from;

  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const probe = new Date(from.getTime() + i * MS_PER_DAY);
    const day = zonedDateParts(probe, spec.timezone);
    if (spec.endDate && dayKey(day) > dayKey(zonedDateParts(spec.endDate, spec.timezone))) return null;
    if (!dayAllowed(spec, probe)) continue;
    const open = zonedWallClockToUtc(
      day.year, day.month, day.day, Math.floor(start / 60), start % 60, spec.timezone,
    );
    if (open.getTime() > from.getTime()) return open;
  }
  return null;
}

export interface WindowValidation {
  ok: boolean;
  errors: string[];
}

export function validateWindow(spec: WindowSpec): WindowValidation {
  const errors: string[] = [];

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: spec.timezone });
  } catch {
    errors.push('INVALID_TIMEZONE');
  }

  const start = minutesOfDay(spec.windowStart);
  const end = minutesOfDay(spec.windowEnd);
  if (start === null || end === null) errors.push('INVALID_WINDOW_TIME');
  // Khung qua đêm được phép, nhưng start === end thì không có phút nào gửi được.
  else if (start === end) errors.push('EMPTY_WINDOW');

  if (spec.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.push('INVALID_DAYS_OF_WEEK');
  }

  if (spec.startDate && spec.endDate && spec.endDate.getTime() < spec.startDate.getTime()) {
    errors.push('INVALID_DATE_RANGE');
  }

  return { ok: errors.length === 0, errors };
}

/** Độ dài khung giờ mỗi ngày (phút) — dùng ước tính bao lâu mới gửi hết tệp. */
export function windowLengthMinutes(spec: WindowSpec): number {
  const start = minutesOfDay(spec.windowStart);
  const end = minutesOfDay(spec.windowEnd);
  if (start === null || end === null) return 0;
  return end > start ? end - start : 24 * 60 - start + end;
}

/** Số ngày gửi trong 1 tuần theo cấu hình (rỗng = 7). */
export function sendingDaysPerWeek(spec: WindowSpec): number {
  return spec.daysOfWeek.length === 0 ? 7 : new Set(spec.daysOfWeek).size;
}
