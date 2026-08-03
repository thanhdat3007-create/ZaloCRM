/**
 * group-broadcast-cron.test.ts — Cron sinh run cho chiến dịch gửi nhóm.
 *
 * Store in-memory thay prisma; kiểm chống trùng (unique broadcastId+scheduledFor),
 * catch-up sau restart, đóng chiến dịch quá endDate, sweeper run kẹt.
 * Không import `_ee`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zonedWallClockToUtc } from '../src/modules/zalo/group-broadcast-schedule.js';

const TZ = 'Asia/Ho_Chi_Minh';
const vn = (y: number, m: number, d: number, hh: number, mm = 0) =>
  zonedWallClockToUtc(y, m, d, hh, mm, TZ);

interface Run {
  id: string; orgId: string; broadcastId: string; scheduledFor: Date;
  triggeredBy: string; state: string; totalTargets: number;
  skipReason: string | null; startedAt: Date | null; completedAt: Date | null;
  createdAt: Date;
}

const store = {
  broadcasts: [] as any[],
  runs: [] as Run[],
  targets: [] as any[],
};
let runSeq = 0;

/** Lỗi P2002 giả — Prisma ném khi đụng @@unique([broadcastId, scheduledFor]). */
class UniqueViolation extends Error {
  code = 'P2002';
}

const tx = {
  groupBroadcastRun: {
    create: vi.fn(async ({ data }: any) => {
      const dup = store.runs.some(
        (r) => r.broadcastId === data.broadcastId && r.scheduledFor.getTime() === data.scheduledFor.getTime(),
      );
      if (dup) throw new UniqueViolation('unique');
      const run: Run = {
        id: `run-${++runSeq}`, orgId: data.orgId, broadcastId: data.broadcastId,
        scheduledFor: data.scheduledFor, triggeredBy: data.triggeredBy,
        state: 'pending', totalTargets: data.totalTargets, skipReason: null,
        startedAt: null, completedAt: null, createdAt: new Date(),
      };
      store.runs.push(run);
      return { id: run.id };
    }),
  },
  groupBroadcastTarget: {
    createMany: vi.fn(async ({ data }: any) => {
      store.targets.push(...data);
      return { count: data.length };
    }),
  },
};

const prismaMock = {
  $transaction: vi.fn(async (fn: any) => fn(tx)),
  groupBroadcast: {
    findMany: vi.fn(async () => store.broadcasts.map((b) => ({ ...b }))),
    update: vi.fn(async ({ where, data }: any) => {
      const b = store.broadcasts.find((x) => x.id === where.id)!;
      Object.assign(b, data);
      return { ...b };
    }),
  },
  groupBroadcastRun: {
    updateMany: vi.fn(async ({ where, data }: any) => {
      const cutoff = where.createdAt?.lt ?? where.startedAt?.lt;
      const field = where.createdAt ? 'createdAt' : 'startedAt';
      const hit = store.runs.filter(
        (r) => r.state === where.state && (r as any)[field] && (r as any)[field].getTime() < cutoff.getTime(),
      );
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    }),
  },
};

const enqueueMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: prismaMock,
  // materializeRun dùng tenantTransaction (RLS set_config), không phải $transaction trần.
  tenantTransaction: (fn: any) => fn(tx),
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  withTenant: (_org: string, fn: () => Promise<unknown>) => fn(),
  runSystemQuery: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/modules/zalo/group-broadcast-queue.js', () => ({
  enqueueGroupBroadcast: (...a: any[]) => enqueueMock(...a),
}));

const { runScheduleTick, sweepStuckRuns, materializeRun, CATCH_UP_MS } =
  await import('../src/modules/zalo/group-broadcast-cron.js');

function seedBroadcast(over: Record<string, unknown> = {}) {
  store.broadcasts = [{
    id: 'bc-1', orgId: 'org-1', name: 'CD 1',
    targetGroupIds: ['g-1', 'g-2', 'g-3'],
    groupNamesSnapshot: { 'g-1': 'Nhóm 1', 'g-2': 'Nhóm 2' },
    scheduleKind: 'daily', timesOfDay: ['08:00'], daysOfWeek: [], daysOfMonth: [],
    timezone: TZ, startDate: null, endDate: null, nextRunAt: null,
    ...over,
  }];
}

beforeEach(() => {
  vi.clearAllMocks();
  store.broadcasts = [];
  store.runs = [];
  store.targets = [];
  runSeq = 0;
});

