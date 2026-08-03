/**
 * group-broadcast-routes.test.ts — API chiến dịch gửi nhóm + RBAC + ngân sách.
 * Mock ở biên prisma + zaloOps + rbac + sdk-limit. Không import `_ee`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser } from './test-helpers.js';

const userHasGrantMock = vi.fn().mockResolvedValue(true);
const getEffectiveLimitMock = vi.fn().mockResolvedValue({ daily: 200, burst: 20, burstWindowMs: 30_000 });
const getInstanceMock = vi.fn(() => ({ api: {}, status: 'connected' }));
const getAllGroupsMock = vi.fn();
const getGroupInfoMock = vi.fn();
const resolveAttachmentsMock = vi.fn();
const materializeRunMock = vi.fn();
const enqueueMock = vi.fn().mockResolvedValue(undefined);
const resolveAccountMock = vi.fn();
const checkAccessMock = vi.fn().mockResolvedValue(true);

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    groupBroadcast: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    groupBroadcastRun: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    groupBroadcastTarget: { findMany: vi.fn(), updateMany: vi.fn() },
    messageTemplate: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => undefined }));
vi.mock('../src/modules/rbac/permission-group-service.js', () => ({
  userHasGrant: (...a: any[]) => userHasGrantMock(...a),
}));
vi.mock('../src/modules/zalo/sdk-limit-service.js', () => ({
  getEffectiveLimit: (...a: any[]) => getEffectiveLimitMock(...a),
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { getInstance: (...a: any[]) => getInstanceMock(...(a as [])) },
}));
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: {
    getAllGroups: (...a: any[]) => getAllGroupsMock(...a),
    getGroupInfo: (...a: any[]) => getGroupInfoMock(...a),
  },
  ZaloOpError: class extends Error {
    code: string; statusCode: number;
    constructor(msg: string, code: string, statusCode = 400) {
      super(msg); this.code = code; this.statusCode = statusCode;
    }
  },
}));
vi.mock('../src/modules/zalo/zalo-route-helpers.js', () => ({
  resolveAccount: (...a: any[]) => resolveAccountMock(...a),
  checkAccess: (...a: any[]) => checkAccessMock(...a),
  handleError: (reply: any, err: any, _op: string) =>
    reply.status(err?.statusCode ?? 500).send({ error: err?.message ?? 'Error' }),
}));
vi.mock('../src/modules/chat/message-template-service.js', () => ({
  resolveTemplateAttachments: (...a: any[]) => resolveAttachmentsMock(...a),
}));
vi.mock('../src/modules/zalo/group-broadcast-cron.js', () => ({
  materializeRun: (...a: any[]) => materializeRunMock(...a),
}));
vi.mock('../src/modules/zalo/group-broadcast-queue.js', () => ({
  enqueueGroupBroadcast: (...a: any[]) => enqueueMock(...a),
}));

const { groupBroadcastRoutes } = await import('../src/modules/zalo/group-broadcast-routes.js');
const { prisma } = await import('../src/shared/database/prisma-client.js');
const p = prisma as any;

const BASE = '/api/v1/group-broadcasts';
const RUNS = '/api/v1/group-broadcast-runs';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(groupBroadcastRoutes);
  return app;
}

/** N nhóm mà nick đang tham gia. */
function stubGroups(n: number) {
  const gridVerMap: Record<string, string> = {};
  const gridInfoMap: Record<string, { name: string }> = {};
  for (let i = 0; i < n; i++) {
    gridVerMap[`g-${i}`] = '1';
    gridInfoMap[`g-${i}`] = { name: `Nhóm ${i}` };
  }
  getAllGroupsMock.mockResolvedValue({ gridVerMap, gridInfoMap });
}

const groupIds = (n: number) => Array.from({ length: n }, (_, i) => `g-${i}`);

/** Mẫu tin 3 lệnh gửi: 1 chữ + album ảnh + 1 tệp. */
function stubTemplate3Ops() {
  p.messageTemplate.findFirst.mockResolvedValue({ content: 'Xin chào', attachments: [] });
  resolveAttachmentsMock.mockResolvedValue([
    { mediaAssetId: 'a1', kind: 'image', name: 'a.jpg', caption: '', blobUrl: 'u', missing: false },
    { mediaAssetId: 'a2', kind: 'image', name: 'b.jpg', caption: '', blobUrl: 'u', missing: false },
    { mediaAssetId: 'f1', kind: 'file', name: 'bao-gia.pdf', caption: '', blobUrl: 'u', missing: false },
  ]);
}

