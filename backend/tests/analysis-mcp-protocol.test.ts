/**
 * analysis-mcp-protocol.test.ts — lớp giao thức MCP tự viết trên POST /mcp.
 *
 * Phần này không có SDK đỡ lưng: nếu khung JSON-RPC sai một chi tiết (trả body cho
 * notification, quên echo protocolVersion, nuốt lỗi tool thành lỗi giao thức) thì
 * Claude Code sẽ bắt tay thất bại và không có tool nào dùng được. Test đi qua HTTP
 * thật bằng fastify.inject để bắt đúng những chỗ đó.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const configMock = {
  analysisApiEnabled: true,
  analysisApiToken: '',
  analysisApiAllowedIps: [] as string[],
  analysisOrgId: '',
  analysisMaxMessages: 1000,
};

const prismaMock = {
  organization: { findMany: vi.fn(), findUnique: vi.fn() },
};

const serviceMock = {
  listZaloAccounts: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  getTranscript: vi.fn(),
  getConversationMetrics: vi.fn(),
  searchMessages: vi.fn(),
  searchContacts: vi.fn(),
  getContact: vi.fn(),
  getOrgOverview: vi.fn(),
};

vi.mock('../src/config/index.js', () => ({ config: configMock, envValue: () => undefined }));
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/analysis/analysis-service.js', () => serviceMock);

const { mcpRoutes } = await import('../src/modules/analysis/mcp-routes.js');
const { resetOrgCache } = await import('../src/modules/analysis/analysis-guard.js');

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(mcpRoutes);
  await app.ready();
  return app;
}

/** Gửi một thông điệp JSON-RPC và trả về cả status lẫn body đã parse. */
async function rpc(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown, headers = {}) {
  const response = await app.inject({ method: 'POST', url: '/mcp', payload, headers });
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetOrgCache();
  configMock.analysisApiEnabled = true;
  configMock.analysisApiToken = '';
  configMock.analysisApiAllowedIps = [];
  configMock.analysisOrgId = '';
  prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
  prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-1' });
});

describe('bắt tay MCP', () => {
  it('initialize trả năng lực tool và echo đúng phiên bản giao thức client yêu cầu', async () => {
    const app = await buildApp();

    const { status, body } = await rpc(app, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } },
    });

    expect(status).toBe(200);
    expect(body.result.protocolVersion).toBe('2025-03-26');
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.serverInfo.name).toBe('zalocrm-analysis');
  });

  it('rơi về phiên bản mặc định khi client yêu cầu phiên bản lạ', async () => {
    const app = await buildApp();

    const { body } = await rpc(app, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '1999-01-01' },
    });

    expect(body.result.protocolVersion).toBe('2025-06-18');
  });

  it('notification không được sinh body — trả 202 rỗng', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST', url: '/mcp',
      payload: { jsonrpc: '2.0', method: 'notifications/initialized' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.body).toBe('');
  });

  it('trả danh sách rỗng cho resources/prompts thay vì lỗi khi client dò năng lực', async () => {
    const app = await buildApp();

    const resources = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'resources/list' });
    const prompts = await rpc(app, { jsonrpc: '2.0', id: 2, method: 'prompts/list' });

    expect(resources.body.result.resources).toEqual([]);
    expect(prompts.body.result.prompts).toEqual([]);
  });

  it('báo lỗi -32601 cho phương thức không hỗ trợ', async () => {
    const app = await buildApp();

    const { body } = await rpc(app, { jsonrpc: '2.0', id: 9, method: 'sampling/createMessage' });

    expect(body.error.code).toBe(-32601);
    expect(body.id).toBe(9);
  });
});

describe('tools/list', () => {
  it('khai báo đủ 9 tool, mỗi tool có mô tả và schema tham số', async () => {
    const app = await buildApp();

    const { body } = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = body.result.tools;

    expect(tools).toHaveLength(9);
    expect(tools.map((t: { name: string }) => t.name)).toEqual([
      'list_zalo_accounts', 'list_conversations', 'get_conversation', 'get_transcript',
      'get_conversation_metrics', 'search_messages', 'search_contacts', 'get_contact',
      'get_org_overview',
    ]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties.orgId).toBeDefined();
    }
  });

  it('không lộ tool nào có khả năng ghi dữ liệu', async () => {
    const app = await buildApp();

    const { body } = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names: string[] = body.result.tools.map((t: { name: string }) => t.name);

    expect(names.some((n) => /^(create|update|delete|send|set|post)_/.test(n))).toBe(false);
  });
});