describe('runScheduleTick', () => {
  it('chiến dịch đến hạn → tạo 1 run + N target + enqueue 1 lần', async () => {
    seedBroadcast();
    const created = await runScheduleTick(vn(2026, 8, 3, 8, 0));
    expect(created).toBe(1);
    expect(store.runs).toHaveLength(1);
    expect(store.targets).toHaveLength(3);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    // Nhóm thiếu trong snapshot → dùng chính groupId làm tên.
    expect(store.targets.map((t) => t.groupName)).toEqual(['Nhóm 1', 'Nhóm 2', 'g-3']);
  });

  it('tick 2 lần cùng phút → vẫn chỉ 1 run (unique constraint)', async () => {
    seedBroadcast();
    await runScheduleTick(vn(2026, 8, 3, 8, 0));
    await runScheduleTick(vn(2026, 8, 3, 8, 0));
    expect(store.runs).toHaveLength(1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('restart trễ 5 phút → bù đúng 1 run cho mốc đã lỡ', async () => {
    seedBroadcast();
    const created = await runScheduleTick(vn(2026, 8, 3, 8, 5));
    expect(created).toBe(1);
    expect(store.runs[0].scheduledFor.getTime()).toBe(vn(2026, 8, 3, 8, 0).getTime());
  });

  it('trễ hơn cửa sổ catch-up → KHÔNG bù (tránh dội tin lúc khởi động)', async () => {
    seedBroadcast();
    const late = new Date(vn(2026, 8, 3, 8, 0).getTime() + CATCH_UP_MS + 60_000);
    const created = await runScheduleTick(late);
    expect(created).toBe(0);
    expect(store.runs).toHaveLength(0);
  });

  it('chiến dịch paused → không được cron quét (query lọc state=active)', async () => {
    // Cron chỉ findMany state='active'; mock trả nguyên store nên mô phỏng bằng
    // store rỗng — kiểm điều kiện where thay vì kết quả.
    seedBroadcast();
    await runScheduleTick(vn(2026, 8, 3, 8, 0));
    expect(prismaMock.groupBroadcast.findMany.mock.calls[0][0].where).toEqual({
      state: 'active', scheduleKind: { not: 'now' } },
    );
  });

  it('quá endDate → chiến dịch chuyển completed, nextRunAt=null', async () => {
    seedBroadcast({ endDate: vn(2026, 8, 1, 0, 0) });
    await runScheduleTick(vn(2026, 8, 3, 8, 0));
    expect(store.runs).toHaveLength(0);
    expect(store.broadcasts[0].state).toBe('completed');
    expect(store.broadcasts[0].nextRunAt).toBeNull();
  });

  it('còn lịch → cập nhật nextRunAt', async () => {
    seedBroadcast({ timesOfDay: ['08:00', '20:00'] });
    await runScheduleTick(vn(2026, 8, 3, 8, 0));
    expect(store.broadcasts[0].nextRunAt.getTime()).toBe(vn(2026, 8, 3, 20, 0).getTime());
  });

  it('enqueue chạy SAU transaction — run đã tồn tại khi job bắt đầu', async () => {
    seedBroadcast();
    enqueueMock.mockImplementation(async (runId: string) => {
      expect(store.runs.some((r) => r.id === runId)).toBe(true);
    });
    await runScheduleTick(vn(2026, 8, 3, 8, 0));
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe('materializeRun', () => {
  it('ném P2002 khi đã có run cùng scheduledFor', async () => {
    seedBroadcast();
    const b = store.broadcasts[0];
    await materializeRun(b, vn(2026, 8, 3, 8, 0), 'manual');
    await expect(materializeRun(b, vn(2026, 8, 3, 8, 0), 'manual')).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('sweepStuckRuns', () => {
  it('run pending quá 30 phút → failed/QUEUE_TIMEOUT', async () => {
    const now = new Date('2026-08-03T10:00:00Z');
    store.runs = [{
      id: 'run-x', orgId: 'org-1', broadcastId: 'bc-1', scheduledFor: now,
      triggeredBy: 'schedule', state: 'pending', totalTargets: 1, skipReason: null,
      startedAt: null, completedAt: null,
      createdAt: new Date(now.getTime() - 31 * 60_000),
    }];
    const res = await sweepStuckRuns(now);
    expect(res.timedOut).toBe(1);
    expect(store.runs[0].state).toBe('failed');
    expect(store.runs[0].skipReason).toBe('QUEUE_TIMEOUT');
  });

  it('run running quá 2 giờ → partial/WORKER_STALLED', async () => {
    const now = new Date('2026-08-03T10:00:00Z');
    store.runs = [{
      id: 'run-y', orgId: 'org-1', broadcastId: 'bc-1', scheduledFor: now,
      triggeredBy: 'schedule', state: 'running', totalTargets: 1, skipReason: null,
      startedAt: new Date(now.getTime() - 3 * 3600_000), completedAt: null,
      createdAt: new Date(now.getTime() - 3 * 3600_000),
    }];
    const res = await sweepStuckRuns(now);
    expect(res.stalled).toBe(1);
    expect(store.runs[0].state).toBe('partial');
    expect(store.runs[0].skipReason).toBe('WORKER_STALLED');
  });

  it('run pending mới → không đụng', async () => {
    const now = new Date('2026-08-03T10:00:00Z');
    store.runs = [{
      id: 'run-z', orgId: 'org-1', broadcastId: 'bc-1', scheduledFor: now,
      triggeredBy: 'schedule', state: 'pending', totalTargets: 1, skipReason: null,
      startedAt: null, completedAt: null, createdAt: new Date(now.getTime() - 60_000),
    }];
    const res = await sweepStuckRuns(now);
    expect(res.timedOut).toBe(0);
    expect(store.runs[0].state).toBe('pending');
  });
});
