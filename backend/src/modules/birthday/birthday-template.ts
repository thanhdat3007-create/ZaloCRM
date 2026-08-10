// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Chúc sinh nhật (🟢 Community) — thay biến trong mẫu tin. THUẦN HÀM.
// ════════════════════════════════════════════════════════════════════════
//
// Bộ render biến đầy đủ ({province}, {score}, {next_appt}…) nằm ở bundle EE và
// core gọi qua `ee-registry/automation.renderTemplate`. Bản Community KHÔNG có
// bundle đó — hook trả nguyên văn, nên tin chúc sẽ gửi đi kèm chữ "{name}".
//
// Với lời chúc sinh nhật thì đó là lỗi nặng: một lời chúc sai tên còn tệ hơn
// không chúc. Nên ở đây có bộ thay biến TỐI THIỂU, chỉ vài biến lấy thẳng từ
// Contact, chạy SAU hook EE:
//   - Có bundle EE  → hook đã thay hết, không còn `{…}` nào, hàm này thành no-op.
//   - Community     → hàm này thay phần cốt lõi (xưng hô + tên + tuổi).
// Placeholder không nhận ra được XOÁ khỏi tin (kèm khoảng trắng thừa) — thà
// thiếu một chi tiết còn hơn gửi cho khách một dòng chữ lộ code.

/** Placeholder dạng {ten_bien} — khớp đúng bộ biến của UI soạn mẫu tin. */
const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;

export interface BirthdayTemplateContact {
  fullName: string | null;
  crmName: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  birthYear: number | null;
  birthDate: Date | null;
}

export interface BirthdayTemplateVars {
  contact: BirthdayTemplateContact;
  /** Tên sale phụ trách — cho {sale} / {sale_full}. */
  saleFullName: string | null;
  /** Mốc thời gian tính tuổi; mặc định "bây giờ" của người gọi. */
  now: Date;
}

/** 'Trần Văn Lộc' → 'Lộc'. Tên người Việt: chữ CUỐI là tên gọi. */
function lastWord(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Xưng hô theo giới tính. 'other'/'unknown'/null → 'Anh Chị' (an toàn hai chiều). */
function genderWord(gender: string | null): string {
  if (gender === 'male') return 'Anh';
  if (gender === 'female') return 'Chị';
  return 'Anh Chị';
}

/**
 * Tuổi tính theo `birthDate` (chuẩn hơn) rồi mới tới `birthYear`.
 *
 * Ngày sinh lưu ở cột `@db.Date` nên đọc theo UTC — đọc theo giờ máy chủ sẽ lệch
 * một ngày ở múi giờ âm và làm tuổi sai đúng vào hôm sinh nhật.
 */
function ageOf(contact: BirthdayTemplateContact, now: Date): number | null {
  if (contact.birthDate) {
    const born = contact.birthDate;
    let age = now.getUTCFullYear() - born.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - born.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age--;
    return age >= 0 ? age : null;
  }
  if (contact.birthYear) {
    const age = now.getUTCFullYear() - contact.birthYear;
    return age >= 0 ? age : null;
  }
  return null;
}

/** Bảng giá trị cho bộ biến tối thiểu. `null` = không có dữ liệu → xoá placeholder. */
function buildValues(vars: BirthdayTemplateVars): Record<string, string | null> {
  const { contact, saleFullName, now } = vars;
  const name = contact.fullName?.trim() || null;
  // Tên gợi nhớ do sale tự đặt sát thực tế hơn tên import → ưu tiên, rồi mới fullName.
  const crm = contact.crmName?.trim() || name;
  const sale = saleFullName?.trim() || null;
  const age = ageOf(contact, now);

  return {
    gender: genderWord(contact.gender),
    name: name ? lastWord(name) : null,
    name_full: name,
    name_first: name ? firstWord(name) : null,
    crm_full: crm,
    crm_first: crm ? firstWord(crm) : null,
    crm_last: crm ? lastWord(crm) : null,
    sale: sale ? lastWord(sale) : null,
    sale_full: sale,
    phone: contact.phone?.trim() || null,
    email: contact.email?.trim() || null,
    occupation: contact.occupation?.trim() || null,
    age: age === null ? null : String(age),
  };
}

/**
 * Thay biến còn sót trong `raw`. Gọi SAU `ee-registry.renderTemplate`.
 *
 * Placeholder không có giá trị (hoặc không thuộc bộ biến này) bị xoá; khoảng
 * trắng đôi và khoảng trắng cuối dòng được dọn lại để câu không hở.
 */
export function renderBirthdayFallback(raw: string, vars: BirthdayTemplateVars): string {
  if (!raw.includes('{')) return raw;
  const values = buildValues(vars);
  const replaced = raw.replace(PLACEHOLDER_RE, (_match, key: string) => values[key] ?? '');
  return replaced
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/^[^\S\n]+/gm, '');
}
