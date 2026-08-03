// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * schedule-model.ts — Kiểu dữ liệu lịch dùng chung giữa ScheduleEditor.vue và
 * màn wizard. Để ngoài SFC vì `<script setup>` không cho ES module export.
 */
import type { ScheduleKind } from '@/composables/use-group-broadcasts';

export interface ScheduleModel {
  scheduleKind: ScheduleKind;
  /** ['08:00','20:00'] — HH:mm 24h. */
  timesOfDay: string[];
  /** 0=CN..6=T7, chỉ dùng khi weekly. */
  daysOfWeek: number[];
  /** 1..31, chỉ dùng khi monthly. */
  daysOfMonth: number[];
  /** 'YYYY-MM-DD' hoặc null. */
  startDate: string | null;
  endDate: string | null;
  minDelaySec: number;
  maxDelaySec: number;
}
