// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * agent-reply-worker.ts — xử lý 1 lượt trả lời tự động.
 *
 * Luôn chạy trong withTenant(orgId): AI tự hành động in-process nên mọi query
 * phải mang tenant context (tenant-guard + RLS), không được vượt mặt gateway.
 *
 * Nguyên tắc: MỌI lượt đều ghi 1 dòng AiAgentRun, kể cả khi bỏ qua. Nhật ký này
 * là chỗ duy nhất trả lời được "sao AI không trả lời" / "câu trả lời sai từ đâu".
 */
import { randomUUID } from 'node:crypto';
import type { AiAgent, Prisma } from '@prisma/client';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { startTypingIndicator } from './typing-indicator.js';
import { buildMessageAttribution } from '../../shared/message-attribution.js';
import { getIo } from '../../shared/event-buffer.js';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { extractZaloMsgId } from '../chat/chat-media-helpers.js';
import { assertAiCapability, auditAiAction } from '../ai/ai-capabilities.js';
import { AiAgentConfigError, type SkipReason } from './ai-agent-errors.js';
import { resolveAgentForConversation } from './binding-resolver.js';
import { evaluateGates, type MentionEntry } from './trigger-gate.js';
import { buildAgentPrompt } from './prompt-builder.js';
import { generateAgentReply } from './agent-runner.js';
import { pauseConversation } from './conversation-pause-store.js';
import type { AgentReplyJobData } from './agent-reply-queue.js';

interface RunLogInput {
  orgId: string;
  agentId: string | null;
  conversationId: string;
  triggerMessageId: string;
  status: 'sent' | 'skipped' | 'failed' | 'handoff';
  skipReason?: SkipReason | null;
  model?: string | null;
  replyMessageId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  chunkIds?: string[] | null;
  replyText?: string | null;
  error?: string | null;
  /** true = lượt này chạy bằng engine dự phòng vì engine chính lỗi (agent-runner.ts). */
  fallbackUsed?: boolean;
}

async function writeRun(input: RunLogInput): Promise<string | null> {
  try {
    const run = await prisma.aiAgentRun.create({
      data: {
        orgId: input.orgId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        triggerMessageId: input.triggerMessageId,
        replyMessageId: input.replyMessageId ?? null,
        status: input.status,
        skipReason: input.skipReason ?? null,
        model: input.model ?? null,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        latencyMs: input.latencyMs ?? null,
        chunkIds: (input.chunkIds ?? null) as Prisma.InputJsonValue | undefined,
        replyText: input.replyText ?? null,
        error: input.error ?? null,
        fallbackUsed: input.fallbackUsed ?? false,
      },
      select: { id: true },
    });
    return run.id;
  } catch (err) {
    // Nhật ký hỏng không được làm hỏng luồng gửi tin.
    logger.warn('[ai-agent-worker] ghi AiAgentRun lỗi: %s', (err as Error).message);
    return null;
  }
}

function parseMentions(raw: unknown): MentionEntry[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({
      uid: String(m.uid ?? ''),
      pos: Number(m.pos ?? 0),
      len: Number(m.len ?? 0),
      type: (Number(m.type ?? 0) === 1 ? 1 : 0) as 0 | 1,
    }));
}

/**
 * UID người gửi tin GỐC được khách trích dẫn. Zalo dùng `uidFrom`
 * (xem ReplyMessageRef ở frontend/src/composables/use-chat.ts); các tên còn lại
 * là dự phòng cho khác biệt phiên bản SDK.
 */
function parseQuoteOwnerUid(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const uid = q.uidFrom ?? q.fromUid ?? q.ownerId;
  return uid == null ? null : String(uid);
}

export async function processAgentReply(data: AgentReplyJobData): Promise<void> {
  await withTenant(data.orgId, () => runAgentReply(data));
}

