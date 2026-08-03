/**
 * list-broadcast-window.test.ts — Khung giờ gửi của chiến dịch nhắn tệp KH.
 * Thuần hàm, không DB, không mock. Biên timezone +07 (Asia/Ho_Chi_Minh).
 */
import { describe, it, expect } from 'vitest';
import { zonedWallClockToUtc } from '../src/modules/zalo/group-broadcast-schedule.js';
import {
  dayBoundsUtc,
  isWithinWindow,
  minutesOfDay,
  nextWindowOpen,
  sendingDaysPerWeek,
  validateWindow,
  windowLengthMinutes,
  type WindowSpec,
} from '../src/modules/zalo/list-broadcast-window.js';

const TZ = 'Asia/Ho_Chi_Minh';

function spec(overrides: Partial<WindowSpec> = {}): WindowSpec {
  return {
    windowStart: '08:00',
    windowEnd: '17:00',
    daysOfWeek: [],
    timezone: TZ,
    startDate: null,
    endDate: null,
    ...overrides,
  };
}

/** Giờ VN → Date UTC. 08:00 VN = 01:00 UTC. */
const vn = (y: number, m: number, d: number, hh: number, mm = 0) =>
  zonedWallClockToUtc(y, m, d, hh, mm, TZ);

describe('minutesOfDay', () => {
  it('đổi HH:mm sang số phút', () => {
    expect(minutesOfDay('00:00')).toBe(0);
    expect(minutesOfDay('08:30')).toBe(510);
    expect(minutesOfDay('23:59')).toBe(1439);
  });

  it('trả null với định dạng sai', () => {
    expect(minutesOfDay('24:00')).toBeNull();
    expect(minutesOfDay('8:00')).toBeNull();
    expect(minutesOfDay('')).toBeNull();
  });
});

describe('isWithinWindow', () => {
  it('trong khung 08:00–17:00 giờ VN', () => {
    expect(isWithinWindow(spec(), vn(2026, 8, 4, 8, 0))).toBe(true);
    expect(isWithinWindow(spec(), vn(2026, 8, 4, 12, 30))).toBe(true);
    expect(isWithinWindow(spec(), vn(2026, 8, 4, 16, 59))).toBe(true);
  });

  it('mốc kết thúc là biên MỞ — 17:00 đã ngoài khung', () => {
    expect(isWithinWindow(spec(), vn(2026, 8, 4, 17, 0))).toBe(false);
  });

  it('trước giờ mở và sau giờ đóng đều ngoài khung', () => {
    expect(isWithinWindow(spec(), vn(2026, 8, 4, 7, 59))).toBe(false);
    expect(isWithinWindow(spec(), vn(2026, 8, 4, 22, 0))).toBe(false);
  });

  it('khung QUA ĐÊM 22:00–02:00 nhận cả hai phía nửa đêm', () => {
    const overnight = spec({ windowStart: '22:00', windowEnd: '02:00' });
    expect(isWithinWindow(overnight, vn(2026, 8, 4, 23, 0))).toBe(true);
    expect(isWithinWindow(overnight, vn(2026, 8, 5, 1, 0))).toBe(true);
    expect(isWithinWindow(overnight, vn(2026, 8, 5, 3, 0))).toBe(false);
    expect(isWithinWindow(overnight, vn(2026, 8, 4, 21, 59))).toBe(false);
  });

  it('lọc theo thứ trong tuần — 2026-08-04 là Thứ Ba (weekday=2)', () => {
    expect(isWithinWindow(spec({ daysOfWeek: [2] }), vn(2026, 8, 4, 10, 0))).toBe(true);
    expect(isWithinWindow(spec({ daysOfWeek: [3] }), vn(2026, 8, 4, 10, 0))).toBe(false);
  });

  it('daysOfWeek rỗng = mọi ngày', () => {
    expect(isWithinWindow(spec(), vn(2026, 8, 8, 10, 0))).toBe(true); // Thứ Bảy
    expect(isWithinWindow(spec(), vn(2026, 8, 9, 10, 0))).toBe(true); // Chủ Nhật
  });

  it('tôn trọng startDate/endDate theo NGÀY ở timezone chiến dịch', () => {
    const ranged = spec({ startDate: vn(2026, 8, 4, 0, 0), endDate: vn(2026, 8, 6, 0, 0) });
    expect(isWithinWindow(ranged, vn(2026, 8, 3, 10, 0))).toBe(false);
    expect(isWithinWindow(ranged, vn(2026, 8, 4, 10, 0))).toBe(true);
    expect(isWithinWindow(ranged, vn(2026, 8, 6, 10, 0))).toBe(true); // bao gồm ngày cuối
    expect(isWithinWindow(ranged, vn(2026, 8, 7, 10, 0))).toBe(false);
  });

  it('khung giờ sai định dạng thì không bao giờ gửi', () => {
    expect(isWithinWindow(spec({ windowStart: 'x' }), vn(2026, 8, 4, 10, 0))).toBe(false);
  });
});

