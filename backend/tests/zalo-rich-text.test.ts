/**
 * zalo-rich-text.test.ts — Định dạng chữ Zalo (đậm/màu/cỡ) cho gửi hàng loạt.
 * Thuần hàm, không DB, không mock.
 *
 * Trọng tâm: offset của style tính theo KÝ TỰ, nên mọi phép cắt chuỗi đều có thể
 * làm đậm/màu bám sai chỗ — đó là lỗi im lặng (tin vẫn gửi, chỉ tô lệch).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeZaloStyles,
  stylesFromContentRich,
  trimRich,
  buildRtfContent,
} from '../src/shared/zalo-rich-text.js';

describe('normalizeZaloStyles', () => {
  it('giữ nguyên mã Zalo hợp lệ', () => {
    const raw = [
      { st: 'b', start: 0, len: 3 },
      { st: 'i', start: 3, len: 2 },
      { st: 'u', start: 0, len: 1 },
      { st: 's', start: 1, len: 1 },
      { st: 'c_db342e', start: 2, len: 3 },
      { st: 'f_18', start: 0, len: 5 },
      { st: 'lst_1', start: 0, len: 5 },
    ];
    expect(normalizeZaloStyles(raw, 10)).toHaveLength(7);
  });

  it('loại mã lạ — Zalo từ chối cả tin nếu gặp style không hiểu', () => {
    const raw = [
      { st: 'blink', start: 0, len: 3 },
      { st: 'c_ZZZZZZ', start: 0, len: 3 },
      { st: 'f_9999', start: 0, len: 3 },
      { st: '', start: 0, len: 3 },
      { st: 'b', start: 0, len: 3 },
    ];
    expect(normalizeZaloStyles(raw, 10)).toEqual([{ st: 'b', start: 0, len: 3 }]);
  });

  it('cắt phần tràn khỏi độ dài chữ thay vì bỏ cả khoảng', () => {
    expect(normalizeZaloStyles([{ st: 'b', start: 3, len: 99 }], 5)).toEqual([
      { st: 'b', start: 3, len: 2 },
    ]);
  });

  it('bỏ khoảng rỗng, âm, hoặc bắt đầu ngoài chuỗi', () => {
    const raw = [
      { st: 'b', start: 0, len: 0 },
      { st: 'b', start: -1, len: 3 },
      { st: 'b', start: 10, len: 3 },
      { st: 'b', start: 1.5, len: 2 },
    ];
    expect(normalizeZaloStyles(raw, 5)).toEqual([]);
  });

  it('đầu vào không phải mảng → rỗng, không ném', () => {
    expect(normalizeZaloStyles(null, 5)).toEqual([]);
    expect(normalizeZaloStyles('b', 5)).toEqual([]);
    expect(normalizeZaloStyles([null, 'x', 42], 5)).toEqual([]);
  });
});

describe('stylesFromContentRich', () => {
  it('đọc styles từ cột JSON, đo theo chữ truyền vào', () => {
    const rich = { text: 'Xin chào', styles: [{ st: 'b', start: 0, len: 3 }] };
    expect(stylesFromContentRich(rich, 'Xin chào')).toEqual([{ st: 'b', start: 0, len: 3 }]);
  });

  it('mẫu cũ (contentRich null) → không có định dạng', () => {
    expect(stylesFromContentRich(null, 'Xin chào')).toEqual([]);
  });

  it('contentRich lệch nhịp với content → cắt theo content, không tô tràn', () => {
    // Bản ghi cũ: chữ đã bị sửa ngắn lại nhưng styles còn theo đoạn dài.
    const rich = { text: 'Xin chào anh Hoàng', styles: [{ st: 'b', start: 0, len: 18 }] };
    expect(stylesFromContentRich(rich, 'Xin chào')).toEqual([{ st: 'b', start: 0, len: 8 }]);
  });
});

describe('trimRich', () => {
  it('không có khoảng trắng thừa → giữ nguyên', () => {
    const styles = [{ st: 'b', start: 0, len: 3 }];
    expect(trimRich('Xin chào', styles)).toEqual({ text: 'Xin chào', styles });
  });

  it('cắt khoảng trắng ĐẦU → dời start trái đúng bấy nhiêu ký tự', () => {
    // '  Xin chào' → 'Xin chào'; 'Xin' bắt đầu ở index 2, sau trim phải về 0.
    const got = trimRich('  Xin chào', [{ st: 'b', start: 2, len: 3 }]);
    expect(got.text).toBe('Xin chào');
    expect(got.styles).toEqual([{ st: 'b', start: 0, len: 3 }]);
  });

  it('cắt khoảng trắng CUỐI → kẹp len về biên mới', () => {
    const got = trimRich('Xin chào   ', [{ st: 'b', start: 0, len: 11 }]);
    expect(got.text).toBe('Xin chào');
    expect(got.styles).toEqual([{ st: 'b', start: 0, len: 8 }]);
  });

  it('khoảng phủ cả phần bị cắt hai đầu → kẹp về đúng chữ còn lại', () => {
    const got = trimRich('\n\n Xin chào \n', [{ st: 'c_db342e', start: 0, len: 13 }]);
    expect(got.text).toBe('Xin chào');
    expect(got.styles).toEqual([{ st: 'c_db342e', start: 0, len: 8 }]);
  });

  it('khoảng nằm TRỌN trong phần bị cắt → bỏ hẳn', () => {
    const got = trimRich('   Xin chào', [{ st: 'b', start: 0, len: 2 }]);
    expect(got.styles).toEqual([]);
  });

  it('chữ toàn khoảng trắng → rỗng cả hai', () => {
    expect(trimRich('   \n ', [{ st: 'b', start: 0, len: 3 }])).toEqual({ text: '', styles: [] });
  });

  it('giữ đúng thứ tự nhiều khoảng chồng nhau sau khi dời', () => {
    // ' **Giá** 500k' — đậm ở 'Giá', đỏ ở '500k'.
    const got = trimRich(' Giá 500k ', [
      { st: 'b', start: 1, len: 3 },
      { st: 'c_db342e', start: 5, len: 4 },
    ]);
    expect(got.text).toBe('Giá 500k');
    expect(got.styles).toEqual([
      { st: 'b', start: 0, len: 3 },
      { st: 'c_db342e', start: 4, len: 4 },
    ]);
    // Kiểm chứng bằng chính chuỗi sau trim: khoảng phải trỏ đúng từ.
    expect(got.text.slice(0, 3)).toBe('Giá');
    expect(got.text.slice(4, 8)).toBe('500k');
  });
});

describe('buildRtfContent', () => {
  it('không có định dạng → lưu chữ trơ, không bọc JSON thừa', () => {
    expect(buildRtfContent('Xin chào', [])).toBe('Xin chào');
  });

  it('có định dạng → khuôn JSON rtf khớp echo Zalo', () => {
    const got = buildRtfContent('Xin chào', [{ st: 'b', start: 0, len: 3 }]);
    const parsed = JSON.parse(got);
    expect(parsed.title).toBe('Xin chào');
    expect(parsed.action).toBe('rtf');
    expect(JSON.parse(parsed.params)).toEqual({ styles: [{ st: 'b', start: 0, len: 3 }] });
  });
});
