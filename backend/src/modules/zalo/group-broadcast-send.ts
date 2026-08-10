// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi nhóm theo lịch (🟢 Community) — gửi mẫu tin vào MỘT nhóm.
// ════════════════════════════════════════════════════════════════════════
//
// Một mẫu tin = NHIỀU lệnh gửi ("bước"): chữ → album ảnh → từng video/tệp.
// Thứ tự khớp trực giác người dùng; giữa các bước nghỉ 0.8–2.5s như `send-block`
// để không dồn burst vào một thread.
//
// Media tải về tmp MỘT LẦN cho cả lượt (`prepareMedia`), không tải lại theo từng
// nhóm — 50 nhóm × 12 đính kèm sẽ là 600 lượt tải và làm lượt gửi dài hơn nhiều
// so với `runDurationSec` mà ràng buộc SCHEDULE_TOO_TIGHT dựa vào.
// Gửi từ blob nội bộ (MinIO) chứ không phải URL Zalo CDN — URL CDN hết hạn.
//
// Rate limit: `zaloOps.exec` ĐÃ tự `checkLimits` + `recordSend` cho mỗi lệnh
// (category 'message'). KHÔNG gọi `recordSend` thêm cho các lệnh đi qua `zaloOps`
// — sẽ đếm gấp đôi. Riêng `sendNativeVideo` gọi thẳng `api` nên phải tự đếm.
//
// Community feature — KHÔNG import `_ee`.

import { randomUUID } from 'node:crypto';
import { getUserFullName } from '../chat/chat-helpers.js';
import { buildMessageAttribution } from '../../shared/message-attribution.js';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { zaloRateLimiter } from './zalo-rate-limiter.js';
import { sendNativeVideo } from '../../shared/video-processor.js';
import { zaloPool } from './zalo-pool.js';
import { downloadMediaToTemp, extractZaloMsgId } from '../chat/chat-media-helpers.js';
import type { ResolvedAttachment } from '../chat/message-template-service.js';
import { buildRtfContent, trimRich, type ZaloStyle } from '../../shared/zalo-rich-text.js';

/** threadType của Zalo: 0 = 1-1, 1 = nhóm. */
const THREAD_TYPE_GROUP = 1 as const;
export type ZaloThreadType = 0 | 1;
/** Trần ảnh 1 album — khớp giới hạn SDK và trần đính kèm mẫu tin. */
const MAX_ALBUM_IMAGES = 12;

export interface PreparedItem {
  attachment: ResolvedAttachment;
  /** Đường dẫn tmp của blob đã tải về. */
  path: string;
}

/** Media của mẫu tin đã tải về tmp, dùng lại cho MỌI nhóm trong cùng lượt. */
export interface PreparedMedia {
  /** Ảnh gộp 1 album, giữ đúng thứ tự sale sắp trong mẫu. */
  images: PreparedItem[];
  /** Video/tệp gửi từng cái. */
  others: PreparedItem[];
  /** Đính kèm bị bỏ (asset xoá khỏi kho / tải hỏng). */
  warnings: string[];
  /** Xoá toàn bộ tmp — gọi ở `finally` của lượt gửi. */
  cleanup: () => Promise<void>;
}

export interface SendToGroupArgs {
  orgId: string;
  zaloAccountId: string;
  /** External thread id của nhóm Zalo. */
  groupId: string;
  groupName: string;
  text: string;
  /** Định dạng Zalo của `text` (đậm/nghiêng/màu/cỡ). Offset bám theo `text` đã trim. */
  styles?: ZaloStyle[];
  media: PreparedMedia;
  /** Tên chiến dịch — ghi vào metadata để bong bóng hiện đúng nguồn. */
  broadcastName: string;
  /**
   * Người bấm phát chiến dịch (GroupBroadcast.createdById). Bắt buộc truyền: tin bắn hàng
   * loạt phải truy được về người phát động, nhưng KHÔNG được hiện như tin người đó ngồi gõ
   * tay — trước đây thiếu trường này nên tin chiến dịch mang đúng nhãn "Sale CRM · Staff".
   */
  broadcastCreatedById: string;
  /**
   * Số bước ĐÃ gửi thành công cho nhóm này ở lần thử trước. Gửi lại sẽ bỏ qua
   * đúng bấy nhiêu bước đầu — nếu không, nhóm nhận lại đoạn chữ đã nhận rồi.
   */
  skipSteps?: number;
  io: Server | null;
}

