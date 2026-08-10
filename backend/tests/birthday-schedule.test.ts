/**
 * birthday-schedule.test.ts — lịch gửi lời chúc sinh nhật (thuần hàm).
 *
 * Ba nhóm phải đúng, vì sai thì khách nhận tin sai ngày hoặc sai giờ:
 *  1. Suy NGÀY SINH cần dò từ NGÀY GỬI cho 3 dịp (trước / đúng ngày / sau).
 *  2. Giờ gửi quy đổi đúng từ giờ tường Việt Nam sang UTC.
 *  3. Ngày 29/02 không bị bỏ rơi ở năm không nhuận.
 */
import { describe, it, expect } from 'vitest';
import {
  dayBoundsUtc, isDue, isTooLate, occasionOffsetDays, plannedOccasionsFor,
  validateSchedule, type BirthdayScheduleSpec,
} from '../src/modules/birthday/birthday-schedule.js';

const VN = 'Asia/Ho_Chi_Minh';

function spec(overrides: Partial<BirthdayScheduleSpec> = {}): BirthdayScheduleSpec {
  return {
    timezone: VN,
    sendTime: '09:00',
    lateToleranceMinutes: 180,
    beforeEnabled: false,
    beforeDays: 3,
    onDayEnabled: true,
    afterEnabled: false,
    afterDays: 1,
    ...overrides,
  };
}

/** 10/08/2026 08:00 giờ VN = 01:00 UTC. */
const AUG_10_0800_VN = new Date('2026-08-10T01:00:00Z');

describe('occasionOffsetDays', () => {
  it('trước = dương, đúng ngày = 0, sau = âm', () => {
    const s = spec({ beforeDays: 5, afterDays: 2 });
    expect(occasionOffsetDays(s, 'before')).toBe(5);
    expect(occasionOffsetDays(s, 'on_day')).toBe(0);
    expect(occasionOffsetDays(s, 'after')).toBe(-2);
  });
});

