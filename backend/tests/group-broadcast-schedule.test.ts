/**
 * group-broadcast-schedule.test.ts — Tính mốc giờ cho chiến dịch gửi nhóm.
 * Thuần hàm, không DB, không mock. Biên timezone +07 (Asia/Ho_Chi_Minh).
 */
import { describe, it, expect } from 'vitest';
import {
  occurrencesBetween,
  nextOccurrence,
  validateSchedule,
  normalizeSchedule,
  zonedWallClockToUtc,
  type ScheduleSpec,
} from '../src/modules/zalo/group-broadcast-schedule.js';

const TZ = 'Asia/Ho_Chi_Minh';

function spec(overrides: Partial<ScheduleSpec> = {}): ScheduleSpec {
  return {
    scheduleKind: 'daily',
    timesOfDay: ['08:00', '20:00'],
    daysOfWeek: [],
    daysOfMonth: [],
    timezone: TZ,
    startDate: null,
    endDate: null,
    ...overrides,
  };
}

/** Giờ VN → Date UTC. 08:00 VN = 01:00 UTC. */
const vn = (y: number, m: number, d: number, hh: number, mm = 0) =>
  zonedWallClockToUtc(y, m, d, hh, mm, TZ);

describe('occurrencesBetween', () => {
  it('daily 08:00 & 20:00 — cửa sổ 07:59→08:01 giờ VN chỉ có 1 mốc', () => {
    const got = occurrencesBetween(spec(), vn(2026, 8, 3, 7, 59), vn(2026, 8, 3, 8, 1));
    expect(got).toHaveLength(1);
    expect(got[0].getTime()).toBe(vn(2026, 8, 3, 8, 0).getTime());
  });

  it('cửa sổ chứa 2 mốc → trả cả 2, tăng dần', () => {
    const got = occurrencesBetween(
      spec({ timesOfDay: ['08:00', '08:05'] }),
      vn(2026, 8, 3, 7, 59),
      vn(2026, 8, 3, 8, 9),
    );
    expect(got.map((d) => d.getTime())).toEqual([
      vn(2026, 8, 3, 8, 0).getTime(),
      vn(2026, 8, 3, 8, 5).getTime(),
    ]);
  });

  it('weekly [1,3] (T2, T4) — không sinh mốc ngày T3', () => {
    // 2026-08-04 là thứ Ba.
    const s = spec({ scheduleKind: 'weekly', daysOfWeek: [1, 3], timesOfDay: ['08:00'] });
    expect(occurrencesBetween(s, vn(2026, 8, 4, 7, 59), vn(2026, 8, 4, 8, 1))).toHaveLength(0);
    // 2026-08-05 là thứ Tư (weekday 3).
    expect(occurrencesBetween(s, vn(2026, 8, 5, 7, 59), vn(2026, 8, 5, 8, 1))).toHaveLength(1);
  });

  it('monthly [31] — tháng 2 không có mốc, tháng 3 có', () => {
    const s = spec({ scheduleKind: 'monthly', daysOfMonth: [31], timesOfDay: ['08:00'] });
    let feb = 0;
    for (let d = 1; d <= 28; d++) {
      feb += occurrencesBetween(s, vn(2026, 2, d, 0, 0), vn(2026, 2, d, 23, 59)).length;
    }
    expect(feb).toBe(0);
    expect(occurrencesBetween(s, vn(2026, 3, 31, 7, 59), vn(2026, 3, 31, 8, 1))).toHaveLength(1);
  });

  it('startDate ngày mai → hôm nay không có mốc', () => {
    const s = spec({ timesOfDay: ['08:00'], startDate: vn(2026, 8, 4, 0, 0) });
    expect(occurrencesBetween(s, vn(2026, 8, 3, 7, 59), vn(2026, 8, 3, 8, 1))).toHaveLength(0);
    expect(occurrencesBetween(s, vn(2026, 8, 4, 7, 59), vn(2026, 8, 4, 8, 1))).toHaveLength(1);
  });

  it('mốc 00:00 và 23:59 không lệch ngày ở timezone +07', () => {
    const s = spec({ timesOfDay: ['00:00', '23:59'] });
    // Cửa sổ là (after, until] — biên dưới HỞ, nên lấy 23:58 để 23:59 lọt vào.
    const midnight = occurrencesBetween(s, vn(2026, 8, 2, 23, 58), vn(2026, 8, 3, 0, 1));
    expect(midnight).toHaveLength(2);
    expect(midnight[0].getTime()).toBe(vn(2026, 8, 2, 23, 59).getTime());
    expect(midnight[1].getTime()).toBe(vn(2026, 8, 3, 0, 0).getTime());
  });

  it('scheduleKind=now → không bao giờ sinh mốc', () => {
    const s = spec({ scheduleKind: 'now' });
    expect(occurrencesBetween(s, vn(2026, 8, 3, 0, 0), vn(2026, 8, 4, 0, 0))).toHaveLength(0);
  });
});

