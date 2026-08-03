// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * use-list-broadcasts.ts — Chiến dịch nhắn tin hàng loạt cho tệp KH (🟢 Community).
 * Gọi `/list-broadcasts` + `/list-broadcast-runs`.
 */
import { ref } from 'vue';
import { api } from '@/api';
import type { CeResolvedAttachment } from './use-ce-message-templates';

export type ListBroadcastState = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type RunState = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'skipped';
export type RecipientState = 'pending' | 'sent' | 'failed' | 'skipped';

export interface ListBroadcast {
  id: string;
  name: string;
  customerListId: string;
  templateId: string;
  zaloAccountIds: string[];
  windowStart: string;
  windowEnd: string;
  daysOfWeek: number[];
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  dailyQuota: number;
  perNickDailyQuota: number;
  minDelaySec: number;
  maxDelaySec: number;
  state: ListBroadcastState;
  pausedReason: string | null;
  consecutiveFailedRuns: number;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  recipientsSyncedAt: string | null;
  lastRunAt: string | null;
  /** Server tính từ khung giờ, không lưu DB. */
  nextRunAt: string | null;
  customerList?: { id: string; name: string; totalEntries?: number; hasZaloEntries?: number };
  template?: { id: string; name: string };
  _count?: { runs: number };
}

export interface ListBroadcastRun {
  id: string;
  broadcastId: string;
  scheduledFor: string;
  triggeredBy: 'schedule' | 'manual';
  state: RunState;
  plannedCount: number;
  sentCount: number;
  failedCount: number;
  skipReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ListBroadcastRecipient {
  id: string;
  entryId: string;
  phoneE164: string;
  displayName: string | null;
  state: RecipientState;
  attempts: number;
  zaloAccountId: string | null;
  sentAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ListBroadcastNick {
  id: string;
  displayName: string | null;
  phone: string | null;
  archivedAt: string | null;
}

export interface ListBroadcastEstimate {
  opsPerRecipient: number;
  opsPerDay: number;
  daysToFinish: number;
  dailyDurationSec: number;
  recipientCount: number;
  budget: number;
  warnings: string[];
}

export interface ListBroadcastPayload {
  name: string;
  customerListId: string;
  templateId: string;
  zaloAccountIds: string[];
  windowStart: string;
  windowEnd: string;
  daysOfWeek: number[];
  startDate?: string | null;
  endDate?: string | null;
  dailyQuota: number;
  perNickDailyQuota: number;
  minDelaySec: number;
  maxDelaySec: number;
}

export type RecipientCounts = Partial<Record<RecipientState, number>>;

const BASE = '/list-broadcasts';
const RUNS = '/list-broadcast-runs';

/** Lỗi từ server kèm mã máy đọc được — UI hiện gợi ý sửa theo `code`. */
export interface ListBroadcastApiError {
  message: string;
  code?: string;
  errors?: string[];
}

function toApiError(err: any, fallback: string): ListBroadcastApiError {
  const data = err?.response?.data;
  return {
    message: data?.error ?? fallback,
    code: data?.code,
    errors: data?.errors,
  };
}

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Tóm tắt lịch dạng người đọc: "Cả tuần · 08:00–17:00 · 100 tin/ngày". */
export function describeWindow(
  b: Pick<ListBroadcast, 'windowStart' | 'windowEnd' | 'daysOfWeek' | 'dailyQuota'>,
): string {
  const days = b.daysOfWeek.length === 0
    ? 'Cả tuần'
    : b.daysOfWeek.map((d) => WEEKDAY_LABELS[d] ?? d).join(', ');
  return `${days} · ${b.windowStart}–${b.windowEnd} · ${b.dailyQuota} tin/ngày`;
}

/** Lỗi gửi từng khách → tiếng Việt cho sale. */
export function describeRecipientError(code: string | null): string {
  if (!code) return '';
  const map: Record<string, string> = {
    UID_NOT_FOUND: 'Nick không tìm được Zalo của số này',
    RATE_LIMIT: 'Chạm giới hạn gửi của Zalo',
    NICK_OFFLINE: 'Nick mất kết nối khi gửi',
    NETWORK: 'Lỗi mạng khi gửi',
  };
  if (map[code]) return map[code];
  if (code.startsWith('ZALO_')) return `Zalo từ chối (mã ${code.slice(5)})`;
  return 'Lỗi không xác định';
}

/** Lý do một lát gửi bị bỏ / dừng giữa chừng. */
export function describeSkipReason(reason: string | null): string {
  const map: Record<string, string> = {
    OUT_OF_WINDOW: 'Ngoài khung giờ gửi',
    DAILY_QUOTA_REACHED: 'Đã đủ hạn mức hôm nay',
    NO_USABLE_NICK: 'Không nick nào gửi được (offline hoặc chạm hạn mức)',
    NO_PENDING: 'Không còn ai chờ gửi',
    BROADCAST_INACTIVE: 'Chiến dịch chưa bật lịch',
    TEMPLATE_EMPTY: 'Mẫu tin rỗng',
    QUEUE_TIMEOUT: 'Hàng đợi không nhận việc',
    WORKER_STALLED: 'Tiến trình gửi bị treo',
  };
  return reason ? (map[reason] ?? reason) : '';
}

/** Lý do chiến dịch tự tạm dừng. */
export function describePausedReason(reason: string | null): string {
  const map: Record<string, string> = {
    CONSECUTIVE_FAILURES: 'Tự tạm dừng vì nhiều lát gửi liên tiếp thất bại',
    NO_USABLE_NICK: 'Tự tạm dừng vì không còn nick nào gửi được',
  };
  return reason ? (map[reason] ?? reason) : '';
}

export function useListBroadcasts() {
  const broadcasts = ref<ListBroadcast[]>([]);
  const runs = ref<ListBroadcastRun[]>([]);
  const recipients = ref<ListBroadcastRecipient[]>([]);
  const recipientTotal = ref(0);
  const counts = ref<RecipientCounts>({});
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<ListBroadcastApiError | null>(null);

  async function fetchBroadcasts(params: { state?: string; customerListId?: string } = {}) {
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

  async function fetchBroadcast(id: string): Promise<{
    broadcast: ListBroadcast;
    attachments: CeResolvedAttachment[];
    counts: RecipientCounts;
    nicks: ListBroadcastNick[];
  } | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.get(`${BASE}/${id}`);
      counts.value = res.data.counts ?? {};
      return {
        broadcast: res.data.broadcast,
        attachments: res.data.attachments ?? [],
        counts: res.data.counts ?? {},
        nicks: res.data.nicks ?? [],
      };
    } catch (err) {
      error.value = toApiError(err, 'Không tải được chiến dịch');
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function saveBroadcast(
    payload: ListBroadcastPayload, id?: string,
  ): Promise<ListBroadcast | null> {
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

  /** Thao tác đổi trạng thái: activate | pause | run-now | sync-recipients | retry-failed. */
  async function control(
    id: string,
    action: 'activate' | 'pause' | 'run-now' | 'sync-recipients' | 'retry-failed',
  ): Promise<any | null> {
    saving.value = true;
    error.value = null;
    try {
      const res = await api.post(`${BASE}/${id}/${action}`);
      if (res.data?.counts) counts.value = res.data.counts;
      return res.data ?? {};
    } catch (err) {
      error.value = toApiError(err, 'Thao tác không thành công');
      return null;
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
    try {
      const res = await api.get(`${BASE}/${broadcastId}/runs`);
      runs.value = res.data.runs ?? [];
    } catch (err) {
      error.value = toApiError(err, 'Không tải được lịch sử gửi');
    }
  }

  async function fetchRun(runId: string): Promise<ListBroadcastRun | null> {
    try {
      const res = await api.get(`${RUNS}/${runId}`);
      return res.data.run;
    } catch (err) {
      error.value = toApiError(err, 'Không tải được lượt gửi');
      return null;
    }
  }

  async function fetchRecipients(
    broadcastId: string, params: { state?: string; limit?: number; offset?: number } = {},
  ): Promise<void> {
    try {
      const res = await api.get(`${BASE}/${broadcastId}/recipients`, { params });
      recipients.value = res.data.recipients ?? [];
      recipientTotal.value = res.data.total ?? 0;
      counts.value = res.data.counts ?? {};
    } catch (err) {
      error.value = toApiError(err, 'Không tải được danh sách người nhận');
    }
  }

  /** Ước tính hạn mức — chỉ đọc, gọi khi sale đang chỉnh cấu hình. */
  async function estimate(
    payload: Partial<ListBroadcastPayload>,
  ): Promise<ListBroadcastEstimate | null> {
    try {
      const res = await api.post(`${BASE}/estimate`, payload);
      return res.data;
    } catch {
      return null;
    }
  }

  return {
    broadcasts, runs, recipients, recipientTotal, counts, loading, saving, error,
    fetchBroadcasts, fetchBroadcast, saveBroadcast, control, cancelBroadcast,
    fetchRuns, fetchRun, fetchRecipients, estimate,
  };
}
