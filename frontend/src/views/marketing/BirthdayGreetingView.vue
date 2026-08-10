<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  BirthdayGreetingView — "Chúc sinh nhật" trong menu Marketing (2026-08-06).

  Ba dịp gửi quanh ngày sinh (trước N ngày / đúng ngày / sau N ngày), mỗi dịp một
  mẫu tin riêng, tất cả dùng chung một giờ gửi trong ngày.

  GET/PUT /api/v1/birthday-greetings/settings (PUT cần owner/admin)
  GET     /api/v1/birthday-greetings/upcoming
-->
<template>
  <div class="bd-settings">
    <div class="text-caption text-medium-emphasis mb-1">Marketing / Chúc sinh nhật</div>
    <header class="bd-head">
      <div class="bd-ico">🎂</div>
      <div>
        <h1 class="bd-h1">Chúc sinh nhật tự động</h1>
        <p class="bd-sub">
          Hệ thống quét khách có ngày sinh và tự gửi lời chúc đúng giờ anh chọn.
          Lời chúc nên <b>chỉ là lời chúc</b> — kèm khuyến mãi sẽ phản tác dụng.
        </p>
      </div>
    </header>

    <div v-if="loading" class="bd-loading">Đang tải cài đặt…</div>

    <template v-else>
      <div v-if="templateCount === 0" class="bd-warn">
        <v-icon size="18" color="#b45309">mdi-alert-outline</v-icon>
        <div>
          Chưa có <b>mẫu tin</b> nào — cần tạo mẫu lời chúc trước khi bật tính năng.
          <RouterLink to="/chat" class="bd-link">Tạo mẫu tin trong màn Chat →</RouterLink>
        </div>
      </div>

      <!-- Bật / tắt -->
      <section class="bd-card">
        <div class="bd-row">
          <div class="bd-row-text">
            <div class="bd-row-title">Bật chúc sinh nhật tự động</div>
            <div class="bd-row-desc">
              Tắt thì hàng đợi chưa gửi sẽ bị huỷ; lời chúc đã gửi vẫn giữ trong lịch sử.
            </div>
          </div>
          <v-switch v-model="form.enabled" color="primary" hide-details density="comfortable" :disabled="!canEdit" />
        </div>
      </section>

      <!-- Giờ gửi -->
      <section class="bd-card" :class="{ 'bd-disabled': !form.enabled }">
        <div class="bd-row-text" style="margin-bottom: 12px">
          <div class="bd-row-title">Giờ gửi trong ngày</div>
          <div class="bd-row-desc">
            Giờ Việt Nam (GMT+7). Cả ba dịp đều gửi vào giờ này. Tránh gửi quá sớm hoặc quá khuya.
          </div>
        </div>
        <div class="bd-time">
          <v-text-field
            v-model="form.sendTime"
            type="time"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 150px"
            :disabled="!form.enabled || !canEdit"
          />
          <div class="bd-quick">
            <button
              v-for="t in QUICK_TIMES"
              :key="t"
              type="button"
              class="bd-chip"
              :class="{ active: form.sendTime === t }"
              :disabled="!form.enabled || !canEdit"
              @click="form.sendTime = t"
            >{{ t }}</button>
          </div>
        </div>

        <div class="bd-row-text" style="margin: 18px 0 8px">
          <div class="bd-row-title">Trễ tối đa vẫn gửi bù</div>
          <div class="bd-row-desc">
            Máy chủ có sự cố thì lời chúc gửi bù trong khoảng này; quá thì bỏ luôn dịp đó.
            Nếu không có ngưỡng, hệ thống hồi phục lúc 3h sáng sẽ bắn tin vào giờ ngủ của khách.
          </div>
        </div>
        <v-text-field
          v-model.number="form.lateToleranceMinutes"
          type="number"
          :min="0"
          :max="1440"
          suffix="phút"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 180px"
          :disabled="!form.enabled || !canEdit"
        />
      </section>

      <!-- 3 dịp gửi -->
      <section
        v-for="occ in OCCASIONS"
        :key="occ.key"
        class="bd-card"
        :class="{ 'bd-disabled': !form.enabled }"
      >
        <div class="bd-row">
          <div class="bd-row-text">
            <div class="bd-row-title">{{ occ.icon }} {{ occ.title }}</div>
            <div class="bd-row-desc">{{ occ.desc }}</div>
          </div>
          <v-switch
            v-model="form[occ.enabledKey]"
            color="primary"
            hide-details
            density="comfortable"
            :disabled="!form.enabled || !canEdit"
          />
        </div>

        <div v-if="form[occ.enabledKey]" class="bd-occ-body">
          <label v-if="occ.daysKey" class="bd-field">
            <span>{{ occ.daysLabel }}</span>
            <v-text-field
              v-model.number="form[occ.daysKey]"
              type="number"
              :min="1"
              :max="30"
              suffix="ngày"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 150px"
              :disabled="!form.enabled || !canEdit"
            />
          </label>
          <label class="bd-field bd-field-grow">
            <span>Mẫu tin</span>
            <v-select
              v-model="form[occ.templateKey]"
              :items="templateItems"
              item-title="name"
              item-value="id"
              placeholder="Chọn mẫu tin…"
              density="compact"
              variant="outlined"
              hide-details
              :disabled="!form.enabled || !canEdit"
            />
          </label>
        </div>
        <p v-if="form[occ.enabledKey]" class="bd-hint">
          Xem trước: <span class="bd-preview">{{ previewOf(form[occ.templateKey]) }}</span>
        </p>
      </section>

      <!-- Nick gửi -->
      <section class="bd-card" :class="{ 'bd-disabled': !form.enabled }">
        <div class="bd-row-text" style="margin-bottom: 12px">
          <div class="bd-row-title">Gửi bằng nick nào</div>
          <div class="bd-row-desc">
            Lời chúc nên đến từ đúng người khách vẫn nhắn — nick lạ gửi lời chúc trông như spam.
          </div>
        </div>
        <v-radio-group v-model="form.senderMode" hide-details density="compact" :disabled="!form.enabled || !canEdit">
          <v-radio value="assigned" label="Nick đang chăm khách (khuyên dùng)" />
          <v-radio value="pool" label="Luân phiên các nick đã chọn" />
        </v-radio-group>
        <p class="bd-hint" style="margin-top: 4px">
          Chế độ "nick đang chăm khách" vẫn dùng danh sách dưới đây khi khách chưa có hội thoại.
        </p>
        <v-select
          v-model="form.zaloAccountIds"
          :items="nickItems"
          item-title="label"
          item-value="id"
          multiple
          chips
          closable-chips
          placeholder="Chọn nick…"
          density="compact"
          variant="outlined"
          hide-details
          class="bd-nicks"
          :disabled="!form.enabled || !canEdit"
        />
      </section>

      <!-- Hạn mức -->
      <section class="bd-card" :class="{ 'bd-disabled': !form.enabled }">
        <div class="bd-row-text" style="margin-bottom: 12px">
          <div class="bd-row-title">Hạn mức &amp; nhịp gửi</div>
          <div class="bd-row-desc">
            Van an toàn chống Zalo khoá nick. Nick còn phải chat tay và phục vụ chiến dịch khác.
          </div>
        </div>
        <div class="bd-grid">
          <label class="bd-field"><span>Tối đa / ngày (cả tổ chức)</span>
            <v-text-field v-model.number="form.dailyQuota" type="number" :min="1" :max="1000" suffix="tin"
              density="compact" variant="outlined" hide-details :disabled="!form.enabled || !canEdit" />
          </label>
          <label class="bd-field"><span>Tối đa / ngày / nick</span>
            <v-text-field v-model.number="form.perNickDailyQuota" type="number" :min="1" :max="1000" suffix="tin"
              density="compact" variant="outlined" hide-details :disabled="!form.enabled || !canEdit" />
          </label>
          <label class="bd-field"><span>Giãn cách tối thiểu</span>
            <v-text-field v-model.number="form.minDelaySec" type="number" :min="5" :max="600" suffix="giây"
              density="compact" variant="outlined" hide-details :disabled="!form.enabled || !canEdit" />
          </label>
          <label class="bd-field"><span>Giãn cách tối đa</span>
            <v-text-field v-model.number="form.maxDelaySec" type="number" :min="5" :max="600" suffix="giây"
              density="compact" variant="outlined" hide-details :disabled="!form.enabled || !canEdit" />
          </label>
        </div>
      </section>

      <div class="bd-actions">
        <span v-if="!canEdit" class="bd-noperm">Chỉ chủ tổ chức / quản trị mới sửa được</span>
        <v-btn v-else color="primary" :loading="saving" :disabled="!dirty" @click="save">Lưu cài đặt</v-btn>
      </div>

      <!-- Hàng đợi -->
      <section class="bd-card">
        <div class="bd-row">
          <div class="bd-row-text">
            <div class="bd-row-title">Hàng đợi lời chúc</div>
            <div class="bd-row-desc">Đã lên lịch và đã gửi trong 14 ngày gần đây.</div>
          </div>
          <v-btn variant="text" size="small" :loading="loadingQueue" @click="loadQueue">Tải lại</v-btn>
        </div>

        <div v-if="queue.length === 0" class="bd-empty">
          Chưa có lời chúc nào trong hàng đợi.
          <template v-if="form.enabled">
            Hệ thống quét lại mỗi 10 phút — hoặc bấm Lưu cài đặt để dựng hàng đợi ngay.
          </template>
        </div>

        <table v-else class="bd-table">
          <thead>
            <tr>
              <th>Khách</th><th>Dịp</th><th>Sinh nhật</th><th>Giờ gửi</th><th>Trạng thái</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in queue" :key="g.id">
              <td>{{ g.contact?.fullName || 'Không tên' }}</td>
              <td>{{ g.occasionLabel }}</td>
              <td>{{ formatDate(g.birthdayOn) }}</td>
              <td>{{ formatDateTime(g.dueAt) }}</td>
              <td>
                <span class="bd-state" :class="`is-${g.state}`">{{ STATE_LABELS[g.state] ?? g.state }}</span>
                <span v-if="g.errorCode" class="bd-errcode" :title="g.errorMessage ?? ''">{{ g.errorCode }}</span>
              </td>
              <td class="bd-td-action">
                <v-btn
                  v-if="g.state === 'pending' && canEdit"
                  variant="text"
                  size="x-small"
                  :loading="sendingId === g.id"
                  @click="sendNow(g.id)"
                >Gửi ngay</v-btn>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';

