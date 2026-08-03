<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<template>
  <div class="d-flex flex-column gap-5">
    <!-- Khung giờ gửi -->
    <div>
      <span class="rc-label">KHUNG GIỜ ĐƯỢC PHÉP GỬI</span>
      <div class="d-flex align-center gap-3 flex-wrap mt-1">
        <div style="width: 150px">
          <span class="rc-sublabel">Bắt đầu</span>
          <input
            :value="modelValue.windowStart"
            type="time"
            class="rc-input"
            @input="patch({ windowStart: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div style="width: 150px">
          <span class="rc-sublabel">Kết thúc</span>
          <input
            :value="modelValue.windowEnd"
            type="time"
            class="rc-input"
            @input="patch({ windowEnd: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="flex-1-1" style="min-width: 160px">
          <span class="rc-sublabel">Gợi ý</span>
          <div class="d-flex gap-2 flex-wrap">
            <button
              v-for="p in WINDOW_PRESETS"
              :key="p.label"
              type="button"
              class="rc-chip-btn"
              @click="patch({ windowStart: p.start, windowEnd: p.end })"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        Ngoài khung giờ này hệ thống dừng gửi. Chưa gửi hết thì hôm sau tự chạy tiếp.
      </div>
    </div>

    <!-- Ngày trong tuần -->
    <div>
      <div class="d-flex align-center justify-space-between mb-1">
        <span class="rc-label mb-0">NGÀY GỬI TRONG TUẦN</span>
        <span class="text-caption text-medium-emphasis">Không chọn ngày nào = gửi cả tuần</span>
      </div>
      <div class="rc-pill-row mt-1">
        <button
          v-for="(label, idx) in WEEKDAY_LABELS"
          :key="idx"
          type="button"
          class="rc-pill-btn flex-1-1"
          :class="{ active: modelValue.daysOfWeek.includes(idx) }"
          @click="toggleDayOfWeek(idx)"
        >
          {{ label }}
        </button>
      </div>
    </div>

    <!-- Hạn mức -->
    <div class="pt-3 border-t">
      <span class="rc-label">HẠN MỨC MỖI NGÀY</span>
      <div class="d-flex align-center gap-3 flex-wrap mt-1">
        <div style="width: 190px">
          <span class="rc-sublabel">Cả chiến dịch (tin/ngày)</span>
          <input
            :value="modelValue.dailyQuota"
            type="number"
            min="1"
            :max="MAX_DAILY_QUOTA"
            class="rc-input"
            @input="onDailyQuota(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div style="width: 190px">
          <span class="rc-sublabel">Mỗi nick (tin/ngày)</span>
          <input
            :value="modelValue.perNickDailyQuota"
            type="number"
            min="1"
            class="rc-input"
            @input="onNickQuota(($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        Hạn mức mỗi nick tính trên toàn hệ thống trong ngày, kể cả khi nick đó chạy chiến dịch khác.
        <template v-if="nickCount > 0">
          Với {{ nickCount }} nick đang chọn, trần thực tế là
          <b>{{ Math.min(modelValue.dailyQuota, nickCount * modelValue.perNickDailyQuota) }} tin/ngày</b>.
        </template>
      </div>
      <v-alert
        v-if="nickCount > 0 && nickCount * modelValue.perNickDailyQuota < modelValue.dailyQuota"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-3"
      >
        ⚠ Hạn mức mỗi nick đang chặn trước: {{ nickCount }} nick × {{ modelValue.perNickDailyQuota }} =
        {{ nickCount * modelValue.perNickDailyQuota }} tin/ngày, thấp hơn hạn mức chiến dịch
        {{ modelValue.dailyQuota }}. Thêm nick hoặc nâng hạn mức mỗi nick.
      </v-alert>
    </div>

    <!-- Khoảng thời gian áp dụng -->
    <div>
      <span class="rc-label">KHOẢNG THỜI GIAN ÁP DỤNG (TÙY CHỌN)</span>
      <div class="d-flex align-center gap-3 flex-wrap mt-1">
        <div style="width: 180px">
          <span class="rc-sublabel">TỪ NGÀY</span>
          <input
            :value="modelValue.startDate ?? ''"
            type="date"
            class="rc-input"
            @input="patch({ startDate: ($event.target as HTMLInputElement).value || null })"
          />
        </div>
        <div style="width: 180px">
          <span class="rc-sublabel">ĐẾN NGÀY</span>
          <input
            :value="modelValue.endDate ?? ''"
            type="date"
            class="rc-input"
            @input="patch({ endDate: ($event.target as HTMLInputElement).value || null })"
          />
        </div>
      </div>
    </div>

    <!-- Nhịp gửi -->
    <div class="pt-3 border-t">
      <span class="rc-label">GIÃN CÁCH GIỮA 2 KHÁCH</span>
      <div class="text-body-2 font-weight-bold text-primary my-1">
        {{ modelValue.minDelaySec }} giây – {{ modelValue.maxDelaySec }} giây
      </div>
      <div class="d-flex align-center gap-4 flex-wrap mt-2">
        <div class="flex-1-1" style="min-width: 200px">
          <span class="rc-sublabel">Thời gian chờ tối thiểu</span>
          <v-slider
            :model-value="modelValue.minDelaySec"
            :min="MIN_DELAY_SEC"
            :max="MAX_DELAY_SEC"
            :step="5"
            thumb-label
            color="primary"
            hide-details
            @update:model-value="onMinDelay"
          />
        </div>
        <div class="flex-1-1" style="min-width: 200px">
          <span class="rc-sublabel">Thời gian chờ tối đa</span>
          <v-slider
            :model-value="modelValue.maxDelaySec"
            :min="MIN_DELAY_SEC"
            :max="MAX_DELAY_SEC"
            :step="5"
            thumb-label
            color="primary"
            hide-details
            @update:model-value="onMaxDelay"
          />
        </div>
      </div>
      <v-alert type="info" variant="tonal" density="compact" class="mt-3">
        💡 Nhắn riêng từng người dễ bị báo xấu hơn nhắn nhóm. Giãn cách càng dài, nick càng an toàn.
      </v-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  MAX_DAILY_QUOTA, MAX_DELAY_SEC, MIN_DELAY_SEC, WEEKDAY_LABELS,
  type SendWindowModel,
} from './send-window-model';

