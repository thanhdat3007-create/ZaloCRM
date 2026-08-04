<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  Tạo/sửa chiến dịch nhắn tin hàng loạt cho tệp khách hàng (🟢 Community).
  Vào từ /marketing/lists (nút "Gửi tin hàng loạt") với ?listId=… để chọn sẵn tệp.
-->
<template>
  <div class="lb-page-wrapper bg-background">
    <div class="d-flex align-center px-6 py-4 border-b bg-surface">
      <div>
        <div class="text-caption text-medium-emphasis">Marketing / Nhắn tệp khách hàng</div>
        <h1 class="text-h5 font-weight-bold">
          {{ broadcastId ? 'Sửa chiến dịch' : 'Tạo chiến dịch nhắn tệp' }}
        </h1>
      </div>
      <v-spacer />
      <v-btn variant="outlined" size="small" prepend-icon="mdi-arrow-left" to="/marketing/list-broadcasts">
        Quay lại
      </v-btn>
    </div>

    <div class="pa-6 flex-grow-1 pb-16">
      <div class="lb-container">
        <!-- Tên chiến dịch -->
        <div class="rc-card mb-5">
          <span class="rc-label">TÊN CHIẾN DỊCH</span>
          <input
            v-model="form.name"
            class="rc-input mt-1"
            type="text"
            placeholder="Ví dụ: Mời xem căn hộ Q7 - Tệp lead tháng 8"
            maxlength="120"
          />
        </div>

        <div class="lb-grid">
          <!-- ═══ Cột trái: tệp, nick, mẫu tin ═══ -->
          <div class="lb-col">
            <!-- 1. Tệp khách hàng -->
            <div class="rc-card">
              <div class="rc-section-title mb-3 border-b pb-2">1. TỆP KHÁCH HÀNG NHẬN TIN</div>
              <v-select
                v-model="form.customerListId"
                :items="listOptions"
                item-title="label"
                item-value="id"
                placeholder="-- Chọn tệp khách hàng --"
                variant="outlined"
                density="comfortable"
                class="rc-v-select"
                :loading="loadingLists"
                :disabled="listLocked"
                hide-details
              />
              <v-alert v-if="listLocked" type="info" variant="tonal" density="compact" class="mt-3">
                Chiến dịch đã dựng danh sách nhận nên không đổi được tệp. Tạo chiến dịch mới nếu cần tệp khác.
              </v-alert>

              <div v-if="estimateData" class="mt-4 pa-3 rounded-lg border bg-grey-lighten-5">
                <div class="text-body-2">
                  Sẽ gửi cho
                  <strong class="text-primary">{{ estimateData.recipientCount.toLocaleString('vi-VN') }}</strong>
                  khách đã xác nhận có Zalo trong tệp.
                </div>
                <div class="text-caption text-medium-emphasis mt-1">
                  Khách chưa quét Zalo KHÔNG được gửi. Vào trang tệp bấm "Quét lại Zalo" để phủ thêm.
                </div>
              </div>
            </div>

            <!-- 2. Nick gửi -->
            <div class="rc-card">
              <div class="d-flex align-center justify-space-between mb-3 border-b pb-2">
                <span class="rc-section-title">2. NICK ZALO GỬI LUÂN PHIÊN</span>
                <v-chip size="small" :color="selectedNickIds.size ? 'primary' : 'error'" variant="tonal" class="font-weight-bold">
                  Đã chọn {{ selectedNickIds.size }}/{{ MAX_NICKS }}
                </v-chip>
              </div>

              <v-alert v-if="!accountLoading && !accounts.length" type="info" variant="tonal" density="compact">
                Chưa có nick Zalo nào. Thêm tại
                <RouterLink to="/settings/channels/zalo" class="font-weight-medium">Cài đặt / Nick Zalo</RouterLink>.
              </v-alert>

              <v-list v-else density="compact" class="border rounded-lg nick-list" max-height="260">
                <v-list-item v-for="a in accounts" :key="a.id">
                  <template #prepend>
                    <v-checkbox-btn
                      :model-value="selectedNickIds.has(a.id)"
                      :disabled="!selectedNickIds.has(a.id) && selectedNickIds.size >= MAX_NICKS"
                      color="primary"
                      @update:model-value="toggleNick(a.id)"
                    />
                  </template>
                  <v-list-item-title class="font-weight-medium">
                    {{ a.displayName || a.phone || a.id }}
                  </v-list-item-title>
                  <template #append>
                    <v-chip size="x-small" :color="acctOnline(a) ? 'success' : 'error'" variant="tonal">
                      {{ acctOnline(a) ? 'Online' : 'Offline' }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>

              <div class="text-caption text-medium-emphasis mt-2">
                Tin được chia đều theo vòng xoay. Nick offline hoặc chạm hạn mức sẽ tự bị bỏ qua,
                nick còn lại gánh tiếp — không làm hỏng cả lượt gửi.
              </div>
            </div>

            <!-- 3. Mẫu tin -->
            <div class="rc-card">
              <div class="rc-section-title mb-3 border-b pb-2">3. NỘI DUNG MẪU TIN NHẮN</div>
              <div class="d-flex align-center gap-2 flex-wrap mt-1">
                <v-select
                  v-model="form.templateId"
                  :items="templates"
                  item-title="name"
                  item-value="id"
                  placeholder="-- Chọn mẫu tin nhắn --"
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
                      {{ a.name || a.mediaAssetId }} (File đã bị xoá)
                    </v-chip>
                  </template>
                </div>
                <v-alert v-if="hasMissingAttachment" type="error" variant="tonal" density="compact" class="mt-3">
                  Mẫu tin có file đính kèm đã bị xoá khỏi kho media.
                </v-alert>
              </div>
            </div>
          </div>

          <!-- ═══ Cột phải: khung giờ & ước tính ═══ -->
          <div class="lb-col">
            <div class="rc-card">
              <div class="rc-section-title mb-3 border-b pb-2">4. KHUNG GIỜ &amp; HẠN MỨC NGÀY</div>
              <SendWindowEditor v-model="sendWindow" :nick-count="selectedNickIds.size" />
            </div>

            <v-card variant="tonal" class="pa-5 rounded-lg" :color="budgetColor">
              <div class="text-subtitle-1 font-weight-bold mb-2">📊 Ước tính &amp; An toàn</div>
              <template v-if="estimateData">
                <div class="text-body-2 mb-1">
                  Mỗi khách: <strong>{{ estimateData.opsPerRecipient }}</strong> lệnh gửi
                  <span class="text-caption text-medium-emphasis">(nhiều ảnh gộp 1 album = 1 lệnh)</span>
                </div>
                <div class="text-body-2 mb-1">
                  Mỗi ngày: {{ sendWindow.dailyQuota }} khách × {{ estimateData.opsPerRecipient }} =
                  <strong class="text-primary">{{ estimateData.opsPerDay }} lệnh</strong>
                  <span class="text-caption text-medium-emphasis">
                    (~{{ Math.round(estimateData.dailyDurationSec / 3600 * 10) / 10 }} giờ)
                  </span>
                </div>
                <div class="text-body-2 mb-1">
                  Ngưỡng an toàn của {{ selectedNickIds.size }} nick:
                  <strong>{{ estimateData.budget }}</strong> lệnh/ngày
                </div>
                <div class="text-body-2 mb-2">
                  Dự kiến gửi hết tệp trong
                  <strong class="text-primary">{{ estimateData.daysToFinish }} ngày</strong>
                </div>
                <v-progress-linear :model-value="budgetPercent" :color="budgetColor" height="10" rounded />
                <div v-for="w in estimateData.warnings" :key="w" class="text-caption text-error mt-2 font-weight-medium">
                  ⚠ {{ w }}
                </div>
              </template>
              <div v-else class="text-caption text-medium-emphasis py-2">
                💡 Chọn tệp, nick gửi và mẫu tin để hiện ước tính chi tiết.
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

        <div style="height: 120px;" />
      </div>
    </div>

    <!-- Thanh thao tác ghim đáy -->
    <div class="lb-actionbar">
      <div class="lb-container d-flex align-center justify-space-between gap-3 flex-wrap">
        <div>
          <span v-if="missing.length" class="text-caption text-error font-weight-bold">
            ⚠ Chưa đủ thông tin: {{ missing.join(', ') }}
          </span>
          <span v-else class="text-caption text-success font-weight-bold">
            ✓ Đã đủ thông tin sẵn sàng bật lịch
          </span>
        </div>
        <div class="d-flex align-center gap-3">
          <button type="button" class="rc-btn-secondary" :disabled="saving || !canSave" @click="submit('draft')">
            Lưu nháp
          </button>
          <button type="button" class="rc-btn-secondary text-info" :disabled="saving || !canSave" @click="submit('run-now')">
            Gửi thử 1 lượt
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

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="5000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useSelectedAccount } from '@/composables/use-selected-account';
import SendWindowEditor from '@/components/marketing/SendWindowEditor.vue';
import { defaultSendWindow, type SendWindowModel } from '@/components/marketing/send-window-model';
import TemplateEditorDialog from '@/components/marketing/TemplateEditorDialog.vue';
import { useCeMessageTemplates, type CeMessageTemplate, type CeResolvedAttachment } from '@/composables/use-ce-message-templates';
import { useListBroadcasts, type ListBroadcastEstimate } from '@/composables/use-list-broadcasts';

const MAX_NICKS = 10;
const ESTIMATE_DEBOUNCE_MS = 400;

const route = useRoute();
const router = useRouter();
const broadcastId = computed(() => (route.params.id as string) || '');

const { accounts, loading: accountLoading } = useSelectedAccount();
const { templates, loading: templatesLoading, fetchTemplates, fetchTemplate } = useCeMessageTemplates();
const { saving, error: apiError, fetchBroadcast, saveBroadcast, control, estimate } = useListBroadcasts();

const form = reactive({ name: '', customerListId: '', templateId: '' });
const sendWindow = ref<SendWindowModel>(defaultSendWindow());
const selectedNickIds = reactive(new Set<string>());

const lists = ref<Array<{ id: string; name: string; hasZaloEntries: number }>>([]);
const loadingLists = ref(false);
const listLocked = ref(false);

const preview = ref<{ template: CeMessageTemplate; attachments: CeResolvedAttachment[] } | null>(null);
const showEditor = ref(false);
const editorTemplateId = ref<string | undefined>(undefined);
const estimateData = ref<ListBroadcastEstimate | null>(null);

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  Object.assign(snack, { show: true, message, color });
}

