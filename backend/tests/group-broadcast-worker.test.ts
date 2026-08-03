/**
 * group-broadcast-worker.test.ts — Worker gửi 1 run của chiến dịch nhóm.
 *
 * Dùng store in-memory thay prisma để kiểm state machine (run/target/broadcast)
 * mà không cần DB. Mock ở biên sendToGroup + zaloPool + rate limiter.
 * Không import `_ee`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Store in-memory ─────────────────────────────────────────────────────────
interface Run {
  id: string; orgId: string; broadcastId: string; scheduledFor: Date;
  triggeredBy: string; state: string; sentCount: number; failedCount: number;
  skipReason: string | null; startedAt: Date | null; completedAt: Date | null;
}
interface Target {
  id: string; runId: string; groupId: string; groupName: string; state: string;
  attempts: number; sentSteps: number; sentAt: Date | null; errorCode: string | null;
  errorMessage: string | null; zaloMsgIds: string[]; createdAt: Date;
}
interface Broadcast {
  id: string; orgId: string; name: string; zaloAccountId: string; state: string;
  targetGroupIds: string[];
  minDelaySec: number; maxDelaySec: number; scheduleKind: string;
  timesOfDay: string[]; daysOfWeek: number[]; daysOfMonth: number[];
  timezone: string; startDate: Date | null; endDate: Date | null;
  consecutiveFailedRuns: number; pausedReason: string | null;
  nextRunAt: Date | null; lastRunAt: Date | null;
  template: { content: string; attachments: unknown };
  zaloAccount: { id: string; archivedAt: Date | null };
}

const store = {
  runs: [] as Run[],
  targets: [] as Target[],
  broadcasts: [] as Broadcast[],
};

const prismaMock = {
  groupBroadcastRun: {
    findUnique: vi.fn(async ({ where, include }: any) => {
      const run = store.runs.find((r) => r.id === where.id);
      if (!run) return null;
      if (!include) return { ...run };
      const b = store.broadcasts.find((x) => x.id === run.broadcastId)!;
      return { ...run, broadcast: { ...b } };
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      const found = store.runs.find((r) => {
        if (r.broadcastId !== where.broadcastId || r.id === where.id.not) return false;
        // Guard chồng lấn: run CŨ HƠN còn pending/running.
        if (where.state) {
          return where.state.in.includes(r.state)
            && r.scheduledFor.getTime() < where.scheduledFor.lt.getTime();
        }
        // Guard RECENT_RUN: run bất kỳ vừa khởi động trong cửa sổ cooldown.
        return !!r.startedAt && r.startedAt.getTime() >= where.startedAt.gte.getTime();
      });
      return found ? { id: found.id } : null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const run = store.runs.find((r) => r.id === where.id)!;
      Object.assign(run, data);
      return { ...run };
    }),
  },
  groupBroadcastTarget: {
    findMany: vi.fn(async ({ where }: any) =>
      store.targets
        .filter((t) => t.runId === where.runId && t.state === where.state)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((t) => ({ ...t })),
    ),
    update: vi.fn(async ({ where, data }: any) => {
      const t = store.targets.find((x) => x.id === where.id)!;
      Object.assign(t, data);
      return { ...t };
    }),
    groupBy: vi.fn(async ({ where }: any) => {
      const rows = store.targets.filter((t) => t.runId === where.runId);
      const byState = new Map<string, number>();
      for (const r of rows) byState.set(r.state, (byState.get(r.state) ?? 0) + 1);
      return [...byState].map(([state, n]) => ({ state, _count: { _all: n } }));
    }),
  },
  groupBroadcast: {
    update: vi.fn(async ({ where, data }: any) => {
      const b = store.broadcasts.find((x) => x.id === where.id)!;
      Object.assign(b, data);
      return { ...b };
    }),
  },
};

const sendToGroupMock = vi.fn();
const getInstanceMock = vi.fn(() => ({ api: {}, status: 'connected' }));
const checkLimitsMock = vi.fn(async () => ({ allowed: true, reason: '' }));
const resolveAttachmentsMock = vi.fn(async () => [] as unknown[]);

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  withTenant: (_org: string, fn: () => Promise<unknown>) => fn(),
  runSystemQuery: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { getInstance: (...a: any[]) => getInstanceMock(...(a as [])) },
}));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({
  zaloRateLimiter: { checkLimits: (...a: any[]) => checkLimitsMock(...(a as [])) },
}));
vi.mock('../src/modules/chat/message-template-service.js', () => ({
  resolveTemplateAttachments: (...a: any[]) => resolveAttachmentsMock(...(a as [])),
}));
class FakeGroupSendError extends Error {
  constructor(readonly cause: unknown, readonly zaloMsgIds: string[], readonly stepsDone: number) {
    super(String((cause as Error)?.message ?? cause));
    this.name = 'GroupSendError';
  }
}
const prepareMediaMock = vi.fn(async () => ({
  images: [], others: [], warnings: [], cleanup: mediaCleanupMock,
}));
const mediaCleanupMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/modules/zalo/group-broadcast-send.js', () => ({
  sendToGroup: (...a: any[]) => sendToGroupMock(...a),
  prepareMedia: (...a: any[]) => prepareMediaMock(...(a as [])),
  GroupSendError: FakeGroupSendError,
  classifySendError: (err: any) => ({
    errorCode: 'UNKNOWN', errorMessage: String(err?.message ?? err).slice(0, 500),
  }),
}));

const { processGroupBroadcast } = await import('../src/modules/zalo/group-broadcast-worker.js');

// ── Fixtures ────────────────────────────────────────────────────────────────
function seed(opts: {
  groups?: number;
  broadcastState?: string;
  triggeredBy?: string;
  scheduleKind?: string;
  consecutiveFailedRuns?: number;
  archivedNick?: boolean;
} = {}) {
  const groups = opts.groups ?? 3;
  store.runs = [];
  store.targets = [];
  store.broadcasts = [{
    id: 'bc-1', orgId: 'org-1', name: 'CD 1', zaloAccountId: 'za-1',
    targetGroupIds: Array.from({ length: groups }, (_, i) => `g-${i}`),
    state: opts.broadcastState ?? 'active',
    // 0s giãn cách trong test — sàn 10s enforce ở route, không ở worker.
    minDelaySec: 0, maxDelaySec: 0,
    scheduleKind: opts.scheduleKind ?? 'daily',
    timesOfDay: ['08:00'], daysOfWeek: [], daysOfMonth: [],
    timezone: 'Asia/Ho_Chi_Minh', startDate: null, endDate: null,
    consecutiveFailedRuns: opts.consecutiveFailedRuns ?? 0,
    pausedReason: null, nextRunAt: null, lastRunAt: null,
    template: { content: 'Xin chào', attachments: [] },
    zaloAccount: { id: 'za-1', archivedAt: opts.archivedNick ? new Date() : null },
  }];
  store.runs.push({
    id: 'run-1', orgId: 'org-1', broadcastId: 'bc-1',
    scheduledFor: new Date('2026-08-03T01:00:00Z'),
    triggeredBy: opts.triggeredBy ?? 'schedule', state: 'pending',
    sentCount: 0, failedCount: 0, skipReason: null, startedAt: null, completedAt: null,
  });
  for (let i = 0; i < groups; i++) {
    store.targets.push({
      id: `t-${i}`, runId: 'run-1', groupId: `g-${i}`, groupName: `Nhóm ${i}`,
      state: 'pending', attempts: 0, sentSteps: 0, sentAt: null,
      errorCode: null, errorMessage: null,
      zaloMsgIds: [], createdAt: new Date(Date.now() + i),
    });
  }
}

const run1 = () => store.runs.find((r) => r.id === 'run-1')!;
const bc1 = () => store.broadcasts[0];

beforeEach(() => {
  vi.clearAllMocks();
  getInstanceMock.mockReturnValue({ api: {}, status: 'connected' });
  checkLimitsMock.mockResolvedValue({ allowed: true, reason: '' });
  resolveAttachmentsMock.mockResolvedValue([]);
  prepareMediaMock.mockResolvedValue({
    images: [], others: [], warnings: [], cleanup: mediaCleanupMock,
  });
  sendToGroupMock.mockResolvedValue({ zaloMsgIds: ['m1'], stepsDone: 1, warnings: [] });
});

// ── Gate ────────────────────────────────────────────────────────────────────
describe('gate trước khi gửi', () => {
  it('nick offline → run skipped/NICK_OFFLINE, không target nào sent', async () => {
    seed();
    getInstanceMock.mockReturnValue({ api: null, status: 'disconnected' } as any);
    await processGroupBroadcast('run-1');
    expect(run1().state).toBe('skipped');
    expect(run1().skipReason).toBe('NICK_OFFLINE');
    expect(store.targets.every((t) => t.state === 'pending')).toBe(true);
    expect(sendToGroupMock).not.toHaveBeenCalled();
  });

  it('chạm trần rate limit → run skipped/RATE_LIMIT', async () => {
    seed();
    checkLimitsMock.mockResolvedValue({ allowed: false, reason: 'daily cap' });
    await processGroupBroadcast('run-1');
    expect(run1().skipReason).toBe('RATE_LIMIT');
  });

  it('nick đã xoá → NICK_ARCHIVED', async () => {
    seed({ archivedNick: true });
    await processGroupBroadcast('run-1');
    expect(run1().skipReason).toBe('NICK_ARCHIVED');
  });

  it('chiến dịch draft + theo lịch → BROADCAST_INACTIVE', async () => {
    seed({ broadcastState: 'draft' });
    await processGroupBroadcast('run-1');
    expect(run1().skipReason).toBe('BROADCAST_INACTIVE');
  });

  it('triggeredBy=manual trên chiến dịch draft → vẫn gửi', async () => {
    seed({ broadcastState: 'draft', triggeredBy: 'manual' });
    await processGroupBroadcast('run-1');
    expect(run1().state).toBe('completed');
    expect(sendToGroupMock).toHaveBeenCalledTimes(3);
  });

  it('run trước còn running → run mới skipped/PREVIOUS_RUN_ACTIVE, không gửi gì', async () => {
    seed();
    store.runs.push({
      id: 'run-0', orgId: 'org-1', broadcastId: 'bc-1',
      scheduledFor: new Date('2026-08-03T00:00:00Z'), triggeredBy: 'schedule',
      state: 'running', sentCount: 0, failedCount: 0, skipReason: null,
      startedAt: new Date(), completedAt: null,
    });
    await processGroupBroadcast('run-1');
    expect(run1().skipReason).toBe('PREVIOUS_RUN_ACTIVE');
    expect(sendToGroupMock).not.toHaveBeenCalled();
  });

  it('triggeredBy=manual trên chiến dịch paused → vẫn gửi (khớp nút Gửi ngay ở UI)', async () => {
    seed({ broadcastState: 'paused', triggeredBy: 'manual' });
    await processGroupBroadcast('run-1');
    expect(run1().state).toBe('completed');
    expect(sendToGroupMock).toHaveBeenCalledTimes(3);
  });

  /**
   * Cửa sổ cooldown = (số nhóm - 1) × giãn cách trung bình. Đặt 60 nhóm × 1s để
   * cửa sổ là 59s mà vòng gửi thật chỉ có 2 target (test chạy nhanh).
   */
  function seedRecentRunScenario(triggeredBy: 'schedule' | 'manual') {
    seed({ groups: 2, triggeredBy });
    Object.assign(store.broadcasts[0], {
      minDelaySec: 1, maxDelaySec: 1,
      targetGroupIds: Array.from({ length: 60 }, (_, i) => `g-${i}`),
    });
    // Lượt trước bắt đầu 30s trước mốc của lượt này → nằm trong cửa sổ 59s.
    store.runs.push({
      id: 'run-0', orgId: 'org-1', broadcastId: 'bc-1',
      scheduledFor: new Date('2026-08-03T00:59:30Z'), triggeredBy: 'manual',
      state: 'completed', sentCount: 2, failedCount: 0, skipReason: null,
      startedAt: new Date('2026-08-03T00:59:30Z'), completedAt: new Date('2026-08-03T00:59:50Z'),
    });
  }

  it('lượt theo lịch tới ngay sau một lượt vừa chạy → skipped/RECENT_RUN, không gửi trùng', async () => {
    seedRecentRunScenario('schedule');
    await processGroupBroadcast('run-1');
    expect(run1().skipReason).toBe('RECENT_RUN');
    expect(sendToGroupMock).not.toHaveBeenCalled();
  });

  it('lượt THỦ CÔNG không bị RECENT_RUN chặn — sale chủ động bấm', async () => {
    seedRecentRunScenario('manual');
    await processGroupBroadcast('run-1');
    expect(sendToGroupMock).toHaveBeenCalledTimes(2);
  });

  it('mẫu tin rỗng cả chữ lẫn đính kèm → run failed/TEMPLATE_EMPTY', async () => {
    seed();
    bc1().template = { content: '   ', attachments: [] };
    await processGroupBroadcast('run-1');
    expect(run1().state).toBe('failed');
    expect(run1().skipReason).toBe('TEMPLATE_EMPTY');
  });
});