const props = defineProps<{
  modelValue: SendWindowModel;
  /** Số nick đang chọn — để cảnh báo hạn mức nick chặn trước hạn mức chiến dịch. */
  nickCount?: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [SendWindowModel] }>();

const WINDOW_PRESETS = [
  { label: 'Giờ hành chính', start: '08:00', end: '17:00' },
  { label: 'Cả ngày', start: '07:00', end: '21:00' },
  { label: 'Buổi tối', start: '18:00', end: '21:00' },
];

const nickCount = computed(() => props.nickCount ?? 0);

function patch(partial: Partial<SendWindowModel>) {
  emit('update:modelValue', { ...props.modelValue, ...partial });
}

function toggleDayOfWeek(idx: number) {
  const has = props.modelValue.daysOfWeek.includes(idx);
  patch({
    daysOfWeek: has
      ? props.modelValue.daysOfWeek.filter((x) => x !== idx)
      : [...props.modelValue.daysOfWeek, idx].sort((a, b) => a - b),
  });
}

function onDailyQuota(raw: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  patch({ dailyQuota: Math.min(MAX_DAILY_QUOTA, Math.max(1, Math.round(n))) });
}

function onNickQuota(raw: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  patch({ perNickDailyQuota: Math.max(1, Math.round(n)) });
}

function onMinDelay(v: number) {
  patch({ minDelaySec: v, maxDelaySec: Math.max(v, props.modelValue.maxDelaySec) });
}
function onMaxDelay(v: number) {
  patch({ maxDelaySec: v, minDelaySec: Math.min(v, props.modelValue.minDelaySec) });
}
</script>

<style scoped>
.rc-label {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.rc-sublabel {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  text-transform: uppercase;
  margin-bottom: 3px;
}

.rc-input {
  width: 100%;
  height: 42px;
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

.rc-pill-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.rc-pill-btn {
  height: 40px;
  padding: 0 16px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.rc-pill-btn:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}
.rc-pill-btn.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  font-weight: 600;
}

.rc-chip-btn {
  padding: 4px 10px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12.5px;
  color: #374151;
  cursor: pointer;
}
.rc-chip-btn:hover {
  background: #e5e7eb;
}
</style>
