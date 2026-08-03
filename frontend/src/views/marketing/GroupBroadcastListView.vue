<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  GroupBroadcastListView — danh sách chiến dịch gửi nhóm hàng loạt (🟢 Community).
  Bảng: Tên · Nick · Số nhóm · Lịch · Lần chạy kế · Trạng thái · Thao tác.
-->
<template>
  <div class="d-flex flex-column h-100">
    <div class="d-flex align-center pa-4 pb-2 gap-3">
      <div>
        <div class="text-caption text-medium-emphasis">Marketing / Gửi nhóm</div>
        <h1 class="text-h5">Gửi nhóm hàng loạt</h1>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" to="/marketing/group-broadcasts/new">
        Tạo chiến dịch
      </v-btn>
    </div>

    <div class="flex-1-1 overflow-auto px-4 pb-4">
      <v-card variant="outlined">
        <v-data-table
          :headers="headers"
          :items="broadcasts"
          :loading="loading"
          density="comfortable"
          no-data-text="Chưa có chiến dịch nào"
        >
          <template #item.name="{ item }">
            <RouterLink :to="`/marketing/group-broadcasts/${item.id}`" class="font-weight-medium">
              {{ item.name }}
            </RouterLink>
          </template>

          <template #item.account="{ item }">
            {{ item.zaloAccount?.displayName ?? '—' }}
          </template>

          <template #item.groups="{ item }">
            {{ item.targetGroupIds.length }} nhóm
          </template>

          <template #item.schedule="{ item }">
            <span class="text-caption">{{ describeSchedule(item) }}</span>
          </template>

          <template #item.nextRunAt="{ item }">
            <span :class="item.nextRunAt ? '' : 'text-medium-emphasis'">
              {{ item.nextRunAt ? formatTime(item.nextRunAt) : '—' }}
            </span>
          </template>

          <template #item.state="{ item }">
            <v-tooltip v-if="item.pausedReason === 'CONSECUTIVE_FAILURES'" location="top">
              <template #activator="{ props: tip }">
                <v-chip v-bind="tip" size="small" color="error" variant="tonal">
                  Tự dừng — 3 lượt hỏng liên tiếp
                </v-chip>
              </template>
              Chiến dịch bị tạm dừng tự động. Mở chi tiết để xem lượt chạy lỗi gần nhất.
            </v-tooltip>
            <v-chip v-else size="small" :color="STATE_COLOR[item.state]" variant="tonal">
              {{ STATE_LABEL[item.state] }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <v-btn
              v-if="item.state === 'active'"
              icon="mdi-pause"
              size="small"
              variant="text"
              title="Tạm dừng"
              @click="run(item.id, 'pause')"
            />
            <v-btn
              v-else-if="item.state === 'draft' || item.state === 'paused'"
              icon="mdi-play"
              size="small"
              variant="text"
              color="success"
              title="Bật lịch"
              @click="run(item.id, 'activate')"
            />
            <v-btn
              icon="mdi-send"
              size="small"
              variant="text"
              title="Gửi ngay"
              :disabled="['cancelled', 'completed'].includes(item.state)"
              @click="run(item.id, 'run-now')"
            />
            <v-btn
              icon="mdi-pencil"
              size="small"
              variant="text"
              title="Sửa"
              :to="`/marketing/group-broadcasts/${item.id}/edit`"
            />
            <v-btn
              icon="mdi-close-circle-outline"
              size="small"
              variant="text"
              color="error"
              title="Huỷ chiến dịch"
              :disabled="item.state === 'cancelled'"
              @click="cancel(item.id)"
            />
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
import { reactive, onMounted } from 'vue';
import {
  useGroupBroadcasts, describeSchedule, type BroadcastState,
} from '@/composables/use-group-broadcasts';

const { broadcasts, loading, error, fetchBroadcasts, control, cancelBroadcast } = useGroupBroadcasts();

const STATE_LABEL: Record<BroadcastState, string> = {
  draft: 'Nháp', active: 'Đang chạy', paused: 'Tạm dừng',
  completed: 'Hoàn tất', cancelled: 'Đã huỷ',
};
const STATE_COLOR: Record<BroadcastState, string> = {
  draft: 'grey', active: 'success', paused: 'warning',
  completed: 'info', cancelled: 'error',
};

const headers = [
  { title: 'Tên chiến dịch', key: 'name' },
  { title: 'Nick', key: 'account', sortable: false },
  { title: 'Nhóm', key: 'groups', sortable: false },
  { title: 'Lịch', key: 'schedule', sortable: false },
  { title: 'Lần chạy kế', key: 'nextRunAt' },
  { title: 'Trạng thái', key: 'state' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  Object.assign(snack, { show: true, message, color });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

async function run(id: string, action: 'activate' | 'pause' | 'run-now') {
  const ok = await control(id, action);
  if (!ok) return notify(error.value?.message ?? 'Thao tác không thành công', 'error');
  notify(action === 'run-now' ? 'Đã xếp hàng gửi ngay' : 'Đã cập nhật');
  await fetchBroadcasts();
}

async function cancel(id: string) {
  if (!confirm('Huỷ chiến dịch này? Lịch sử các lượt gửi vẫn được giữ lại.')) return;
  const ok = await cancelBroadcast(id);
  if (!ok) return notify(error.value?.message ?? 'Không huỷ được', 'error');
  notify('Đã huỷ chiến dịch');
  await fetchBroadcasts();
}

onMounted(() => fetchBroadcasts());
</script>