// ── Vòng gửi ────────────────────────────────────────────────────────────────
describe('vòng gửi', () => {
  it('5 nhóm, nhóm thứ 3 lỗi → partial, sent=4, failed=1, mọi target có state cuối', async () => {
    seed({ groups: 5 });
    sendToGroupMock.mockImplementation(async ({ groupId }: any) => {
      if (groupId === 'g-2') throw new Error('kicked');
      return { zaloMsgIds: ['m'], stepsDone: 1, warnings: [] };
    });
    await processGroupBroadcast('run-1');
    expect(run1().state).toBe('partial');
    expect(run1().sentCount).toBe(4);
    expect(run1().failedCount).toBe(1);
    expect(store.targets.filter((t) => t.state === 'pending')).toHaveLength(0);
    expect(store.targets.find((t) => t.groupId === 'g-2')!.errorCode).toBe('UNKNOWN');
  });

  it('chạy lại worker trên cùng run → target sent KHÔNG gửi lại', async () => {
    seed({ groups: 3 });
    await processGroupBroadcast('run-1');
    expect(sendToGroupMock).toHaveBeenCalledTimes(3);
    // Reset run về pending như "gửi lại nhóm lỗi" nhưng không có target failed.
    run1().state = 'pending';
    sendToGroupMock.mockClear();
    await processGroupBroadcast('run-1');
    expect(sendToGroupMock).not.toHaveBeenCalled();
    expect(run1().state).toBe('completed');
  });

  it('nick rớt sau nhóm thứ 2 → break, partial, nhóm còn lại giữ pending', async () => {
    seed({ groups: 5 });
    let sent = 0;
    getInstanceMock.mockImplementation(() =>
      (sent >= 2 ? { api: null, status: 'disconnected' } : { api: {}, status: 'connected' }) as any,
    );
    sendToGroupMock.mockImplementation(async () => { sent++; return { zaloMsgIds: [], stepsDone: 1, warnings: [] }; });
    await processGroupBroadcast('run-1');
    expect(run1().state).toBe('partial');
    expect(run1().skipReason).toBe('NICK_OFFLINE');
    expect(store.targets.filter((t) => t.state === 'sent')).toHaveLength(2);
    expect(store.targets.filter((t) => t.state === 'pending')).toHaveLength(3);
  });

  it('media chỉ tải 1 LẦN cho cả lượt và luôn được cleanup', async () => {
    seed({ groups: 4 });
    await processGroupBroadcast('run-1');
    expect(prepareMediaMock).toHaveBeenCalledTimes(1);
    expect(mediaCleanupMock).toHaveBeenCalledTimes(1);
  });

  it('lỗi giữa chừng ghi lại sentSteps để lần gửi lại không lặp phần đã gửi', async () => {
    seed({ groups: 1 });
    sendToGroupMock.mockRejectedValue(new FakeGroupSendError(new Error('boom'), ['m1'], 1));
    await processGroupBroadcast('run-1');
    expect(store.targets[0].state).toBe('failed');
    expect(store.targets[0].sentSteps).toBe(1);
    expect(store.targets[0].zaloMsgIds).toEqual(['m1']);
  });

  it('target có sentSteps > 0 → truyền skipSteps cho sendToGroup', async () => {
    seed({ groups: 1 });
    store.targets[0].sentSteps = 2;
    await processGroupBroadcast('run-1');
    expect(sendToGroupMock.mock.calls[0][0].skipSteps).toBe(2);
  });

  it('cảnh báo đính kèm mất được ghi vào errorMessage của target sent', async () => {
    seed({ groups: 1 });
    sendToGroupMock.mockResolvedValue({ zaloMsgIds: ['m'], stepsDone: 1, warnings: ['Bỏ qua đính kèm đã bị xoá'] });
    await processGroupBroadcast('run-1');
    expect(store.targets[0].state).toBe('sent');
    expect(store.targets[0].errorMessage).toContain('Bỏ qua đính kèm');
  });
});

