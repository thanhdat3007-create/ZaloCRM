// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * trigger-gate.ts — quyết định CÓ chạy agent cho lượt này không.
 *
 * Kiểm theo thứ tự rẻ → đắt: kiểm tra thuần bộ nhớ trước, query DB sau, để tin
 * rác và tin nhóm không được gọi không tốn round-trip lẫn tiền gọi model.
 *
 * Mọi cổng trả về `skipReason` khớp cột AiAgentRun.skip_reason — nhật ký chính
 * là chỗ trả lời câu hỏi "sao AI không trả lời".
 */
import type { AiAgent, AiAgentBinding } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import type { SkipReason } from './ai-agent-errors.js';
import { getPauseReason } from './conversation-pause-store.js';

export type GateResult = { ok: true } | { ok: false; reason: SkipReason };

const PASS: GateResult = { ok: true };
const fail = (reason: SkipReason): GateResult => ({ ok: false, reason });

export interface MentionEntry {
  uid: string;
  pos: number;
  len: number;
  type: 0 | 1; // 0 = user, 1 = @all
}

export interface GateContext {
  orgId: string;
  agent: AiAgent;
  binding: AiAgentBinding;
  conversationId: string;
  zaloAccountId: string;
  /** UID Zalo của nick đang nhận tin — dùng để nhận biết @mention đúng nick. */
  zaloUid: string | null;
  threadType: 'user' | 'group';
  message: {
    id: string;
    senderType: string;
    senderUid: string | null;
    content: string | null;
    contentType: string;
    isDeleted: boolean;
    isLocal: boolean;
    mentions: MentionEntry[] | null;
    quoteOwnerUid: string | null;
  };
}

/** Bỏ dấu + lowercase để so từ khoá "bao gia" khớp "báo giá". */
export function foldVietnamese(text: string): string {
  return (text || '')
    .normalize('NFD')
    // Bỏ dấu thanh + dấu mũ/móc (combining diacritics) sau khi tách NFD.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd') // đ / Đ không tách được bằng NFD
    .toLowerCase();
}

function matchesAnyKeyword(content: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const folded = foldVietnamese(content);
  return keywords.some((kw) => {
    const needle = foldVietnamese(kw).trim();
    return needle.length > 0 && folded.includes(needle);
  });
}

/**
 * Trong nhóm, agent mặc định IM LẶNG. Chỉ coi là "được gọi" khi:
 *   - @mention đúng UID của nick (type 0), hoặc
 *   - @all và binding cho phép tính @all, hoặc
 *   - khách reply (quote) vào tin do chính nick gửi, hoặc
 *   - nội dung trúng triggerKeywords của binding.
 * `groupTriggerMode` quyết định nhánh nào được tính.
 */
export function isDirectedAtNick(ctx: GateContext): boolean {
  const { binding, message, zaloUid } = ctx;
  const mode = binding.groupTriggerMode;
  const allowMention = mode === 'mention' || mode === 'mention_or_keyword';
  const allowKeyword = mode === 'keyword' || mode === 'mention_or_keyword';

  if (allowMention) {
    for (const mention of message.mentions ?? []) {
      if (mention.type === 1) {
        if (binding.replyToAllMention) return true;
        continue;
      }
      if (zaloUid && mention.uid === zaloUid) return true;
    }
    // Khách bấm "Trả lời" vào tin của nick = gọi đích danh, dù không gõ @.
    if (zaloUid && message.quoteOwnerUid && message.quoteOwnerUid === zaloUid) return true;
  }

  if (allowKeyword && matchesAnyKeyword(message.content ?? '', binding.triggerKeywords)) return true;

  return false;
}

