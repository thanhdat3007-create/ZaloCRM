// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * chat-media-helpers.ts — tiện ích tải media (URL → file tmp) + extract msgId,
 * dùng chung cho forward-media (chat-operations-routes) VÀ gửi Khối vào hội thoại
 * (chat-routes /send-block).
 *
 * 2026-06-07 — tách từ chat-operations-routes.ts (vốn private) để endpoint send-block
 * tái dùng đúng đường media đã được chứng minh: tải URL về tmp rồi đưa LOCAL PATH cho
 * zca-js (api.sendMessage attachments cần path, KHÔNG nhận URL).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../../config/index.js';
import { getObjectBuffer, keyFromPublicUrl } from '../../shared/storage/minio-client.js';

/** Extract zaloMsgId từ nhiều shape trả về của zca-js (text/media/forward). */
export function extractZaloMsgId(result: unknown): string {
  const sr = result as {
    msgId?: string | number;
    data?: { msgId?: string | number };
    message?: { msgId?: string | number } | null;
    attachment?: Array<{ msgId?: string | number }>;
  } | null;
  const raw = sr?.message?.msgId ?? sr?.attachment?.[0]?.msgId ?? sr?.data?.msgId ?? sr?.msgId ?? '';
  return String(raw || '');
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const au = new URL(a);
    const bu = new URL(b);
    return au.protocol === bu.protocol && au.host === bu.host;
  } catch {
    return false;
  }
}

/**
 * Trả các URL ứng viên để tải media: ưu tiên URL gốc, kèm fallback dịch s3PublicUrl
 * → s3Endpoint (khi bucket nội bộ không expose public host).
 */
export function candidateDownloadUrls(url: string): string[] {
  const candidates = [url];
  try {
    if (sameOrigin(url, config.s3PublicUrl)) {
      const publicUrl = new URL(config.s3PublicUrl);
      const endpoint = new URL(config.s3Endpoint);
      const original = new URL(url);
      original.protocol = endpoint.protocol;
      original.host = endpoint.host;
      const publicPath = publicUrl.pathname.replace(/\/$/, '');
      if (publicPath && original.pathname.startsWith(publicPath)) {
        original.pathname = original.pathname.slice(publicPath.length) || '/';
      }
      candidates.push(original.toString());
    }
  } catch {
    // keep original only
  }
  return [...new Set(candidates)];
}

// Ký tự bị cấm trong tên file Windows/đường dẫn: \ / : * ? " < > |
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]+/g;
// Ký tự điều khiển 0x00–0x1f (dựng từ codepoint để source chỉ chứa ASCII in được —
// tránh nhúng byte điều khiển thô vào file gây hỏng khi tool khác lưu lại).
const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']+', 'g');

function sanitizeFileName(value?: string): string | undefined {
  // GIỮ chữ Unicode (tiếng Việt có dấu) + dấu cách + gạch ngang + (). KHÔNG dùng \w (chỉ ASCII)
  // vì \w biến "BẢNG VẬT LIỆU.pdf" → "B_NG V_T LI_U.pdf" (khách nhận file thấy tên xấu).
  // Chỉ thay ký tự CẤM trong tên file + ký tự điều khiển. Đuôi (.) luôn giữ.
  const cleaned = value
    ?.replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(CONTROL_CHARS, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || undefined;
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image': return '.jpg';
    case 'video': return '.mp4';
    case 'voice':
    case 'audio': return '.mp3';
    default: return '';
  }
}

export function filenameFromUrl(url: string, contentType: string, fallback?: string): string {
  const cleanFallback = sanitizeFileName(fallback);
  if (cleanFallback) return cleanFallback;
  try {
    const name = new URL(url).pathname.split('/').filter(Boolean).pop();
    const cleanName = sanitizeFileName(name ? decodeURIComponent(name) : undefined);
    if (cleanName) return cleanName;
  } catch {
    // fall through
  }
  return `forward-${contentType}${extensionForContentType(contentType)}`;
}

/** Prefix route tĩnh phục vụ file của local driver (đăng ký trong app.ts). */
const LOCAL_FILES_PREFIX = '/files/';

/**
 * Object key trong kho ứng với một public URL, '' nếu URL không thuộc kho.
 *
 * Ngoài `keyFromPublicUrl` (khớp base hiện tại), còn bóc theo path `/files/` để
 * nhận cả URL CŨ đã đóng băng trong DB với host/cổng khác — publicUrl được sinh
 * lúc upload theo APP_URL lúc đó, nên đổi cổng/đổi domain là hàng loạt blob cũ
 * không còn khớp base mới.
 */
function storageKeyFor(url: string): string {
  const key = keyFromPublicUrl(url);
  if (key) return key;
  const at = url.indexOf(LOCAL_FILES_PREFIX);
  if (at < 0) return '';
  try {
    return decodeURIComponent(url.slice(at + LOCAL_FILES_PREFIX.length).split('?')[0]);
  } catch {
    return '';
  }
}

/**
 * Đọc bytes của một URL media.
 *
 * Blob của KHO đọc THẲNG từ storage (đĩa hoặc S3), KHÔNG đi HTTP: host:port trong
 * publicUrl là địa chỉ cho trình duyệt, thường không gọi được từ chính tiến trình
 * backend — container map `3080:3000` nên `http://localhost:3080/files/...` bên
 * trong container là ECONNREFUSED ("fetch failed"), làm gãy gửi ảnh ở gửi nhóm
 * hàng loạt. Chỉ URL ngoài (CDN Zalo) mới tải qua HTTP.
 */
export async function readMediaBytes(url: string): Promise<Buffer> {
  const key = storageKeyFor(url);
  if (key) {
    const buffer = await getObjectBuffer(key);
    if (buffer && buffer.length > 0) return buffer;
  }

  let lastError: unknown;
  for (const candidate of candidateDownloadUrls(url)) {
    try {
      const response = await fetch(candidate, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error('empty response');
      return buffer;
    } catch (err) {
      lastError = err;
    }
  }
  const detail = (lastError as Error)?.message ?? String(lastError);
  throw new Error(
    key
      ? `Không tải được file media để gửi: không thấy "${key}" trong kho (${detail})`
      : `Không tải được file media để gửi: ${detail}`,
  );
}

/**
 * Tải 1 URL media về file tmp, trả { path, cleanup }.
 * Gọi cleanup() trong finally để xoá thư mục tmp sau khi gửi xong.
 */
export async function downloadMediaToTemp(
  media: { url: string; filename?: string },
  contentType: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const buffer = await readMediaBytes(media.url);
  const dir = await mkdtemp(path.join(tmpdir(), 'zalocrm-forward-'));
  const filePath = path.join(dir, filenameFromUrl(media.url, contentType, media.filename));
  try {
    await writeFile(filePath, buffer);
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  return { path: filePath, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
