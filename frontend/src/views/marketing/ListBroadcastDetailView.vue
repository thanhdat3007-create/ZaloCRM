<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  Chi tiết chiến dịch nhắn tệp KH (🟢 Community).
  Hai bảng trả lời hai câu hỏi khác nhau:
    - "Ai đã nhận / ai lỗi"  → bảng người nhận (hàng đợi, sống suốt chiến dịch)
    - "Hôm nay chạy thế nào" → bảng lát gửi (mỗi lát vài chục tin)
-->
<template>
  <div class="pa-6">
    <div v-if="broadcast" class="d-flex align-center mb-5 flex-wrap gap-3">
      <div>
        <div class="text-caption text-medium-emphasis">
          <RouterLink to="/marketing/list-broadcasts" class="text-decoration-none">Nhắn tệp hàng loạt</RouterLink>
          / {{ broadcast.customerList?.name ?? '' }}
        </div>
        <h1 class="text-h5 font-weight-bold">{{ broadcast.name }}</h1>
        <div class="text-body-2 text-medium-emphasis mt-1">
          {{ describeWindow(broadcast) }} · {{ nicks.length }} nick gửi luân phiên
        </div>
      </div>
      <v-spacer />
      <v-chip :color="STATE_COLOR[broadcast.state]" variant="tonal" class="font-weight-medium">
        {{ STATE_LABEL[broadcast.state] }}
      </v-chip>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
      {{ error.message }}
    </v-alert>

    <v-alert
      v-if="broadcast?.pausedReason"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-4"
    >
      {{ describePausedReason(broadcast.pausedReason) }} — sửa cấu hình hoặc bật lại khi nick đã sẵn sàng.
    </v-alert>

    <template v-if="broadcast">
      <!-- Thanh thao tác -->
      <div class="d-flex align-center gap-2 flex-wrap mb-5">
        <v-btn
          v-if="broadcast.state === 'active'"
          variant="outlined"
          prepend-icon="mdi-pause"
          :loading="saving"
          @click="onControl('pause')"
        >
          Tạm dừng
        </v-btn>
        <v-btn
          v-else-if="['draft', 'paused', 'completed'].includes(broadcast.state)"
          color="primary"
          prepend-icon="mdi-play"
          :loading="saving"
          @click="onControl('activate')"
        >
          Bật lịch gửi
        </v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-flash" :loading="saving" @click="onControl('run-now')">
          Gửi thử 1 lượt
        </v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-sync" :loading="saving" @click="onControl('sync-recipients')">
          Cập nhật danh sách nhận
        </v-btn>
        <v-btn
          v-if="(counts.failed ?? 0) > 0"
          variant="outlined"
          color="warning"
          prepend-icon="mdi-refresh"
          :loading="saving"
          @click="onControl('retry-failed')"
        >
          Gửi lại {{ counts.failed }} người lỗi
        </v-btn>
        <v-spacer />
        <v-btn variant="text" prepend-icon="mdi-pencil" :to="`/marketing/list-broadcasts/${broadcastId}/edit`">
          Sửa cấu hình
        </v-btn>
      </div>

      <!-- Thẻ số liệu -->
      <div class="stat-grid mb-6">
        <v-card variant="outlined" class="pa-4">
          <div class="text-caption text-medium-emphasis">Tổng người nhận</div>
          <div class="text-h5 font-weight-bold">{{ broadcast.totalRecipients.toLocaleString('vi-VN') }}</div>
        </v-card>
        <v-card variant="outlined" class="pa-4">
          <div class="text-caption text-medium-emphasis">Đã gửi</div>
          <div class="text-h5 font-weight-bold text-success">{{ (counts.sent ?? 0).toLocaleString('vi-VN') }}</div>
        </v-card>
        <v-card variant="outlined" class="pa-4">
          <div class="text-caption text-medium-emphasis">Còn chờ</div>
          <div class="text-h5 font-weight-bold">{{ (counts.pending ?? 0).toLocaleString('vi-VN') }}</div>
        </v-card>
        <v-card variant="outlined" class="pa-4">
          <div class="text-caption text-medium-emphasis">Lỗi</div>
          <div class="text-h5 font-weight-bold" :class="(counts.failed ?? 0) > 0 ? 'text-error' : ''">
            {{ (counts.failed ?? 0).toLocaleString('vi-VN') }}
          </div>
        </v-card>
        <v-card variant="outlined" class="pa-4">
          <div class="text-caption text-medium-emphasis">Lượt gửi kế tiếp</div>
          <div class="text-body-1 font-weight-bold">
            {{ broadcast.nextRunAt ? formatDateTime(broadcast.nextRunAt) : '—' }}
          </div>
        </v-card>
      </div>

      <!-- Người nhận -->
      <v-card variant="outlined" class="mb-6">
        <div class="d-flex align-center pa-4 pb-2 flex-wrap gap-2">
          <div class="text-subtitle-1 font-weight-bold">Người nhận</div>
          <v-spacer />
          <v-btn-toggle v-model="recipientFilter" density="compact" variant="outlined" mandatory @update:model-value="loadRecipients">
            <v-btn value="">Tất cả</v-btn>
            <v-btn value="pending">Chờ gửi</v-btn>
            <v-btn value="sent">Đã gửi</v-btn>
            <v-btn value="failed">Lỗi</v-btn>
          </v-btn-toggle>
        </div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Khách</th>
              <th>Số điện thoại</th>
              <th>Nick gửi</th>
              <th>Thời điểm gửi</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in recipients" :key="r.id">
              <td>{{ r.displayName || '—' }}</td>
              <td class="text-mono">{{ r.phoneE164 }}</td>
              <td>{{ nickName(r.zaloAccountId) }}</td>
              <td>{{ r.sentAt ? formatDateTime(r.sentAt) : '—' }}</td>
              <td>
                <v-chip :color="RECIPIENT_COLOR[r.state]" size="x-small" variant="tonal">
                  {{ RECIPIENT_LABEL[r.state] }}
                </v-chip>
                <div v-if="r.errorCode" class="text-caption text-error mt-1">
                  {{ describeRecipientError(r.errorCode) }}
                </div>
              </td>
            </tr>
            <tr v-if="!recipients.length">
              <td colspan="5" class="text-center text-medium-emphasis py-6">Không có người nhận nào</td>
            </tr>
          </tbody>
        </v-table>
        <div v-if="recipientTotal > recipients.length" class="pa-3 text-center">
          <v-btn variant="text" size="small" @click="loadMoreRecipients">
            Xem thêm ({{ recipients.length }}/{{ recipientTotal }})
          </v-btn>
        </div>
      </v-card>

      <!-- Lịch sử lát gửi -->
      <v-card variant="outlined">
        <div class="pa-4 pb-2 text-subtitle-1 font-weight-bold">Lịch sử lượt gửi</div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Bắt đầu</th>
              <th>Nguồn</th>
              <th class="text-right">Dự kiến</th>
              <th class="text-right">Đã gửi</th>
              <th class="text-right">Lỗi</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in runs" :key="run.id">
              <td>{{ formatDateTime(run.scheduledFor) }}</td>
              <td>{{ run.triggeredBy === 'manual' ? 'Gửi thử' : 'Theo lịch' }}</td>
              <td class="text-right">{{ run.plannedCount }}</td>
              <td class="text-right text-success">{{ run.sentCount }}</td>
              <td class="text-right" :class="run.failedCount > 0 ? 'text-error' : ''">{{ run.failedCount }}</td>
              <td>
                <v-chip :color="RUN_COLOR[run.state] ?? 'grey'" size="x-small" variant="tonal">
                  {{ RUN_LABEL[run.state] ?? run.state }}
                </v-chip>
                <div v-if="run.skipReason" class="text-caption text-medium-emphasis mt-1">
                  {{ describeSkipReason(run.skipReason) }}
                </div>
              </td>
            </tr>
            <tr v-if="!runs.length">
              <td colspan="6" class="text-center text-medium-emphasis py-6">Chưa có lượt gửi nào</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="5000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { formatInOrgTz } from '@/composables/use-org-timezone';