export interface SendToGroupResult {
  zaloMsgIds: string[];
  /** Tổng số bước đã gửi (tính cả phần bỏ qua) — worker lưu vào target.sentSteps. */
  stepsDone: number;
  warnings: string[];
}

/**
 * Lỗi gửi kèm tiến độ đã đạt được, để worker lưu lại và không gửi trùng khi
 * người dùng bấm "Gửi lại nhóm lỗi".
 *
 * Dùng chung cho cả gửi nhóm lẫn gửi 1-1: `classifySendError` bóc `cause` ra khỏi
 * lớp vỏ này, nên mọi đường gửi hàng loạt phải ném đúng kiểu này để tiến độ
 * từng phần không bị mất.
 */
export class GroupSendError extends Error {
  constructor(
    override readonly cause: unknown,
    readonly zaloMsgIds: string[],
    readonly stepsDone: number,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'GroupSendError';
  }
}

/**
 * Nghỉ giữa 2 bước gửi trong CÙNG một thread: 0.8–2.5s (khớp send-block).
 * Dùng chung cho gửi nhóm và gửi 1-1 — cùng lý do: không dồn burst vào 1 thread.
 */
export function intraThreadDelay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 800 + Math.floor(Math.random() * 1700)));
}

/**
 * Phân loại lỗi gửi → errorCode ngắn để UI dịch sang tiếng Việt.
 *
 * `ZaloOpError.code` là nguồn tin cậy cho rate-limit / mất kết nối (message của
 * limiter là tiếng Việt nên khớp regex tiếng Anh sẽ trượt). Mã lỗi phía Zalo thì
 * `zaloOps.exec` chỉ nhét vào message dạng `[zalo:<code>]`, phải bắt bằng regex.
 */
export function classifySendError(err: unknown): { errorCode: string; errorMessage: string } {
  const raw = err instanceof GroupSendError ? err.cause : err;
  const message = raw instanceof Error ? raw.message : String(raw);
  const code = (raw as { code?: string })?.code;

  let errorCode: string;
  const zaloCode = /\[zalo:([^\]]+)\]/.exec(message)?.[1];
  if (code === 'RATE_LIMITED') errorCode = 'RATE_LIMIT';
  else if (code === 'NOT_CONNECTED' || code === 'SESSION_EXPIRED') errorCode = 'NICK_OFFLINE';
  else if (zaloCode) errorCode = `ZALO_${zaloCode}`;
  else if (/not.*member|left|kick/i.test(message)) errorCode = 'NOT_IN_GROUP';
  else if (/fetch failed|econnreset|socket|und_err/i.test(message)) errorCode = 'NETWORK';
  else if (/rate limit|rate-limited/i.test(message)) errorCode = 'RATE_LIMIT';
  else errorCode = 'UNKNOWN';

  return { errorCode, errorMessage: message.slice(0, 500) };
}

/**
 * Tải đính kèm của mẫu tin về tmp một lần cho cả lượt gửi.
 * Đính kèm `missing` hoặc tải hỏng → bỏ qua + ghi cảnh báo, không làm gãy lượt.
 */
