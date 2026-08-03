/**
 * group-scan-import.test.ts — Nhập roster nhóm đã quét thành Tệp khách hàng.
 *
 * 2 tầng:
 *   1. Route POST /group-scans/:scanId/import-to-list — quyền, 404/409/400, lọc groupIds
 *      về đúng phiên quét.
 *   2. Service importGroupMembersToList — gộp trùng UID, loại chính nick, nối contactId
 *      sẵn có, đánh dấu trùng tệp cũ, entry sinh ra ở dạng đã-có-Zalo.
 *
 * Mock ở ranh giới prisma (giống group-scan-routes.test.ts). Community feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { mockUser, mockZaloOps } from './test-helpers.js';

const zaloOpsMock = mockZaloOps();
const recomputeListCountersMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/shared/database/prisma-client.js', () => {
  const prisma = {
    zaloAccount: { findFirst: vi.fn() },
    zaloAccountAccess: { findFirst: vi.fn() },
    groupScan: { create: vi.fn(), findFirst: vi.fn() },
    groupMember: { findMany: vi.fn(), count: vi.fn() },
    customerList: { create: vi.fn() },
    customerListEntry: { findMany: vi.fn(), createMany: vi.fn() },
    friend: { findMany: vi.fn() },
  };
  return {
    prisma,
    // Chạy thẳng callback với chính prisma mock — không cần transaction thật.
    tenantTransaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
});
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: zaloOpsMock,
  ZaloOpError: class extends Error {},
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/zalo/group-scan-queue.js', () => ({
  enqueueGroupScan: vi.fn().mockResolvedValue(undefined),
}));
// recomputeListCounters đọc DB thật ở list-entry-routes → stub, đã có test riêng.
vi.mock('../src/modules/lists/list-entry-routes.js', () => ({
  recomputeListCounters: (...a: any[]) => recomputeListCountersMock(...a),
}));

const resolveAccountMock = vi.fn().mockResolvedValue({ id: 'za-1', orgId: 'org-1' });
const checkAccessMock = vi.fn().mockResolvedValue(true);
vi.mock('../src/modules/zalo/zalo-route-helpers.js', () => ({
  resolveAccount: (...a: any[]) => resolveAccountMock(...a),
  checkAccess: (...a: any[]) => checkAccessMock(...a),
  handleError: vi.fn().mockImplementation((reply: any, err: any) => {
    reply.status(err?.statusCode ?? 500).send({ error: err?.message ?? 'Error' });
  }),
}));

const { groupScanRoutes } = await import('../src/modules/zalo/group-scan-routes.js');
const { importGroupMembersToList } = await import(
  '../src/modules/lists/group-member-import-service.js'
);
const { prisma } = await import('../src/shared/database/prisma-client.js');

const p = prisma as any;
const BASE = '/api/v1/zalo-accounts/za-1/group-scans';
const IMPORT_URL = `${BASE}/scan-1/import-to-list`;

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(groupScanRoutes);
  return app;
}

/** Roster row mặc định — override từng field theo test. */
function member(uid: string, over: Record<string, unknown> = {}) {
  return {
    memberUid: uid,
    displayName: `KH ${uid}`,
    zaloName: `zalo-${uid}`,
    avatarUrl: null,
    isFriend: false,
    globalId: null,
    groupId: 'gA',
    ...over,
  };
}

/** Chuẩn bị prisma mock cho một lượt nhập thành công. */
function primeImport(members: Array<ReturnType<typeof member>>) {
  p.groupMember.findMany.mockResolvedValue(members);
  p.zaloAccount.findFirst.mockResolvedValue({ zaloUid: 'self-uid', displayName: 'Nick A' });
  p.customerListEntry.findMany.mockResolvedValue([]);
  p.friend.findMany.mockResolvedValue([]);
  p.customerList.create.mockResolvedValue({ id: 'list-1', name: 'Tệp nhóm' });
  p.customerListEntry.createMany.mockResolvedValue({ count: members.length });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveAccountMock.mockResolvedValue({ id: 'za-1', orgId: 'org-1' });
  checkAccessMock.mockResolvedValue(true);
});

