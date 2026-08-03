<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<template>
  <div class="gb-page-wrapper bg-background">
    <!-- Header -->
    <div class="d-flex align-center px-6 py-4 border-b bg-surface">
      <div>
        <div class="text-caption text-medium-emphasis">Marketing / Gửi nhóm hàng loạt</div>
        <h1 class="text-h5 font-weight-bold">{{ broadcastId ? 'Sửa chiến dịch' : 'Tạo chiến dịch' }}</h1>
      </div>
      <v-spacer />
      <v-btn variant="outlined" size="small" prepend-icon="mdi-arrow-left" to="/marketing/group-broadcasts">
        Quay lại
      </v-btn>
    </div>

    <!-- Main Content Form Area -->
    <div class="pa-6 flex-grow-1 pb-16">
      <div class="gb-container">
        <!-- Tên chiến dịch -->
        <div class="rc-card mb-5">
          <span class="rc-label">TÊN CHIẾN DỊCH</span>
          <input
            v-model="form.name"
            class="rc-input mt-1"
            type="text"
            placeholder="Nhập tên chiến dịch (Ví dụ: Khuyến mãi Tháng 8 - Nhóm Khách Hàng Thân Thiết)..."
            maxlength="120"
          />
        </div>

        <div class="gb-grid">
          <!-- ═══════════ Cột trái: Nick Zalo, Chọn nhóm, Mẫu tin ═══════════ -->
          <div class="gb-col">
            <!-- 1. Nick & Nhóm nhận -->
            <div class="rc-card">
              <div class="d-flex align-center justify-space-between mb-3 border-b pb-2">
                <span class="rc-section-title">1. NICK ZALO &amp; NHÓM NHẬN</span>
                <v-chip v-if="form.zaloAccountId" size="small" :color="selectedOnline ? 'success' : 'error'" variant="tonal" class="font-weight-medium">
                  {{ selectedOnline ? '● Nick Online' : '○ Nick Offline' }}
                </v-chip>
              </div>

              <div class="mb-3">
                <span class="rc-label">NICK ZALO GỬI TIN</span>
                <v-select
                  v-model="form.zaloAccountId"
                  :items="accounts"
                  item-title="displayName"
                  item-value="id"
                  placeholder="-- Chọn Nick Zalo gửi tin --"
                  variant="outlined"
                  density="comfortable"
                  class="mt-1 rc-v-select"
                  :loading="accountLoading"
                  hide-details
                  @update:model-value="onAccountChange"
                >
                  <template #item="{ props: itemProps, item }">
                    <v-list-item v-bind="itemProps">
                      <template #append>
                        <v-chip size="x-small" :color="acctOnline(item) ? 'success' : 'error'" variant="tonal">
                          {{ acctOnline(item) ? 'Online' : 'Offline' }}
                        </v-chip>
                      </template>
                    </v-list-item>
                  </template>
                </v-select>
              </div>

              <v-alert v-if="!accountLoading && !accounts.length" type="info" variant="tonal" density="compact" class="mt-3">
                Chưa có nick Zalo nào. Vui lòng thêm nick Zalo tại
                <RouterLink to="/settings/channels/zalo" class="font-weight-medium">Cài đặt / Nick Zalo</RouterLink>.
              </v-alert>

              <v-alert v-else-if="form.zaloAccountId && !selectedOnline" type="warning" variant="tonal" density="compact" class="mt-3">
                Bật nick Zalo online để hệ thống tải danh sách các nhóm đã tham gia.
              </v-alert>

              <!-- Danh sách nhóm Zalo -->
              <template v-if="selectedOnline">
                <div class="mt-4 pt-3 border-t">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <span class="rc-label mb-0">DANH SÁCH NHÓM NHẬN</span>
                    <v-chip :color="overGroupCap ? 'error' : 'primary'" variant="tonal" size="small" class="font-weight-bold">
                      Đã chọn {{ selectedGroupIds.size }}/{{ MAX_GROUPS }} nhóm
                    </v-chip>
                  </div>

                  <div class="d-flex align-center gap-2 mb-3 flex-wrap mt-2">
                    <input
                      v-model="groupSearch"
                      type="text"
                      class="rc-input"
                      placeholder="Tìm kiếm tên nhóm..."
                      style="min-width: 180px; flex: 1"
                    />
                    <button type="button" class="rc-btn-secondary" @click="selectAllVisible">Chọn tất cả</button>
                    <button type="button" class="rc-btn-text text-error" @click="selectedGroupIds.clear()">Bỏ chọn</button>
                  </div>

                  <v-alert v-if="overGroupCap" type="error" variant="tonal" density="compact" class="mb-2">
                    Tối đa {{ MAX_GROUPS }} nhóm cho mỗi chiến dịch. Vui lòng bỏ bớt nhóm.
                  </v-alert>

                  <v-skeleton-loader v-if="groupsLoading" type="list-item@4" class="mt-2" />
                  <v-list v-else density="compact" class="border rounded-lg custom-group-list" max-height="280">
                    <v-list-item v-for="g in visibleGroups" :key="g.id">
                      <template #prepend>
                        <v-checkbox-btn
                          :model-value="selectedGroupIds.has(g.id)"
                          :disabled="!selectedGroupIds.has(g.id) && selectedGroupIds.size >= MAX_GROUPS"
                          color="primary"
                          @update:model-value="toggleGroup(g.id)"
                        />
                      </template>
                      <v-list-item-title class="font-weight-medium">{{ g.name || g.id }}</v-list-item-title>
                      <v-list-item-subtitle class="text-caption text-medium-emphasis">
                        👥 {{ g.totalMember }} thành viên
                      </v-list-item-subtitle>
                    </v-list-item>
                    <v-list-item v-if="!visibleGroups.length">
                      <v-list-item-title class="text-center text-medium-emphasis py-4">
                        Không tìm thấy nhóm Zalo phù hợp
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </div>
              </template>
            </div>

            <!-- 2. Nội dung Mẫu tin -->
            <div class="rc-card">
              <div class="rc-section-title mb-3 border-b pb-2">2. NỘI DUNG MẪU TIN NHẮN</div>

              <div class="mb-3">
                <span class="rc-label">MẪU TIN NHẮN</span>
                <div class="d-flex align-center gap-2 flex-wrap mt-1">
                  <v-select
                    v-model="form.templateId"
                    :items="templates"
                    item-title="name"
                    item-value="id"
                    placeholder="-- Chọn Mẫu tin nhắn --"
                    variant="outlined"
                    density="comfortable"
                    class="rc-v-select"
                    style="min-width: 200px; flex: 1"
                    :loading="templatesLoading"
                    hide-details
                    @update:model-value="loadTemplatePreview"
                  />
                  <button type="button" class="rc-btn-primary-outline" @click="editorTemplateId = undefined; showEditor = true">
                    + Tạo mới
                  </button>
                  <button v-if="form.templateId" type="button" class="rc-btn-secondary" @click="editorTemplateId = form.templateId; showEditor = true">
                    ✏ Sửa
                  </button>
                </div>
              </div>

              <!-- Xem trước nội dung -->
              <div v-if="preview" class="mt-4 pa-4 rounded-lg border bg-grey-lighten-5">
                <span class="rc-label mb-2">XEM TRƯỚC NỘI DUNG GỬI</span>
                <div v-if="preview.template.content" class="preview-bubble mb-3">
                  {{ preview.template.content }}
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <template v-for="a in preview.attachments" :key="a.mediaAssetId">
                    <v-img
                      v-if="a.kind === 'image' && !a.missing"
                      :src="a.blobUrl"
                      width="80"
                      height="80"
                      cover
                      class="rounded border"
                    />
                    <v-chip v-else-if="!a.missing" variant="outlined" size="small" prepend-icon="mdi-file">
                      {{ a.name }}
                    </v-chip>
                    <v-chip v-else color="error" variant="tonal" size="small" prepend-icon="mdi-alert">
                      {{ a.name || a.mediaAssetId }} (File đã bị xóa)
                    </v-chip>
                  </template>
                </div>
                <v-alert v-if="hasMissingAttachment" type="error" variant="tonal" density="compact" class="mt-3">
                  Mẫu tin có file đính kèm đã bị xóa khỏi kho media.
                </v-alert>
              </div>
            </div>
          </div>

          <!-- ═══════════ Cột phải: Lịch gửi & Ước tính ═══════════ -->
          <div class="gb-col">
            <!-- 3. Lịch & Nhịp gửi -->
            <div class="rc-card">
              <div class="rc-section-title mb-3 border-b pb-2">3. CẤU HÌNH LỊCH &amp; NHỊP GỬI</div>
              <ScheduleEditor v-model="schedule" :run-duration-sec="estimateData?.runDurationSec" />
            </div>

            <!-- 4. Ước tính lượt gửi -->
            <v-card variant="tonal" class="pa-5 rounded-lg" :color="budgetColor">
              <div class="text-subtitle-1 font-weight-bold mb-2">📊 Ước tính lượt gửi &amp; An toàn</div>
              <template v-if="estimateData">
                <div class="text-body-2 mb-1">
                  Mỗi nhóm: <strong>{{ estimateData.opsPerGroup }}</strong> lượt gửi
                  <span class="text-caption text-medium-emphasis">(nhiều ảnh gộp 1 album = 1 lượt)</span>
                </div>
                <div class="text-body-2 mb-1">
                  Tổng lượt mỗi vòng: {{ selectedGroupIds.size }} nhóm × {{ estimateData.opsPerGroup }} =
                  <strong class="text-primary">{{ estimateData.opsPerRun }} lượt</strong>
                  <span class="text-caption text-medium-emphasis"> (~{{ Math.round(estimateData.runDurationSec / 60) }} phút)</span>
                </div>
                <div class="text-body-2 mb-2">
                  Dự kiến theo ngày: <strong>{{ estimateData.opsPerDay }}</strong> / {{ estimateData.budget }} lượt an toàn
                </div>
                <v-progress-linear
                  :model-value="budgetPercent"
                  :color="budgetColor"
                  height="10"
                  rounded
                />
                <div v-for="w in estimateData.warnings" :key="w" class="text-caption text-error mt-2 font-weight-medium">
                  ⚠ {{ w }}
                </div>
              </template>
              <div v-else class="text-caption text-medium-emphasis py-2">
                💡 Vui lòng chọn Nick gửi, Nhóm nhận và Mẫu tin để hiển thị ước tính chi tiết.
              </div>
            </v-card>

            <v-alert v-if="apiError" type="error" variant="tonal" density="compact">
              {{ apiError.message }}
              <div v-if="apiError.errors?.length" class="text-caption mt-1">
                {{ apiError.errors.join(', ') }}
              </div>
            </v-alert>
          </div>
        </div>

        <!-- Extra spacing div to prevent actionbar from ever covering form fields -->
        <div style="height: 120px;" />
      </div>
    </div>

    <!-- Thanh Thao Tác Ghim Đáy -->
    <div class="gb-actionbar">
      <div class="gb-container d-flex align-center justify-space-between gap-3 flex-wrap">
        <div>
          <span v-if="missing.length" class="text-caption text-error font-weight-bold">
            ⚠ Chưa đủ thông tin: {{ missing.join(', ') }}
          </span>
          <span v-else class="text-caption text-success font-weight-bold">
            ✓ Đã đủ thông tin sẵn sàng kích hoạt
          </span>
        </div>

        <div class="d-flex align-center gap-3">
          <button type="button" class="rc-btn-secondary" :disabled="saving || !canSave" @click="submit('draft')">
            Lưu nháp
          </button>
          <button type="button" class="rc-btn-secondary text-info" :disabled="saving || !canSave" @click="submit('run-now')">
            Gửi thử ngay
          </button>
          <button
            type="button"
            class="rc-btn-main"
            :disabled="saving || !canSave || overBudget"
            @click="submit('activate')"
          >
            🚀 Lưu &amp; Bật lịch gửi
          </button>
        </div>
      </div>
    </div>

    <TemplateEditorDialog
      v-if="showEditor"
      :template-id="editorTemplateId"
      @close="showEditor = false"
      @saved="onTemplateSaved"
    />

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="4000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useSelectedAccount } from '@/composables/use-selected-account';
import ScheduleEditor from '@/components/marketing/ScheduleEditor.vue';
import type { ScheduleModel } from '@/components/marketing/schedule-model';
import TemplateEditorDialog from '@/components/marketing/TemplateEditorDialog.vue';
import { useCeMessageTemplates, type CeMessageTemplate, type CeResolvedAttachment } from '@/composables/use-ce-message-templates';
import { useGroupBroadcasts, type BroadcastEstimate } from '@/composables/use-group-broadcasts';

