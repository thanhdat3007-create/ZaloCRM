// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * zalo-rich-text.ts — định dạng chữ Zalo (RTF) dùng chung giữa chat và gửi hàng loạt.
 *
 * Zalo mô tả định dạng bằng MẢNG KHOẢNG trên plain text, không phải HTML:
 *   { st: 'b', start: 0, len: 5 }        → 5 ký tự đầu in đậm
 *   { st: 'c_db342e', start: 6, len: 4 } → 4 ký tự kế tô đỏ
 *
 * Vì offset tính theo ký tự của plain text, MỌI phép biến đổi chuỗi (trim, thay
 * biến) đều làm lệch khoảng — dùng `trimRich` thay cho `.trim()` trực tiếp.
 *
 * Mã `st` hợp lệ (khớp bảng enum zca-js + rich-text-editor.vue):
 *   b / i / u / s   đậm, nghiêng, gạch chân, gạch ngang
 *   c_RRGGBB        màu chữ          f_NN / s_NN   cỡ chữ
 *   lst_1 / lst_2   bullet / đánh số
 */

export interface ZaloStyle {
  st: string;
  start: number;
  len: number;
}

/** Chỉ nhận đúng bộ mã Zalo hiểu được — mã lạ khiến Zalo từ chối cả tin. */
const VALID_ST = /^(b|i|u|s|lst_[12]|c_[0-9a-fA-F]{6}|[fs]_\d{1,3})$/;

/**
 * Lọc mảng style thô (từ HTTP body hoặc cột JSON) về dạng an toàn để gửi Zalo.
 * Bỏ mã lạ, bỏ khoảng rỗng/âm, cắt phần tràn khỏi `textLength`.
 */
export function normalizeZaloStyles(raw: unknown, textLength: number): ZaloStyle[] {
  if (!Array.isArray(raw) || textLength <= 0) return [];
  const out: ZaloStyle[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { st, start, len } = item as Record<string, unknown>;
    if (typeof st !== 'string' || !VALID_ST.test(st)) continue;
    if (!Number.isInteger(start) || !Number.isInteger(len)) continue;
    const s = start as number;
    const l = len as number;
    if (s < 0 || s >= textLength || l <= 0) continue;
    // Cắt đuôi tràn thay vì bỏ cả khoảng — chữ vẫn được định dạng đúng phần còn lại.
    out.push({ st, start: s, len: Math.min(l, textLength - s) });
  }
  return out;
}

/**
 * Đọc cột `MessageTemplate.contentRich` (JSON `{ text, styles }`).
 * `text` truyền vào là nguồn sự thật (cột `content` phẳng) — contentRich chỉ góp styles,
 * nên bản ghi cũ có contentRich lệch nhịp cũng không làm sai nội dung gửi đi.
 */
export function stylesFromContentRich(raw: unknown, text: string): ZaloStyle[] {
  if (!raw || typeof raw !== 'object') return [];
  return normalizeZaloStyles((raw as { styles?: unknown }).styles, text.length);
}

/**
 * `.trim()` có nhận biết định dạng: dời `start` theo số ký tự đầu bị cắt rồi
 * cắt phần tràn ở đuôi. Trim thẳng sẽ làm mọi khoảng lệch trái → sai chỗ tô màu.
 */
export function trimRich(text: string, styles: ZaloStyle[]): { text: string; styles: ZaloStyle[] } {
  const trimmed = text.trim();
  if (trimmed === text) return { text, styles: normalizeZaloStyles(styles, text.length) };
  if (!trimmed) return { text: '', styles: [] };
  const offset = text.indexOf(trimmed);
  const shifted: ZaloStyle[] = [];
  for (const s of styles) {
    // Khoảng có thể phủ cả phần khoảng trắng bị cắt → kẹp về biên của chuỗi mới.
    const start = Math.max(0, s.start - offset);
    const end = Math.min(trimmed.length, s.start + s.len - offset);
    if (end > start) shifted.push({ st: s.st, start, len: end - start });
  }
  return { text: trimmed, styles: shifted };
}

/**
 * Dựng giá trị cột `Message.content` cho tin có định dạng — khớp ĐÚNG khuôn Zalo
 * echo về, để bong bóng chat render giống nhau dù tin do ta gửi hay Zalo đẩy sang.
 * Không có style thì trả plain text (đừng bọc JSON thừa).
 */
export function buildRtfContent(text: string, styles: ZaloStyle[]): string {
  if (!styles.length) return text;
  return JSON.stringify({ title: text, action: 'rtf', params: JSON.stringify({ styles }) });
}
