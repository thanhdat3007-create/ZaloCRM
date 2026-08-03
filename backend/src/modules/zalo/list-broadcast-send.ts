// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi tệp khách hàng (🟢 Community) — gửi mẫu tin cho MỘT khách (1-1).
// ════════════════════════════════════════════════════════════════════════
//
// Bẫy cốt lõi: **UID Zalo là per-nick**. UID mà nick A tra ra cho một số điện
// thoại KHÔNG dùng được khi nick B gửi — Zalo trả "Tham số không hợp lệ". Chiến
// dịch này gửi luân phiên nhiều nick nên phải resolve UID lại theo đúng nick sắp
// gửi, thứ tự từ rẻ đến đắt:
//   1. `Friend.zaloUidInNick`         — đã kết bạn, chuẩn nhất, 0 chi phí
//   2. `CustomerListEntry.zaloUid`    — chỉ khi chính nick này tra ra trước đó
//   3. `zaloOps.findUser`             — tốn hạn mức 'friend_lookup' của nick
//
// Phần gửi media dùng lại `prepareMedia` / `sendMediaItem` của gửi nhóm: cùng một
// chuỗi bước (chữ → album ảnh → từng video/tệp) và cùng cách xử lý video native.
//
// Community feature — KHÔNG import `_ee`.

import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { getUserFullName } from '../chat/chat-helpers.js';
import { buildMessageAttribution } from '../../shared/message-attribution.js';
import { extractZaloMsgId } from '../chat/chat-media-helpers.js';
import { resolveOrCreateUserConversation } from '../chat/conversation-resolver.js';
import {
  GroupSendError, intraThreadDelay, sendMediaItem, type PreparedMedia,
} from './group-broadcast-send.js';

/** threadType của Zalo: 0 = 1-1. */
const THREAD_TYPE_USER = 0 as const;

