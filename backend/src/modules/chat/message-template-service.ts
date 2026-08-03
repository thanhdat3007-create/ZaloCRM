// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * message-template-service.ts — Mẫu tin Community (🟢 Community).
 *
 * Validate + resolve đính kèm cho mẫu tin. Đính kèm lưu trong cột JSON
 * `MessageTemplate.attachments` (mảng, GIỮ THỨ TỰ = thứ tự gửi đi), mỗi phần tử
 * trỏ 1 `MediaAsset` của cùng org.
 *
 * Không dùng FK cho mảng → asset có thể bị xoá sau khi mẫu đã lưu. Khi đó
 * `resolveTemplateAttachments` trả `missing: true` để worker bỏ qua phần tử đó
 * và ghi cảnh báo, thay vì làm gãy cả lượt gửi.
 *
 * Community feature — KHÔNG import `_ee`.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { userHasGrant } from '../rbac/permission-group-service.js';

/** Trần đính kèm — khớp trần album 12 ảnh của POST /media/album/send. */
export const MAX_TEMPLATE_ATTACHMENTS = 12;
/** Chú thích tối đa cho ảnh/video. */
export const MAX_CAPTION_LENGTH = 500;
/** Tên mẫu tối đa. */
export const MAX_TEMPLATE_NAME_LENGTH = 120;

export type AttachmentKind = 'image' | 'video' | 'file';

/** Phần tử lưu trong cột JSON `attachments`. */
export interface StoredAttachment {
  mediaAssetId: string;
  kind: AttachmentKind;
  caption: string;
}

/** Đính kèm đã resolve — dùng cho worker gửi và preview UI. */
export interface ResolvedAttachment {
  mediaAssetId: string;
  kind: AttachmentKind;
  name: string;
  caption: string;
  /** URL blob nội bộ (MinIO). Rỗng khi `missing`. */
  blobUrl: string;
  /** Asset đã xoá/archive hoặc không còn blob → bỏ qua khi gửi. */
  missing: boolean;
}

export interface ValidationFailure {
  code: string;
  message: string;
  /** Danh sách id gây lỗi (chỉ có với ASSET_NOT_ACCESSIBLE). */
  assetIds?: string[];
}

export interface AttachmentInput {
  mediaAssetId?: unknown;
  caption?: unknown;
}

/**
 * Validate danh sách đính kèm client gửi lên và chuẩn hoá về `StoredAttachment[]`.
 *
 * `kind` KHÔNG nhận từ client — luôn đọc từ `MediaAsset.kind` để client không
 * giả được loại (VD khai ảnh là file để né trần album).
 */
export async function validateAttachments(
  orgId: string,
  userId: string,
  input: unknown,
): Promise<{ ok: true; attachments: StoredAttachment[] } | { ok: false; error: ValidationFailure }> {
  if (input === undefined || input === null) return { ok: true, attachments: [] };
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: 'INVALID_ATTACHMENTS', message: 'attachments phải là mảng' } };
  }
  if (input.length === 0) return { ok: true, attachments: [] };
  if (input.length > MAX_TEMPLATE_ATTACHMENTS) {
    return {
      ok: false,
      error: {
        code: 'TOO_MANY_ATTACHMENTS',
        message: `Tối đa ${MAX_TEMPLATE_ATTACHMENTS} đính kèm mỗi mẫu tin`,
      },
    };
  }

  const items = input as AttachmentInput[];
  const ids: string[] = [];
  for (const item of items) {
    const id = typeof item?.mediaAssetId === 'string' ? item.mediaAssetId.trim() : '';
    if (!id) {
      return { ok: false, error: { code: 'INVALID_ATTACHMENTS', message: 'Thiếu mediaAssetId' } };
    }
    const caption = typeof item?.caption === 'string' ? item.caption : '';
    if (caption.length > MAX_CAPTION_LENGTH) {
      return {
        ok: false,
        error: { code: 'CAPTION_TOO_LONG', message: `Chú thích tối đa ${MAX_CAPTION_LENGTH} ký tự` },
      };
    }
    ids.push(id);
  }

  // Scope xem: chủ sở hữu, hoặc asset public, hoặc có grant media.view_all.
  const canViewAll = await userHasGrant(userId, 'media', 'view_all');
  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: { in: [...new Set(ids)] },
      orgId,
      archivedAt: null,
      ...(canViewAll ? {} : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] }),
    },
    select: { id: true, kind: true },
  });
  const byId = new Map(assets.map((a) => [a.id, a]));
  const inaccessible = [...new Set(ids)].filter((id) => !byId.has(id));
  if (inaccessible.length > 0) {
    return {
      ok: false,
      error: {
        code: 'ASSET_NOT_ACCESSIBLE',
        message: 'Có đính kèm không tồn tại hoặc bạn không có quyền dùng',
        assetIds: inaccessible,
      },
    };
  }

  // Giữ nguyên thứ tự client gửi — thứ tự này là thứ tự gửi đi.
  const attachments: StoredAttachment[] = items.map((item, i) => ({
    mediaAssetId: ids[i],
    kind: (byId.get(ids[i])!.kind as AttachmentKind) ?? 'file',
    caption: typeof item?.caption === 'string' ? item.caption : '',
  }));
  return { ok: true, attachments };
}