function validBody(over: Record<string, unknown> = {}) {
  return {
    name: 'CD 1', zaloAccountId: 'za-1', templateId: 'tpl-1',
    targetGroupIds: groupIds(3),
    scheduleKind: 'daily', timesOfDay: ['08:00'],
    minDelaySec: 20, maxDelaySec: 45,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userHasGrantMock.mockResolvedValue(true);
  getEffectiveLimitMock.mockResolvedValue({ daily: 200, burst: 20, burstWindowMs: 30_000 });
  getInstanceMock.mockReturnValue({ api: {}, status: 'connected' });
  checkAccessMock.mockResolvedValue(true);
  resolveAccountMock.mockResolvedValue({ id: 'za-1', orgId: 'org-1', archivedAt: null });
  stubGroups(60);
  stubTemplate3Ops();
  p.groupBroadcast.create.mockImplementation(async (args: any) => ({ id: 'bc-1', ...args.data }));
  p.groupBroadcast.update.mockImplementation(async (args: any) => ({ id: args.where.id, ...args.data }));
});

// ── Create ──────────────────────────────────────────────────────────────────
describe('POST /group-broadcasts', () => {
  it('hợp lệ → 201, groupNamesSnapshot lấy từ Zalo (không từ body)', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({ groupNamesSnapshot: { 'g-0': 'TÊN GIẢ' } }),
    });
    expect(res.statusCode).toBe(201);
    const data = p.groupBroadcast.create.mock.calls[0][0].data;
    expect(data.groupNamesSnapshot).toEqual({ 'g-0': 'Nhóm 0', 'g-1': 'Nhóm 1', 'g-2': 'Nhóm 2' });
    expect(data.state).toBe('draft');
  });

  it('nhóm nick không tham gia → 422 GROUP_NOT_JOINED', async () => {
    stubGroups(2);
    const res = await buildApp().inject({
      method: 'POST', url: BASE, payload: validBody({ targetGroupIds: ['g-0', 'g-99'] }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('GROUP_NOT_JOINED');
    expect(res.json().groupIds).toEqual(['g-99']);
    expect(p.groupBroadcast.create).not.toHaveBeenCalled();
  });

  it('51 nhóm → 422 TOO_MANY_GROUPS', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE, payload: validBody({ targetGroupIds: groupIds(51) }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TOO_MANY_GROUPS');
  });

  it('minDelaySec=3 → 422 DELAY_TOO_SHORT', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE, payload: validBody({ minDelaySec: 3 }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('DELAY_TOO_SHORT');
  });

  it('50 nhóm × 3 lệnh × 3 mốc = 450 lượt → 422 DAILY_BUDGET_EXCEEDED, thông báo chứa 450 và 120', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({
        targetGroupIds: groupIds(50),
        timesOfDay: ['08:00', '14:00', '20:00'],
      }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('DAILY_BUDGET_EXCEEDED');
    expect(res.json().error).toContain('450');
    expect(res.json().error).toContain('120');
  });

  it('13 nhóm × 3 lệnh × 3 mốc = 117 lượt → 201 (vừa dưới ngưỡng 120)', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({
        targetGroupIds: groupIds(13),
        timesOfDay: ['08:00', '14:00', '20:00'],
      }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('nick có hạn mức override daily=800 → 450 lượt được chấp nhận (ngưỡng 480)', async () => {
    getEffectiveLimitMock.mockResolvedValue({ daily: 800, burst: 20, burstWindowMs: 30_000 });
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({
        targetGroupIds: groupIds(50),
        timesOfDay: ['08:00', '14:00', '20:00'],
      }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('override daily=500 vẫn chặn 450 lượt — ngưỡng là 60% (300), không phải cả hạn mức', async () => {
    getEffectiveLimitMock.mockResolvedValue({ daily: 500, burst: 20, burstWindowMs: 30_000 });
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({
        targetGroupIds: groupIds(50),
        timesOfDay: ['08:00', '14:00', '20:00'],
      }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('DAILY_BUDGET_EXCEEDED');
  });

  it('mốc 08:00 & 08:10 với 50 nhóm (~27 phút/lượt) → 422 SCHEDULE_TOO_TIGHT', async () => {
    getEffectiveLimitMock.mockResolvedValue({ daily: 2000, burst: 20, burstWindowMs: 30_000 });
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({ targetGroupIds: groupIds(50), timesOfDay: ['08:00', '08:10'] }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('SCHEDULE_TOO_TIGHT');
  });

  it('weekly thiếu daysOfWeek → 422 kèm INVALID_DAYS_OF_WEEK', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE, payload: validBody({ scheduleKind: 'weekly', daysOfWeek: [] }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().errors).toContain('INVALID_DAYS_OF_WEEK');
  });

  it('mẫu tin rỗng → 422 TEMPLATE_EMPTY', async () => {
    p.messageTemplate.findFirst.mockResolvedValue({ content: '  ', attachments: [] });
    resolveAttachmentsMock.mockResolvedValue([]);
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody() });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TEMPLATE_EMPTY');
  });

  it('nick offline → 400 NICK_NOT_CONNECTED', async () => {
    getInstanceMock.mockReturnValue({ api: null, status: 'disconnected' } as any);
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody() });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NICK_NOT_CONNECTED');
  });

  it('nick của org khác → 404, không tạo hàng', async () => {
    const err: any = new Error('Account not found');
    err.statusCode = 404;
    resolveAccountMock.mockRejectedValue(err);
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody() });
    expect(res.statusCode).toBe(404);
    expect(p.groupBroadcast.create).not.toHaveBeenCalled();
  });
});

// ── Scope xem ───────────────────────────────────────────────────────────────
describe('scope xem', () => {
  it('không có view_all → GET list chỉ lọc chiến dịch của mình', async () => {
    userHasGrantMock.mockResolvedValue(false);
    p.groupBroadcast.findMany.mockResolvedValue([]);
    await buildApp().inject({ method: 'GET', url: BASE });
    expect(p.groupBroadcast.findMany.mock.calls[0][0].where.createdById).toBe('user-1');
  });

  it('có view_all → không lọc theo người tạo', async () => {
    userHasGrantMock.mockResolvedValue(true);
    p.groupBroadcast.findMany.mockResolvedValue([]);
    await buildApp().inject({ method: 'GET', url: BASE });
    expect(p.groupBroadcast.findMany.mock.calls[0][0].where.createdById).toBeUndefined();
  });
});

// ── Điều khiển ──────────────────────────────────────────────────────────────
describe('pause / activate', () => {
  const current = {
    id: 'bc-1', orgId: 'org-1', name: 'CD 1', zaloAccountId: 'za-1', templateId: 'tpl-1',
    targetGroupIds: groupIds(3), groupNamesSnapshot: { 'g-0': 'Nhóm 0' },
    scheduleKind: 'daily', timesOfDay: ['08:00'], daysOfWeek: [], daysOfMonth: [],
    timezone: 'Asia/Ho_Chi_Minh', startDate: null, endDate: null,
    minDelaySec: 20, maxDelaySec: 45, state: 'active', nextRunAt: new Date(),
  };

  it('pause → nextRunAt = null', async () => {
    p.groupBroadcast.findFirst.mockResolvedValue({ ...current });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/pause` });
    expect(res.statusCode).toBe(200);
    expect(p.groupBroadcast.update.mock.calls[0][0].data.nextRunAt).toBeNull();
  });

  it('activate → nextRunAt khác null, reset pausedReason + bộ đếm hỏng', async () => {
    p.groupBroadcast.findFirst.mockResolvedValue({
      ...current, state: 'paused', pausedReason: 'CONSECUTIVE_FAILURES', consecutiveFailedRuns: 3,
    });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/activate` });
    expect(res.statusCode).toBe(200);
    const data = p.groupBroadcast.update.mock.calls[0][0].data;
    expect(data.state).toBe('active');
    expect(data.pausedReason).toBeNull();
    expect(data.consecutiveFailedRuns).toBe(0);
    expect(data.nextRunAt).toBeInstanceOf(Date);
  });

  it('activate với scheduleKind=now → tạo lượt gửi NGAY, không để chiến dịch treo', async () => {
    p.groupBroadcast.findFirst.mockResolvedValue({
      ...current, state: 'draft', scheduleKind: 'now', timesOfDay: [],
    });
    materializeRunMock.mockResolvedValue({ id: 'run-9' });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/activate` });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.id).toBe('run-9');
    expect(materializeRunMock).toHaveBeenCalledTimes(1);
  });

  it('activate khi cấu hình đã vượt ngân sách → 422, không đổi state', async () => {
    p.groupBroadcast.findFirst.mockResolvedValue({
      ...current, state: 'draft', targetGroupIds: groupIds(50),
      timesOfDay: ['08:00', '14:00', '20:00'],
    });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/activate` });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('DAILY_BUDGET_EXCEEDED');
    expect(p.groupBroadcast.update).not.toHaveBeenCalled();
  });

  it('sửa tên/lịch khi không đổi nhóm → không cần nick online', async () => {
    getInstanceMock.mockReturnValue({ api: null, status: 'disconnected' } as any);
    p.groupBroadcast.findFirst.mockResolvedValue({ ...current });
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/bc-1`, payload: { name: 'Tên mới' },
    });
    expect(res.statusCode).toBe(200);
    expect(p.groupBroadcast.update.mock.calls[0][0].data.name).toBe('Tên mới');
  });
});

// ── run-now ─────────────────────────────────────────────────────────────────
describe('POST /:id/run-now', () => {
  beforeEach(() => {
    p.groupBroadcast.findFirst.mockResolvedValue({
      id: 'bc-1', orgId: 'org-1', state: 'draft',
      targetGroupIds: groupIds(2), groupNamesSnapshot: {},
    });
  });

  it('chạy được cả khi chiến dịch còn draft (bắn thử)', async () => {
    materializeRunMock.mockResolvedValue({ id: 'run-1' });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/run-now` });
    expect(res.statusCode).toBe(201);
    expect(materializeRunMock.mock.calls[0][2]).toBe('manual');
    expect(p.groupBroadcast.update).not.toHaveBeenCalled(); // không đổi state
  });

  it('2 lần trong cùng giây → lần 2 trả 409', async () => {
    const dup: any = new Error('unique'); dup.code = 'P2002';
    materializeRunMock.mockRejectedValue(dup);
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/run-now` });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('RUN_ALREADY_QUEUED');
  });

  it('chiến dịch đã huỷ → 409', async () => {
    p.groupBroadcast.findFirst.mockResolvedValue({
      id: 'bc-1', orgId: 'org-1', state: 'cancelled', targetGroupIds: [], groupNamesSnapshot: {},
    });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/run-now` });
    expect(res.statusCode).toBe(409);
  });
});

