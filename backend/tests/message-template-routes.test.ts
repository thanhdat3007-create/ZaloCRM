/**
 * message-template-routes.test.ts — CRUD mẫu tin Community.
 *
 * Mock ở biên prisma + rbac, drive route qua Fastify inject() giống
 * group-scan-routes.test.ts. Community feature — không import `_ee`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser } from './test-helpers.js';

const userHasGrantMock = vi.fn().mockResolvedValue(true);

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    messageTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    mediaAsset: { findMany: vi.fn() },
    groupBroadcast: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/rbac/permission-group-service.js', () => ({
  userHasGrant: (...a: any[]) => userHasGrantMock(...a),
}));
vi.mock('../src/modules/rbac/rbac-middleware.js', () => ({
  requireGrant: () => async () => undefined,
}));

const { messageTemplateRoutes } = await import('../src/modules/chat/message-template-routes.js');
const { prisma } = await import('../src/shared/database/prisma-client.js');

const BASE = '/api/v1/message-templates';
const p = prisma as any;

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(messageTemplateRoutes);
  return app;
}

/** Giả lập kho media: mọi id truyền vào đều tồn tại với kind cho trước. */
function stubAssets(assets: Array<{ id: string; kind: string }>) {
  p.mediaAsset.findMany.mockImplementation(async (args: any) => {
    const wanted: string[] = args.where.id.in;
    return assets.filter((a) => wanted.includes(a.id));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  userHasGrantMock.mockResolvedValue(true);
  p.groupBroadcast.findMany.mockResolvedValue([]);
  p.messageTemplate.create.mockImplementation(async (args: any) => ({ id: 'tpl-1', ...args.data }));
  p.messageTemplate.update.mockImplementation(async (args: any) => ({ id: args.where.id, ...args.data }));
});

describe('POST /api/v1/message-templates', () => {
  it('tạo mẫu chỉ có chữ → 201', async () => {
    stubAssets([]);
    const res = await buildApp().inject({
      method: 'POST', url: BASE, payload: { name: 'Chào', content: 'Xin chào' },
    });
    expect(res.statusCode).toBe(201);
    expect(p.messageTemplate.create).toHaveBeenCalled();
    expect(p.messageTemplate.create.mock.calls[0][0].data.attachments).toEqual([]);
  });

  it('tạo mẫu chỉ có 2 ảnh, content rỗng → 201', async () => {
    stubAssets([{ id: 'a1', kind: 'image' }, { id: 'a2', kind: 'image' }]);
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'Album', content: '', attachments: [{ mediaAssetId: 'a1' }, { mediaAssetId: 'a2' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(p.messageTemplate.create.mock.calls[0][0].data.attachments).toHaveLength(2);
  });

  it('mẫu rỗng cả chữ lẫn đính kèm → 422 TEMPLATE_EMPTY', async () => {
    stubAssets([]);
    const res = await buildApp().inject({
      method: 'POST', url: BASE, payload: { name: 'Rỗng', content: '   ' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TEMPLATE_EMPTY');
    expect(p.messageTemplate.create).not.toHaveBeenCalled();
  });

  it('mediaAssetId của org khác → 422 ASSET_NOT_ACCESSIBLE, không tạo hàng nào', async () => {
    stubAssets([{ id: 'a1', kind: 'image' }]); // 'a-other' không trả về
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'X', content: 'hi', attachments: [{ mediaAssetId: 'a1' }, { mediaAssetId: 'a-other' }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('ASSET_NOT_ACCESSIBLE');
    expect(res.json().assetIds).toEqual(['a-other']);
    expect(p.messageTemplate.create).not.toHaveBeenCalled();
  });

  it('13 đính kèm → 422 TOO_MANY_ATTACHMENTS', async () => {
    const ids = Array.from({ length: 13 }, (_, i) => `a${i}`);
    stubAssets(ids.map((id) => ({ id, kind: 'image' })));
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'X', content: 'hi', attachments: ids.map((id) => ({ mediaAssetId: id })) },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TOO_MANY_ATTACHMENTS');
  });

  it('client gửi kind sai → bản lưu vẫn lấy kind từ MediaAsset', async () => {
    stubAssets([{ id: 'a1', kind: 'image' }]);
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'X', content: 'hi', attachments: [{ mediaAssetId: 'a1', kind: 'file' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(p.messageTemplate.create.mock.calls[0][0].data.attachments[0].kind).toBe('image');
  });

  it('ghi contentRich khớp content — giữ bất biến content === contentRich.text', async () => {
    stubAssets([]);
    const res = await buildApp().inject({
      method: 'POST', url: BASE, payload: { name: 'X', content: 'Bảng giá tháng 8' },
    });
    expect(res.statusCode).toBe(201);
    const data = p.messageTemplate.create.mock.calls[0][0].data;
    expect(data.contentRich).toEqual({ text: 'Bảng giá tháng 8', styles: [] });
    expect(data.content).toBe(data.contentRich.text);
  });

  it('giữ nguyên thứ tự đính kèm client gửi', async () => {
    // findMany trả ngược thứ tự để chứng minh route không phụ thuộc thứ tự DB.
    p.mediaAsset.findMany.mockResolvedValue([
      { id: 'a3', kind: 'file' }, { id: 'a1', kind: 'image' }, { id: 'a2', kind: 'video' },
    ]);
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: {
        name: 'X', content: 'hi',
        attachments: [{ mediaAssetId: 'a1' }, { mediaAssetId: 'a2' }, { mediaAssetId: 'a3' }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(p.messageTemplate.create.mock.calls[0][0].data.attachments.map((a: any) => a.mediaAssetId))
      .toEqual(['a1', 'a2', 'a3']);
  });
});

describe('GET /api/v1/message-templates', () => {
  it('scope quyền vẫn áp khi CÓ từ khoá tìm kiếm — không lộ mẫu riêng tư người khác', async () => {
    p.messageTemplate.findMany.mockResolvedValue([]);
    await buildApp().inject({ method: 'GET', url: `${BASE}?search=gi%C3%A1` });
    const where = p.messageTemplate.findMany.mock.calls[0][0].where;
    // Cả scope quyền lẫn bộ lọc tìm kiếm đều dùng khoá `OR` → phải nằm trong AND,
    // nếu spread thì bộ lọc sau đè scope và mọi mẫu private của org lộ ra.
    expect(where.OR).toBeUndefined();
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toEqual([
      { visibility: 'public' }, { ownerUserId: 'user-1' }, { createdById: 'user-1' },
    ]);
  });

  it('không có từ khoá → chỉ còn scope quyền', async () => {
    p.messageTemplate.findMany.mockResolvedValue([]);
    await buildApp().inject({ method: 'GET', url: BASE });
    const where = p.messageTemplate.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(1);
  });
});

describe('PATCH /api/v1/message-templates/:id', () => {
  beforeEach(() => {
    p.messageTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1', orgId: 'org-1', name: 'Cũ', content: 'Nội dung cũ', attachments: [],
    });
  });

  it('đổi content → contentRich viết lại theo content mới', async () => {
    stubAssets([]);
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/tpl-1`, payload: { content: 'Nội dung mới' },
    });
    expect(res.statusCode).toBe(200);
    expect(p.messageTemplate.update.mock.calls[0][0].data.contentRich)
      .toEqual({ text: 'Nội dung mới', styles: [] });
  });

  it('không đổi content → không đụng contentRich', async () => {
    stubAssets([]);
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/tpl-1`, payload: { name: 'Tên mới' },
    });
    expect(res.statusCode).toBe(200);
    expect(p.messageTemplate.update.mock.calls[0][0].data.contentRich).toBeUndefined();
  });
});

describe('DELETE /api/v1/message-templates/:id', () => {
  it('mẫu đang có chiến dịch active → 409 TEMPLATE_IN_USE', async () => {
    p.messageTemplate.findFirst.mockResolvedValue({ id: 'tpl-1', orgId: 'org-1' });
    p.groupBroadcast.findMany.mockResolvedValue([{ id: 'bc-1', name: 'Chiến dịch A' }]);
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/tpl-1` });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('TEMPLATE_IN_USE');
    expect(p.messageTemplate.update).not.toHaveBeenCalled();
  });

  it('không chiến dịch nào dùng → soft delete (archivedAt)', async () => {
    p.messageTemplate.findFirst.mockResolvedValue({ id: 'tpl-1', orgId: 'org-1' });
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/tpl-1` });
    expect(res.statusCode).toBe(200);
    expect(p.messageTemplate.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
  });
});
