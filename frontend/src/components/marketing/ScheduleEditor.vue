<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<template>
  <div class="d-flex flex-column gap-5">
    <!-- Kiểu lịch -->
    <div>
      <span class="rc-label">KIỂU LỊCH GỬI</span>
      <div class="rc-pill-row mt-1">
        <button
          type="button"
          class="rc-pill-btn"
          :class="{ active: modelValue.scheduleKind === 'now' }"
          @click="patch({ scheduleKind: 'now' })"
        >
          ⚡ Gửi ngay
        </button>
        <button
          type="button"
          class="rc-pill-btn"
          :class="{ active: modelValue.scheduleKind === 'daily' }"
          @click="patch({ scheduleKind: 'daily' })"
        >
          🔄 Hàng ngày
        </button>
        <button
          type="button"
          class="rc-pill-btn"
          :class="{ active: modelValue.scheduleKind === 'weekly' }"
          @click="patch({ scheduleKind: 'weekly' })"
        >
          📅 Hàng tuần
        </button>
        <button
          type="button"
          class="rc-pill-btn"
          :class="{ active: modelValue.scheduleKind === 'monthly' }"
          @click="patch({ scheduleKind: 'monthly' })"
        >
          📆 Hàng tháng
        </button>
      </div>
    </div>

    <!-- Mốc giờ -->
    <div v-if="modelValue.scheduleKind !== 'now'">
      <div class="d-flex align-center justify-space-between mb-1">
        <span class="rc-label">MỐC GIỜ TRONG NGÀY</span>
        <span class="text-caption text-medium-emphasis">(Tối đa {{ MAX_TIMES }} mốc)</span>
      </div>

      <div class="d-flex align-center flex-wrap gap-2 mb-2">
        <v-chip
          v-for="t in modelValue.timesOfDay"
          :key="t"
          closable
          color="primary"
          variant="tonal"
          size="small"
          class="font-weight-medium"
          :class="{ 'chip-warn': tightTimes.has(t) }"
          @click:close="removeTime(t)"
        >
          ⏰ {{ t }}
        </v-chip>
        <span v-if="!modelValue.timesOfDay.length" class="text-caption text-error font-italic">
          ⚠ Vui lòng chọn ít nhất 1 mốc giờ gửi
        </span>
      </div>

      <div class="d-flex align-center gap-2 flex-wrap">
        <input
          v-model="newTime"
          type="time"
          class="rc-input"
          style="width: 130px"
          :disabled="modelValue.timesOfDay.length >= MAX_TIMES"
        />
        <button
          type="button"
          class="rc-btn-secondary"
          :disabled="!newTime || modelValue.timesOfDay.length >= MAX_TIMES"
          @click="addTime(newTime)"
        >
          + Thêm
        </button>
        <v-divider vertical class="mx-1" style="height: 28px" />
        <span class="text-caption text-medium-emphasis">Gợi ý:</span>
        <button
          v-for="s in SUGGESTED_TIMES"
          :key="s"
          type="button"
          class="rc-chip-btn"
          :disabled="modelValue.timesOfDay.includes(s) || modelValue.timesOfDay.length >= MAX_TIMES"
          @click="addTime(s)"
        >
          {{ s }}
        </button>
      </div>

      <v-alert v-if="tightTimes.size" type="warning" variant="tonal" density="compact" class="mt-3">
        ⚠ Hai mốc giờ gần nhau hơn thời lượng ước tính (~{{ Math.round((runDurationSec || 0) / 60) }} phút). Lượt sau có thể bị bỏ qua.
      </v-alert>
    </div>

    <!-- Thứ trong tuần -->
    <div v-if="modelValue.scheduleKind === 'weekly'">
      <span class="rc-label">THỨ TRONG TUẦN</span>
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

    <!-- Ngày trong tháng -->
    <div v-if="modelValue.scheduleKind === 'monthly'">
      <span class="rc-label">NGÀY TRONG THÁNG</span>
      <div class="day-grid mt-1">
        <button
          v-for="d in 31"
          :key="d"
          type="button"
          class="rc-day-btn"
          :class="{ active: modelValue.daysOfMonth.includes(d) }"
          @click="toggleDayOfMonth(d)"
        >
          {{ d }}
        </button>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        Tháng không có ngày đã chọn sẽ tự động bỏ qua (VD: ngày 31 vào tháng 2).
      </div>
    </div>

    <!-- Khoảng thời gian áp dụng -->
    <div v-if="modelValue.scheduleKind !== 'now'">
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

    <!-- Nhịp gửi (Giãn cách) -->
    <div class="pt-3 border-t">
      <span class="rc-label">GIÃN CÁCH GIỮA 2 NHÓM</span>
      <div class="text-body-2 font-weight-bold text-primary my-1">
        {{ modelValue.minDelaySec }} giây – {{ modelValue.maxDelaySec }} giây
      </div>
      <div class="d-flex align-center gap-4 flex-wrap mt-2">
        <div class="flex-1-1" style="min-width: 200px">
          <span class="rc-sublabel">Thời gian chờ tối thiểu</span>
          <v-slider
            :model-value="modelValue.minDelaySec"
            :min="MIN_DELAY"
            :max="MAX_DELAY"
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
            :min="MIN_DELAY"
            :max="MAX_DELAY"
            :step="5"
            thumb-label
            color="primary"
            hide-details
            @update:model-value="onMaxDelay"
          />
        </div>
      </div>
      <v-alert type="info" variant="tonal" density="compact" class="mt-3">
        💡 Giãn cách ngẫu nhiên trong khoảng {{ modelValue.minDelaySec }}s–{{ modelValue.maxDelaySec }}s giữa mỗi nhóm giúp bảo vệ nick Zalo an toàn hơn.
      </v-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ScheduleModel } from './schedule-model';