const MAX_GROUPS = 50;
const ESTIMATE_DEBOUNCE_MS = 400;

const route = useRoute();
const router = useRouter();
const broadcastId = computed(() => (route.params.id as string) || '');

const { accounts, loading: accountLoading } = useSelectedAccount();
const { templates, loading: templatesLoading, fetchTemplates, fetchTemplate } = useCeMessageTemplates();
const {
  saving, error: apiError, fetchBroadcast, saveBroadcast, control, estimate,
} = useGroupBroadcasts();

const form = reactive({ name: '', zaloAccountId: '', templateId: '' });
const schedule = ref<ScheduleModel>({
  scheduleKind: 'daily', timesOfDay: ['08:00'], daysOfWeek: [], daysOfMonth: [],
  startDate: null, endDate: null, minDelaySec: 20, maxDelaySec: 45,
});

const groups = ref<Array<{ id: string; name: string; totalMember: number }>>([]);
const groupsLoading = ref(false);
const groupSearch = ref('');
const selectedGroupIds = reactive(new Set<string>());

const preview = ref<{ template: CeMessageTemplate; attachments: CeResolvedAttachment[] } | null>(null);
const showEditor = ref(false);
const editorTemplateId = ref<string | undefined>(undefined);
const estimateData = ref<BroadcastEstimate | null>(null);

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  Object.assign(snack, { show: true, message, color });
}

