<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  GroupBroadcastDetailView — lịch sử các lượt gửi + bảng chi tiết từng nhóm.
  Poll mỗi 3s khi lượt đang chọn còn pending/running (khuôn poll của GroupScanView).
-->
<template>
  <div class="d-flex flex-column h-100">
    <div class="d-flex align-center pa-4 pb-2 gap-3">
      <div>
        <div class="text-caption text-medium-emphasis">Marketing / Gửi nhóm</div>
        <h1 class="text-h5">{{ broadcast?.name ?? 'Chiến dịch' }}</h1>
      </div>
      <v-spacer />
      <v-btn variant="text" to="/marketing/group-broadcasts">Quay lại</v-btn>
      <v-btn v-if="broadcast" variant="outlined" prepend-icon="mdi-pencil" :to="`/marketing/group-broadcasts/${broadcast.id}/edit`">
        Sửa
      </v-btn>
    </div>

    <div class="flex-1-1 overflow-auto px-4 pb-4">
      <!-- Thẻ tóm tắt -->
      <v-card v-if="broadcast" variant="outlined" class="pa-4 mb-4">
        <div class="summary-grid">
          <div>
            <div class="text-caption text-medium-emphasis">Nick gửi</div>
            <div>{{ broadcast.zaloAccount?.displayName ?? '—' }}</div>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Số nhóm</div>
            <div>{{ broadcast.targetGroupIds.length }}</div>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Lịch</div>
            <div>{{ describeSchedule(broadcast) }}</div>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Lần chạy kế</div>
            <div>{{ broadcast.nextRunAt ? formatTime(broadcast.nextRunAt) : '—' }}</div>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Tổng đã gửi / thất bại</div>
            <div>{{ totalSent }} / {{ totalFailed }}</div>
          </div>
        </div>

        <v-alert
          v-if="broadcast.pausedReason === 'CONSECUTIVE_FAILURES'"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          Chiến dịch tự dừng sau 3 lượt hỏng liên tiếp. Kiểm tra nick còn trong nhóm không, rồi bấm Bật lại.
          <template #append>
            <v-btn size="small" variant="flat" color="error" @click="reactivate">Bật lại</v-btn>
          </template>
        </v-alert>
      </v-card>

      <!-- Danh sách lượt chạy -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">Lịch sử lượt gửi</v-card-title>
        <v-divider />
        <v-data-table
          :headers="runHeaders"
          :items="runs"
          :loading="loading"
          density="compact"
          no-data-text="Chưa có lượt gửi nào"
          @click:row="(_e: unknown, row: any) => openRun(row.item.id)"
        >
          <template #item.scheduledFor="{ item }">{{ formatTime(item.scheduledFor) }}</template>
          <template #item.triggeredBy="{ item }">{{ TRIGGER_LABEL[item.triggeredBy] ?? item.triggeredBy }}</template>
          <template #item.state="{ item }">
            <v-chip size="small" :color="RUN_STATE_COLOR[item.state]" variant="tonal">
              {{ RUN_STATE_LABEL[item.state] }}
            </v-chip>
            <span v-if="item.skipReason" class="text-caption text-medium-emphasis ml-2">
              {{ describeSkipReason(item.skipReason) }}
            </span>
          </template>
          <template #item.result="{ item }">
            {{ item.sentCount }} gửi · {{ item.failedCount }} lỗi / {{ item.totalTargets }}
          </template>
        </v-data-table>
      </v-card>

      <!-- Bảng chi tiết từng nhóm -->
      <v-card v-if="selectedRun" variant="outlined">
        <v-card-title class="d-flex align-center text-subtitle-1">
          <span>Chi tiết lượt {{ formatTime(selectedRun.scheduledFor) }}</span>
          <v-chip size="small" class="ml-2" :color="RUN_STATE_COLOR[selectedRun.state]" variant="tonal">
            {{ RUN_STATE_LABEL[selectedRun.state] }}
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="selectedRun.failedCount > 0"
            size="small"
            color="primary"
            variant="flat"
            prepend-icon="mdi-refresh"
            :loading="saving"
            @click="onRetryFailed"
          >
            Gửi lại nhóm lỗi
          </v-btn>
        </v-card-title>
        <v-divider />
        <v-data-table
          :headers="targetHeaders"
          :items="selectedRun.targets ?? []"
          density="compact"
          no-data-text="Chưa có nhóm nào"
        >
          <template #item.state="{ item }">
            <v-chip size="small" :color="TARGET_STATE_COLOR[item.state]" variant="tonal">
              {{ TARGET_STATE_LABEL[item.state] }}
            </v-chip>
          </template>
          <template #item.sentAt="{ item }">
            {{ item.sentAt ? formatTime(item.sentAt) : '—' }}
          </template>
          <template #item.error="{ item }">
            <span v-if="item.errorCode" class="text-error">{{ describeTargetError(item.errorCode) }}</span>
            <span v-else-if="item.errorMessage" class="text-warning text-caption">{{ item.errorMessage }}</span>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
        </v-data-table>
      </v-card>
    </div>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="4000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import {
  useGroupBroadcasts, describeSchedule, describeSkipReason, describeTargetError,
  type GroupBroadcast, type GroupBroadcastRun, type RunState,
} from '@/composables/use-group-broadcasts';

