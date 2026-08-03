// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * agent-simulator.ts — chạy thử agent trên hội thoại GIẢ LẬP.
 *
 * Đi đúng chuỗi của luồng thật: chọn binding → cổng kích hoạt → dựng prompt →
 * gọi model. Khác luồng thật ở 2 điểm, cả 2 đều cố ý:
 *   - KHÔNG ghi gì vào DB (không conversation/message/contact/AiAgentRun giả).
 *   - Bỏ các cổng phụ thuộc hội thoại thật (tạm dừng, sale vừa trả lời, quota,
 *     trần tin của nick) vì không có conversationId để đếm. Trả về trong
 *     `skippedGates` để người dùng biết đang không kiểm những gì.
 *
 * Mục đích: xác nhận cấu hình nick/nhóm + prompt + tài liệu trước khi bật worker,
 * không phải đo tải hay kiểm hạn mức.
 */
import type { AiAgent, AiAgentBinding } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { AiAgentConfigError, type SkipReason } from './ai-agent-errors.js';
import { resolveAgentForConversation } from './binding-resolver.js';
import { evaluateMemoryGates, type GateContext, type MentionEntry } from './trigger-gate.js';
import { assemblePrompt, buildSimulationContextBlock, type HistoryTurn } from './prompt-builder.js';
import { generateAgentReply } from './agent-runner.js';

/** Cổng bị bỏ qua khi mô phỏng — hiển thị nguyên văn trên UI. */
const SKIPPED_GATES = [
  'Hội thoại đang tạm dừng / chờ bàn giao',
  'Sale vừa trả lời (pauseAfterHumanReply)',
  'Hạn mức trả lời mỗi ngày của agent',
  'Trần tin nhắn mỗi ngày của nick',
] as const;

export interface SimulateTurn {
  /** 'customer' = tin khách, 'agent' = câu agent đã trả lời ở lượt trước. */
  role: 'customer' | 'agent';
  content: string;
  /** Tên người gửi trong nhóm — giúp agent phân biệt ai đang hỏi. */
  senderName?: string | null;
}

export interface SimulateInput {
  orgId: string;
  zaloAccountId: string;
  threadType: 'user' | 'group';
  /** Tin khách vừa gửi ở lượt này. */
  text: string;
  /** Các lượt trước đó, cũ → mới. Không gồm `text`. */
  history: SimulateTurn[];
  senderName?: string | null;
  /** Nhóm: khách có @nhắc đúng nick không. */
  mentionsNick: boolean;
  /** Nhóm: khách dùng @all. */
  mentionsAll: boolean;
  /** Nhóm: khách bấm "Trả lời" vào tin của nick. */
  replyToNick: boolean;
}

export interface SimulateResult {
  binding: {
    agentId: string;
    agentName: string;
    agentEnabled: boolean;
    scope: string;
    bindingEnabled: boolean;
    groupTriggerMode: string;
    triggerKeywords: string[];
    replyToAllMention: boolean;
  } | null;
  gate: { ok: boolean; reason: SkipReason | null };
  reply: {
    text: string;
    handoff: boolean;
    handoffReason: string | null;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
  } | null;
  chunks: Array<{ id: string; heading: string | null; content: string; documentTitle: string }>;
  system: string | null;
  skippedGates: readonly string[];
}

/** UID giả cho nick khi bản ghi chưa có zaloUid — mention vẫn khớp được khi mô phỏng. */
const SIM_NICK_UID = '__sim_nick__';

function buildMentions(input: SimulateInput, nickUid: string): MentionEntry[] {
  if (input.threadType !== 'group') return [];
  const mentions: MentionEntry[] = [];
  if (input.mentionsNick) mentions.push({ uid: nickUid, pos: 0, len: 0, type: 0 });
  if (input.mentionsAll) mentions.push({ uid: '-1', pos: 0, len: 0, type: 1 });
  return mentions;
}

function toHistoryTurns(input: SimulateInput): HistoryTurn[] {
  const turns: HistoryTurn[] = input.history.map((t) => ({
    senderType: t.role === 'agent' ? 'self' : 'contact',
    senderName: t.senderName ?? input.senderName ?? null,
    content: t.content,
  }));
  turns.push({
    senderType: 'contact',
    senderName: input.senderName ?? null,
    content: input.text,
  });
  return turns;
}