// ── retry-failed ────────────────────────────────────────────────────────────
describe('POST /group-broadcast-runs/:runId/retry-failed', () => {
  beforeEach(() => {
    p.groupBroadcastRun.findFirst.mockResolvedValue({
      id: 'run-1',
      broadcast: { id: 'bc-1', orgId: 'org-1', targetGroupIds: groupIds(3), groupNamesSnapshot: {} },
    });
    p.groupBroadcastTarget.updateMany.mockResolvedValue({ count: 1 });
    materializeRunMock.mockResolvedValue({ id: 'run-2' });
  });

  it('không có target failed → 400 NO_FAILED_TARGETS', async () => {
    p.groupBroadcastTarget.findMany.mockResolvedValue([]);
    const res = await buildApp().inject({ method: 'POST', url: `${RUNS}/run-1/retry-failed` });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NO_FAILED_TARGETS');
    expect(materializeRunMock).not.toHaveBeenCalled();
  });

  it('tạo LƯỢT MỚI chỉ gồm nhóm lỗi — không mở lại lượt cũ (jobId cũ còn trong Redis)', async () => {
    p.groupBroadcastTarget.findMany.mockResolvedValue([
      { id: 't-1', groupId: 'g-1', groupName: 'N1', attempts: 1, sentSteps: 0 },
    ]);
    const res = await buildApp().inject({ method: 'POST', url: `${RUNS}/run-1/retry-failed` });
    expect(res.statusCode).toBe(200);
    expect(res.json().runId).toBe('run-2');
    // Query chỉ lấy state='failed' → target 'sent' không bao giờ vào lượt mới.
    expect(p.groupBroadcastTarget.findMany.mock.calls[0][0].where.state).toBe('failed');
    expect(materializeRunMock.mock.calls[0][2]).toBe('retry');
    expect(materializeRunMock.mock.calls[0][3]).toEqual(['g-1']);
    // Lượt cũ giữ nguyên trạng thái lịch sử.
    expect(p.groupBroadcastRun.update).not.toHaveBeenCalled();
  });

  it('chuyển tiếp sentSteps sang lượt mới để không gửi lại phần đã gửi', async () => {
    p.groupBroadcastTarget.findMany.mockResolvedValue([
      { id: 't-1', groupId: 'g-1', groupName: 'N1', attempts: 1, sentSteps: 2 },
    ]);
    const res = await buildApp().inject({ method: 'POST', url: `${RUNS}/run-1/retry-failed` });
    expect(res.statusCode).toBe(200);
    const call = p.groupBroadcastTarget.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ runId: 'run-2', groupId: 'g-1' });
    expect(call.data.sentSteps).toBe(2);
  });

  it('mọi target đã thử quá 3 lần → 400 TOO_MANY_ATTEMPTS', async () => {
    p.groupBroadcastTarget.findMany.mockResolvedValue([
      { id: 't-1', groupId: 'g-1', groupName: 'N1', attempts: 3, sentSteps: 0 },
    ]);
    const res = await buildApp().inject({ method: 'POST', url: `${RUNS}/run-1/retry-failed` });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('TOO_MANY_ATTEMPTS');
    expect(materializeRunMock).not.toHaveBeenCalled();
  });
});