describe('plannedOccasionsFor', () => {
  it('dịp đúng ngày dò chính ngày gửi', () => {
    const [occ] = plannedOccasionsFor(spec(), AUG_10_0800_VN);
    expect(occ.occasion).toBe('on_day');
    expect(occ.monthDays).toEqual(['08-10']);
    expect(occ.birthdayOn.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('dịp trước N ngày dò ngày sinh Ở PHÍA TRƯỚC ngày gửi', () => {
    const s = spec({ beforeEnabled: true, beforeDays: 3, onDayEnabled: false });
    const [occ] = plannedOccasionsFor(s, AUG_10_0800_VN);
    expect(occ.occasion).toBe('before');
    expect(occ.monthDays).toEqual(['08-13']);
  });

  it('dịp sau N ngày dò ngày sinh ĐÃ QUA', () => {
    const s = spec({ afterEnabled: true, afterDays: 2, onDayEnabled: false });
    const [occ] = plannedOccasionsFor(s, AUG_10_0800_VN);
    expect(occ.occasion).toBe('after');
    expect(occ.monthDays).toEqual(['08-08']);
  });

  it('bật cả 3 dịp trả đủ 3, cùng một mốc giờ gửi', () => {
    const s = spec({ beforeEnabled: true, afterEnabled: true });
    const occasions = plannedOccasionsFor(s, AUG_10_0800_VN);
    expect(occasions.map((o) => o.occasion)).toEqual(['before', 'on_day', 'after']);
    const dueSet = new Set(occasions.map((o) => o.dueAt.toISOString()));
    expect(dueSet.size).toBe(1);
  });

  it('dịp đã tắt không được lên lịch', () => {
    expect(plannedOccasionsFor(spec({ onDayEnabled: false }), AUG_10_0800_VN)).toEqual([]);
  });

  it('giờ gửi 09:00 giờ VN = 02:00 UTC cùng ngày', () => {
    const [occ] = plannedOccasionsFor(spec(), AUG_10_0800_VN);
    expect(occ.dueAt.toISOString()).toBe('2026-08-10T02:00:00.000Z');
  });

  it('ngày lịch tính theo múi giờ cấu hình, không theo UTC', () => {
    // 09/08/2026 23:30 UTC = 10/08 06:30 giờ VN → phải là ngày 10, không phải 09.
    const [occ] = plannedOccasionsFor(spec(), new Date('2026-08-09T23:30:00Z'));
    expect(occ.monthDays).toEqual(['08-10']);
  });

  it('giờ gửi sai định dạng thì không lên lịch gì cả', () => {
    expect(plannedOccasionsFor(spec({ sendTime: '25:00' }), AUG_10_0800_VN)).toEqual([]);
  });
});

describe('người sinh 29/02', () => {
  it('năm KHÔNG nhuận: ngày dò 28/02 gộp luôn 02-29', () => {
    // 2027 không nhuận. Gửi ngày 28/02/2027 giờ VN.
    const [occ] = plannedOccasionsFor(spec(), new Date('2027-02-28T02:00:00Z'));
    expect(occ.monthDays).toEqual(['02-28', '02-29']);
  });

  it('năm nhuận: 28/02 chỉ dò 02-28, còn 29/02 có ngày riêng', () => {
    const feb28 = plannedOccasionsFor(spec(), new Date('2028-02-28T02:00:00Z'))[0];
    expect(feb28.monthDays).toEqual(['02-28']);
    const feb29 = plannedOccasionsFor(spec(), new Date('2028-02-29T02:00:00Z'))[0];
    expect(feb29.monthDays).toEqual(['02-29']);
  });
});

describe('isDue / isTooLate', () => {
  const due = new Date('2026-08-10T02:00:00Z');

  it('chưa tới giờ thì chưa gửi', () => {
    expect(isDue(due, new Date('2026-08-10T01:59:00Z'))).toBe(false);
    expect(isDue(due, due)).toBe(true);
  });

  it('trong khung trễ cho phép vẫn gửi bù', () => {
    const s = spec({ lateToleranceMinutes: 180 });
    expect(isTooLate(s, due, new Date('2026-08-10T04:59:00Z'))).toBe(false);
  });

  it('quá khung trễ thì bỏ hẳn, không gửi vào giờ ngủ', () => {
    const s = spec({ lateToleranceMinutes: 180 });
    expect(isTooLate(s, due, new Date('2026-08-10T05:01:00Z'))).toBe(true);
  });
});

describe('dayBoundsUtc', () => {
  it('mốc ngày theo giờ VN, không theo UTC', () => {
    const { start, end } = dayBoundsUtc(VN, AUG_10_0800_VN);
    // Nửa đêm 10/08 giờ VN = 17:00 ngày 09/08 UTC.
    expect(start.toISOString()).toBe('2026-08-09T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-10T17:00:00.000Z');
  });
});

describe('validateSchedule', () => {
  it('cấu hình mặc định hợp lệ', () => {
    expect(validateSchedule(spec()).ok).toBe(true);
  });

  it('chặn khi không bật dịp nào', () => {
    const r = validateSchedule(spec({ onDayEnabled: false }));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('NO_OCCASION_ENABLED');
  });

  it('chặn giờ gửi sai và múi giờ sai', () => {
    const r = validateSchedule(spec({ sendTime: '9h', timezone: 'Mars/Olympus' }));
    expect(r.errors).toContain('INVALID_SEND_TIME');
    expect(r.errors).toContain('INVALID_TIMEZONE');
  });

  it('chặn số ngày lệch ngoài khoảng — nhưng chỉ khi dịp đó BẬT', () => {
    expect(validateSchedule(spec({ beforeDays: 99 })).ok).toBe(true);
    const r = validateSchedule(spec({ beforeEnabled: true, beforeDays: 99 }));
    expect(r.errors).toContain('INVALID_BEFORE_DAYS');
  });

  it('chặn độ trễ cho phép quá 24 giờ', () => {
    const r = validateSchedule(spec({ lateToleranceMinutes: 2000 }));
    expect(r.errors).toContain('INVALID_LATE_TOLERANCE');
  });
});