const listOptions = computed(() =>
  lists.value.map((l) => ({
    id: l.id,
    label: `${l.name} — ${l.hasZaloEntries.toLocaleString('vi-VN')} KH có Zalo`,
  })),
);

function acctOnline(a: any): boolean {
  return String(a?.liveStatus || a?.status || '').toLowerCase() === 'connected';
}

function toggleNick(id: string) {
  if (selectedNickIds.has(id)) selectedNickIds.delete(id);
  else if (selectedNickIds.size < MAX_NICKS) selectedNickIds.add(id);
}

async function loadLists() {
  loadingLists.value = true;
  try {
    // Chỉ tệp đang dùng: gửi cho tệp đã lưu trữ là dấu hiệu chọn nhầm.
    const res = await api.get('/customer-lists', { params: { status: 'active', limit: 100 } });
    lists.value = (res.data.lists ?? []).map((l: any) => ({
      id: l.id, name: l.name, hasZaloEntries: l.hasZaloEntries ?? 0,
    }));
  } catch {
    notify('Không tải được danh sách tệp khách hàng', 'error');
  } finally {
    loadingLists.value = false;
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
  () => !!estimateData.value && selectedNickIds.size > 0 && estimateData.value.opsPerDay > estimateData.value.budget,
);
const budgetColor = computed(() => {
  if (overBudget.value) return 'error';
  return budgetPercent.value >= 60 ? 'warning' : 'success';
});

let estimateTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleEstimate() {
  if (estimateTimer) clearTimeout(estimateTimer);
  estimateTimer = setTimeout(async () => {
    if (!form.customerListId || !form.templateId) {
      estimateData.value = null;
      return;
    }
    estimateData.value = await estimate(buildPayload());
  }, ESTIMATE_DEBOUNCE_MS);
}

watch(
  () => [form.templateId, form.customerListId, selectedNickIds.size, JSON.stringify(sendWindow.value)],
  scheduleEstimate,
);

function buildPayload() {
  return {
    name: form.name.trim(),
    customerListId: form.customerListId,
    templateId: form.templateId,
    zaloAccountIds: [...selectedNickIds],
    windowStart: sendWindow.value.windowStart,
    windowEnd: sendWindow.value.windowEnd,
    daysOfWeek: sendWindow.value.daysOfWeek,
    startDate: sendWindow.value.startDate,
    endDate: sendWindow.value.endDate,
    dailyQuota: sendWindow.value.dailyQuota,
    perNickDailyQuota: sendWindow.value.perNickDailyQuota,
    minDelaySec: sendWindow.value.minDelaySec,
    maxDelaySec: sendWindow.value.maxDelaySec,
  };
}

const missing = computed(() => {
  const out: string[] = [];
  if (!form.name.trim()) out.push('Tên chiến dịch');
  if (!form.customerListId) out.push('Tệp khách hàng');
  if (selectedNickIds.size === 0) out.push('Nick Zalo gửi');
  if (!form.templateId) out.push('Mẫu tin');
  return out;
});

const canSave = computed(() => missing.value.length === 0);

async function submit(mode: 'draft' | 'activate' | 'run-now') {
  const saved = await saveBroadcast(buildPayload(), broadcastId.value || undefined);
  if (!saved) return notify(apiError.value?.message ?? 'Không lưu được chiến dịch', 'error');

  if (mode !== 'draft') {
    const result = await control(saved.id, mode === 'activate' ? 'activate' : 'run-now');
    if (!result) {
      notify(apiError.value?.message ?? 'Đã lưu nhưng không thực hiện được thao tác', 'warning');
      return router.push(`/marketing/list-broadcasts/${saved.id}`);
    }
    if (mode === 'activate' && result.sync) {
      notify(`Đã bật lịch — hàng đợi ${result.sync.total.toLocaleString('vi-VN')} khách`);
      return router.push(`/marketing/list-broadcasts/${saved.id}`);
    }
  }
  notify('Đã lưu chiến dịch');
  router.push(`/marketing/list-broadcasts/${saved.id}`);
}

onMounted(async () => {
  await Promise.all([fetchTemplates(), loadLists()]);

  // Vào từ trang tệp: ?listId=… chọn sẵn tệp và gợi ý tên chiến dịch.
  const presetListId = (route.query.listId as string) || '';
  if (!broadcastId.value && presetListId) {
    form.customerListId = presetListId;
    const list = lists.value.find((l) => l.id === presetListId);
    if (list) form.name = `Nhắn tệp ${list.name}`;
  }

  if (!broadcastId.value) return;

  const loaded = await fetchBroadcast(broadcastId.value);
  if (!loaded) return;
  const b = loaded.broadcast;
  form.name = b.name;
  form.customerListId = b.customerListId;
  form.templateId = b.templateId;
  for (const id of b.zaloAccountIds) selectedNickIds.add(id);
  listLocked.value = b.totalRecipients > 0;
  sendWindow.value = {
    windowStart: b.windowStart,
    windowEnd: b.windowEnd,
    daysOfWeek: [...b.daysOfWeek],
    startDate: b.startDate ? b.startDate.slice(0, 10) : null,
    endDate: b.endDate ? b.endDate.slice(0, 10) : null,
    dailyQuota: b.dailyQuota,
    perNickDailyQuota: b.perNickDailyQuota,
    minDelaySec: b.minDelaySec,
    maxDelaySec: b.maxDelaySec,
  };
  await loadTemplatePreview();
});
</script>

<style scoped>
.lb-page-wrapper {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.lb-container { max-width: 1200px; margin: 0 auto; width: 100%; }
.lb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.lb-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

@media (max-width: 1024px) {
  .lb-grid { grid-template-columns: 1fr; }
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
}
.rc-btn-primary-outline:hover { background: #eff6ff; }

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
.rc-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

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
.rc-btn-main:hover:not(:disabled) { background: #1d4ed8; }
.rc-btn-main:disabled { opacity: 0.5; cursor: not-allowed; }

.nick-list { overflow-y: auto; background: #fff; }
.preview-bubble {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 12px 14px;
  white-space: pre-wrap;
  font-size: 0.9rem;
}

.lb-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 100;
  padding: 16px 24px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}
</style>
