<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  TemplateEditorDialog — soạn mẫu tin Community (chữ + đính kèm từ Kho phương tiện).
  Thứ tự đính kèm = thứ tự gửi đi; kéo lên/xuống để sắp lại.
  Dùng endpoint CE `/message-templates` qua use-ce-message-templates.
-->
<template>
  <v-dialog :model-value="true" max-width="720" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>{{ templateId ? 'Sửa mẫu tin' : 'Tạo mẫu tin' }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" density="comfortable" @click="emit('close')" />
      </v-card-title>
      <v-divider />

      <v-card-text class="d-flex flex-column gap-3">
        <v-text-field
          v-model="name"
          label="Tên mẫu tin"
          variant="outlined"
          density="compact"
          counter="120"
          maxlength="120"
          hide-details="auto"
        />

        <div>
          <div class="text-subtitle-2 mb-1">Nội dung chữ</div>
          <RichTextEditor
            ref="editorRef"
            v-model="content"
            :show-toolbar="true"
            :submit-on-enter="false"
            placeholder="Để trống nếu chỉ gửi ảnh/tệp"
            class="tpl-rich"
          />
          <div class="text-caption text-medium-emphasis mt-1">
            Bôi đen chữ rồi bấm nút trên thanh công cụ để in đậm, tô màu, đổi cỡ — khách nhận đúng định dạng này trên Zalo.
          </div>
        </div>

        <v-select
          v-model="visibility"
          :items="[
            { title: 'Riêng tư (chỉ mình tôi)', value: 'private' },
            { title: 'Công khai (cả tổ chức)', value: 'public' },
          ]"
          label="Quyền xem"
          variant="outlined"
          density="compact"
          hide-details
        />

        <!-- Đính kèm -->
        <div>
          <div class="d-flex align-center mb-2">
            <span class="text-subtitle-2">
              Đính kèm ({{ attachments.length }}/{{ MAX_ATTACHMENTS }})
            </span>
            <v-spacer />
            <v-btn
              size="small"
              variant="outlined"
              prepend-icon="mdi-image-plus"
              :disabled="attachments.length >= MAX_ATTACHMENTS"
              @click="pickerKind = 'image'"
            >
              Thêm ảnh
            </v-btn>
            <v-btn
              size="small"
              variant="outlined"
              class="ml-2"
              prepend-icon="mdi-file-plus"
              :disabled="attachments.length >= MAX_ATTACHMENTS"
              @click="pickerKind = 'file'"
            >
              Thêm tệp
            </v-btn>
          </div>

          <v-list v-if="attachments.length" density="compact" class="border rounded">
            <v-list-item v-for="(a, i) in attachments" :key="a.mediaAssetId">
              <template #prepend>
                <v-avatar rounded size="40" class="mr-2">
                  <v-img v-if="a.kind === 'image' && a.previewUrl" :src="a.previewUrl" cover />
                  <v-icon v-else>{{ a.kind === 'video' ? 'mdi-video' : 'mdi-file' }}</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title>{{ a.name }}</v-list-item-title>
              <v-list-item-subtitle v-if="a.kind !== 'file'">
                <v-text-field
                  v-model="a.caption"
                  placeholder="Chú thích (tuỳ chọn)"
                  variant="plain"
                  density="compact"
                  hide-details
                  maxlength="500"
                />
              </v-list-item-subtitle>
              <template #append>
                <v-btn icon="mdi-arrow-up" variant="text" size="small" :disabled="i === 0" @click="move(i, -1)" />
                <v-btn icon="mdi-arrow-down" variant="text" size="small" :disabled="i === attachments.length - 1" @click="move(i, 1)" />
                <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="attachments.splice(i, 1)" />
              </template>
            </v-list-item>
          </v-list>
          <div v-else class="text-caption text-medium-emphasis">
            Chưa có đính kèm. Nhiều ảnh sẽ gộp thành 1 album — chỉ tốn 1 lượt gửi.
          </div>
        </div>

        <v-alert v-if="errorMessage" type="error" variant="tonal" density="compact">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('close')">Huỷ</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" :disabled="!canSave" @click="save">
          Lưu mẫu tin
        </v-btn>
      </v-card-actions>
    </v-card>

    <MediaPickerDialog
      v-if="pickerKind"
      multiple
      :kind="pickerKind"
      @close="pickerKind = null"
      @pick="onPick"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import MediaPickerDialog from '@/components/media/MediaPickerDialog.vue';
import RichTextEditor from '@/components/chat/rich-text-editor.vue';
import type { MediaAssetItem } from '@/api/media';
import {
  useCeMessageTemplates,
  type CeMessageTemplate,
  type CeZaloStyle,
} from '@/composables/use-ce-message-templates';

const props = defineProps<{ templateId?: string }>();
const emit = defineEmits<{ close: []; saved: [template: CeMessageTemplate] }>();

