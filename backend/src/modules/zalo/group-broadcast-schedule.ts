// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi nhóm theo lịch (🟢 Community) — tính mốc giờ. THUẦN HÀM, không chạm DB.
// ════════════════════════════════════════════════════════════════════════
//
// Repo không có thư viện timezone → tự bù offset bằng `Intl.DateTimeFormat`
// (`timeZoneName: 'longOffset'`), zero-dependency. VN không có DST nên offset cố
// định +07:00, nhưng thuật toán viết tổng quát (lặp 2 vòng bù offset) để timezone
// khác không sai giờ quanh ranh giới DST.

export type ScheduleKind = 'now' | 'daily' | 'weekly' | 'monthly';

export interface ScheduleSpec {
  scheduleKind: ScheduleKind;
  /** ['08:00','20:00'] — HH:mm 24h, giờ tường ở `timezone`. */
  timesOfDay: string[];
  /** 0=CN..6=T7, chỉ dùng khi weekly. */
  daysOfWeek: number[];
  /** 1..31, chỉ dùng khi monthly. */
  daysOfMonth: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
}

/** Trần mốc giờ mỗi ngày — nhiều hơn là dấu hiệu cấu hình sai, không phải nhu cầu thật. */
export const MAX_TIMES_PER_DAY = 12;
/** Số ngày tối đa dò tới khi tìm mốc kế tiếp (hơn 1 năm → coi như hết lịch). */
const MAX_LOOKAHEAD_DAYS = 400;
const MS_PER_DAY = 86_400_000;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Rút `ScheduleSpec` từ row `GroupBroadcast` (hoặc body request đã chuẩn hoá). */
export function scheduleSpecOf(b: {
  scheduleKind: string;
  timesOfDay: string[];
  daysOfWeek: number[];
  daysOfMonth: number[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
}): ScheduleSpec {
  return {
    scheduleKind: b.scheduleKind as ScheduleKind,
    timesOfDay: b.timesOfDay,
    daysOfWeek: b.daysOfWeek,
    daysOfMonth: b.daysOfMonth,
    timezone: b.timezone,
    startDate: b.startDate,
    endDate: b.endDate,
  };
}

// ── Timezone helpers (Intl-only) ─────────────────────────────────────────────

/** Offset (phút) của `timeZone` tại thời điểm `at`. VD Asia/Ho_Chi_Minh → 420. */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  if (!m) return 0; // 'GMT' trơn = UTC
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Đổi 1 mốc "giờ tường" ở `timeZone` → Date UTC.
 * Lặp 2 vòng: vòng 1 bù offset ước lượng, vòng 2 hội tụ nếu offset đổi (DST).
 */
export function zonedWallClockToUtc(
  year: number, month: number, day: number, hour: number, minute: number, timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let utc = naive;
  for (let i = 0; i < 2; i++) {
    utc = naive - tzOffsetMinutes(new Date(utc), timeZone) * 60_000;
  }
  return new Date(utc);
}

interface ZonedDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  weekday: number; // 0=CN..6=T7
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Đọc ngày/tháng/năm/thứ theo lịch của `timeZone` tại thời điểm `at`. */
export function zonedDateParts(at: Date, timeZone: string): ZonedDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

/** Số nguyên so sánh được cho 1 ngày lịch: 20260803. */
function dayKey(d: ZonedDate): number {
  return d.year * 10000 + d.month * 100 + d.day;
}

// ── Khớp ngày ────────────────────────────────────────────────────────────────

function dayMatchesSpec(spec: ScheduleSpec, day: ZonedDate): boolean {
  if (spec.scheduleKind === 'daily') return true;
  if (spec.scheduleKind === 'weekly') return spec.daysOfWeek.includes(day.weekday);
  if (spec.scheduleKind === 'monthly') {
    // Ngày 31 ở tháng chỉ có 30 ngày → BỎ QUA tháng đó. Không dồn sang ngày 1
    // tháng sau: dồn gây gửi bất ngờ vào ngày sale không chọn.
    return spec.daysOfMonth.includes(day.day);
  }
  return false;
}

function withinDateRange(spec: ScheduleSpec, day: ZonedDate): boolean {
  const key = dayKey(day);
  // So sánh theo NGÀY ở timezone của chiến dịch, bao gồm cả 2 đầu mút.
  if (spec.startDate && key < dayKey(zonedDateParts(spec.startDate, spec.timezone))) return false;
  if (spec.endDate && key > dayKey(zonedDateParts(spec.endDate, spec.timezone))) return false;
  return true;
}

/** Các mốc của MỘT ngày lịch, đã sort tăng dần. */
function occurrencesOnDay(spec: ScheduleSpec, day: ZonedDate): Date[] {
  if (!dayMatchesSpec(spec, day) || !withinDateRange(spec, day)) return [];
  const out: Date[] = [];
  for (const t of spec.timesOfDay) {
    const m = TIME_RE.exec(t);
    if (!m) continue;
    out.push(zonedWallClockToUtc(day.year, day.month, day.day, Number(m[1]), Number(m[2]), spec.timezone));
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Các mốc đến hạn trong khoảng `(after, until]` — dùng cho catch-up sau restart.
 * Duyệt thêm 1 ngày mỗi phía vì mốc giờ tường có thể rơi sang ngày UTC khác.
 */
export function occurrencesBetween(spec: ScheduleSpec, after: Date, until: Date): Date[] {
  if (spec.scheduleKind === 'now' || spec.timesOfDay.length === 0) return [];
  if (until.getTime() <= after.getTime()) return [];

  const out: Date[] = [];
  for (let t = after.getTime() - MS_PER_DAY; t <= until.getTime() + MS_PER_DAY; t += MS_PER_DAY) {
    for (const at of occurrencesOnDay(spec, zonedDateParts(new Date(t), spec.timezone))) {
      if (at.getTime() > after.getTime() && at.getTime() <= until.getTime()) out.push(at);
    }
  }
  return [...new Set(out.map((d) => d.getTime()))].sort((a, b) => a - b).map((ms) => new Date(ms));
}

/** Mốc kế tiếp SAU `from`, hoặc null khi đã hết lịch (quá endDate). */
export function nextOccurrence(spec: ScheduleSpec, from: Date): Date | null {
  if (spec.scheduleKind === 'now' || spec.timesOfDay.length === 0) return null;

  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const probe = new Date(from.getTime() + i * MS_PER_DAY);
    const day = zonedDateParts(probe, spec.timezone);
    if (spec.endDate && dayKey(day) > dayKey(zonedDateParts(spec.endDate, spec.timezone))) return null;
    for (const at of occurrencesOnDay(spec, day)) {
      if (at.getTime() > from.getTime()) return at;
    }
  }
  return null;
}

// ── Validate ─────────────────────────────────────────────────────────────────

export interface ScheduleValidation {
  ok: boolean;
  errors: string[];
}

export function validateSchedule(spec: ScheduleSpec): ScheduleValidation {
  const errors: string[] = [];

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: spec.timezone });
  } catch {
    errors.push('INVALID_TIMEZONE');
  }

  if (spec.scheduleKind !== 'now') {
    if (spec.timesOfDay.length === 0) errors.push('TIMES_REQUIRED');
    if (spec.timesOfDay.some((t) => !TIME_RE.test(t))) errors.push('INVALID_TIME');
    if (spec.timesOfDay.length > MAX_TIMES_PER_DAY) errors.push('TOO_MANY_TIMES');
  }

  if (spec.scheduleKind === 'weekly') {
    if (spec.daysOfWeek.length === 0 || spec.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      errors.push('INVALID_DAYS_OF_WEEK');
    }
  }

  if (spec.scheduleKind === 'monthly') {
    if (spec.daysOfMonth.length === 0 || spec.daysOfMonth.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
      errors.push('INVALID_DAYS_OF_MONTH');
    }
  }

  if (spec.startDate && spec.endDate && spec.endDate.getTime() < spec.startDate.getTime()) {
    errors.push('INVALID_DATE_RANGE');
  }

  return { ok: errors.length === 0, errors };
}

/** Chuẩn hoá spec: mốc giờ + thứ + ngày đều unique và sort tăng dần. */
export function normalizeSchedule<T extends {
  timesOfDay?: string[]; daysOfWeek?: number[]; daysOfMonth?: number[];
}>(input: T): T & { timesOfDay: string[]; daysOfWeek: number[]; daysOfMonth: number[] } {
  return {
    ...input,
    timesOfDay: [...new Set(input.timesOfDay ?? [])].sort(),
    daysOfWeek: [...new Set(input.daysOfWeek ?? [])].sort((a, b) => a - b),
    daysOfMonth: [...new Set(input.daysOfMonth ?? [])].sort((a, b) => a - b),
  };
}