/**
 * Validate phần chữ + tên của mẫu tin. Mẫu phải có chữ HOẶC ít nhất 1 đính kèm.
 */
export function validateTemplateInput(args: {
  name: unknown;
  content: unknown;
  attachmentCount: number;
}): ValidationFailure | null {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) return { code: 'NAME_REQUIRED', message: 'Tên mẫu tin là bắt buộc' };
  if (name.length > MAX_TEMPLATE_NAME_LENGTH) {
    return {
      code: 'NAME_TOO_LONG',
      message: `Tên mẫu tin tối đa ${MAX_TEMPLATE_NAME_LENGTH} ký tự`,
    };
  }
  const content = typeof args.content === 'string' ? args.content : '';
  if (!content.trim() && args.attachmentCount === 0) {
    return { code: 'TEMPLATE_EMPTY', message: 'Mẫu tin phải có nội dung chữ hoặc ít nhất 1 đính kèm' };
  }
  return null;
}

/** Đọc cột JSON `attachments` về dạng `StoredAttachment[]` (bỏ phần tử hỏng). */
export function parseStoredAttachments(raw: unknown): StoredAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAttachment[] = [];
  for (const item of raw) {
    const id = (item as StoredAttachment)?.mediaAssetId;
    if (typeof id !== 'string' || !id) continue;
    const kind = (item as StoredAttachment)?.kind;
    out.push({
      mediaAssetId: id,
      kind: kind === 'image' || kind === 'video' || kind === 'file' ? kind : 'file',
      caption: typeof (item as StoredAttachment)?.caption === 'string' ? (item as StoredAttachment).caption : '',
    });
  }
  return out;
}

/**
 * Resolve đính kèm của mẫu tin thành URL blob nội bộ để gửi / preview.
 *
 * Chọn variant giống `POST /media/album/send`: watermark BẬT và có bản watermarked
 * → dùng bản đó, ngược lại dùng bản gốc. Gửi từ blob nội bộ (MinIO) thay vì URL
 * CDN Zalo vì URL CDN hết hạn.
 *
 * KHÔNG lọc theo người dùng: worker chạy nền không có ngữ cảnh user; quyền đã
 * được kiểm lúc lưu mẫu.
 */
export async function resolveTemplateAttachments(
  orgId: string,
  attachments: unknown,
): Promise<ResolvedAttachment[]> {
  const stored = parseStoredAttachments(attachments);
  if (stored.length === 0) return [];

  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: [...new Set(stored.map((a) => a.mediaAssetId))] }, orgId, archivedAt: null },
    select: {
      id: true,
      kind: true,
      name: true,
      watermarkEnabled: true,
      blobs: {
        where: { variantType: { in: ['original', 'watermarked'] } },
        select: { variantType: true, publicUrl: true },
      },
    },
  });
  const byId = new Map(assets.map((a) => [a.id, a]));

  return stored.map((item) => {
    const asset = byId.get(item.mediaAssetId);
    if (!asset) {
      return { ...item, name: '', blobUrl: '', missing: true };
    }
    const original = asset.blobs.find((b) => b.variantType === 'original');
    const watermarked = asset.blobs.find((b) => b.variantType === 'watermarked');
    const blob = asset.watermarkEnabled && watermarked ? watermarked : original;
    return {
      mediaAssetId: item.mediaAssetId,
      // Tin `kind` của asset thật, không tin bản snapshot trong JSON.
      kind: (asset.kind as AttachmentKind) ?? item.kind,
      name: asset.name,
      caption: item.caption,
      blobUrl: blob?.publicUrl ?? '',
      missing: !blob?.publicUrl,
    };
  });
}