async function runAgentReply(data: AgentReplyJobData): Promise<void> {
  const { orgId, conversationId, zaloAccountId } = data;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    select: {
      id: true,
      threadType: true,
      externalThreadId: true,
      contactId: true,
      zaloAccountId: true,
      zaloAccount: {
        select: {
          zaloUid: true,
          privacyMode: true,
          ownerUserId: true,
          displayName: true,
          chatEnabled: true,
        },
      },
    },
  });
  if (!conversation) {
    logger.warn('[ai-agent-worker] không tìm thấy hội thoại %s', conversationId);
    return;
  }

  // Đọc lại tin MỚI NHẤT của khách tại thời điểm chạy — payload của job có thể đã
  // cũ (job bị gom, khách nhắn thêm sau khi enqueue).
  const triggerMessage = await prisma.message.findFirst({
    where: { conversationId, senderType: { not: 'self' }, isDeleted: false },
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      senderType: true,
      senderUid: true,
      senderName: true,
      content: true,
      contentType: true,
      isDeleted: true,
      isLocal: true,
      mentions: true,
      quote: true,
    },
  });
  if (!triggerMessage) return;

  const threadType = conversation.threadType === 'group' ? 'group' : 'user';

  const resolved = await resolveAgentForConversation({
    orgId,
    zaloAccountId,
    threadType,
    externalThreadId: conversation.externalThreadId,
    contactId: conversation.contactId,
  });
  if (!resolved) {
    await writeRun({
      orgId,
      agentId: null,
      conversationId,
      triggerMessageId: triggerMessage.id,
      status: 'skipped',
      skipReason: 'no_binding',
    });
    return;
  }
  const { agent, binding } = resolved;

  const gate = await evaluateGates({
    orgId,
    agent,
    binding,
    conversationId,
    zaloAccountId,
    zaloUid: conversation.zaloAccount?.zaloUid ?? null,
    threadType,
    message: {
      id: triggerMessage.id,
      senderType: triggerMessage.senderType,
      senderUid: triggerMessage.senderUid,
      content: triggerMessage.content,
      contentType: triggerMessage.contentType,
      isDeleted: triggerMessage.isDeleted,
      isLocal: triggerMessage.isLocal,
      mentions: parseMentions(triggerMessage.mentions),
      quoteOwnerUid: parseQuoteOwnerUid(triggerMessage.quote),
    },
  });

  if (!gate.ok) {
    // Trúng từ khoá bàn giao là tình huống cần người thật, không phải "bỏ qua
    // thầm lặng" — báo sale ngay.
    if (gate.reason === 'handoff_keyword') {
      await handleHandoff({
        orgId,
        agent,
        conversationId,
        triggerMessageId: triggerMessage.id,
        zaloAccountId,
        skipReason: 'handoff_keyword',
        reason: 'Khách yêu cầu gặp nhân viên',
      });
      return;
    }
    await writeRun({
      orgId,
      agentId: agent.id,
      conversationId,
      triggerMessageId: triggerMessage.id,
      status: 'skipped',
      skipReason: gate.reason,
    });
    return;
  }

  // Nick CHỈ NHẬN: tầng gửi tin (zalo-operations) sẽ chặn ở phút cuối, nên chạy tiếp là
  // vừa đốt token soạn một câu không ai đọc, vừa hiện bubble "đang soạn tin" cho khách rồi
  // im — hứa suông còn tệ hơn không trả lời. Dừng ngay tại đây, ghi rõ lý do.
  if (conversation.zaloAccount && !conversation.zaloAccount.chatEnabled) {
    await writeRun({
      orgId,
      agentId: agent.id,
      conversationId,
      triggerMessageId: triggerMessage.id,
      status: 'skipped',
      skipReason: 'chat_disabled',
    });
    return;
  }

  // Quyền của AI — deny-by-default, dùng chung allowlist với AI cũ.
  assertAiCapability('generate_reply');
  assertAiCapability('save_ai_message');

  // Bubble "đang soạn tin" phải bật TỪ ĐÂY, trước khi soạn: một lượt mất 13-22 giây, để
  // khách nhìn màn hình trống chừng đó là họ tưởng bị lơ. Bật SAU các cửa gate phía trên
  // là có chủ ý — mọi lối thoát "không trả lời" (không có agent, ngoài giờ, đang bàn giao)
  // đều nằm trên, hiện bubble rồi im còn tệ hơn im từ đầu.
  //
  // Vòng ping tự tắt sau vài nhịp (typing-indicator.ts), nhưng phải tắt tay ở MỌI lối
  // thoát bên dưới để bubble không còn sáng sau khi tin đã gửi. `stopTyping` gọi lại nhiều
  // lần vẫn an toàn.
  const stopTyping = startTypingIndicator({
    accountId: zaloAccountId,
    threadId: conversation.externalThreadId || '',
    threadType: threadType === 'group' ? 1 : 0,
  });

  let prompt;
  let reply;
  try {
    prompt = await buildAgentPrompt({
      orgId,
      agent,
      conversationId,
      threadType,
    });
    reply = await generateAgentReply(orgId, agent, prompt);
    if (reply.fallbackUsed) {
      // Cảnh báo sớm: fallback tốn tiền thật (chuyển tải sang OpenRouter) và nếu Rocket
      // chết âm thầm mà không ai đọc log này thì chỉ phát hiện được qua hoá đơn tăng.
      // KHÔNG log giá trị API key — chỉ tên agent + lỗi gốc.
      logger.warn(
        '[ai-agent-worker] agent "%s" (%s) dùng engine dự phòng (%s) — lỗi gốc engine chính: %s',
        agent.name,
        agent.id,
        agent.fallbackProvider,
        reply.primaryError,
      );
    }
  } catch (err) {
    // Soạn hỏng: cả nhánh return (sai cấu hình) lẫn nhánh throw (lỗi tạm, BullMQ retry) đều
    // đi qua đây → tắt bubble một chỗ là đủ cho cả hai.
    stopTyping();
    if (err instanceof AiAgentConfigError) {
      await writeRun({
        orgId,
        agentId: agent.id,
        conversationId,
        triggerMessageId: triggerMessage.id,
        status: 'skipped',
        skipReason: err.skipReason,
        error: err.message,
      });
      return; // cấu hình sai — retry vô ích
    }
    await writeRun({
      orgId,
      agentId: agent.id,
      conversationId,
      triggerMessageId: triggerMessage.id,
      status: 'failed',
      model: agent.model,
      error: (err as Error).message,
    });
    throw err; // để BullMQ retry lỗi tạm thời
  }

  if (reply.handoff) {
    // Bàn giao = KHÔNG gửi gì cho khách, nên bubble phải tắt ngay: để nó sáng là hứa suông
    // một câu trả lời không bao giờ tới.
    stopTyping();
    await handleHandoff({
      orgId,
      agent,
      conversationId,
      triggerMessageId: triggerMessage.id,
      zaloAccountId,
      // Model tự nhận không đủ thông tin — KHÔNG phải trúng từ khoá bàn giao.
      skipReason: null,
      reason: reply.handoffReason ?? 'AI không đủ thông tin để trả lời',
      usage: reply,
      chunkIds: prompt.chunkIds,
    });
    return;
  }

  // ── Gửi tin ───────────────────────────────────────────────────────────────
  const threadId = conversation.externalThreadId || '';
  const zaloThreadType = threadType === 'group' ? 1 : 0;
  const io = getIo();

  try {
    // Trước đây chỗ này ping "đang gõ" MỘT lần rồi ngủ thêm tối đa 4 giây cho giống người
    // thật. Cả hai đã bỏ: vòng ping phía trên đã giữ bubble suốt 13-22 giây soạn bài, thêm
    // 4 giây câm nữa chỉ làm khách chờ lâu hơn mà không "người" hơn chút nào.
    const sdkResult = await zaloOps.sendMessage(
      zaloAccountId,
      threadId,
      zaloThreadType,
      { msg: reply.reply },
      null, // KHÔNG để zaloOps tự emit — dưới đây emit bản đã persist (có id thật).
    );

    const zaloMsgId = extractZaloMsgId(sdkResult);
    const savedMessage = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId,
        zaloMsgId: zaloMsgId || null,
        zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
        senderType: 'self',
        senderUid: conversation.zaloAccount?.zaloUid ?? null,
        senderName: conversation.zaloAccount?.displayName ?? null,
        content: reply.reply,
        contentType: 'text',
        sentAt: new Date(),
        isLocal: false,
        // sentVia giữ nguyên 'automation' (helper tự ánh xạ) — đổi giá trị này sẽ làm lệch
        // trigger-gate, analysis-service và nick-metrics-service đang đọc từ vựng cũ.
        ...buildMessageAttribution({
          kind: 'ai_agent',
          agentId: agent.id,
          agentName: agent.name,
        }),
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), isReplied: true },
    });

    const runId = await writeRun({
      orgId,
      agentId: agent.id,
      conversationId,
      triggerMessageId: triggerMessage.id,
      replyMessageId: savedMessage.id,
      status: 'sent',
      // Model THỰC SỰ đã trả lời — khác agent.model khi lượt này rơi sang fallback.
      model: reply.usedModel,
      promptTokens: reply.promptTokens,
      completionTokens: reply.completionTokens,
      latencyMs: reply.latencyMs,
      chunkIds: prompt.chunkIds,
      replyText: reply.reply,
      fallbackUsed: reply.fallbackUsed,
      // status vẫn 'sent' (khách đã nhận trả lời) nhưng error giữ lỗi GỐC của engine
      // chính — cách duy nhất phát hiện Rocket chết âm thầm mà fallback đang gánh hết.
      error: reply.fallbackUsed ? reply.primaryError : null,
    });

    auditAiAction(orgId, 'agent_reply', {
      agentId: agent.id,
      agentName: agent.name,
      conversationId,
      runId,
      messageId: savedMessage.id,
    });

    await emitChatMessage({
      io,
      orgId,
      accountId: zaloAccountId,
      conversationId,
      // zaloMsgIdNum là BigInt — phải bỏ trước khi serialize qua socket.
      message: { ...savedMessage, zaloMsgIdNum: null },
      privacyMode: conversation.zaloAccount?.privacyMode ?? 'sub',
      ownerUserId: conversation.zaloAccount?.ownerUserId ?? null,
      extra: { _aiAgent: true },
    });
  } catch (err) {
    // Gửi hỏng (nick rớt, rate-limit) → KHÔNG persist Message ma. Chỉ ghi nhật ký.
    await writeRun({
      orgId,
      agentId: agent.id,
      conversationId,
      triggerMessageId: triggerMessage.id,
      status: 'failed',
      // Model đã sinh ra reply.reply (kể cả khi đó là model fallback) — ghi đúng model
      // này thay vì agent.model để không đánh lạc hướng khi soát log.
      model: reply.usedModel,
      latencyMs: reply.latencyMs,
      chunkIds: prompt.chunkIds,
      replyText: reply.reply,
      fallbackUsed: reply.fallbackUsed,
      error: (err as Error).message,
    });
    throw err;
  } finally {
    // Gửi xong hay gửi hỏng đều phải tắt bubble — đây là lối thoát cuối của hàm.
    stopTyping();
  }
}