/** Regex do admin nhập có thể sai — regex hỏng thì fail-open (không chặn tin). */
function matchesNoisePattern(content: string, pattern: string): boolean {
  if (!pattern) return false;
  try {
    return new RegExp(pattern, 'i').test(content);
  } catch {
    logger.warn('[ai-agent-gate] skipNoisePattern không hợp lệ, bỏ qua cổng nhiễu');
    return false;
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Cổng thuần bộ nhớ — không chạm DB nên khung mô phỏng dùng lại được nguyên vẹn.
 * Tách riêng để mô phỏng và luồng thật không bao giờ lệch quy tắc kích hoạt.
 */
export function evaluateMemoryGates(ctx: GateContext): GateResult {
  const { agent, binding, message } = ctx;

  if (!agent.enabled) return fail('agent_disabled');
  if (!binding.enabled) return fail('binding_disabled');

  // Chỉ trả lời tin THẬT của khách. Tin của chính nick (kể cả tin AI vừa gửi,
  // sentVia='automation' nhưng senderType='self') không được kích hoạt lại agent.
  if (message.senderType === 'self' || message.isLocal || message.isDeleted) return fail('not_inbound');

  if (message.contentType !== 'text') return fail('unsupported_type');
  const content = (message.content ?? '').trim();
  if (!content) return fail('unsupported_type');

  if (matchesNoisePattern(content, agent.skipNoisePattern)) return fail('noise');

  if (ctx.threadType === 'group' && !isDirectedAtNick(ctx)) return fail('not_mentioned');

  if (matchesAnyKeyword(content, agent.handoffKeywords)) return fail('handoff_keyword');

  return PASS;
}

export async function evaluateGates(ctx: GateContext): Promise<GateResult> {
  const { agent } = ctx;

  // ── Cổng rẻ (bộ nhớ) ──────────────────────────────────────────────────────
  const memory = evaluateMemoryGates(ctx);
  if (!memory.ok) return memory;

  const { message } = ctx;

  // ── Cổng cần I/O ──────────────────────────────────────────────────────────

  // Kill switch org — dùng chung với trợ lý ảo (1 nút tắt toàn bộ AI).
  const aiConfig = await prisma.aiConfig.findUnique({
    where: { orgId: ctx.orgId },
    select: { enabled: true },
  });
  // Chưa cấu hình AiConfig = org chưa bật AI bao giờ → không tự ý chạy.
  if (!aiConfig?.enabled) return fail('org_disabled');

  // Chống vòng lặp AI↔AI: 2 nick cùng org chat với nhau thì tin của nick kia là
  // 'contact' ở phía này. Cổng senderType='self' KHÔNG bắt được ca đó.
  if (message.senderUid) {
    const internalNick = await prisma.zaloAccount.findFirst({
      where: { orgId: ctx.orgId, zaloUid: message.senderUid },
      select: { id: true },
    });
    if (internalNick) return fail('internal_nick');
  }

  const pauseReason = await getPauseReason(ctx.conversationId);
  if (pauseReason) return fail(pauseReason === 'handoff' ? 'handoff_active' : 'conversation_paused');

  // Nhường sale khi họ vừa trả lời (0 = không nhường, theo mặc định đã chốt).
  if (agent.pauseAfterHumanReplyMinutes > 0) {
    const since = new Date(Date.now() - agent.pauseAfterHumanReplyMinutes * 60_000);
    const humanReply = await prisma.message.findFirst({
      where: {
        conversationId: ctx.conversationId,
        senderType: 'self',
        sentVia: { in: ['user', 'user_native'] },
        sentAt: { gte: since },
      },
      select: { id: true },
    });
    if (humanReply) return fail('human_active');
  }

  // Quota agent — đếm lượt ĐÃ GỬI trong ngày.
  const since = startOfToday();
  const [sentToday, sentTodayThisConversation] = await Promise.all([
    prisma.aiAgentRun.count({
      where: { orgId: ctx.orgId, agentId: agent.id, status: 'sent', createdAt: { gte: since } },
    }),
    prisma.aiAgentRun.count({
      where: {
        orgId: ctx.orgId,
        agentId: agent.id,
        conversationId: ctx.conversationId,
        status: 'sent',
        createdAt: { gte: since },
      },
    }),
  ]);
  if (sentToday >= agent.maxRepliesPerDay) return fail('quota');
  if (sentTodayThisConversation >= agent.maxRepliesPerConversationDay) return fail('quota');

  // Trần gửi của nick — bảo vệ nick khỏi bị Zalo gắn cờ. Đếm mọi tin nick đã gửi
  // hôm nay (sale + automation), không riêng agent.
  const account = await prisma.zaloAccount.findUnique({
    where: { id: ctx.zaloAccountId },
    select: { dailyMessageCap: true },
  });
  if (account) {
    const sentByNickToday = await prisma.message.count({
      where: {
        conversation: { zaloAccountId: ctx.zaloAccountId },
        senderType: 'self',
        isLocal: false,
        sentAt: { gte: since },
      },
    });
    if (sentByNickToday >= account.dailyMessageCap) return fail('nick_cap');
  }

  return PASS;
}