describe('nextOccurrence', () => {
  it('trả mốc kế tiếp trong ngày', () => {
    const got = nextOccurrence(spec(), vn(2026, 8, 3, 9, 0));
    expect(got?.getTime()).toBe(vn(2026, 8, 3, 20, 0).getTime());
  });

  it('qua mốc cuối trong ngày → nhảy sang mốc đầu ngày hôm sau', () => {
    const got = nextOccurrence(spec(), vn(2026, 8, 3, 21, 0));
    expect(got?.getTime()).toBe(vn(2026, 8, 4, 8, 0).getTime());
  });

  it('endDate hôm qua → null', () => {
    const s = spec({ endDate: vn(2026, 8, 2, 0, 0) });
    expect(nextOccurrence(s, vn(2026, 8, 3, 9, 0))).toBeNull();
  });

  it('scheduleKind=now → null', () => {
    expect(nextOccurrence(spec({ scheduleKind: 'now' }), new Date())).toBeNull();
  });
});

describe('validateSchedule', () => {
  it('daily thiếu timesOfDay → TIMES_REQUIRED', () => {
    expect(validateSchedule(spec({ timesOfDay: [] })).errors).toContain('TIMES_REQUIRED');
  });

  it('mốc giờ sai định dạng → INVALID_TIME', () => {
    expect(validateSchedule(spec({ timesOfDay: ['25:00'] })).errors).toContain('INVALID_TIME');
    expect(validateSchedule(spec({ timesOfDay: ['8:00'] })).errors).toContain('INVALID_TIME');
    expect(validateSchedule(spec({ timesOfDay: ['08:60'] })).errors).toContain('INVALID_TIME');
  });

  it('quá 12 mốc → TOO_MANY_TIMES', () => {
    const times = Array.from({ length: 13 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    expect(validateSchedule(spec({ timesOfDay: times })).errors).toContain('TOO_MANY_TIMES');
  });

  it('weekly thiếu/sai daysOfWeek → INVALID_DAYS_OF_WEEK', () => {
    expect(validateSchedule(spec({ scheduleKind: 'weekly', daysOfWeek: [] })).errors)
      .toContain('INVALID_DAYS_OF_WEEK');
    expect(validateSchedule(spec({ scheduleKind: 'weekly', daysOfWeek: [7] })).errors)
      .toContain('INVALID_DAYS_OF_WEEK');
  });

  it('monthly thiếu/sai daysOfMonth → INVALID_DAYS_OF_MONTH', () => {
    expect(validateSchedule(spec({ scheduleKind: 'monthly', daysOfMonth: [] })).errors)
      .toContain('INVALID_DAYS_OF_MONTH');
    expect(validateSchedule(spec({ scheduleKind: 'monthly', daysOfMonth: [32] })).errors)
      .toContain('INVALID_DAYS_OF_MONTH');
  });

  it('endDate trước startDate → INVALID_DATE_RANGE', () => {
    const s = spec({ startDate: vn(2026, 8, 10, 0), endDate: vn(2026, 8, 1, 0) });
    expect(validateSchedule(s).errors).toContain('INVALID_DATE_RANGE');
  });

  it('timezone không hợp lệ → INVALID_TIMEZONE', () => {
    expect(validateSchedule(spec({ timezone: 'Mars/Olympus' })).errors).toContain('INVALID_TIMEZONE');
  });

  it('spec hợp lệ → ok', () => {
    expect(validateSchedule(spec())).toEqual({ ok: true, errors: [] });
  });
});

describe('normalizeSchedule', () => {
  it('unique + sort mốc giờ, thứ, ngày', () => {
    const got = normalizeSchedule({
      timesOfDay: ['20:00', '08:00', '08:00'],
      daysOfWeek: [3, 1, 3],
      daysOfMonth: [15, 1, 15],
    });
    expect(got.timesOfDay).toEqual(['08:00', '20:00']);
    expect(got.daysOfWeek).toEqual([1, 3]);
    expect(got.daysOfMonth).toEqual([1, 15]);
  });
});
