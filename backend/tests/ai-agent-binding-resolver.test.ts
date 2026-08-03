/**
 * ai-agent-binding-resolver.test.ts — thứ tự ưu tiên chọn agent.
 *
 * Sai thứ tự = khách của nhóm A nhận câu trả lời của agent nhóm B, hoặc agent
 * chạy ở nơi người dùng đã tắt. Đây là hợp đồng chính của tính năng "gán agent
 * theo số Zalo / theo nhóm".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  aiAgentBinding: { findMany: vi.fn() },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));

const { resolveAgentForConversation, invalidateBindingCache } = await import(
  '../src/modules/ai-agent/binding-resolver.js'
);

function agent(id: string, enabled = true) {
  return { id, name: `agent-${id}`, enabled } as never;
}

function binding(scope: string, targetThreadId: string | null, agentId: string, agentEnabled = true) {
  return {
    id: `b-${scope}-${targetThreadId ?? 'null'}`,
    scope,
    targetThreadId,
    agentId,
    enabled: true,
    agent: agent(agentId, agentEnabled),
  };
}

const BASE = {
  orgId: 'org-1',
  zaloAccountId: 'nick-1',
  externalThreadId: 'group-99',
  contactId: 'contact-7',
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateBindingCache();
});

describe('resolveAgentForConversation', () => {
  it('không có binding nào → null (agent không trả lời)', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([]);
    const res = await resolveAgentForConversation({ ...BASE, threadType: 'user' });
    expect(res).toBeNull();
  });

  it('binding contact thắng account_dm (cụ thể hơn)', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([
      binding('account_dm', null, 'agent-dm'),
      binding('contact', 'contact-7', 'agent-contact'),
    ]);
    const res = await resolveAgentForConversation({ ...BASE, threadType: 'user' });
    expect(res?.agent.id).toBe('agent-contact');
  });

  it('binding group cụ thể thắng account_group', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([
      binding('account_group', null, 'agent-all-groups'),
      binding('group', 'group-99', 'agent-this-group'),
    ]);
    const res = await resolveAgentForConversation({ ...BASE, threadType: 'group' });
    expect(res?.agent.id).toBe('agent-this-group');
  });

  it('nhóm khác dùng account_group làm mặc định', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([
      binding('account_group', null, 'agent-all-groups'),
      binding('group', 'group-99', 'agent-this-group'),
    ]);
    const res = await resolveAgentForConversation({
      ...BASE,
      threadType: 'group',
      externalThreadId: 'group-khac',
    });
    expect(res?.agent.id).toBe('agent-all-groups');
  });

  it('chat 1-1 KHÔNG dùng binding của nhóm', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([
      binding('account_group', null, 'agent-all-groups'),
      binding('group', 'group-99', 'agent-this-group'),
    ]);
    const res = await resolveAgentForConversation({ ...BASE, threadType: 'user', contactId: null });
    expect(res).toBeNull();
  });

  it('chat nhóm KHÔNG dùng binding account_dm', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([binding('account_dm', null, 'agent-dm')]);
    const res = await resolveAgentForConversation({ ...BASE, threadType: 'group', contactId: null });
    expect(res).toBeNull();
  });

  it('agent bị tắt ở cấp cụ thể → im lặng, KHÔNG rơi xuống cấp tổng quát', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([
      binding('account_dm', null, 'agent-dm'),
      binding('contact', 'contact-7', 'agent-contact', /* agentEnabled */ false),
    ]);
    const res = await resolveAgentForConversation({ ...BASE, threadType: 'user' });
    expect(res).toBeNull();
  });

  it('query chỉ lấy binding đang bật, đúng org + nick', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([]);
    await resolveAgentForConversation({ ...BASE, threadType: 'user' });
    expect(prismaMock.aiAgentBinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org-1', zaloAccountId: 'nick-1', enabled: true },
      }),
    );
  });

  it('cache theo nick — 2 lượt liên tiếp chỉ 1 query', async () => {
    prismaMock.aiAgentBinding.findMany.mockResolvedValue([binding('account_dm', null, 'agent-dm')]);
    await resolveAgentForConversation({ ...BASE, threadType: 'user' });
    await resolveAgentForConversation({ ...BASE, threadType: 'user' });
    expect(prismaMock.aiAgentBinding.findMany).toHaveBeenCalledTimes(1);

    // Sau khi người dùng sửa cấu hình, cache phải bị xoá.
    invalidateBindingCache('nick-1');
    await resolveAgentForConversation({ ...BASE, threadType: 'user' });
    expect(prismaMock.aiAgentBinding.findMany).toHaveBeenCalledTimes(2);
  });
});