import {
  useListBroadcasts, describeWindow, describePausedReason, describeRecipientError, describeSkipReason,
  type ListBroadcast, type ListBroadcastNick, type ListBroadcastState, type RecipientState, type RunState,
} from '@/composables/use-list-broadcasts';

/** Chiến dịch chạy cả ngày → làm tươi định kỳ để sale không phải F5 xem tiến độ. */
const REFRESH_MS = 30_000;
const RECIPIENT_PAGE = 50;

const route = useRoute();
const broadcastId = computed(() => route.params.id as string);

const {
  runs, recipients, recipientTotal, counts, saving, error,
  fetchBroadcast, fetchRuns, fetchRecipients, control,
} = useListBroadcasts();

const broadcast = ref<ListBroadcast | null>(null);
const nicks = ref<ListBroadcastNick[]>([]);
const recipientFilter = ref('');
const recipientOffset = ref(0);

const STATE_LABEL: Record<ListBroadcastState, string> = {
  draft: 'Nháp', active: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn tất', cancelled: 'Đã huỷ',
};
const STATE_COLOR: Record<ListBroadcastState, string> = {
  draft: 'grey', active: 'success', paused: 'warning', completed: 'primary', cancelled: 'error',
};
const RECIPIENT_LABEL: Record<RecipientState, string> = {
  pending: 'Chờ gửi', sent: 'Đã gửi', failed: 'Lỗi', skipped: 'Bỏ qua',
};
const RECIPIENT_COLOR: Record<RecipientState, string> = {
  pending: 'grey', sent: 'success', failed: 'error', skipped: 'warning',
};
const RUN_LABEL: Record<RunState, string> = {
  pending: 'Chờ chạy', running: 'Đang chạy', completed: 'Xong', partial: 'Xong một phần',
  failed: 'Thất bại', skipped: 'Bỏ lượt',
};
const RUN_COLOR: Record<RunState, string> = {
  pending: 'grey', running: 'info', completed: 'success', partial: 'warning',
  failed: 'error', skipped: 'grey',
};

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  Object.assign(snack, { show: true, message, color });
}