/**
 * Bàn giao người thật: KHÔNG gửi tin cho khách, báo chủ nick, tạm dừng agent
 * trên hội thoại đó để AI không chen ngang khi sale đang xử lý.
 */
async function handleHandoff(input: {
  orgId: string;
  agent: AiAgent;
  conversationId: string;
  triggerMessageId: string;
  zaloAccountId: string;
  /** 'handoff_keyword' khi khách gõ trúng từ khoá; null khi model tự quyết định. */
  skipReason: SkipReason | null;
  reason: string;
  usage?: { promptTokens: number | null; completionTokens: number | null; latencyMs: number };
  chunkIds?: string[];
}): Promise<void> {
  const runId = await writeRun({
    orgId: input.orgId,
    agentId: input.agent.id,
    conversationId: input.conversationId,
    triggerMessageId: input.triggerMessageId,
    status: 'handoff',
    skipReason: input.skipReason,
    model: input.agent.model,
    promptTokens: input.usage?.promptTokens ?? null,
    completionTokens: input.usage?.completionTokens ?? null,
    latencyMs: input.usage?.latencyMs ?? null,
    chunkIds: input.chunkIds ?? null,
    replyText: input.reason,
  });

  await pauseConversation(input.conversationId, config.aiAgentHandoffPauseMinutes, 'handoff');

  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: input.zaloAccountId },
      select: { ownerUserId: true },
    });
    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { groupName: true, contact: { select: { crmName: true, fullName: true } } },
    });
    if (account?.ownerUserId) {
      const who =
        conversation?.contact?.crmName ||
        conversation?.contact?.fullName ||
        conversation?.groupName ||
        'khách';
      assertAiCapability('notify_internal');
      await prisma.systemNotification.create({
        data: {
          orgId: input.orgId,
          type: 'ai_agent_handoff',
          title: `🤖 ${input.agent.name} cần hỗ trợ`,
          content: `${who} — ${input.reason}`,
          priority: 'high',
          targetUserId: account.ownerUserId,
          conversationId: input.conversationId,
          senderZaloAccountId: input.zaloAccountId,
          status: 'pending',
        },
      });
    }
  } catch (err) {
    logger.warn('[ai-agent-worker] tạo thông báo bàn giao lỗi: %s', (err as Error).message);
  }

  auditAiAction(input.orgId, 'agent_handoff', {
    agentId: input.agent.id,
    conversationId: input.conversationId,
    runId,
    reason: input.reason,
  });
}
