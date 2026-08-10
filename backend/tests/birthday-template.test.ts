/**
 * birthday-template.test.ts — thay biến trong lời chúc sinh nhật.
 *
 * Điểm sống còn: bản Community không có bộ render của EE, nên nếu hàm này sai thì
 * khách nhận nguyên chữ "{name}" trong lời chúc — tệ hơn là không chúc.
 */
import { describe, it, expect } from 'vitest';
import {
  renderBirthdayFallback, type BirthdayTemplateContact,
} from '../src/modules/birthday/birthday-template.js';

const NOW = new Date('2026-08-10T02:00:00Z');

function contact(overrides: Partial<BirthdayTemplateContact> = {}): BirthdayTemplateContact {
  return {
    fullName: 'Trần Văn Lộc',
    crmName: null,
    gender: 'male',
    phone: '0908278807',
    email: null,
    occupation: null,
    birthYear: null,
    birthDate: new Date('1990-08-10T00:00:00Z'),
    ...overrides,
  };
}

function render(raw: string, overrides: Partial<BirthdayTemplateContact> = {}, sale: string | null = null) {
  return renderBirthdayFallback(raw, { contact: contact(overrides), saleFullName: sale, now: NOW });
}

describe('xưng hô', () => {
  it('nam → Anh, nữ → Chị', () => {
    expect(render('Chúc mừng sinh nhật {gender}!')).toBe('Chúc mừng sinh nhật Anh!');
    expect(render('Chúc mừng sinh nhật {gender}!', { gender: 'female' }))
      .toBe('Chúc mừng sinh nhật Chị!');
  });

  it('không rõ giới tính → "Anh Chị" (an toàn hai chiều)', () => {
    expect(render('Chào {gender}', { gender: null })).toBe('Chào Anh Chị');
    expect(render('Chào {gender}', { gender: 'unknown' })).toBe('Chào Anh Chị');
  });
});

describe('tên', () => {
  it('{name} lấy CHỮ CUỐI — tên gọi của người Việt', () => {
    expect(render('Chúc mừng sinh nhật {gender} {name}!'))
      .toBe('Chúc mừng sinh nhật Anh Lộc!');
  });

  it('{name_full} giữ nguyên tên đầy đủ', () => {
    expect(render('{name_full}')).toBe('Trần Văn Lộc');
  });

  it('tên gợi nhớ được ưu tiên hơn tên import', () => {
    expect(render('{crm_full}', { crmName: 'Lộc Q7' })).toBe('Lộc Q7');
    expect(render('{crm_last}', { crmName: 'Lộc Q7' })).toBe('Q7');
  });

  it('chưa có tên gợi nhớ thì rơi về tên đầy đủ', () => {
    expect(render('{crm_full}')).toBe('Trần Văn Lộc');
  });
});

describe('tuổi', () => {
  it('tính theo ngày sinh — đúng ngày sinh nhật đã tính tuổi mới', () => {
    expect(render('{age}')).toBe('36');
  });

  it('chưa tới ngày sinh trong năm thì chưa cộng tuổi', () => {
    expect(render('{age}', { birthDate: new Date('1990-12-25T00:00:00Z') })).toBe('35');
  });

  it('không có ngày sinh thì dùng năm sinh', () => {
    expect(render('{age}', { birthDate: null, birthYear: 1990 })).toBe('36');
  });
});

describe('biến của sale', () => {
  it('{sale} lấy chữ cuối, {sale_full} lấy đủ', () => {
    expect(render('{sale} - {sale_full}', {}, 'Nguyễn Thị Hương'))
      .toBe('Hương - Nguyễn Thị Hương');
  });
});

describe('placeholder không có dữ liệu', () => {
  it('bị xoá chứ KHÔNG gửi nguyên chữ {…} cho khách', () => {
    const out = render('Chúc mừng {gender} {name}{email}!', { email: null });
    expect(out).toBe('Chúc mừng Anh Lộc!');
    expect(out).not.toContain('{');
  });

  it('biến lạ cũng bị xoá', () => {
    expect(render('Chào {gender}{khong_ton_tai}')).toBe('Chào Anh');
  });

  it('dọn khoảng trắng đôi do placeholder rỗng để lại', () => {
    expect(render('Chào {occupation} {gender}', { occupation: null })).toBe('Chào Anh');
  });

  it('giữ nguyên xuống dòng của mẫu tin', () => {
    expect(render('Chúc mừng {gender}!\nChúc {name} năm mới vui.'))
      .toBe('Chúc mừng Anh!\nChúc Lộc năm mới vui.');
  });
});

describe('mẫu tin không có biến', () => {
  it('trả về y nguyên', () => {
    const raw = 'Chúc mừng sinh nhật! Chúc anh chị nhiều sức khoẻ.';
    expect(render(raw)).toBe(raw);
  });
});
