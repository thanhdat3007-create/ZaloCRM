<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  AiKnowledgePage.vue — kho tài liệu cho AI agent (2026-08-03).
  Ô "Thử tìm kiếm" cho phép kiểm chứng tài liệu có tìm được không TRƯỚC khi bật agent.
-->
<template>
  <div class="kb-page">
    <header class="kb-header">
      <div>
        <h1 class="kb-title">📚 Kho tài liệu AI</h1>
        <p class="kb-sub">
          Nội dung ở đây được nhồi vào câu trả lời của
          <RouterLink to="/settings/crm/ai-agents">AI chăm sóc tự động</RouterLink>.
          Agent chỉ được phép trả lời dựa trên tài liệu này.
        </p>
      </div>
      <button class="kb-btn primary" @click="startCreate">+ Thêm tài liệu</button>
    </header>

    <div v-if="error" class="kb-alert err">{{ error }}</div>

    <table class="kb-table">
      <thead>
        <tr>
          <th>Tiêu đề</th>
          <th>Nguồn</th>
          <th>Số đoạn</th>
          <th>Token</th>
          <th>Trạng thái</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in documents" :key="d.id">
          <td>{{ d.title }}</td>
          <td>{{ d.sourceType === 'file' ? `📎 ${d.fileName}` : '✍️ Dán tay' }}</td>
          <td>{{ d.chunkCount }}</td>
          <td>~{{ d.tokenCount }}</td>
          <td>
            <span class="kb-status" :class="d.enabled ? 'on' : 'off'">
              {{ d.enabled ? 'Đang dùng' : 'Tắt' }}
            </span>
          </td>
          <td class="kb-actions-cell">
            <button class="kb-link" @click="startEdit(d)">Sửa</button>
            <button class="kb-link danger" @click="remove(d)">Xoá</button>
          </td>
        </tr>
        <tr v-if="!loading && documents.length === 0">
          <td colspan="6" class="kb-empty">Chưa có tài liệu nào.</td>
        </tr>
        <tr v-if="loading">
          <td colspan="6" class="kb-empty">⏳ Đang tải…</td>
        </tr>
      </tbody>
    </table>

    <!-- Thử tìm kiếm -->
    <section class="kb-search">
      <h2 class="kb-section-title">🔎 Thử tìm kiếm</h2>
      <p class="kb-hint">
        Gõ đúng câu khách hay hỏi để xem agent có tìm được tài liệu không. Không tìm thấy đoạn nào
        nghĩa là agent sẽ trả lời mà không có căn cứ — nên sửa lại tài liệu hoặc thêm từ khoá.
      </p>
      <div class="kb-search-row">
        <select v-model="searchAgentId">
          <option value="">— chọn agent —</option>
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <input v-model="searchQuery" placeholder="VD: giá căn 2 phòng ngủ bao nhiêu" @keyup.enter="runSearch" />
        <button class="kb-btn primary" @click="runSearch" :disabled="!searchAgentId || searching">
          {{ searching ? '⏳' : 'Tìm' }}
        </button>
      </div>
      <div v-if="searchError" class="kb-alert err">{{ searchError }}</div>
      <div v-else-if="searched && searchResults.length === 0" class="kb-alert warn">
        Không có đoạn nào khớp. Agent sẽ nhồi toàn bộ tài liệu nếu kho đủ nhỏ, ngược lại sẽ trả lời
        không căn cứ hoặc chuyển cho nhân viên.
      </div>
      <div v-for="c in searchResults" :key="c.id" class="kb-chunk">
        <div class="kb-chunk-title">
          {{ c.docTitle }}{{ c.heading ? ` › ${c.heading}` : '' }}
          <span class="kb-rank">điểm {{ (c.rank ?? 0).toFixed(4) }}</span>
        </div>
        <div class="kb-chunk-body">{{ c.content }}</div>
      </div>
    </section>

    <!-- Dialog thêm/sửa -->
    <div v-if="dialogOpen" class="kb-overlay" @click.self="dialogOpen = false">
      <div class="kb-dialog">
        <header class="kb-dialog-header">
          <h3>{{ editingId ? 'Sửa tài liệu' : 'Thêm tài liệu' }}</h3>
          <button class="kb-close" @click="dialogOpen = false">✕</button>
        </header>

        <div class="kb-dialog-body">
          <div v-if="!editingId" class="kb-tabs">
            <button :class="{ active: mode === 'text' }" @click="mode = 'text'">Dán nội dung</button>
            <button :class="{ active: mode === 'file' }" @click="mode = 'file'">Tải file</button>
          </div>

          <label class="kb-field">
            <span>Tiêu đề</span>
            <input v-model="formTitle" placeholder="VD: Bảng giá căn hộ Q2/2026" />
          </label>

          <label v-if="mode === 'text' || editingId" class="kb-field">
            <span>Nội dung</span>
            <textarea v-model="formContent" rows="16" spellcheck="false" />
            <small class="kb-hint">
              Dùng tiêu đề markdown (# ## ###) để chia mục — hệ thống cắt đoạn theo tiêu đề, tìm kiếm sẽ chính xác hơn.
            </small>
          </label>

          <label v-else class="kb-field">
            <span>File (.txt hoặc .md, tối đa 2MB)</span>
            <input type="file" accept=".txt,.md,.markdown" @change="onFileChange" />
          </label>

          <label v-if="editingId" class="kb-check">
            <input type="checkbox" v-model="formEnabled" />
            <span>Đang dùng cho agent</span>
          </label>

          <div v-if="editingId" class="kb-alert warn">
            Lưu nội dung mới sẽ chia lại toàn bộ đoạn của tài liệu này.
          </div>
          <div v-if="dialogError" class="kb-alert err">{{ dialogError }}</div>
        </div>

        <footer class="kb-dialog-footer">
          <button class="kb-btn" @click="dialogOpen = false" :disabled="saving">Huỷ</button>
          <button class="kb-btn primary" @click="submit" :disabled="saving">
            {{ saving ? '⏳ Đang lưu…' : '💾 Lưu' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  listAgentDocuments,
  createAgentDocument,
  uploadAgentDocument,
  getAgentDocument,
  updateAgentDocument,
  deleteAgentDocument,
  previewDocumentSearch,
  listAgents,
  type AiAgentDocument,
  type AiAgent,
  type RetrievedChunk,
} from '@/api/ai-agent';

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const documents = ref<AiAgentDocument[]>([]);
const agents = ref<AiAgent[]>([]);

const dialogOpen = ref(false);
const dialogError = ref('');
const editingId = ref<string | null>(null);
const mode = ref<'text' | 'file'>('text');
const formTitle = ref('');
const formContent = ref('');
const formEnabled = ref(true);
const formFile = ref<File | null>(null);

const searchAgentId = ref('');
const searchQuery = ref('');
const searching = ref(false);
const searched = ref(false);
const searchError = ref('');
const searchResults = ref<RetrievedChunk[]>([]);

function startCreate(): void {
  editingId.value = null;
  mode.value = 'text';
  formTitle.value = '';
  formContent.value = '';
  formFile.value = null;
  dialogError.value = '';
  dialogOpen.value = true;
}

async function startEdit(doc: AiAgentDocument): Promise<void> {
  dialogError.value = '';
  saving.value = true;
  try {
    const full = await getAgentDocument(doc.id);
    editingId.value = doc.id;
    formTitle.value = full.title;
    formContent.value = full.content;
    formEnabled.value = full.enabled;
    dialogOpen.value = true;
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi mở tài liệu';
  } finally {
    saving.value = false;
  }
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  formFile.value = input.files?.[0] ?? null;
  if (formFile.value && !formTitle.value) formTitle.value = formFile.value.name;
}

async function submit(): Promise<void> {
  if (saving.value) return;
  dialogError.value = '';
  if (!formTitle.value.trim()) {
    dialogError.value = 'Thiếu tiêu đề';
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateAgentDocument(editingId.value, {
        title: formTitle.value,
        content: formContent.value,
        enabled: formEnabled.value,
      });
    } else if (mode.value === 'file') {
      if (!formFile.value) {
        dialogError.value = 'Chưa chọn file';
        return;
      }
      await uploadAgentDocument(formFile.value, formTitle.value);
    } else {
      if (!formContent.value.trim()) {
        dialogError.value = 'Thiếu nội dung';
        return;
      }
      await createAgentDocument({ title: formTitle.value, content: formContent.value });
    }
    dialogOpen.value = false;
    await load();
  } catch (e: any) {
    dialogError.value = e?.response?.data?.error || e?.message || 'Lỗi lưu tài liệu';
  } finally {
    saving.value = false;
  }
}

async function remove(doc: AiAgentDocument): Promise<void> {
  if (!confirm(`Xoá tài liệu "${doc.title}"? Agent đang dùng sẽ mất nguồn thông tin này.`)) return;
  try {
    await deleteAgentDocument(doc.id);
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi xoá tài liệu';
  }
}

async function runSearch(): Promise<void> {
  if (!searchAgentId.value || !searchQuery.value.trim() || searching.value) return;
  searching.value = true;
  searchError.value = '';
  searchResults.value = [];
  try {
    searchResults.value = await previewDocumentSearch(searchAgentId.value, searchQuery.value);
    searched.value = true;
  } catch (e: any) {
    searchError.value = e?.response?.data?.error || e?.message || 'Lỗi tìm kiếm';
  } finally {
    searching.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    [documents.value, agents.value] = await Promise.all([listAgentDocuments(), listAgents()]);
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi tải tài liệu';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.kb-page { padding: 20px; max-width: 1080px; }
.kb-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;
}
.kb-title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
.kb-sub { margin: 0; color: #64748b; font-size: 13px; }

.kb-alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; margin: 8px 0; }
.kb-alert.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.kb-alert.warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }

.kb-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
.kb-table th, .kb-table td { padding: 9px 12px; font-size: 13px; text-align: left; border-bottom: 1px solid #f1f5f9; }
.kb-table th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 12px; }
.kb-actions-cell { text-align: right; white-space: nowrap; }
.kb-empty { text-align: center; color: #94a3b8; padding: 20px; }
.kb-status { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.kb-status.on { background: #dcfce7; color: #166534; }
.kb-status.off { background: #f1f5f9; color: #64748b; }

.kb-search {
  margin-top: 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;
}
.kb-section-title { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
.kb-hint { font-size: 11px; color: #64748b; margin: 0 0 10px; }
.kb-search-row { display: flex; gap: 8px; }
.kb-search-row select { padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; }
.kb-search-row input { flex: 1; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; }
.kb-chunk { border-left: 2px solid #cbd5e1; padding-left: 10px; margin: 10px 0; }
.kb-chunk-title { font-size: 12px; font-weight: 600; color: #475569; }
.kb-rank { color: #94a3b8; font-weight: 400; margin-left: 6px; }
.kb-chunk-body { font-size: 12px; color: #334155; white-space: pre-wrap; margin-top: 2px; }

.kb-btn {
  padding: 7px 14px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff;
  font-size: 13px; cursor: pointer; color: #334155;
}
.kb-btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; font-weight: 600; }
.kb-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.kb-link { background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 12px; padding: 0 6px; }
.kb-link.danger { color: #b91c1c; }

.kb-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.kb-dialog {
  background: #fff; border-radius: 8px; width: 720px; max-width: 92vw;
  max-height: 88vh; display: flex; flex-direction: column;
}
.kb-dialog-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #e2e8f0;
}
.kb-dialog-header h3 { margin: 0; font-size: 14px; font-weight: 600; }
.kb-close { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.kb-dialog-body { padding: 16px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.kb-dialog-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid #e2e8f0;
}
.kb-tabs { display: flex; gap: 4px; }
.kb-tabs button {
  padding: 6px 14px; border: 1px solid #e2e8f0; background: #fff; border-radius: 6px;
  font-size: 13px; cursor: pointer; color: #64748b;
}
.kb-tabs button.active { background: #eff6ff; border-color: #3b82f6; color: #1e40af; font-weight: 600; }
.kb-field { display: flex; flex-direction: column; gap: 4px; }
.kb-field > span { font-size: 12px; font-weight: 600; color: #1f2937; }
.kb-field input, .kb-field textarea {
  padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; width: 100%;
}
.kb-field textarea { font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; font-size: 12px; line-height: 1.6; }
.kb-check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
</style>