function acctOnline(item: any): boolean {
  const a = item?.raw ?? item;
  return String(a?.liveStatus || a?.status || '').toLowerCase() === 'connected';
}
const selectedOnline = computed(() => {
  const acct = accounts.value.find((a: any) => a.id === form.zaloAccountId);
  return acct ? acctOnline(acct) : false;
});

async function onAccountChange() {
  selectedGroupIds.clear();
  await loadGroups();
}

async function loadGroups() {
  if (!form.zaloAccountId || !selectedOnline.value) {
    groups.value = [];
    return;
  }
  groupsLoading.value = true;
  try {
    const res = await api.get(`/zalo-accounts/${form.zaloAccountId}/groups`);
    groups.value = res.data.groups ?? [];
  } catch {
    notify('Không tải được danh sách nhóm', 'error');
  } finally {
    groupsLoading.value = false;
  }
}

const visibleGroups = computed(() => {
  const q = groupSearch.value.trim().toLowerCase();
  if (!q) return groups.value;
  return groups.value.filter((g) => (g.name || g.id).toLowerCase().includes(q));
});
const overGroupCap = computed(() => selectedGroupIds.size > MAX_GROUPS);

function toggleGroup(id: string) {
  if (selectedGroupIds.has(id)) selectedGroupIds.delete(id);
  else if (selectedGroupIds.size < MAX_GROUPS) selectedGroupIds.add(id);
}
function selectAllVisible() {
  for (const g of visibleGroups.value) {
    if (selectedGroupIds.size >= MAX_GROUPS) break;
    selectedGroupIds.add(g.id);
  }
}