describe('tools/call', () => {
  it('trả kết quả tool dưới dạng khối text JSON', async () => {
    serviceMock.getOrgOverview.mockResolvedValue({ conversations: { total: 42 } });
    const app = await buildApp();

    const { body } = await rpc(app, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'get_org_overview', arguments: { days: 7 } },
    });

    expect(serviceMock.getOrgOverview).toHaveBeenCalledWith('org-1', { days: 7 });
    expect(JSON.parse(body.result.content[0].text)).toEqual({ conversations: { total: 42 } });
    expect(body.result.isError).toBeUndefined();
  });

  it('bỏ mảng messages khỏi transcript để không nhân đôi token với trường text', async () => {
    serviceMock.getTranscript.mockResolvedValue({
      conversationId: 'conv-1', returned: 2, truncated: false,
      messages: [{ id: 'm1' }, { id: 'm2' }],
      text: '[2026-08-01 09:00] KH A: Chào shop',
    });
    const app = await buildApp();

    const { body } = await rpc(app, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'get_transcript', arguments: { conversationId: 'conv-1' } },
    });
    const payload = JSON.parse(body.result.content[0].text);

    expect(payload.messages).toBeUndefined();
    expect(payload.text).toContain('KH A: Chào shop');
    expect(payload.returned).toBe(2);
  });

  it('lỗi khi CHẠY tool trả về isError, không phải lỗi JSON-RPC', async () => {
    serviceMock.getConversation.mockRejectedValue(new Error('Không tìm thấy hội thoại'));
    const app = await buildApp();

    const { body } = await rpc(app, {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'get_conversation', arguments: { conversationId: 'x' } },
    });

    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Không tìm thấy hội thoại');
  });

  it('tên tool không tồn tại cũng trả isError để trợ lý tự sửa', async () => {
    const app = await buildApp();

    const { body } = await rpc(app, {
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'delete_everything', arguments: {} },
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('delete_everything');
  });

  it('thiếu params.name là lỗi giao thức', async () => {
    const app = await buildApp();

    const { body } = await rpc(app, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: {} });

    expect(body.error.code).toBe(-32600);
  });

  it('bắt buộc chỉ định orgId khi hệ thống có nhiều tổ chức', async () => {
    prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
    const app = await buildApp();

    const { body } = await rpc(app, {
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'get_org_overview', arguments: {} },
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('orgId');
  });
});

describe('batch JSON-RPC', () => {
  it('chỉ trả phản hồi cho request, bỏ qua notification trong cùng lô', async () => {
    const app = await buildApp();

    const { status, body } = await rpc(app, [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);

    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.map((r: { id: number }) => r.id)).toEqual([1, 2]);
  });

  it('lô chỉ gồm notification trả 202 rỗng', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST', url: '/mcp',
      payload: [{ jsonrpc: '2.0', method: 'notifications/cancelled' }],
    });

    expect(response.statusCode).toBe(202);
  });
});

describe('kiểm soát truy cập', () => {
  it('mặc định không cần xác thực', async () => {
    const app = await buildApp();

    const { status } = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'ping' });

    expect(status).toBe(200);
  });

  it('bật ANALYSIS_API_TOKEN thì chặn request thiếu token', async () => {
    configMock.analysisApiToken = 'bi-mat';
    const app = await buildApp();

    const withoutToken = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'ping' });
    const withBearer = await rpc(app, { jsonrpc: '2.0', id: 2, method: 'ping' }, {
      authorization: 'Bearer bi-mat',
    });
    const withHeader = await rpc(app, { jsonrpc: '2.0', id: 3, method: 'ping' }, {
      'x-analysis-token': 'bi-mat',
    });

    expect(withoutToken.status).toBe(401);
    expect(withBearer.status).toBe(200);
    expect(withHeader.status).toBe(200);
  });

  it('danh sách IP cho phép chặn nguồn lạ', async () => {
    configMock.analysisApiAllowedIps = ['10.0.'];
    const app = await buildApp();

    const { status } = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'ping' });

    expect(status).toBe(403);
  });

  it('ANALYSIS_API_ENABLED=false thì không đăng ký route nào', async () => {
    configMock.analysisApiEnabled = false;
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/mcp', payload: {} });

    expect(response.statusCode).toBe(404);
  });

  it('GET/DELETE /mcp trả 405 vì máy chủ chạy chế độ không phiên', async () => {
    const app = await buildApp();

    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(405);
    expect((await app.inject({ method: 'DELETE', url: '/mcp' })).statusCode).toBe(405);
  });
});