const toast = useToast();
const auth = useAuthStore();

const QUICK_TIMES = ['08:00', '09:00', '10:00', '14:00'];

const STATE_LABELS: Record<string, string> = {
  pending: 'Chờ gửi', sent: 'Đã gửi', failed: 'Lỗi', skipped: 'Bỏ qua',
};

/**
 * Ba dịp khai báo một chỗ để template lặp — thêm/bớt dịp chỉ sửa mảng này.
 * `daysKey` null ở dịp "đúng ngày" vì không có độ lệch để nhập.
 */
const OCCASIONS = [
  {
    key: 'before', icon: '⏳', title: 'Trước sinh nhật',
    desc: 'Nhắn sớm để khách chủ động sắp lịch — hợp với khách VIP.',
    enabledKey: 'beforeEnabled', daysKey: 'beforeDays', daysLabel: 'Gửi trước', templateKey: 'beforeTemplateId',
  },
  {
    key: 'on_day', icon: '🎂', title: 'Đúng ngày sinh nhật',
    desc: 'Lời chúc chính. Chỉ chúc, không bán gì.',
    enabledKey: 'onDayEnabled', daysKey: null, daysLabel: '', templateKey: 'onDayTemplateId',
  },
  {
    key: 'after', icon: '🕘', title: 'Sau sinh nhật',
    desc: 'Chúc muộn — cứu những khách bị bỏ sót, hoặc làm cớ hỏi thăm lần hai.',
    enabledKey: 'afterEnabled', daysKey: 'afterDays', daysLabel: 'Gửi sau', templateKey: 'afterTemplateId',
  },
] as const;

