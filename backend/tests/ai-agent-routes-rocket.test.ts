/**
 * ai-agent-routes-rocket.test.ts — validate field mới cho Rocket Agent provider +
 * fallback model + gán binding hàng loạt (đợt 2b).
 *
 * Trọng tâm: rocketProfile phải chặn được path-injection (giá trị này nối thẳng vào
 * URL /p/<profile>/v1/... phía rocket-agent-client.ts), ràng buộc chéo
 * fallbackProvider/fallbackModel, provider ngoài danh sách hỗ trợ, và 2 endpoint mới
 * (rocket/probe, bindings/bulk). Mock ở biên prisma + rbac + các module phụ trợ —
 * không kéo theo dependency thật (openrouter sdk, rocket http client thật).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser } from './test-helpers.js';

// ── Prisma mock ─────────────────────────────────────────────────────────────
const prismaMock = {
  aiAgent: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  aiAgentBinding: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  aiAgentRun: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  zaloAccount: {
    findFirst: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
  },
};

// tx mock — tenantTransaction(cb) gọi cb(txMock). Chỉ cần model dùng trong bulk binding.
const txMock = {
  aiAgentBinding: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
};
const tenantTransactionMock = vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

const invalidateBindingCacheMock = vi.fn();
const probeRocketAgentMock = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: prismaMock,
  tenantTransaction: tenantTransactionMock,
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser({ orgId: 'org-1' }); },
}));
vi.mock('../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => undefined }));
vi.mock('../src/modules/ai-agent/binding-resolver.js', () => ({
  invalidateBindingCache: (...a: unknown[]) => invalidateBindingCacheMock(...a),
}));
vi.mock('../src/modules/ai-agent/document-service.js', () => ({
  linkDocumentsToAgent: vi.fn(),
  listAgentDocumentIds: vi.fn(),
}));
vi.mock('../src/modules/ai-agent/prompt-builder.js', () => ({ buildAgentPrompt: vi.fn() }));
vi.mock('../src/modules/ai-agent/agent-runner.js', () => ({ generateAgentReply: vi.fn() }));
vi.mock('../src/modules/ai-agent/agent-simulator.js', () => ({ simulateAgentTurn: vi.fn() }));
vi.mock('../src/modules/ai-agent/conversation-pause-store.js', () => ({
  pauseConversation: vi.fn(),
  resumeConversation: vi.fn(),
  getPauseReason: vi.fn(),
}));
vi.mock('../src/modules/ai-agent/ai-sdk-model.js', () => ({
  AGENT_PROVIDERS: ['openrouter', 'rocket'],
  isAgentProvider: (id: string) => ['openrouter', 'rocket'].includes(id),
}));
vi.mock('../src/modules/ai-agent/rocket-agent-client.js', () => ({
  probeRocketAgent: (...a: unknown[]) => probeRocketAgentMock(...a),
}));

const { aiAgentRoutes } = await import('../src/modules/ai-agent/ai-agent-routes.js');

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(aiAgentRoutes);
  return app;
}

/** Body hợp lệ tối thiểu cho POST /api/v1/ai-agents — test override từng field. */
function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Agent tư vấn',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4.5',
    systemPrompt: 'Bạn là trợ lý CSKH.',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.aiAgent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'agent-new',
    ...data,
  }));
  prismaMock.aiAgent.findFirst.mockResolvedValue({ id: 'agent-1' });
  prismaMock.zaloAccount.findFirst.mockResolvedValue({ id: 'za-1' });
});

describe('POST /api/v1/ai-agents — validate rocketProfile', () => {
  it('chặn path traversal (..)', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ rocketProfile: '../etc/passwd' }),
    });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.aiAgent.create).not.toHaveBeenCalled();
  });

  it('chặn dấu gạch chéo (/)', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ rocketProfile: 'tuvan/bds' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('chặn khoảng trắng', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ rocketProfile: 'tu van bds' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('chặn chữ hoa', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ rocketProfile: 'TuVanBDS' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('chặn tên dài quá 64 ký tự', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ rocketProfile: 'a'.repeat(65) }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('chấp nhận tên hợp lệ (chữ thường, số, -, _)', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ rocketProfile: 'tuvan-bds_01' }),
    });
    expect(res.statusCode).toBe(201);
    expect(prismaMock.aiAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rocketProfile: 'tuvan-bds_01' }) }),
    );
  });

  it('rỗng → lưu null (profile default)', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ rocketProfile: '' }),
    });
    expect(res.statusCode).toBe(201);
    expect(prismaMock.aiAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rocketProfile: null }) }),
    );
  });
});

describe('POST /api/v1/ai-agents — ràng buộc chéo fallback', () => {
  it('có fallbackProvider nhưng thiếu fallbackModel → 400', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ fallbackProvider: 'openrouter' }),
    });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.aiAgent.create).not.toHaveBeenCalled();
  });

  it('fallbackProvider = rocket cho phép fallbackModel rỗng', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ fallbackProvider: 'rocket' }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('fallbackProvider ngoài danh sách hỗ trợ → 400', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ fallbackProvider: 'anthropic', fallbackModel: 'claude' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('đủ cả 2 field → 201, lưu đúng giá trị', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ fallbackProvider: 'openrouter', fallbackModel: 'anthropic/claude-haiku-4.5' }),
    });
    expect(res.statusCode).toBe(201);
    expect(prismaMock.aiAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fallbackProvider: 'openrouter',
          fallbackModel: 'anthropic/claude-haiku-4.5',
        }),
      }),
    );
  });
});