const props = defineProps<{
  modelValue: ScheduleModel;
  runDurationSec?: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [ScheduleModel] }>();

const MAX_TIMES = 12;
const MIN_DELAY = 10;
const MAX_DELAY = 600;
const SUGGESTED_TIMES = ['08:00', '09:00', '14:00', '20:00'];
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const newTime = ref('');

function patch(partial: Partial<ScheduleModel>) {
  emit('update:modelValue', { ...props.modelValue, ...partial });
}

function addTime(t: string) {
  if (!t || props.modelValue.timesOfDay.includes(t)) return;
  if (props.modelValue.timesOfDay.length >= MAX_TIMES) return;
  patch({ timesOfDay: [...props.modelValue.timesOfDay, t].sort() });
  newTime.value = '';
}

function removeTime(t: string) {
  patch({ timesOfDay: props.modelValue.timesOfDay.filter((x) => x !== t) });
}

function toggleDayOfWeek(idx: number) {
  const has = props.modelValue.daysOfWeek.includes(idx);
  patch({
    daysOfWeek: has
      ? props.modelValue.daysOfWeek.filter((x) => x !== idx)
      : [...props.modelValue.daysOfWeek, idx].sort(),
  });
}

function toggleDayOfMonth(d: number) {
  const has = props.modelValue.daysOfMonth.includes(d);
  patch({
    daysOfMonth: has
      ? props.modelValue.daysOfMonth.filter((x) => x !== d)
      : [...props.modelValue.daysOfMonth, d].sort((a, b) => a - b),
  });
}

function onMinDelay(v: number) {
  patch({ minDelaySec: v, maxDelaySec: Math.max(v, props.modelValue.maxDelaySec) });
}
function onMaxDelay(v: number) {
  patch({ maxDelaySec: v, minDelaySec: Math.min(v, props.modelValue.minDelaySec) });
}

const tightTimes = computed(() => {
  const out = new Set<string>();
  const dur = props.runDurationSec ?? 0;
  if (dur <= 0 || props.modelValue.timesOfDay.length < 2) return out;
  const sorted = [...props.modelValue.timesOfDay].sort();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  for (let i = 1; i < sorted.length; i++) {
    if ((toMin(sorted[i]) - toMin(sorted[i - 1])) * 60 < dur) out.add(sorted[i]);
  }
  const wrap = (24 * 60 - toMin(sorted[sorted.length - 1]) + toMin(sorted[0])) * 60;
  if (wrap < dur) out.add(sorted[0]);
  return out;
});
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

.rc-btn-secondary {
  height: 42px;
  padding: 0 16px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  color: #2563eb;
  cursor: pointer;
  transition: all 0.15s ease;
}
.rc-btn-secondary:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #2563eb;
}
.rc-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
.rc-chip-btn:hover:not(:disabled) {
  background: #e5e7eb;
}
.rc-chip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.day-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
  max-width: 500px;
}
.rc-day-btn {
  height: 36px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
}
.rc-day-btn:hover {
  background: #f9fafb;
}
.rc-day-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.chip-warn { outline: 2px solid #f59e0b; }
</style>
