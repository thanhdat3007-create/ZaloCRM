// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * use-group-broadcasts.ts — Chiến dịch gửi nhóm theo lịch (🟢 Community).
 * Gọi `/group-broadcasts` + `/group-broadcast-runs`.
 */
import { ref } from 'vue';
import { api } from '@/api';
import type { CeResolvedAttachment } from './use-ce-message-templates';

export type ScheduleKind = 'now' | 'daily' | 'weekly' | 'monthly';
export type BroadcastState = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type RunState = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'skipped';

export interface GroupBroadcast {
  id: string;
  name: string;
  zaloAccountId: string;
  templateId: string;
  targetGroupIds: string[];
  groupNamesSnapshot: Record<string, string>;
  scheduleKind: ScheduleKind;
  timesOfDay: string[];
  daysOfWeek: number[];
  daysOfMonth: number[];
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  minDelaySec: number;
  maxDelaySec: number;
  state: BroadcastState;
  pausedReason: string | null;
  consecutiveFailedRuns: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  zaloAccount?: { id: string; displayName: string | null };
  template?: { id: string; name: string };
  _count?: { runs: number };
}

export interface GroupBroadcastRun {
  id: string;
  broadcastId: string;
  scheduledFor: string;
  triggeredBy: 'schedule' | 'manual' | 'retry';
  state: RunState;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  skipReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  targets?: GroupBroadcastTarget[];
  broadcast?: { id: string; name: string };
}