// ── Route ───────────────────────────────────────────────────────────────────────
describe('POST /group-scans/:scanId/import-to-list', () => {
  it('trả 404 khi phiên quét không thuộc nick/org của caller', async () => {
    p.groupScan.findFirst.mockResolvedValueOnce(null);
    const res = await buildApp().inject({ method: 'POST', url: IMPORT_URL, payload: {} });
    expect(res.statusCode).toBe(404);
    expect(p.customerList.create).not.toHaveBeenCalled();
  });

  it('trả 409 khi phiên quét còn đang chạy (roster chưa đủ)', async () => {
    p.groupScan.findFirst.mockResolvedValueOnce({ groupIds: ['gA'], state: 'running' });
    const res = await buildApp().inject({ method: 'POST', url: IMPORT_URL, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(p.customerList.create).not.toHaveBeenCalled();
  });

  it('trả 403 khi caller không có quyền trên nick', async () => {
    checkAccessMock.mockImplementationOnce(async (_req: any, reply: any) => {
      reply.status(403).send({ error: 'Không có quyền truy cập tài khoản Zalo này' });
      return false;
    });
    const res = await buildApp().inject({ method: 'POST', url: IMPORT_URL, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(p.customerList.create).not.toHaveBeenCalled();
  });

  it('trả 400 khi groupIds gửi lên không thuộc phiên quét', async () => {
    p.groupScan.findFirst.mockResolvedValueOnce({ groupIds: ['gA', 'gB'], state: 'completed' });
    const res = await buildApp().inject({
      method: 'POST', url: IMPORT_URL, payload: { groupIds: ['g-khac'] },
    });
    expect(res.statusCode).toBe(400);
    expect(p.groupMember.findMany).not.toHaveBeenCalled();
  });

  it('chỉ nhập nhóm giao với phiên quét, bỏ nhóm lạ', async () => {
    p.groupScan.findFirst.mockResolvedValueOnce({ groupIds: ['gA', 'gB'], state: 'completed' });
    primeImport([member('u1')]);
    const res = await buildApp().inject({
      method: 'POST', url: IMPORT_URL, payload: { groupIds: ['gB', 'g-khac'] },
    });
    expect(res.statusCode).toBe(201);
    expect(p.groupMember.findMany.mock.calls[0][0].where.groupId).toEqual({ in: ['gB'] });
  });

  it('trả 400 khi roster rỗng', async () => {
    p.groupScan.findFirst.mockResolvedValueOnce({ groupIds: ['gA'], state: 'completed' });
    primeImport([]);
    const res = await buildApp().inject({ method: 'POST', url: IMPORT_URL, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(p.customerList.create).not.toHaveBeenCalled();
  });

  it('nhập được từ phiên quét partial và chuyển cờ onlyFriends xuống truy vấn roster', async () => {
    p.groupScan.findFirst.mockResolvedValueOnce({ groupIds: ['gA'], state: 'partial' });
    primeImport([member('u1', { isFriend: true })]);
    const res = await buildApp().inject({
      method: 'POST', url: IMPORT_URL, payload: { onlyFriends: true, name: 'Tệp nhóm' },
    });
    expect(res.statusCode).toBe(201);
    expect(p.groupMember.findMany.mock.calls[0][0].where.isFriend).toBe(true);
    expect(res.json()).toMatchObject({ listId: 'list-1', imported: 1, friends: 1, strangers: 0 });
  });
});

// ── Service ─────────────────────────────────────────────────────────────────────
describe('importGroupMembersToList', () => {
  const input = {
    orgId: 'org-1',
    userId: 'user-1',
    zaloAccountId: 'za-1',
    groupIds: ['gA', 'gB'],
    scanId: 'scan-1',
  };

  it('gộp 1 UID có mặt ở nhiều nhóm thành 1 entry và loại chính nick đang quét', async () => {
    primeImport([
      member('u1', { groupId: 'gA' }),
      member('u1', { groupId: 'gB' }), // cùng người, nhóm khác
      member('self-uid'), // chính nick
      member('u2'),
    ]);
    const res = await importGroupMembersToList(input);

    expect(res.imported).toBe(2);
    const rows = p.customerListEntry.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.zaloUid)).toEqual(['u1', 'u2']);
    expect(rows.map((r: any) => r.rowIndex)).toEqual([1, 2]);
  });

  it('entry sinh ra ở trạng thái đã-có-Zalo, không SĐT, gắn nick đã quét', async () => {
    primeImport([member('u1', { isFriend: true, globalId: 'g-1' })]);
    await importGroupMembersToList(input);

    const row = p.customerListEntry.createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      hasZalo: true,
      status: 'enriched',
      zaloUid: 'u1',
      zaloGlobalId: 'g-1',
      resolvedByNickId: 'za-1',
      phoneRaw: '',
      phoneValid: false,
      phoneE164: null,
    });
    // sourceMeta KHÔNG dùng khoá `source` — khoá đó dành cho nền tảng quảng cáo.
    expect(row.sourceMeta).toMatchObject({ origin: 'group_scan', groupId: 'gA', scanId: 'scan-1' });
    expect(row.sourceMeta.source).toBeUndefined();
  });

  it('nối contactId sẵn có khi member là bạn của nick', async () => {
    primeImport([member('u1', { isFriend: true })]);
    p.friend.findMany.mockResolvedValue([{ zaloUidInNick: 'u1', contactId: 'contact-9' }]);

    const res = await importGroupMembersToList(input);
    expect(res.linkedContacts).toBe(1);
    expect(p.customerListEntry.createMany.mock.calls[0][0].data[0].contactId).toBe('contact-9');
  });

  it('UID đã có ở tệp khác → đánh dấu trùng và dùng lại contactId của entry cũ', async () => {
    primeImport([member('u1')]);
    p.customerListEntry.findMany.mockResolvedValue([
      { id: 'entry-cu', customerListId: 'list-cu', contactId: 'contact-cu', zaloUid: 'u1' },
    ]);

    const res = await importGroupMembersToList(input);
    expect(res.duplicates).toBe(1);
    const row = p.customerListEntry.createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      dupWithListId: 'list-cu',
      dupWithListEntryId: 'entry-cu',
      contactId: 'contact-cu',
    });
    expect(row.systemMessages[0].type).toBe('DUP_CROSS_LIST');
  });

  it('tạo tệp nguồn group_scan và cập nhật lại ô đếm sau khi nhập', async () => {
    primeImport([member('u1'), member('u2', { isFriend: true })]);
    const res = await importGroupMembersToList(input);

    expect(p.customerList.create.mock.calls[0][0].data).toMatchObject({
      orgId: 'org-1',
      createdById: 'user-1',
      sourceType: 'group_scan',
    });
    expect(recomputeListCountersMock).toHaveBeenCalledWith('list-1');
    expect(res).toMatchObject({ imported: 2, friends: 1, strangers: 1, truncated: false });
  });

  it('ném no_members_to_import khi roster chỉ còn chính nick', async () => {
    primeImport([member('self-uid')]);
    await expect(importGroupMembersToList(input)).rejects.toThrow('no_members_to_import');
    expect(p.customerList.create).not.toHaveBeenCalled();
  });
});