// ── estimate ────────────────────────────────────────────────────────────────
describe('POST /group-broadcasts/estimate', () => {
  it('mẫu 1 chữ + 5 ảnh + 1 tệp → opsPerGroup = 3 (album gộp 1 lượt)', async () => {
    resolveAttachmentsMock.mockResolvedValue([
      ...Array.from({ length: 5 }, (_, i) => ({
        mediaAssetId: `a${i}`, kind: 'image', name: '', caption: '', blobUrl: 'u', missing: false,
      })),
      { mediaAssetId: 'f1', kind: 'file', name: '', caption: '', blobUrl: 'u', missing: false },
    ]);
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/estimate`,
      payload: { templateId: 'tpl-1', zaloAccountId: 'za-1', targetGroupIds: groupIds(12),
        scheduleKind: 'daily', timesOfDay: ['08:00', '14:00', '20:00'], minDelaySec: 20, maxDelaySec: 45 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.opsPerGroup).toBe(3);
    expect(body.opsPerRun).toBe(36);
    expect(body.opsPerDay).toBe(108);
    expect(body.budget).toBe(120);
    expect(body.warnings).toEqual([]);
  });

  it('nick của org khác → 404, KHÔNG lộ hạn mức tenant khác', async () => {
    const err: any = new Error('Account not found');
    err.statusCode = 404;
    resolveAccountMock.mockRejectedValue(err);
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/estimate`,
      payload: { templateId: 'tpl-1', zaloAccountId: 'za-other', targetGroupIds: groupIds(1) },
    });
    expect(res.statusCode).toBe(404);
    expect(getEffectiveLimitMock).not.toHaveBeenCalled();
  });

  it('vượt ngân sách → warnings có thông báo, vẫn trả 200 (không ghi DB)', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/estimate`,
      payload: { templateId: 'tpl-1', zaloAccountId: 'za-1', targetGroupIds: groupIds(50),
        scheduleKind: 'daily', timesOfDay: ['08:00', '14:00', '20:00'], minDelaySec: 20, maxDelaySec: 45 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings.length).toBeGreaterThan(0);
    expect(p.groupBroadcast.create).not.toHaveBeenCalled();
  });
});