// ── Kết run + van an toàn ───────────────────────────────────────────────────
describe('kết run', () => {
  it('scheduleKind=now chạy xong → broadcast completed', async () => {
    seed({ scheduleKind: 'now' });
    await processGroupBroadcast('run-1');
    expect(bc1().state).toBe('completed');
    expect(bc1().nextRunAt).toBeNull();
  });

  it('theo lịch chạy xong → nextRunAt được tính lại', async () => {
    seed();
    await processGroupBroadcast('run-1');
    expect(bc1().state).toBe('active');
    expect(bc1().nextRunAt).toBeInstanceOf(Date);
  });

  it('run thứ 3 liên tiếp sentCount=0 → broadcast paused/CONSECUTIVE_FAILURES, nextRunAt=null', async () => {
    seed({ groups: 2, consecutiveFailedRuns: 2 });
    sendToGroupMock.mockRejectedValue(new Error('boom'));
    await processGroupBroadcast('run-1');
    expect(run1().state).toBe('failed');
    expect(bc1().state).toBe('paused');
    expect(bc1().pausedReason).toBe('CONSECUTIVE_FAILURES');
    expect(bc1().nextRunAt).toBeNull();
    expect(bc1().consecutiveFailedRuns).toBe(3);
  });

  it('2 run hỏng rồi 1 run gửi được → consecutiveFailedRuns về 0, vẫn active', async () => {
    seed({ groups: 2, consecutiveFailedRuns: 2 });
    await processGroupBroadcast('run-1');
    expect(bc1().consecutiveFailedRuns).toBe(0);
    expect(bc1().state).toBe('active');
  });

  it('run skipped KHÔNG làm tăng consecutiveFailedRuns', async () => {
    seed({ consecutiveFailedRuns: 2 });
    getInstanceMock.mockReturnValue({ api: null, status: 'disconnected' } as any);
    await processGroupBroadcast('run-1');
    expect(bc1().consecutiveFailedRuns).toBe(2);
    expect(bc1().state).toBe('active');
  });

  it('run đã kết thúc → job trùng không làm gì', async () => {
    seed();
    run1().state = 'completed';
    await processGroupBroadcast('run-1');
    expect(sendToGroupMock).not.toHaveBeenCalled();
  });
});