/** Chỉ giữ chữ số: '+84908…' → '84908…' (khớp `Contact.phoneNormalized`). */
export function digitsOf(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export type UidSource = 'friend' | 'entry' | 'find_user';

export interface ResolvedUid {
  uid: string;
  via: UidSource;
  /** Có khi lấy từ Friend — giúp `resolveOrCreateUserConversation` chống xé hội thoại. */
  globalId: string | null;
  contactId: string | null;
}

/**
 * Tìm UID của khách theo GÓC NHÌN của một nick cụ thể.
 * Trả null khi nick không thấy được khách này (số không có Zalo với nick đó,
 * hoặc Zalo chặn tìm kiếm).
 */
export async function resolveUidForNick(args: {
  orgId: string;
  zaloAccountId: string;
  entryId: string;
  phoneE164: string;
  contactId: string | null;
}): Promise<ResolvedUid | null> {
  const { orgId, zaloAccountId, entryId, contactId } = args;
  const phone = digitsOf(args.phoneE164);

  // 1. Đã kết bạn với nick này → UID chuẩn theo góc nhìn nick, không tốn API.
  const friend = await prisma.friend.findFirst({
    where: {
      orgId,
      zaloAccountId,
      ...(contactId ? { contactId } : { contact: { phoneNormalized: phone } }),
    },
    select: { zaloUidInNick: true, zaloGlobalId: true, contactId: true },
  });
  if (friend?.zaloUidInNick) {
    return {
      uid: friend.zaloUidInNick,
      via: 'friend',
      globalId: friend.zaloGlobalId,
      contactId: friend.contactId,
    };
  }

  // 2. UID đã lưu trên entry — CHỈ dùng khi chính nick này tra ra. UID của nick
  //    khác đưa vào đây sẽ làm Zalo từ chối cả lượt gửi.
  const entry = await prisma.customerListEntry.findUnique({
    where: { id: entryId },
    select: { zaloUid: true, resolvedByNickId: true, zaloGlobalId: true, contactId: true },
  });
  if (entry?.zaloUid && entry.resolvedByNickId === zaloAccountId) {
    return {
      uid: entry.zaloUid,
      via: 'entry',
      globalId: entry.zaloGlobalId,
      contactId: entry.contactId ?? contactId,
    };
  }

  // 3. Tra cứu qua Zalo — tốn hạn mức 'friend_lookup' riêng của nick.
  try {
    const found = (await zaloOps.findUser(zaloAccountId, phone)) as Record<string, unknown> | null;
    const uid = String(found?.uid ?? found?.userId ?? '') || null;
    if (!uid) return null;
    return {
      uid,
      via: 'find_user',
      globalId: String(found?.globalId ?? '') || null,
      contactId: entry?.contactId ?? contactId,
    };
  } catch (err) {
    // Nick rớt / chạm hạn mức tra cứu là vấn đề của NICK, không phải của khách →
    // ném lên để worker đổi nick thay vì đánh dấu khách hỏng.
    const code = (err as { code?: string })?.code;
    if (code === 'NOT_CONNECTED' || code === 'RATE_LIMITED' || code === 'SESSION_EXPIRED') throw err;
    logger.warn(
      `[list-broadcast-send] findUser lỗi (nick=${zaloAccountId} phone=${phone}): ${(err as Error).message}`,
    );
    return null;
  }
}

export interface SendToUserArgs {
  orgId: string;
  zaloAccountId: string;
  /** UID theo góc nhìn của `zaloAccountId` — KHÔNG phải UID của nick khác. */
  uid: string;
  contactId: string | null;
  globalId: string | null;
  displayName: string | null;
  text: string;
  media: PreparedMedia;
  /** Tên chiến dịch — ghi vào metadata để bong bóng hiện đúng nguồn. */
  broadcastName: string;
  /** Người bấm phát chiến dịch — truy được trách nhiệm mà không hiện như tin gõ tay. */
  broadcastCreatedById: string;
  /** Số bước ĐÃ gửi ở lần thử trước; gửi lại bỏ qua đúng bấy nhiêu bước đầu. */
  skipSteps?: number;
  io: Server | null;
}

export interface SendToUserResult {
  zaloMsgIds: string[];
  /** Tổng số bước đã gửi (tính cả phần bỏ qua) — worker lưu vào `recipient.sentSteps`. */
  stepsDone: number;
  warnings: string[];
}

/**
 * Ghi tin CHỮ vào hội thoại 1-1 để sale thấy ngay trong /chat.
 *
 * Chỉ ghi tin chữ. Album ảnh KHÔNG ghi placeholder — echo từ Zalo sẽ tự gom đủ cụm;
 * ghi thêm ở đây sẽ ra 2 bong bóng cho cùng 1 tin (cùng lý do như gửi nhóm).
 */
async function recordTextMessage(args: {
  orgId: string;
  zaloAccountId: string;
  uid: string;
  contactId: string | null;
  globalId: string | null;
  text: string;
  broadcastName: string;
  broadcastCreatedById: string;
  zaloMsgId: string;
}): Promise<void> {
  // Đi qua conversation-resolver: 1 (khách, nick) = 1 hội thoại, kể cả khi UID
  // vừa tra ra khác UID của thread chat đang có (per-nick UID drift).
  const conversationId = await resolveOrCreateUserConversation({
    orgId: args.orgId,
    nickId: args.zaloAccountId,
    externalThreadId: args.uid,
    contactId: args.contactId,
    globalId: args.globalId,
  });

  const account = await prisma.zaloAccount.findUnique({
    where: { id: args.zaloAccountId },
    select: { zaloUid: true },
  });

  const attribution = buildMessageAttribution({
    kind: 'campaign',
    userId: args.broadcastCreatedById,
    userName: await getUserFullName(args.broadcastCreatedById),
    campaignName: args.broadcastName,
  });

  await prisma.message.create({
    data: {
      id: randomUUID(),
      conversationId,
      zaloMsgId: args.zaloMsgId || null,
      zaloMsgIdNum: args.zaloMsgId && /^\d+$/.test(args.zaloMsgId) ? BigInt(args.zaloMsgId) : null,
      senderType: 'self',
      senderUid: account?.zaloUid || '',
      senderName: 'Staff',
      content: args.text,
      contentType: 'text',
      sentAt: new Date(),
      ...attribution,
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
}

/**
 * Gửi mẫu tin (chữ + đính kèm) cho 1 khách.
 *
 * Ném `GroupSendError` kèm tiến độ khi một bước thất bại — worker bắt, phân loại
 * qua `classifySendError`, lưu `sentSteps` rồi đánh dấu khách `failed` mà không
 * chặn những khách còn lại.
 */
export async function sendToUser(args: SendToUserArgs): Promise<SendToUserResult> {
  const { orgId, zaloAccountId, uid, media, io } = args;
  const text = args.text.trim();
  const skipSteps = args.skipSteps ?? 0;
  const warnings = [...media.warnings];

  // Danh sách bước theo ĐÚNG thứ tự gửi. Index của bước là định danh bền vững
  // giữa các lần thử (mẫu tin không đổi trong một lượt) → `skipSteps` chính xác.
  const steps: Array<{ label: string; run: () => Promise<unknown> }> = [];

  if (text) {
    steps.push({
      label: 'text',
      run: async () => {
        const result = await zaloOps.sendMessage(
          zaloAccountId, uid, THREAD_TYPE_USER, { msg: text }, io,
        );
        // Lỗi ghi DB không được làm hỏng lượt gửi — tin đã ra khỏi máy rồi.
        await recordTextMessage({
          orgId,
          zaloAccountId,
          uid,
          contactId: args.contactId,
          globalId: args.globalId,
          text,
          broadcastName: args.broadcastName,
          broadcastCreatedById: args.broadcastCreatedById,
          zaloMsgId: extractZaloMsgId(result),
        }).catch((e) => {
          logger.warn(`[list-broadcast-send] ghi Message lỗi (uid=${uid}): ${(e as Error).message}`);
        });
        return result;
      },
    });
  }

  if (media.images.length > 0) {
    steps.push({
      label: `album(${media.images.length})`,
      // Zalo gán idInGroup theo ĐÚNG thứ tự mảng path → giữ nguyên thứ tự sale sắp.
      run: () => zaloOps.sendImage(
        zaloAccountId, uid, THREAD_TYPE_USER,
        media.images.map((i) => i.path), io,
        media.images[0].attachment.caption ?? '',
      ),
    });
  }

  for (const item of media.others) {
    steps.push({
      label: item.attachment.kind,
      run: () => sendMediaItem(zaloAccountId, uid, THREAD_TYPE_USER, item, io),
    });
  }

  // ── STUB QA: không chạm Zalo, log chuỗi sẽ gửi (khớp gửi nhóm) ────────────
  if (process.env.AUTOMATION_STUB_MODE === 'true') {
    logger.info(
      `[list-broadcast-send STUB] nick=${zaloAccountId} → uid=${uid} ` +
      `"${args.displayName ?? ''}" seq=(${steps.map((s) => s.label).join(' → ')}) skipSteps=${skipSteps}`,
    );
    return { zaloMsgIds: [], stepsDone: steps.length, warnings };
  }

  const zaloMsgIds: string[] = [];
  let stepsDone = Math.min(skipSteps, steps.length);
  if (stepsDone > 0) {
    logger.info(
      `[list-broadcast-send] uid=${uid} bỏ qua ${stepsDone} bước đã gửi ở lần thử trước`,
    );
  }

  for (let i = stepsDone; i < steps.length; i++) {
    if (i > 0) await intraThreadDelay();
    try {
      const result = await steps[i].run();
      const msgId = extractZaloMsgId(result);
      if (msgId) zaloMsgIds.push(msgId);
      stepsDone = i + 1;
    } catch (err) {
      // Kèm tiến độ để lần gửi lại không lặp phần đã ra khỏi máy.
      throw new GroupSendError(err, zaloMsgIds, stepsDone);
    }
  }

  return { zaloMsgIds, stepsDone, warnings };
}
