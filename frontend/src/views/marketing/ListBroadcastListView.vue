<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  Danh sách chiến dịch nhắn tin hàng loạt cho tệp KH (🟢 Community).
  Cột "Tiến độ" là thứ sale nhìn nhiều nhất: tệp lớn chạy nhiều ngày nên cần thấy
  ngay còn bao nhiêu người chưa gửi.
-->
<template>
  <div class="pa-6">
    <div class="d-flex align-center mb-5 flex-wrap gap-3">
      <div>
        <h1 class="text-h5 font-weight-bold">Nhắn tệp hàng loạt</h1>
        <div class="text-body-2 text-medium-emphasis mt-1">
          Gửi tin 1-1 cho tệp khách hàng theo khung giờ và hạn mức ngày.
          Chưa gửi hết thì hôm sau tự chạy tiếp.
        </div>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" to="/marketing/list-broadcasts/new">
        Tạo chiến dịch
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
      {{ error.message }}
    </v-alert>

    <v-skeleton-loader v-if="loading && !broadcasts.length" type="table" />

    <v-card v-else-if="!broadcasts.length" variant="outlined" class="pa-10 text-center">
      <v-icon size="44" color="grey">mdi-account-multiple-outline</v-icon>
      <div class="text-h6 mt-3">Chưa có chiến dịch nào</div>
      <div class="text-body-2 text-medium-emphasis mt-1 mb-4">
        Tạo chiến dịch để nhắn tin cho một tệp khách hàng đã có Zalo.
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" to="/marketing/list-broadcasts/new">
        Tạo chiến dịch
      </v-btn>
    </v-card>

    <v-card v-else variant="outlined">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Chiến dịch</th>
            <th>Tệp khách hàng</th>
            <th>Lịch gửi</th>
            <th style="min-width: 190px">Tiến độ</th>
            <th>Lượt kế tiếp</th>
            <th>Trạng thái</th>
            <th class="text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in broadcasts" :key="b.id" class="row-clickable" @click="open(b.id)">
            <td>
              <div class="font-weight-medium">{{ b.name }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ b.template?.name ?? '—' }} · {{ b.zaloAccountIds.length }} nick
              </div>
            </td>
            <td>{{ b.customerList?.name ?? '—' }}</td>
            <td class="text-body-2">{{ describeWindow(b) }}</td>
            <td>
              <v-progress-linear
                :model-value="progressPct(b)"
                color="primary"
                height="8"
                rounded
                class="mb-1"
              />
              <div class="text-caption text-medium-emphasis">
                {{ b.sentCount.toLocaleString('vi-VN') }}/{{ b.totalRecipients.toLocaleString('vi-VN') }} đã gửi
                <span v-if="b.failedCount > 0" class="text-error">· {{ b.failedCount }} lỗi</span>
              </div>
            </td>
            <td class="text-body-2">
              <span v-if="b.nextRunAt">{{ formatDateTime(b.nextRunAt) }}</span>
              <span v-else class="text-medium-emphasis">—</span>
            </td>
            <td>
              <v-chip :color="STATE_COLOR[b.state]" size="small" variant="tonal" class="font-weight-medium">
                {{ STATE_LABEL[b.state] }}
              </v-chip>
              <div v-if="b.pausedReason" class="text-caption text-warning mt-1">
                {{ describePausedReason(b.pausedReason) }}
              </div>
            </td>
            <td class="text-right" @click.stop>
              <v-btn
                v-if="b.state === 'active'"
                size="small"
                variant="text"
                prepend-icon="mdi-pause"
                :loading="saving"
                @click="onControl(b.id, 'pause')"
              >
                Tạm dừng
              </v-btn>
              <v-btn
                v-else-if="['draft', 'paused'].includes(b.state)"
                size="small"
                variant="text"
                color="primary"
                prepend-icon="mdi-play"
                :loading="saving"
                @click="onControl(b.id, 'activate')"
              >
                Bật lịch
              </v-btn>
              <v-btn size="small" variant="text" icon="mdi-chevron-right" @click="open(b.id)" />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="5000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { formatInOrgTz } from '@/composables/use-org-timezone';
import {
  useListBroadcasts, describeWindow, describePausedReason,
  type ListBroadcast, type ListBroadcastState,
} from '@/composables/use-list-broadcasts';

const router = useRouter();
const {
  broadcasts, loading, saving, error, fetchBroadcasts, control,
} = useListBroadcasts();

const STATE_LABEL: Record<ListBroadcastState, string> = {
  draft: 'Nháp',
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
};
const STATE_COLOR: Record<ListBroadcastState, string> = {
  draft: 'grey',
  active: 'success',
  paused: 'warning',
  completed: 'primary',
  cancelled: 'error',
};

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  Object.assign(snack, { show: true, message, color });
}

function open(id: string) {
  router.push(`/marketing/list-broadcasts/${id}`);
}

function progressPct(b: ListBroadcast): number {
  if (b.totalRecipients <= 0) return 0;
  return ((b.sentCount + b.failedCount) / b.totalRecipients) * 100;
}

function formatDateTime(iso: string): string {
  return formatInOrgTz(iso);
}

async function onControl(id: string, action: 'activate' | 'pause') {
  const ok = await control(id, action);
  if (!ok) return notify(error.value?.message ?? 'Thao tác không thành công', 'error');
  notify(action === 'activate' ? 'Đã bật lịch gửi' : 'Đã tạm dừng');
  await fetchBroadcasts();
}

onMounted(() => fetchBroadcasts());
</script>

<style scoped>
.row-clickable { cursor: pointer; }
.row-clickable:hover { background: rgba(0, 0, 0, 0.02); }
</style>