function formatDateTime(iso: string): string {
  return formatInOrgTz(iso);
}

function nickName(id: string | null): string {
  if (!id) return '—';
  const nick = nicks.value.find((n) => n.id === id);
  return nick?.displayName || nick?.phone || id.slice(0, 8);
}

async function loadBroadcast() {
  const loaded = await fetchBroadcast(broadcastId.value);
  if (!loaded) return;
  broadcast.value = loaded.broadcast;
  nicks.value = loaded.nicks;
}

async function loadRecipients() {
  recipientOffset.value = 0;
  await fetchRecipients(broadcastId.value, {
    state: recipientFilter.value || undefined,
    limit: RECIPIENT_PAGE,
    offset: 0,
  });
}

async function loadMoreRecipients() {
  recipientOffset.value += RECIPIENT_PAGE;
  const previous = [...recipients.value];
  await fetchRecipients(broadcastId.value, {
    state: recipientFilter.value || undefined,
    limit: RECIPIENT_PAGE,
    offset: recipientOffset.value,
  });
  recipients.value = [...previous, ...recipients.value];
}

/**
 * Làm tươi định kỳ. Bảng người nhận chỉ nạp lại khi đang ở trang đầu — nếu không,
 * mỗi nhịp 30s sẽ xoá sạch những trang sale vừa bấm "Xem thêm".
 */
async function refreshAll() {
  const tasks: Array<Promise<unknown>> = [loadBroadcast(), fetchRuns(broadcastId.value)];
  if (recipientOffset.value === 0) tasks.push(loadRecipients());
  await Promise.all(tasks);
}

const CONTROL_MESSAGE: Record<string, string> = {
  activate: 'Đã bật lịch gửi',
  pause: 'Đã tạm dừng',
  'run-now': 'Đã xếp hàng một lượt gửi — theo dõi ở bảng lịch sử',
  'retry-failed': 'Đã đưa người lỗi về hàng chờ',
};

async function onControl(
  action: 'activate' | 'pause' | 'run-now' | 'sync-recipients' | 'retry-failed',
) {
  const result = await control(broadcastId.value, action);
  if (!result) return notify(error.value?.message ?? 'Thao tác không thành công', 'error');
  if (action === 'sync-recipients') {
    notify(
      result.added > 0
        ? `Đã thêm ${result.added} khách mới vào hàng đợi (tổng ${result.total})`
        : 'Tệp chưa có khách nào mới có Zalo',
    );
  } else {
    notify(CONTROL_MESSAGE[action] ?? 'Đã thực hiện');
  }
  await refreshAll();
}

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await Promise.all([loadBroadcast(), fetchRuns(broadcastId.value), loadRecipients()]);
  timer = setInterval(refreshAll, REFRESH_MS);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.text-mono { font-family: var(--mono, monospace); font-size: 12.5px; }
</style>