describe('dayBoundsUtc', () => {
  it('cắt ngày theo nửa đêm GIỜ VN, không phải nửa đêm UTC', () => {
    // 00:30 VN ngày 4/8 = 17:30 UTC ngày 3/8. Hạn mức phải tính vào ngày 4/8.
    const { start, end } = dayBoundsUtc(spec(), vn(2026, 8, 4, 0, 30));
    expect(start.getTime()).toBe(vn(2026, 8, 4, 0, 0).getTime());
    expect(end.getTime()).toBe(vn(2026, 8, 5, 0, 0).getTime());
  });

  it('cuối ngày vẫn thuộc cùng khoảng', () => {
    const { start, end } = dayBoundsUtc(spec(), vn(2026, 8, 4, 23, 59));
    expect(start.getTime()).toBe(vn(2026, 8, 4, 0, 0).getTime());
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });
});

describe('nextWindowOpen', () => {
  it('đang trong khung → trả về chính thời điểm đó', () => {
    const at = vn(2026, 8, 4, 10, 0);
    expect(nextWindowOpen(spec(), at)?.getTime()).toBe(at.getTime());
  });

  it('trước giờ mở → mở cùng ngày', () => {
    const got = nextWindowOpen(spec(), vn(2026, 8, 4, 6, 0));
    expect(got?.getTime()).toBe(vn(2026, 8, 4, 8, 0).getTime());
  });

  it('sau giờ đóng → mở sáng hôm sau', () => {
    const got = nextWindowOpen(spec(), vn(2026, 8, 4, 18, 0));
    expect(got?.getTime()).toBe(vn(2026, 8, 5, 8, 0).getTime());
  });

  it('nhảy qua ngày không nằm trong daysOfWeek', () => {
    // Chỉ gửi Thứ Hai (1). 2026-08-04 là Thứ Ba → mốc kế tiếp là Thứ Hai 2026-08-10.
    const got = nextWindowOpen(spec({ daysOfWeek: [1] }), vn(2026, 8, 4, 18, 0));
    expect(got?.getTime()).toBe(vn(2026, 8, 10, 8, 0).getTime());
  });

  it('quá endDate → null', () => {
    const ranged = spec({ endDate: vn(2026, 8, 4, 0, 0) });
    expect(nextWindowOpen(ranged, vn(2026, 8, 4, 18, 0))).toBeNull();
  });
});

describe('validateWindow', () => {
  it('cấu hình mặc định hợp lệ', () => {
    expect(validateWindow(spec()).ok).toBe(true);
  });

  it('khung qua đêm vẫn hợp lệ', () => {
    expect(validateWindow(spec({ windowStart: '22:00', windowEnd: '02:00' })).ok).toBe(true);
  });

  it('start === end là khung rỗng', () => {
    const got = validateWindow(spec({ windowStart: '08:00', windowEnd: '08:00' }));
    expect(got.ok).toBe(false);
    expect(got.errors).toContain('EMPTY_WINDOW');
  });

  it('bắt giờ sai định dạng, thứ sai, timezone sai, khoảng ngày ngược', () => {
    expect(validateWindow(spec({ windowEnd: '25:00' })).errors).toContain('INVALID_WINDOW_TIME');
    expect(validateWindow(spec({ daysOfWeek: [7] })).errors).toContain('INVALID_DAYS_OF_WEEK');
    expect(validateWindow(spec({ timezone: 'Khong/Ton_Tai' })).errors).toContain('INVALID_TIMEZONE');
    expect(
      validateWindow(spec({ startDate: vn(2026, 8, 5, 0), endDate: vn(2026, 8, 4, 0) })).errors,
    ).toContain('INVALID_DATE_RANGE');
  });
});

describe('windowLengthMinutes / sendingDaysPerWeek', () => {
  it('khung thường và khung qua đêm', () => {
    expect(windowLengthMinutes(spec())).toBe(9 * 60);
    expect(windowLengthMinutes(spec({ windowStart: '22:00', windowEnd: '02:00' }))).toBe(4 * 60);
  });

  it('daysOfWeek rỗng = 7 ngày', () => {
    expect(sendingDaysPerWeek(spec())).toBe(7);
    expect(sendingDaysPerWeek(spec({ daysOfWeek: [1, 3, 5] }))).toBe(3);
  });
});