interface BirthdayForm {
  enabled: boolean;
  sendTime: string;
  lateToleranceMinutes: number;
  beforeEnabled: boolean; beforeDays: number; beforeTemplateId: string | null;
  onDayEnabled: boolean; onDayTemplateId: string | null;
  afterEnabled: boolean; afterDays: number; afterTemplateId: string | null;
  senderMode: string;
  zaloAccountIds: string[];
  dailyQuota: number; perNickDailyQuota: number;
  minDelaySec: number; maxDelaySec: number;
}

function emptyForm(): BirthdayForm {
  return {
    enabled: false, sendTime: '09:00', lateToleranceMinutes: 180,
    beforeEnabled: false, beforeDays: 3, beforeTemplateId: null,
    onDayEnabled: true, onDayTemplateId: null,
    afterEnabled: false, afterDays: 1, afterTemplateId: null,
    senderMode: 'assigned', zaloAccountIds: [],
    dailyQuota: 200, perNickDailyQuota: 40, minDelaySec: 30, maxDelaySec: 90,
  };
}

interface QueueRow {
  id: string; occasion: string; occasionLabel: string;
  birthdayOn: string; dueAt: string; state: string;
  errorCode: string | null; errorMessage: string | null;
  contact: { id: string; fullName: string | null } | null;
}

