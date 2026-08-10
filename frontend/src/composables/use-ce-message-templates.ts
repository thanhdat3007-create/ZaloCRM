// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * use-ce-message-templates.ts — Mẫu tin bản Community.
 *
 * Trỏ `/message-templates` (endpoint CE). KHÔNG sửa `use-message-templates.ts`
 * cũ — composable đó trỏ `/automation/templates` của EE, hai bên chạy song song.
 */
import { ref } from 'vue';
import { api } from '@/api';

export interface CeTemplateAttachmentInput {
  mediaAssetId: string;
  caption?: string;
}

/** Đính kèm đã resolve từ server (kèm URL blob nội bộ để preview). */
export interface CeResolvedAttachment {
  mediaAssetId: string;
  kind: 'image' | 'video' | 'file';
  name: string;
  caption: string;
  blobUrl: string;
  /** Asset đã bị xoá khỏi kho — UI cảnh báo đỏ, worker sẽ bỏ qua. */
  missing: boolean;
}

/** Khoảng định dạng Zalo: b/i/u/s, c_RRGGBB (màu), f_NN (cỡ), lst_1/lst_2 (danh sách). */
export interface CeZaloStyle {
  st: string;
  start: number;
  len: number;
}

/** `text` LUÔN bằng `content` — server derive lại, client chỉ đóng góp `styles`. */
export interface CeContentRich {
  text: string;
  styles: CeZaloStyle[];
}

export interface CeMessageTemplate {
  id: string;
  name: string;
  content: string;
  /** null với mẫu cũ tạo trước khi có định dạng → coi như không có style. */
  contentRich: CeContentRich | null;
  visibility: 'public' | 'private';
  folderId: string | null;
  tagIds: string[];
  attachments: CeTemplateAttachmentInput[];
  updatedAt?: string;
}

export interface CeTemplatePayload {
  name: string;
  content: string;
  /** Gửi KÈM `content` mỗi lần sửa chữ — thiếu nó server sẽ bỏ định dạng cũ. */
  contentRich?: CeContentRich;
  visibility?: 'public' | 'private';
  attachments?: CeTemplateAttachmentInput[];
}

const BASE = '/message-templates';

export function useCeMessageTemplates() {
  const templates = ref<CeMessageTemplate[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');

  async function fetchTemplates(search?: string): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get(BASE, { params: search ? { search } : {} });
      templates.value = res.data.templates ?? [];
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không tải được danh sách mẫu tin';
    } finally {
      loading.value = false;
    }
  }

  /** Lấy 1 mẫu kèm đính kèm ĐÃ RESOLVE (URL blob + cờ missing) để preview. */
  async function fetchTemplate(
    id: string,
  ): Promise<{ template: CeMessageTemplate; attachments: CeResolvedAttachment[] } | null> {
    try {
      const res = await api.get(`${BASE}/${id}`);
      return { template: res.data.template, attachments: res.data.attachments ?? [] };
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không tải được mẫu tin';
      return null;
    }
  }

  async function createTemplate(payload: CeTemplatePayload): Promise<CeMessageTemplate | null> {
    saving.value = true;
    error.value = '';
    try {
      const res = await api.post(BASE, payload);
      return res.data.template;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không tạo được mẫu tin';
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateTemplate(
    id: string, payload: Partial<CeTemplatePayload>,
  ): Promise<CeMessageTemplate | null> {
    saving.value = true;
    error.value = '';
    try {
      const res = await api.patch(`${BASE}/${id}`, payload);
      return res.data.template;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không cập nhật được mẫu tin';
      return null;
    } finally {
      saving.value = false;
    }
  }

  /** Xoá mềm. Mẫu đang có chiến dịch chạy → server trả 409 TEMPLATE_IN_USE. */
  async function deleteTemplate(id: string): Promise<boolean> {
    error.value = '';
    try {
      await api.delete(`${BASE}/${id}`);
      return true;
    } catch (err: any) {
      const data = err?.response?.data;
      error.value =
        data?.code === 'TEMPLATE_IN_USE'
          ? `${data.error}: ${(data.broadcasts ?? []).map((b: any) => b.name).join(', ')}`
          : (data?.error ?? 'Không xoá được mẫu tin');
      return false;
    }
  }

  return {
    templates, loading, saving, error,
    fetchTemplates, fetchTemplate, createTemplate, updateTemplate, deleteTemplate,
  };
}