/** Khớp trần server (message-template-service.ts). */
const MAX_ATTACHMENTS = 12;

interface DraftAttachment {
  mediaAssetId: string;
  kind: 'image' | 'video' | 'file';
  name: string;
  caption: string;
  previewUrl: string | null;
}

/**
 * `modelValue` của RichTextEditor là PLAIN TEXT (không phải HTML) — định dạng nằm
 * riêng trong `getRichPayload().styles`, nên phải đọc qua ref lúc lưu chứ không
 * suy ra được từ `content`.
 */
type RichEditorExposed = {
  getRichPayload: () => { text: string; styles: CeZaloStyle[] };
  applyRichPayload: (p: { text: string; styles?: CeZaloStyle[] }, opts?: { focus?: boolean }) => void;
};

const { createTemplate, updateTemplate, fetchTemplate, saving, error } = useCeMessageTemplates();

const editorRef = ref<RichEditorExposed | null>(null);
const name = ref('');
const content = ref('');
const visibility = ref<'public' | 'private'>('private');
const attachments = ref<DraftAttachment[]>([]);
const pickerKind = ref<'image' | 'video' | 'file' | null>(null);
const localError = ref('');

const errorMessage = computed(() => localError.value || error.value);

// Mẫu hợp lệ khi có tên và (chữ hoặc ≥1 đính kèm) — khớp rule TEMPLATE_EMPTY.
const canSave = computed(
  () => name.value.trim().length > 0 && (content.value.trim().length > 0 || attachments.value.length > 0),
);

onMounted(async () => {
  if (!props.templateId) return;
  const loaded = await fetchTemplate(props.templateId);
  if (!loaded) return;
  name.value = loaded.template.name;
  content.value = loaded.template.content;
  visibility.value = loaded.template.visibility;
  // Nạp lại định dạng: `content` mới chỉ dựng chữ trơ trong editor. Chờ nextTick để
  // RichTextEditor mount xong rồi mới applyRichPayload — gọi sớm thì ref còn null.
  await nextTick();
  editorRef.value?.applyRichPayload({
    text: loaded.template.content,
    styles: loaded.template.contentRich?.styles ?? [],
  });
  // Bỏ hẳn đính kèm đã bị xoá khỏi kho: gửi lại id đó khi lưu sẽ luôn 422
  // ASSET_NOT_ACCESSIBLE, khoá cứng việc sửa mẫu. Báo cho người dùng biết.
  const missing = loaded.attachments.filter((a) => a.missing);
  if (missing.length > 0) {
    localError.value =
      `Đã bỏ ${missing.length} đính kèm không còn trong kho: ` +
      missing.map((a) => a.name || a.mediaAssetId).join(', ');
  }
  attachments.value = loaded.attachments
    .filter((a) => !a.missing)
    .map((a) => ({
      mediaAssetId: a.mediaAssetId,
      kind: a.kind,
      name: a.name,
      caption: a.caption,
      previewUrl: a.blobUrl || null,
    }));
});

function onPick(assets: MediaAssetItem[]) {
  const existing = new Set(attachments.value.map((a) => a.mediaAssetId));
  for (const asset of assets) {
    if (existing.has(asset.id)) continue;
    if (attachments.value.length >= MAX_ATTACHMENTS) {
      localError.value = `Tối đa ${MAX_ATTACHMENTS} đính kèm mỗi mẫu tin`;
      break;
    }
    attachments.value.push({
      mediaAssetId: asset.id,
      kind: asset.kind,
      name: asset.name,
      caption: '',
      previewUrl: asset.thumbnailUrl ?? asset.url,
    });
  }
  pickerKind.value = null;
}

function move(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= attachments.value.length) return;
  const list = attachments.value;
  [list[index], list[target]] = [list[target], list[index]];
}

async function save() {
  localError.value = '';
  // Nguồn sự thật lúc lưu là editor, KHÔNG phải `content`: styles chỉ có ở payload,
  // và `text` phải lấy cùng lượt để offset của styles khớp từng ký tự.
  const rich = editorRef.value?.getRichPayload() ?? { text: content.value, styles: [] };
  const payload = {
    name: name.value.trim(),
    content: rich.text,
    contentRich: { text: rich.text, styles: rich.styles },
    visibility: visibility.value,
    attachments: attachments.value.map((a) => ({ mediaAssetId: a.mediaAssetId, caption: a.caption })),
  };
  const saved = props.templateId
    ? await updateTemplate(props.templateId, payload)
    : await createTemplate(payload);
  if (saved) emit('saved', saved);
}
</script>

<style scoped>
/* Vùng soạn cao thoáng như ô cũ (v-textarea rows=5), vẫn cuộn khi mẫu dài. */
.tpl-rich :deep(.tiptap-input) { min-height: 140px; max-height: 320px; font-size: 13.5px; }
</style>