export interface GroupBroadcastTarget {
  id: string;
  groupId: string;
  groupName: string;
  state: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  sentAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface BroadcastEstimate {
  opsPerGroup: number;
  opsPerRun: number;
  opsPerDay: number;
  runDurationSec: number;
  dailyLimit: number;
  budget: number;
  warnings: string[];
}

export interface BroadcastPayload {
  name: string;
  zaloAccountId: string;
  templateId: string;
  targetGroupIds: string[];
  scheduleKind: ScheduleKind;
  timesOfDay: string[];
  daysOfWeek: number[];
  daysOfMonth: number[];
  startDate?: string | null;
  endDate?: string | null;
  minDelaySec: number;
  maxDelaySec: number;
}

const BASE = '/group-broadcasts';
const RUNS = '/group-broadcast-runs';

/** Lỗi từ server kèm mã máy đọc được — UI hiện gợi ý sửa theo `code`. */
export interface BroadcastApiError {
  message: string;
  code?: string;
  /** Danh sách mã lỗi lịch khi code = INVALID_SCHEDULE. */
  errors?: string[];
  groupIds?: string[];
}

function toApiError(err: any, fallback: string): BroadcastApiError {
  const data = err?.response?.data;
  return {
    message: data?.error ?? fallback,
    code: data?.code,
    errors: data?.errors,
    groupIds: data?.groupIds,
  };
}

/** Tóm tắt lịch dạng người đọc: "Hàng ngày 08:00, 20:00" / "T2, T4 · 09:00". */
export function describeSchedule(b: Pick<GroupBroadcast, 'scheduleKind' | 'timesOfDay' | 'daysOfWeek' | 'daysOfMonth'>): string {
  const times = b.timesOfDay.join(', ');
  if (b.scheduleKind === 'now') return 'Gửi ngay (1 lần)';
  if (b.scheduleKind === 'daily') return `Hàng ngày ${times}`;
  if (b.scheduleKind === 'weekly') {
    const labels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return `${b.daysOfWeek.map((d) => labels[d] ?? d).join(', ')} · ${times}`;
  }
  return `Ngày ${b.daysOfMonth.join(', ')} · ${times}`;
}

/** Lỗi gửi từng nhóm → tiếng Việt cho sale. */
export function describeTargetError(code: string | null): string {
  if (!code) return '';
  if (code === 'NOT_IN_GROUP') return 'Nick không còn trong nhóm';
  if (code === 'RATE_LIMIT') return 'Chạm giới hạn gửi của Zalo';
  if (code === 'NETWORK') return 'Lỗi mạng khi gửi';
  if (code.startsWith('ZALO_')) return `Zalo từ chối (mã ${code.slice(5)})`;
  return 'Lỗi không xác định';
}

/** Lý do một lượt gửi bị bỏ / dừng giữa chừng. */
export function describeSkipReason(reason: string | null): string {
  const map: Record<string, string> = {
    NICK_OFFLINE: 'Nick chưa kết nối',
    NICK_ARCHIVED: 'Nick đã bị xoá',
    NICK_CHAT_DISABLED: 'Nick đang tắt chat (chỉ nhận tin)',
    RATE_LIMIT: 'Chạm hạn mức gửi của nick',
    BROADCAST_INACTIVE: 'Chiến dịch chưa bật lịch',
    PREVIOUS_RUN_ACTIVE: 'Lượt trước còn đang chạy',
    TEMPLATE_EMPTY: 'Mẫu tin rỗng',
    QUEUE_TIMEOUT: 'Hàng đợi không nhận việc',
    WORKER_STALLED: 'Tiến trình gửi bị treo',
  };
  return reason ? (map[reason] ?? reason) : '';
}

export function useGroupBroadcasts() {
  const broadcasts = ref<GroupBroadcast[]>([]);
  const runs = ref<GroupBroadcastRun[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<BroadcastApiError | null>(null);

  async function fetchBroadcasts(params: { state?: string; zaloAccountId?: string } = {}) {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.get(BASE, { params });
      broadcasts.value = res.data.broadcasts ?? [];
    } catch (err) {
      error.value = toApiError(err, 'Không tải được danh sách chiến dịch');
    } finally {
      loading.value = false;
    }
  }

  async function fetchBroadcast(
    id: string,
  ): Promise<{ broadcast: GroupBroadcast; attachments: CeResolvedAttachment[] } | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.get(`${BASE}/${id}`);
      return { broadcast: res.data.broadcast, attachments: res.data.attachments ?? [] };
    } catch (err) {
      error.value = toApiError(err, 'Không tải được chiến dịch');
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function saveBroadcast(
    payload: BroadcastPayload, id?: string,
  ): Promise<GroupBroadcast | null> {
    saving.value = true;
    error.value = null;
    try {
      const res = id ? await api.patch(`${BASE}/${id}`, payload) : await api.post(BASE, payload);
      return res.data.broadcast;
    } catch (err) {
      error.value = toApiError(err, 'Không lưu được chiến dịch');
      return null;
    } finally {
      saving.value = false;
    }
  }

  /** Thao tác đổi trạng thái: activate | pause | run-now. */
  async function control(id: string, action: 'activate' | 'pause' | 'run-now'): Promise<boolean> {
    saving.value = true;
    error.value = null;
    try {
      await api.post(`${BASE}/${id}/${action}`);
      return true;
    } catch (err) {
      error.value = toApiError(err, 'Thao tác không thành công');
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function cancelBroadcast(id: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`${BASE}/${id}`);
      return true;
    } catch (err) {
      error.value = toApiError(err, 'Không huỷ được chiến dịch');
      return false;
    }
  }

  async function fetchRuns(broadcastId: string): Promise<void> {
    loading.value = true;
    try {
      const res = await api.get(`${BASE}/${broadcastId}/runs`);
      runs.value = res.data.runs ?? [];
    } catch (err) {
      error.value = toApiError(err, 'Không tải được lịch sử gửi');
    } finally {
      loading.value = false;
    }
  }

  async function fetchRun(runId: string): Promise<GroupBroadcastRun | null> {
    try {
      const res = await api.get(`${RUNS}/${runId}`);
      return res.data.run;
    } catch (err) {
      error.value = toApiError(err, 'Không tải được lượt gửi');
      return null;
    }
  }

  /**
   * Gửi lại các nhóm lỗi. Server tạo LƯỢT MỚI (không mở lại lượt cũ) và trả
   * `runId` của lượt mới để UI chuyển sang theo dõi nó.
   */
  async function retryFailed(runId: string): Promise<string | null> {
    saving.value = true;
    error.value = null;
    try {
      const res = await api.post(`${RUNS}/${runId}/retry-failed`);
      return res.data.runId ?? null;
    } catch (err) {
      error.value = toApiError(err, 'Không gửi lại được');
      return null;
    } finally {
      saving.value = false;
    }
  }

  /** Ước tính lượt gửi — chỉ đọc, gọi khi sale đang chỉnh cấu hình. */
  async function estimate(payload: Partial<BroadcastPayload>): Promise<BroadcastEstimate | null> {
    try {
      const res = await api.post(`${BASE}/estimate`, payload);
      return res.data;
    } catch {
      return null;
    }
  }

  return {
    broadcasts, runs, loading, saving, error,
    fetchBroadcasts, fetchBroadcast, saveBroadcast, control, cancelBroadcast,
    fetchRuns, fetchRun, retryFailed, estimate,
  };
}
