// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * binding-resolver.ts — chọn agent cho 1 hội thoại.
 *
 * Thứ tự ưu tiên (cụ thể → tổng quát), dừng ở binding `enabled` đầu tiên:
 *   1. contact       — 1 khách cụ thể
 *   2. group         — 1 nhóm cụ thể (theo externalThreadId)
 *   3. account_group — mọi nhóm của nick
 *   4. account_dm    — mọi chat 1-1 của nick
 *   5. không có → KHÔNG trả lời
 *
 * Nạp toàn bộ binding của nick trong 1 query rồi chọn trong bộ nhớ (mỗi nick chỉ
 * có vài binding) — tránh 4 round-trip DB cho mỗi tin đến.
 */
import type { AiAgent, AiAgentBinding } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';

export type BindingScope = 'contact' | 'group' | 'account_group' | 'account_dm';

export interface ResolvedAgent {
  agent: AiAgent;
  binding: AiAgentBinding;
}

interface CacheEntry {
  at: number;
  rows: Array<AiAgentBinding & { agent: AiAgent }>;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

/** Gọi sau mọi thao tác ghi binding/agent để lần resolve kế tiếp đọc dữ liệu mới. */
export function invalidateBindingCache(zaloAccountId?: string): void {
  if (zaloAccountId) cache.delete(zaloAccountId);
  else cache.clear();
}

async function loadBindings(orgId: string, zaloAccountId: string) {
  const hit = cache.get(zaloAccountId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  const rows = await prisma.aiAgentBinding.findMany({
    where: { orgId, zaloAccountId, enabled: true },
    include: { agent: true },
  });
  cache.set(zaloAccountId, { at: Date.now(), rows });
  return rows;
}

/**
 * Khoảng trễ trả lời của agent phụ trách hội thoại này, dùng lúc enqueue.
 * Nhờ cache 30s, gọi hàm này trong luồng nhận tin hầu như không chạm DB.
 * Không có agent → null, hàng đợi dùng khoảng mặc định.
 */
export async function resolveReplyDelayRange(input: {
  orgId: string;
  zaloAccountId: string;
  threadType: 'user' | 'group';
  externalThreadId: string | null;
  contactId: string | null;
}): Promise<{ minMs: number; maxMs: number } | null> {
  const resolved = await resolveAgentForConversation(input).catch(() => null);
  if (!resolved) return null;
  return { minMs: resolved.agent.replyDelayMinMs, maxMs: resolved.agent.replyDelayMaxMs };
}

export async function resolveAgentForConversation(input: {
  orgId: string;
  zaloAccountId: string;
  threadType: 'user' | 'group';
  externalThreadId: string | null;
  contactId: string | null;
}): Promise<ResolvedAgent | null> {
  const rows = await loadBindings(input.orgId, input.zaloAccountId);
  if (rows.length === 0) return null;

  const isGroup = input.threadType === 'group';
  const candidates: Array<{ scope: BindingScope; target: string | null }> = [
    { scope: 'contact', target: input.contactId },
    ...(isGroup
      ? ([
          { scope: 'group', target: input.externalThreadId },
          { scope: 'account_group', target: null },
        ] as const)
      : ([{ scope: 'account_dm', target: null }] as const)),
  ];

  for (const candidate of candidates) {
    // scope 'contact'/'group' cần target cụ thể; thiếu target thì bỏ qua cấp đó.
    if ((candidate.scope === 'contact' || candidate.scope === 'group') && !candidate.target) continue;
    const match = rows.find(
      (r) => r.scope === candidate.scope && (r.targetThreadId ?? null) === candidate.target,
    );
    // agent bị tắt → coi như không có binding ở cấp này, KHÔNG rơi xuống cấp tổng
    // quát hơn (người dùng tắt agent cụ thể là có chủ đích).
    if (match) return match.agent.enabled ? { agent: match.agent, binding: match } : null;
  }
  return null;
}