describe('POST /api/v1/ai-agents — validate provider + model', () => {
  it('provider ngoài danh sách hỗ trợ → 400', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ provider: 'anthropic' }),
    });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.aiAgent.create).not.toHaveBeenCalled();
  });

  it('openrouter mà thiếu model → 400', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ model: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rocket cho phép model rỗng', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: validCreateBody({ provider: 'rocket', model: '', rocketProfile: 'cskh' }),
    });
    expect(res.statusCode).toBe(201);
    expect(prismaMock.aiAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ model: '' }) }),
    );
  });
});

describe('GET /api/v1/ai-agents/rocket/probe', () => {
  it('profile sai định dạng → 400, không gọi probeRocketAgent', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ai-agents/rocket/probe?profile=../x' });
    expect(res.statusCode).toBe(400);
    expect(probeRocketAgentMock).not.toHaveBeenCalled();
  });

  it('không truyền profile → dò profile default (null), luôn 200', async () => {
    probeRocketAgentMock.mockResolvedValue({ ok: false, status: 'unreachable', message: 'lỗi', models: [] });
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ai-agents/rocket/probe' });
    expect(res.statusCode).toBe(200);
    expect(probeRocketAgentMock).toHaveBeenCalledWith(null);
    expect(res.json()).toMatchObject({ ok: false, status: 'unreachable' });
  });

  it('profile hợp lệ → chuyển tiếp nguyên kết quả kể cả ok=false', async () => {
    probeRocketAgentMock.mockResolvedValue({ ok: true, status: 'ok', message: 'OK', models: ['rocket-zalo'] });
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ai-agents/rocket/probe?profile=tuvan-bds' });
    expect(res.statusCode).toBe(200);
    expect(probeRocketAgentMock).toHaveBeenCalledWith('tuvan-bds');
    expect(res.json()).toEqual({ ok: true, status: 'ok', message: 'OK', models: ['rocket-zalo'] });
  });
});

describe('PUT /api/v1/ai-agents/bindings/bulk', () => {
  it('scope khác "group" → 400', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/ai-agents/bindings/bulk',
      payload: { agentId: 'agent-1', zaloAccountId: 'za-1', scope: 'account_group', targetThreadIds: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(tenantTransactionMock).not.toHaveBeenCalled();
  });

  it('vượt quá 200 targetThreadIds → 400', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/ai-agents/bindings/bulk',
      payload: {
        agentId: 'agent-1',
        zaloAccountId: 'za-1',
        scope: 'group',
        targetThreadIds: Array.from({ length: 201 }, (_, i) => `t${i}`),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(tenantTransactionMock).not.toHaveBeenCalled();
  });

  it('agent/nick khác org → 404', async () => {
    prismaMock.aiAgent.findFirst.mockResolvedValue(null);
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/ai-agents/bindings/bulk',
      payload: { agentId: 'agent-x', zaloAccountId: 'za-1', scope: 'group', targetThreadIds: ['t1'] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tạo mới + cập nhật + loại trùng lặp, invalidateBindingCache gọi đúng 1 lần', async () => {
    txMock.aiAgentBinding.findFirst
      .mockResolvedValueOnce(null) // t1 → tạo mới
      .mockResolvedValueOnce({ id: 'existing-t2' }); // t2 → cập nhật
    txMock.aiAgentBinding.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new-1',
      ...data,
    }));
    txMock.aiAgentBinding.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'existing-t2',
      ...data,
    }));

    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/ai-agents/bindings/bulk',
      payload: {
        agentId: 'agent-1',
        zaloAccountId: 'za-1',
        scope: 'group',
        targetThreadIds: ['t1', 't1', 't2'], // t1 trùng lặp
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: 1, updated: 1, removed: 0 });
    // Trùng lặp bị loại trước khi ghi → chỉ 2 lần findFirst (t1, t2), không phải 3.
    expect(txMock.aiAgentBinding.findFirst).toHaveBeenCalledTimes(2);
    expect(invalidateBindingCacheMock).toHaveBeenCalledTimes(1);
    expect(invalidateBindingCacheMock).toHaveBeenCalledWith('za-1');
  });

  it('replaceMissing=true chỉ gỡ binding group CỦA AGENT NÀY, không đụng agent khác', async () => {
    txMock.aiAgentBinding.findFirst.mockResolvedValue(null);
    txMock.aiAgentBinding.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new-1',
      ...data,
    }));
    txMock.aiAgentBinding.deleteMany.mockResolvedValue({ count: 3 });

    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/ai-agents/bindings/bulk',
      payload: {
        agentId: 'agent-1',
        zaloAccountId: 'za-1',
        scope: 'group',
        targetThreadIds: ['t1'],
        replaceMissing: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: 1, updated: 0, removed: 3 });
    expect(txMock.aiAgentBinding.deleteMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        zaloAccountId: 'za-1',
        agentId: 'agent-1',
        scope: 'group',
        targetThreadId: { notIn: ['t1'] },
      },
    });
  });
});