export async function prepareMedia(attachments: ResolvedAttachment[]): Promise<PreparedMedia> {
  const warnings: string[] = [];
  const cleanups: Array<() => Promise<void>> = [];
  const images: PreparedItem[] = [];
  const others: PreparedItem[] = [];

  const cleanup = async () => {
    for (const c of cleanups) await c().catch(() => {});
  };

  try {
    const usable = attachments.filter((a) => {
      if (a.missing) {
        warnings.push(`Bỏ qua đính kèm đã bị xoá khỏi kho: ${a.name || a.mediaAssetId}`);
        return false;
      }
      return true;
    });

    for (const att of usable) {
      const isImage = att.kind === 'image';
      if (isImage && images.length >= MAX_ALBUM_IMAGES) {
        warnings.push(`Bỏ qua ảnh vượt trần album ${MAX_ALBUM_IMAGES}: ${att.name}`);
        continue;
      }
      try {
        const dl = await downloadMediaToTemp(
          { url: att.blobUrl, filename: att.name },
          isImage ? 'image' : att.kind === 'video' ? 'video' : 'file',
        );
        cleanups.push(dl.cleanup);
        (isImage ? images : others).push({ attachment: att, path: dl.path });
      } catch (err) {
        warnings.push(`Không tải được đính kèm ${att.name}: ${(err as Error).message}`);
      }
    }
    return { images, others, warnings, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/**
 * Đảm bảo có `Conversation` cho nhóm rồi ghi tin chữ vào lịch sử chat.
 *
 * Nhóm có thể CHƯA có row `Conversation` (chưa từng có tin nhắn) → upsert theo
 * `@@unique([zaloAccountId, externalThreadId])` để hai worker không tạo trùng.
 *
 * Chỉ ghi Message cho tin CHỮ. Album ảnh KHÔNG ghi placeholder — echo từ Zalo về
 * sẽ tự gom đủ cụm (lý do đã ghi tại media-routes.ts FIX 2026-06-12); ghi thêm ở
 * đây sẽ ra 2 bong bóng cho cùng 1 tin.
 */
async function recordTextMessage(args: {
  orgId: string;
  zaloAccountId: string;
  groupId: string;
  groupName: string;
  text: string;
  styles: ZaloStyle[];
  broadcastName: string;
  broadcastCreatedById: string;
  zaloMsgId: string;
}): Promise<void> {
  const conversation = await prisma.conversation.upsert({
    where: {
      zaloAccountId_externalThreadId: {
        zaloAccountId: args.zaloAccountId,
        externalThreadId: args.groupId,
      },
    },
    create: {
      orgId: args.orgId,
      zaloAccountId: args.zaloAccountId,
      threadType: 'group',
      externalThreadId: args.groupId,
      groupName: args.groupName,
      lastMessageAt: new Date(),
    },
    update: { lastMessageAt: new Date() },
    select: { id: true, zaloAccount: { select: { zaloUid: true } } },
  });

  // Nguồn 'campaign' (không phải 'sale_crm'): vẫn truy được người phát động qua
  // repliedByUserId, nhưng nhãn khác hẳn tin sale gõ tay — trước đây dùng chung nhãn
  // 'user_crm' nên tin bắn hàng loạt hiện y như một nhân viên ngồi nhắn từng nhóm.
  const attribution = buildMessageAttribution({
    kind: 'campaign',
    userId: args.broadcastCreatedById,
    userName: await getUserFullName(args.broadcastCreatedById),
    campaignName: args.broadcastName,
  });

  await prisma.message.create({
    data: {
      id: randomUUID(),
      conversationId: conversation.id,
      zaloMsgId: args.zaloMsgId || null,
      zaloMsgIdNum: args.zaloMsgId && /^\d+$/.test(args.zaloMsgId) ? BigInt(args.zaloMsgId) : null,
      senderType: 'self',
      senderUid: conversation.zaloAccount.zaloUid || '',
      senderName: 'Staff',
      // Có định dạng → lưu khuôn JSON 'rtf' y như echo Zalo, để bong bóng /chat
      // render đậm/màu thay vì hiện chữ trơ.
      content: buildRtfContent(args.text, args.styles),
      contentType: 'text',
      sentAt: new Date(),
      ...attribution,
    },
  });
}

/**
 * Gửi mẫu tin (chữ + đính kèm) vào 1 nhóm.
 *
 * Ném `GroupSendError` khi một bước thất bại — caller (worker) bắt, phân loại
 * qua `classifySendError`, lưu `stepsDone` rồi đánh dấu target `failed` mà không
 * chặn nhóm còn lại.
 */
export async function sendToGroup(args: SendToGroupArgs): Promise<SendToGroupResult> {
  const { orgId, zaloAccountId, groupId, groupName, broadcastName, broadcastCreatedById, media, io } = args;
  // trimRich thay cho .trim(): offset của styles tính theo ký tự nên cắt khoảng
  // trắng đầu chuỗi mà không dời khoảng sẽ tô đậm/tô màu lệch chỗ.
  const { text, styles } = trimRich(args.text, args.styles ?? []);
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
          zaloAccountId, groupId, THREAD_TYPE_GROUP,
          // `styles` rỗng thì KHÔNG gửi khoá này — zca-js coi mảng rỗng là tin RTF.
          styles.length ? { msg: text, styles } : { msg: text },
          io,
        );
        // Ghi Message ngay để tin hiện trong /chat của nhóm. Lỗi ghi DB không
        // được làm hỏng lượt gửi — tin đã ra khỏi máy rồi.
        await recordTextMessage({
          orgId, zaloAccountId, groupId, groupName, text, styles, broadcastName, broadcastCreatedById,
          zaloMsgId: extractZaloMsgId(result),
        }).catch((e) => {
          logger.warn(`[group-broadcast-send] ghi Message lỗi (group=${groupId}): ${(e as Error).message}`);
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
        zaloAccountId, groupId, THREAD_TYPE_GROUP,
        media.images.map((i) => i.path), io,
        media.images[0].attachment.caption ?? '',
      ),
    });
  }

  for (const item of media.others) {
    steps.push({
      label: item.attachment.kind,
      run: () => sendMediaItem(zaloAccountId, groupId, THREAD_TYPE_GROUP, item, io),
    });
  }

  // ── STUB QA: không chạm Zalo, log chuỗi sẽ gửi (khớp send-block) ──────────
  if (process.env.AUTOMATION_STUB_MODE === 'true') {
    logger.info(
      `[group-broadcast-send STUB] nick=${zaloAccountId} → group=${groupId} "${groupName}" ` +
      `seq=(${steps.map((s) => s.label).join(' → ')}) skipSteps=${skipSteps}`,
    );
    return { zaloMsgIds: [], stepsDone: steps.length, warnings };
  }

  const zaloMsgIds: string[] = [];
  let stepsDone = Math.min(skipSteps, steps.length);
  if (stepsDone > 0) {
    logger.info(
      `[group-broadcast-send] group=${groupId} bỏ qua ${stepsDone} bước đã gửi ở lần thử trước`,
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

/**
 * Gửi 1 video hoặc 1 tệp vào một thread bất kỳ (nhóm hoặc 1-1).
 * Tách khỏi `sendToGroup` để chiến dịch gửi tệp khách hàng dùng lại nguyên vẹn
 * phần xử lý video native + fallback — logic này đắt và dễ sai nếu chép lại.
 */
export async function sendMediaItem(
  zaloAccountId: string,
  threadId: string,
  threadType: ZaloThreadType,
  item: PreparedItem,
  io: Server | null,
): Promise<unknown> {
  const caption = item.attachment.caption ?? '';
  if (item.attachment.kind !== 'video') {
    return zaloOps.sendFile(zaloAccountId, threadId, threadType, [item.path], io, caption);
  }

  // `zaloOps.sendVideo` cần videoUrl ĐÃ upload lên Zalo, không nhận path local →
  // phải qua sendNativeVideo (upload video + thumbnail rồi mới sendVideo). Cần
  // ffmpeg; thiếu ffmpeg / lỗi upload thì fallback gửi dạng tệp như `send-block`.
  const instance = zaloPool.getInstance(zaloAccountId);
  try {
    if (!instance?.api) throw new Error('Zalo account not connected');
    const result = await sendNativeVideo({
      api: instance.api,
      threadId,
      threadType,
      videoPath: item.path,
      message: caption,
    });
    // sendNativeVideo gọi thẳng `api`, KHÔNG đi qua `zaloOps.exec` → phải tự ghi
    // nhận vào limiter, nếu không broadcast đốt hạn mức nick mà không ai đếm.
    zaloRateLimiter.recordSend(zaloAccountId, 'message');
    return result;
  } catch (videoErr) {
    logger.warn(
      `[broadcast-send] native video lỗi (thread=${threadId}), fallback sendFile: ${(videoErr as Error).message}`,
    );
    return zaloOps.sendFile(zaloAccountId, threadId, threadType, [item.path], io, caption);
  }
}