const loading = ref(true);
const saving = ref(false);
const loadingQueue = ref(false);
const sendingId = ref<string | null>(null);
const templateCount = ref(0);
const canEdit = ref(false);

const form = reactive<BirthdayForm>(emptyForm());
const saved = ref<BirthdayForm>(emptyForm());

const templates = ref<Array<{ id: string; name: string; content: string }>>([]);
const nicks = ref<Array<{ id: string; displayName: string | null; status: string }>>([]);
const queue = ref<QueueRow[]>([]);

const templateItems = computed(() => templates.value.map((t) => ({ id: t.id, name: t.name })));
const nickItems = computed(() =>
  nicks.value.map((n) => ({
    id: n.id,
    label: `${n.displayName || 'Nick chưa đặt tên'}${n.status === 'connected' ? '' : ' (mất kết nối)'}`,
  })),
);

// So sánh bằng JSON: form phẳng, không có Date/hàm nên đủ tin cậy và ngắn gọn.
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(saved.value));

function previewOf(templateId: string | null): string {
  if (!templateId) return '(chưa chọn mẫu)';
  const t = templates.value.find((x) => x.id === templateId);
  if (!t) return '(mẫu tin đã bị xoá)';
  const text = (t.content ?? '').trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text || '(mẫu rỗng — chỉ có đính kèm)';
}