async function loadTemplatePreview() {
  preview.value = form.templateId ? await fetchTemplate(form.templateId) : null;
}
const hasMissingAttachment = computed(() => preview.value?.attachments.some((a) => a.missing) ?? false);

async function onTemplateSaved(template: CeMessageTemplate) {
  showEditor.value = false;
  await fetchTemplates();
  form.templateId = template.id;
  await loadTemplatePreview();
}

const budgetPercent = computed(() => {
  if (!estimateData.value || estimateData.value.budget <= 0) return 0;
  return Math.min(100, (estimateData.value.opsPerDay / estimateData.value.budget) * 100);
});
const overBudget = computed(
  () => !!estimateData.value && estimateData.value.opsPerDay > estimateData.value.budget,
);
const budgetColor = computed(() => {
  if (overBudget.value) return 'error';
  return budgetPercent.value >= 60 ? 'warning' : 'success';
});

let estimateTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleEstimate() {
  if (estimateTimer) clearTimeout(estimateTimer);
  estimateTimer = setTimeout(async () => {
    if (!form.templateId || !form.zaloAccountId || selectedGroupIds.size === 0) {
      estimateData.value = null;
      return;
    }
    estimateData.value = await estimate({ ...buildPayload() });
  }, ESTIMATE_DEBOUNCE_MS);
}

watch(
  () => [form.templateId, form.zaloAccountId, selectedGroupIds.size, JSON.stringify(schedule.value)],
  scheduleEstimate,
);