async function loadChunks(orgId: string, chunkIds: string[]) {
  if (chunkIds.length === 0) return [];
  const rows = await prisma.aiAgentDocumentChunk.findMany({
    where: { orgId, id: { in: chunkIds } },
    select: { id: true, heading: true, content: true, document: { select: { title: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    heading: c.heading,
    content: c.content,
    documentTitle: c.document?.title ?? '',
  }));
}

function describeBinding(agent: AiAgent, binding: AiAgentBinding): SimulateResult['binding'] {
  return {
    agentId: agent.id,
    agentName: agent.name,
    agentEnabled: agent.enabled,
    scope: binding.scope,
    bindingEnabled: binding.enabled,
    groupTriggerMode: binding.groupTriggerMode,
    triggerKeywords: binding.triggerKeywords,
    replyToAllMention: binding.replyToAllMention,
  };
}

export async function simulateAgentTurn(input: SimulateInput): Promise<SimulateResult> {
  const empty: Omit<SimulateResult, 'binding' | 'gate'> = {
    reply: null,
    chunks: [],
    system: null,
    skippedGates: SKIPPED_GATES,
  };

  const account = await prisma.zaloAccount.findFirst({
    where: { id: input.zaloAccountId, orgId: input.orgId },
    select: { id: true, displayName: true, zaloUid: true },
  });
  if (!account) throw new AiAgentConfigError('Không tìm thấy nick Zalo', 'no_binding');

  // Bước 1 — binding. externalThreadId/contactId để null: mô phỏng kiểm cấu hình
  // MẶC ĐỊNH của nick (account_dm / account_group), không phải override 1 nhóm.
  const resolved = await resolveAgentForConversation({
    orgId: input.orgId,
    zaloAccountId: input.zaloAccountId,
    threadType: input.threadType,
    externalThreadId: null,
    contactId: null,
  });
  if (!resolved) {
    return { ...empty, binding: null, gate: { ok: false, reason: 'no_binding' } };
  }
  const { agent, binding } = resolved;

  // Bước 2 — cổng kích hoạt (phần thuần bộ nhớ, dùng chung với luồng thật).
  const nickUid = account.zaloUid || SIM_NICK_UID;
  const ctx: GateContext = {
    orgId: input.orgId,
    agent,
    binding,
    conversationId: '__simulation__',
    zaloAccountId: input.zaloAccountId,
    zaloUid: nickUid,
    threadType: input.threadType,
    message: {
      id: '__simulation__',
      senderType: 'contact',
      senderUid: null,
      content: input.text,
      contentType: 'text',
      isDeleted: false,
      isLocal: false,
      mentions: buildMentions(input, nickUid),
      quoteOwnerUid: input.threadType === 'group' && input.replyToNick ? nickUid : null,
    },
  };
  const memoryGate = evaluateMemoryGates(ctx);
  if (!memoryGate.ok) {
    return { ...empty, binding: describeBinding(agent, binding), gate: { ok: false, reason: memoryGate.reason } };
  }

  // Kill switch cấp org — cổng I/O duy nhất còn giữ, vì nó không phụ thuộc
  // hội thoại và là lý do "AI im lặng" hay gặp nhất.
  const aiConfig = await prisma.aiConfig.findUnique({
    where: { orgId: input.orgId },
    select: { enabled: true },
  });
  if (!aiConfig?.enabled) {
    return { ...empty, binding: describeBinding(agent, binding), gate: { ok: false, reason: 'org_disabled' } };
  }

  // Bước 3 — prompt + gọi model.
  const prompt = await assemblePrompt({
    orgId: input.orgId,
    agent,
    threadType: input.threadType,
    ordered: toHistoryTurns(input),
    contextBlock: buildSimulationContextBlock({
      nickName: account.displayName,
      threadType: input.threadType,
      groupName: input.threadType === 'group' ? 'Nhóm mô phỏng' : null,
      contactName: input.senderName ?? null,
    }),
  });
  const generated = await generateAgentReply(input.orgId, agent, prompt);

  return {
    binding: describeBinding(agent, binding),
    gate: { ok: true, reason: null },
    reply: {
      text: generated.reply,
      handoff: generated.handoff,
      handoffReason: generated.handoffReason,
      latencyMs: generated.latencyMs,
      promptTokens: generated.promptTokens,
      completionTokens: generated.completionTokens,
    },
    chunks: await loadChunks(input.orgId, prompt.chunkIds),
    system: prompt.system,
    skippedGates: SKIPPED_GATES,
  };
}

export const __testing = { buildMentions, toHistoryTurns, SKIPPED_GATES };