function formatDate(raw: string): string {
  return new Date(raw).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(raw: string): string {
  return new Date(raw).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function applyServer(data: Record<string, unknown>) {
  const next = emptyForm();
  for (const key of Object.keys(next) as Array<keyof BirthdayForm>) {
    if (data[key] !== undefined && data[key] !== null) {
      (next[key] as unknown) = data[key];
    }
  }
  // zaloAccountIds có thể về mảng rỗng — vòng lặp trên bỏ qua null nên gán lại.
  next.zaloAccountIds = Array.isArray(data.zaloAccountIds) ? [...(data.zaloAccountIds as string[])] : [];
  Object.assign(form, next);
  saved.value = JSON.parse(JSON.stringify(next));
  canEdit.value = !!data.canEdit;
  templateCount.value = Number(data.templateCount ?? templateCount.value);
}

async function load() {
  loading.value = true;
  try {
    const [settings, tpl, acc] = await Promise.all([
      api.get('/birthday-greetings/settings'),
      api.get('/message-templates', { params: { limit: 200 } }),
      api.get('/zalo-accounts'),
    ]);
    applyServer(settings.data);
    templates.value = (tpl.data?.templates ?? []).map((t: Record<string, unknown>) => ({
      id: String(t.id), name: String(t.name ?? 'Mẫu không tên'), content: String(t.content ?? ''),
    }));
    nicks.value = Array.isArray(acc.data) ? acc.data : [];
  } catch {
    toast.error('Không tải được cài đặt sinh nhật');
  } finally {
    loading.value = false;
  }
  await loadQueue();
}

async function loadQueue() {
  loadingQueue.value = true;
  try {
    const { data } = await api.get('/birthday-greetings/upcoming', { params: { limit: 100 } });
    queue.value = data?.items ?? [];
  } catch {
    // Hàng đợi chỉ là thông tin phụ — hỏng thì đừng che mất trang cài đặt.
    queue.value = [];
  } finally {
    loadingQueue.value = false;
  }
}

/** Chặn tại chỗ những lỗi người dùng thấy ngay, còn lại để server chốt. */
function localError(): string | null {
  if (!form.enabled) return null;
  if (!form.beforeEnabled && !form.onDayEnabled && !form.afterEnabled) {
    return 'Cần bật ít nhất một dịp gửi';
  }
  for (const occ of OCCASIONS) {
    if (form[occ.enabledKey] && !form[occ.templateKey]) {
      return `Dịp "${occ.title}" chưa chọn mẫu tin`;
    }
  }
  if (form.minDelaySec > form.maxDelaySec) return 'Giãn cách tối thiểu phải ≤ tối đa';
  if (form.senderMode === 'pool' && form.zaloAccountIds.length === 0) {
    return 'Chế độ luân phiên cần chọn ít nhất 1 nick';
  }
  return null;
}

async function save() {
  const err = localError();
  if (err) {
    toast.error(err);
    return;
  }
  saving.value = true;
  try {
    const { data } = await api.put('/birthday-greetings/settings', { ...form });
    applyServer(data);
    const planned = Number(data.planned ?? 0);
    toast.success(
      planned > 0 ? `Đã lưu — lên lịch ${planned} lời chúc cho hôm nay` : 'Đã lưu cài đặt sinh nhật',
    );
    await loadQueue();
  } catch (e) {
    const body = (e as { response?: { data?: { hint?: string; error?: string } } }).response?.data;
    toast.error(body?.hint || body?.error || 'Lưu cài đặt thất bại');
  } finally {
    saving.value = false;
  }
}

async function sendNow(id: string) {
  sendingId.value = id;
  try {
    const { data } = await api.post(`/birthday-greetings/${id}/send-now`);
    const kind = data?.outcome?.kind;
    if (kind === 'sent') toast.success('Đã gửi lời chúc');
    else if (kind === 'failed') toast.error(`Gửi lỗi: ${data.outcome.errorCode}`);
    else toast.error(`Bỏ qua: ${data?.outcome?.reason ?? 'không rõ'}`);
    await loadQueue();
  } catch {
    toast.error('Gửi lời chúc thất bại');
  } finally {
    sendingId.value = null;
  }
}

onMounted(() => {
  canEdit.value = ['owner', 'admin'].includes(auth.user?.role ?? '');
  void load();
});
</script>

<style scoped>
.bd-settings { max-width: 780px; padding: 24px 32px; font-family: 'Inter', -apple-system, sans-serif; color: #1F2D3D; }
.bd-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 20px; }
.bd-ico { width: 44px; height: 44px; border-radius: 12px; background: #FFF1F2; display: grid; place-items: center; font-size: 22px; flex: none; }
.bd-h1 { font-size: 19px; font-weight: 700; margin: 0 0 4px; }
.bd-sub { font-size: 13px; color: #6B7785; margin: 0; line-height: 1.55; }
.bd-loading { padding: 28px; text-align: center; color: #97A0AC; }

.bd-warn { display: flex; gap: 10px; align-items: flex-start; background: #FFFBEB; border: 1px solid #FDE68A;
  color: #92400E; border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.5; margin-bottom: 18px; }
.bd-link { color: #5E6AD2; font-weight: 600; text-decoration: none; white-space: nowrap; }
.bd-link:hover { text-decoration: underline; }

.bd-card { background: #fff; border: 1px solid #E4E5E9; border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.bd-card.bd-disabled { opacity: 0.6; }
.bd-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.bd-row-title { font-size: 14.5px; font-weight: 600; margin-bottom: 3px; }
.bd-row-desc { font-size: 12.5px; color: #6B7785; line-height: 1.5; }

.bd-time { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bd-quick { display: flex; gap: 6px; }
.bd-chip { border: 1px solid #D4D6DB; background: #fff; border-radius: 999px; padding: 5px 13px; font-size: 12.5px;
  font-weight: 600; color: #475066; cursor: pointer; font-family: inherit; transition: all .12s; }
.bd-chip:hover:not(:disabled) { border-color: #5E6AD2; color: #5E6AD2; }
.bd-chip.active { background: #EEF0FF; border-color: #5E6AD2; color: #5E6AD2; }
.bd-chip:disabled { opacity: .5; cursor: default; }

.bd-occ-body { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
.bd-field { display: flex; flex-direction: column; gap: 5px; min-width: 150px; }
.bd-field > span { font-size: 12px; font-weight: 600; color: #475066; }
.bd-field-grow { flex: 1; min-width: 240px; }
.bd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.bd-nicks { margin-top: 10px; }

.bd-hint { font-size: 12px; color: #97A0AC; margin: 10px 0 0; }
.bd-preview { color: #475066; font-style: italic; }

.bd-actions { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin: 8px 0 22px; }
.bd-noperm { font-size: 12.5px; color: #97A0AC; }

.bd-empty { font-size: 12.5px; color: #97A0AC; padding: 16px 0 4px; line-height: 1.55; }
.bd-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12.5px; }
.bd-table th { text-align: left; font-weight: 600; color: #6B7785; padding: 6px 8px; border-bottom: 1px solid #E4E5E9; }
.bd-table td { padding: 7px 8px; border-bottom: 1px solid #F1F2F4; }
.bd-td-action { text-align: right; white-space: nowrap; }
.bd-state { display: inline-block; border-radius: 999px; padding: 2px 9px; font-weight: 600; font-size: 11.5px; }
.bd-state.is-pending { background: #EEF0FF; color: #4C58C0; }
.bd-state.is-sent { background: #ECFDF5; color: #047857; }
.bd-state.is-failed { background: #FEF2F2; color: #B91C1C; }
.bd-state.is-skipped { background: #F3F4F6; color: #6B7280; }
.bd-errcode { margin-left: 6px; font-size: 11px; color: #97A0AC; cursor: help; }
</style>