function buildPayload() {
  return {
    name: form.name.trim(),
    zaloAccountId: form.zaloAccountId,
    templateId: form.templateId,
    targetGroupIds: [...selectedGroupIds],
    scheduleKind: schedule.value.scheduleKind,
    timesOfDay: schedule.value.timesOfDay,
    daysOfWeek: schedule.value.daysOfWeek,
    daysOfMonth: schedule.value.daysOfMonth,
    startDate: schedule.value.startDate,
    endDate: schedule.value.endDate,
    minDelaySec: schedule.value.minDelaySec,
    maxDelaySec: schedule.value.maxDelaySec,
  };
}

const missing = computed(() => {
  const out: string[] = [];
  if (!form.name.trim()) out.push('Tên chiến dịch');
  if (!form.zaloAccountId) out.push('Nick Zalo');
  if (selectedGroupIds.size === 0) out.push('Nhóm nhận');
  if (!form.templateId) out.push('Mẫu tin');
  return out;
});

const canSave = computed(() => missing.value.length === 0 && !overGroupCap.value);

async function submit(mode: 'draft' | 'activate' | 'run-now') {
  const saved = await saveBroadcast(buildPayload(), broadcastId.value || undefined);
  if (!saved) return notify(apiError.value?.message ?? 'Không lưu được chiến dịch', 'error');

  if (mode !== 'draft') {
    const action = mode === 'activate' ? 'activate' : 'run-now';
    const ok = await control(saved.id, action);
    if (!ok) {
      notify(apiError.value?.message ?? 'Đã lưu nhưng không thực hiện được thao tác', 'warning');
      return router.push(`/marketing/group-broadcasts/${saved.id}`);
    }
  }
  notify('Đã lưu chiến dịch');
  router.push(`/marketing/group-broadcasts/${saved.id}`);
}

onMounted(async () => {
  await fetchTemplates();
  if (!broadcastId.value) return;

  const loaded = await fetchBroadcast(broadcastId.value);
  if (!loaded) return;
  const b = loaded.broadcast;
  form.name = b.name;
  form.zaloAccountId = b.zaloAccountId;
  form.templateId = b.templateId;
  for (const id of b.targetGroupIds) selectedGroupIds.add(id);
  schedule.value = {
    scheduleKind: b.scheduleKind,
    timesOfDay: [...b.timesOfDay],
    daysOfWeek: [...b.daysOfWeek],
    daysOfMonth: [...b.daysOfMonth],
    startDate: b.startDate ? b.startDate.slice(0, 10) : null,
    endDate: b.endDate ? b.endDate.slice(0, 10) : null,
    minDelaySec: b.minDelaySec,
    maxDelaySec: b.maxDelaySec,
  };
  await Promise.all([loadGroups(), loadTemplatePreview()]);
});
</script>

<style scoped>
.gb-page-wrapper {
  min-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
}
.gb-container { max-width: 1200px; margin: 0 auto; width: 100%; }
.gb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.gb-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

@media (max-width: 1024px) {
  .gb-grid { grid-template-columns: 1fr; }
}

.rc-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.rc-section-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  letter-spacing: 0.02em;
}

.rc-label {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.rc-input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  color: #111827;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.rc-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.rc-v-select :deep(.v-field) {
  border-radius: 8px !important;
  background: #ffffff !important;
}

.rc-btn-primary-outline {
  height: 44px;
  padding: 0 16px;
  background: #ffffff;
  border: 1px solid #2563eb;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
  transition: all 0.15s ease;
}
.rc-btn-primary-outline:hover {
  background: #eff6ff;
}

.rc-btn-secondary {
  height: 44px;
  padding: 0 16px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s ease;
}
.rc-btn-secondary:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}
.rc-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rc-btn-text {
  background: transparent;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0 8px;
}

.rc-btn-main {
  height: 44px;
  padding: 0 24px;
  background: #2563eb;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s ease;
}
.rc-btn-main:hover:not(:disabled) {
  background: #1d4ed8;
}
.rc-btn-main:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.custom-group-list { overflow-y: auto; background: #fff; }
.preview-bubble {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 12px 14px;
  white-space: pre-wrap;
  font-size: 0.9rem;
}

.gb-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 100;
  padding: 16px 24px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}
</style>