/** Nhịp poll khi lượt đang chạy. */
const POLL_MS = 3000;

const route = useRoute();
const broadcastId = route.params.id as string;

const {
  runs, loading, saving, error,
  fetchBroadcast, fetchRuns, fetchRun, retryFailed, control,
} = useGroupBroadcasts();

const broadcast = ref<GroupBroadcast | null>(null);
const selectedRun = ref<GroupBroadcastRun | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const RUN_STATE_LABEL: Record<RunState, string> = {
  pending: 'Chờ gửi', running: 'Đang gửi', completed: 'Hoàn tất',
  partial: 'Gửi một phần', failed: 'Thất bại', skipped: 'Bỏ qua',
};
const RUN_STATE_COLOR: Record<RunState, string> = {
  pending: 'grey', running: 'info', completed: 'success',
  partial: 'warning', failed: 'error', skipped: 'grey',
};
const TARGET_STATE_LABEL: Record<string, string> = {
  pending: 'Chờ gửi', sent: 'Đã gửi', failed: 'Lỗi', skipped: 'Bỏ qua',
};
const TARGET_STATE_COLOR: Record<string, string> = {
  pending: 'grey', sent: 'success', failed: 'error', skipped: 'grey',
};
const TRIGGER_LABEL: Record<string, string> = {
  schedule: 'Theo lịch', manual: 'Thủ công', retry: 'Gửi lại',
};

const runHeaders = [
  { title: 'Thời điểm', key: 'scheduledFor' },
  { title: 'Nguồn', key: 'triggeredBy' },
  { title: 'Trạng thái', key: 'state' },
  { title: 'Kết quả', key: 'result', sortable: false },
];
const targetHeaders = [
  { title: 'Tên nhóm', key: 'groupName' },
  { title: 'Trạng thái', key: 'state' },
  { title: 'Giờ gửi', key: 'sentAt' },
  { title: 'Lỗi', key: 'error', sortable: false },
];

const totalSent = computed(() => runs.value.reduce((n, r) => n + r.sentCount, 0));
const totalFailed = computed(() => runs.value.reduce((n, r) => n + r.failedCount, 0));

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  Object.assign(snack, { show: true, message, color });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

async function openRun(runId: string) {
  selectedRun.value = await fetchRun(runId);
  syncPolling();
}

/** Chỉ poll khi lượt đang chọn còn chạy — xong thì dừng hẳn. */
function syncPolling() {
  const active = selectedRun.value && ['pending', 'running'].includes(selectedRun.value.state);
  if (active && !pollTimer) {
    pollTimer = setInterval(async () => {
      if (!selectedRun.value) return;
      selectedRun.value = await fetchRun(selectedRun.value.id);
      await fetchRuns(broadcastId);
      syncPolling();
    }, POLL_MS);
  } else if (!active && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function onRetryFailed() {
  if (!selectedRun.value) return;
  // Server tạo LƯỢT MỚI chỉ gồm nhóm lỗi → chuyển sang theo dõi lượt đó.
  const newRunId = await retryFailed(selectedRun.value.id);
  if (!newRunId) return notify(error.value?.message ?? 'Không gửi lại được', 'error');
  notify('Đã xếp hàng gửi lại các nhóm lỗi');
  await fetchRuns(broadcastId);
  await openRun(newRunId);
}

async function reactivate() {
  const ok = await control(broadcastId, 'activate');
  if (!ok) return notify(error.value?.message ?? 'Không bật lại được', 'error');
  notify('Đã bật lại chiến dịch');
  const loaded = await fetchBroadcast(broadcastId);
  if (loaded) broadcast.value = loaded.broadcast;
}

onMounted(async () => {
  const loaded = await fetchBroadcast(broadcastId);
  if (loaded) broadcast.value = loaded.broadcast;
  await fetchRuns(broadcastId);
  if (runs.value.length > 0) await openRun(runs.value[0].id);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.summary-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px;
}
</style>
