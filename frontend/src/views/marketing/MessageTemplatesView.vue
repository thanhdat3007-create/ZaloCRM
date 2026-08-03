<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  MessageTemplatesView — quản lý mẫu tin bản Community (chữ + đính kèm).
  Dùng endpoint CE `/message-templates`, không đụng `/automation/templates` của EE.
-->
<template>
  <div class="d-flex flex-column h-100">
    <div class="d-flex align-center pa-4 pb-2 gap-3">
      <div>
        <div class="text-caption text-medium-emphasis">Marketing / Mẫu tin</div>
        <h1 class="text-h5">Mẫu tin</h1>
      </div>
      <v-spacer />
      <v-text-field
        v-model="search"
        placeholder="Tìm mẫu tin..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 280px"
        @update:model-value="fetchTemplates(search)"
      />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="editorTemplateId = undefined; showEditor = true">
        Tạo mẫu tin
      </v-btn>
    </div>

    <div class="flex-1-1 overflow-auto px-4 pb-4">
      <v-card variant="outlined">
        <v-data-table
          :headers="headers"
          :items="templates"
          :loading="loading"
          density="comfortable"
          no-data-text="Chưa có mẫu tin nào"
        >
          <template #item.content="{ item }">
            <span class="text-truncate d-inline-block" style="max-width: 420px">
              {{ item.content || '(chỉ có đính kèm)' }}
            </span>
          </template>
          <template #item.attachments="{ item }">
            {{ item.attachments?.length ?? 0 }}
          </template>
          <template #item.visibility="{ item }">
            <v-chip size="small" variant="tonal" :color="item.visibility === 'public' ? 'primary' : 'grey'">
              {{ item.visibility === 'public' ? 'Công khai' : 'Riêng tư' }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn icon="mdi-pencil" size="small" variant="text" @click="editorTemplateId = item.id; showEditor = true" />
            <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" @click="remove(item.id)" />
          </template>
        </v-data-table>
      </v-card>
    </div>

    <TemplateEditorDialog
      v-if="showEditor"
      :template-id="editorTemplateId"
      @close="showEditor = false"
      @saved="onSaved"
    />

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="5000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import TemplateEditorDialog from '@/components/marketing/TemplateEditorDialog.vue';
import { useCeMessageTemplates } from '@/composables/use-ce-message-templates';

const { templates, loading, error, fetchTemplates, deleteTemplate } = useCeMessageTemplates();

const search = ref('');
const showEditor = ref(false);
const editorTemplateId = ref<string | undefined>(undefined);

const headers = [
  { title: 'Tên', key: 'name' },
  { title: 'Nội dung', key: 'content', sortable: false },
  { title: 'Đính kèm', key: 'attachments', sortable: false },
  { title: 'Quyền xem', key: 'visibility' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  Object.assign(snack, { show: true, message, color });
}

async function onSaved() {
  showEditor.value = false;
  await fetchTemplates(search.value);
  notify('Đã lưu mẫu tin');
}

async function remove(id: string) {
  if (!confirm('Xoá mẫu tin này?')) return;
  const ok = await deleteTemplate(id);
  // Mẫu đang có chiến dịch chạy → server trả 409 kèm tên chiến dịch.
  if (!ok) return notify(error.value || 'Không xoá được mẫu tin', 'error');
  notify('Đã xoá mẫu tin');
  await fetchTemplates(search.value);
}

onMounted(() => fetchTemplates());
</script>
