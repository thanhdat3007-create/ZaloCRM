// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Gửi tệp khách hàng (🟢 Community) — dựng & đồng bộ hàng đợi người nhận.
// ════════════════════════════════════════════════════════════════════════
//
// Hàng đợi được vật chất hoá THÀNH BẢNG chứ không truy vấn tệp mỗi lượt gửi, vì:
//   - tệp còn được enrich/bổ sung liên tục, truy vấn động sẽ làm tập người nhận
//     đổi giữa chừng và sale không biết chiến dịch thực sự gửi cho những ai;
//   - trạng thái "đã gửi tới ai" phải sống lâu hơn một lượt — đó là thứ cho phép
//     hôm sau gửi tiếp mà không gửi trùng.
//
// Đồng bộ là hành động CÓ CHỦ Ý (bấm nút / lúc bật chiến dịch), không tự chạy mỗi
// lát gửi: quét lại tệp 20.000 dòng mỗi vài phút vừa tốn vừa gây bất ngờ.
//
// Community feature — KHÔNG import `_ee`.

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { MAX_RECIPIENTS_PER_BROADCAST } from './list-broadcast-cost.js';

export interface SyncResult {
  /** Số người nhận mới thêm vào hàng đợi lần này. */
  added: number;
  /** Tổng số người nhận sau khi đồng bộ. */
  total: number;
  /** Số khách hợp lệ trong tệp bị bỏ vì chạm trần chiến dịch. */
  overCap: number;
}

interface EligibleEntry {
  id: string;
  phoneE164: string;
  nameRaw: string | null;
  zaloName: string | null;
  contactId: string | null;
}

/**
 * Khách đủ điều kiện nhận tin trong một tệp:
 *   - `hasZalo = true` — đã xác nhận có Zalo (anh chốt: không tự tra cứu lúc gửi)
 *   - SĐT hợp lệ và đã chuẩn hoá
 *   - không phải dòng trùng trong chính tệp (`dupInListWithEntryId`) — nếu không
 *     một người có 2 dòng sẽ nhận 2 tin giống nhau
 *
 * Còn lọc trùng theo `phoneE164` trong bộ nhớ: cờ `dupInListWithEntryId` do worker
 * enrich đặt, có thể chưa kịp chạy cho dòng vừa thêm.
 */
export async function findEligibleEntries(customerListId: string): Promise<EligibleEntry[]> {
  const rows = await prisma.customerListEntry.findMany({
    where: {
      customerListId,
      hasZalo: true,
      phoneValid: true,
      phoneE164: { not: null },
      dupInListWithEntryId: null,
    },
    orderBy: { rowIndex: 'asc' },
    select: { id: true, phoneE164: true, nameRaw: true, zaloName: true, contactId: true },
  });

  const seen = new Set<string>();
  const out: EligibleEntry[] = [];
  for (const r of rows) {
    const phone = r.phoneE164!;
    if (seen.has(phone)) continue;
    seen.add(phone);
    out.push({ ...r, phoneE164: phone });
  }
  return out;
}

/**
 * Thêm khách đủ điều kiện của tệp vào hàng đợi chiến dịch.
 *
 * `skipDuplicates` dựa trên `@@unique([broadcastId, entryId])` → gọi lại nhiều lần
 * chỉ thêm phần mới, KHÔNG đụng tới trạng thái gửi của những người đã có. Nhờ vậy
 * "Cập nhật danh sách nhận" an toàn với chiến dịch đang chạy.
 */
export async function syncRecipients(broadcast: {
  id: string;
  orgId: string;
  customerListId: string;
}): Promise<SyncResult> {
  const eligible = await findEligibleEntries(broadcast.customerListId);

  const existing = await prisma.listBroadcastRecipient.findMany({
    where: { broadcastId: broadcast.id },
    select: { entryId: true },
  });
  const existingIds = new Set(existing.map((e) => e.entryId));

  const room = Math.max(0, MAX_RECIPIENTS_PER_BROADCAST - existingIds.size);
  const fresh = eligible.filter((e) => !existingIds.has(e.id));
  const toAdd = fresh.slice(0, room);
  const overCap = fresh.length - toAdd.length;

  if (toAdd.length > 0) {
    await prisma.listBroadcastRecipient.createMany({
      data: toAdd.map((e) => ({
        orgId: broadcast.orgId,
        broadcastId: broadcast.id,
        entryId: e.id,
        phoneE164: e.phoneE164,
        displayName: e.zaloName || e.nameRaw || null,
        contactId: e.contactId,
      })),
      skipDuplicates: true,
    });
  }

  const total = await prisma.listBroadcastRecipient.count({ where: { broadcastId: broadcast.id } });
  await prisma.listBroadcast.update({
    where: { id: broadcast.id },
    data: { totalRecipients: total, recipientsSyncedAt: new Date() },
  });

  if (overCap > 0) {
    logger.warn(
      `[list-broadcast] chiến dịch ${broadcast.id} bỏ ${overCap} khách vì chạm trần ` +
      `${MAX_RECIPIENTS_PER_BROADCAST} người nhận`,
    );
  }
  return { added: toAdd.length, total, overCap };
}

/** Đếm nhanh trạng thái hàng đợi — dùng cho trang chi tiết và gate của cron. */
export async function countRecipientsByState(
  broadcastId: string,
): Promise<Record<string, number>> {
  const grouped = await prisma.listBroadcastRecipient.groupBy({
    by: ['state'],
    where: { broadcastId },
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((g) => [g.state, g._count._all]));
}

/**
 * Đưa những người nhận `failed` về lại `pending` để chiến dịch thử lại.
 *
 * Giữ nguyên `sentSteps`: người đã nhận được đoạn chữ rồi thì lần gửi lại bỏ qua
 * đúng bấy nhiêu bước, không nhận trùng. `maxAttempts` chặn bám mãi số hỏng hẳn.
 */
export async function requeueFailed(
  broadcastId: string, maxAttempts: number,
): Promise<number> {
  const result = await prisma.listBroadcastRecipient.updateMany({
    where: { broadcastId, state: 'failed', attempts: { lt: maxAttempts } },
    data: { state: 'pending', errorCode: null, errorMessage: null },
  });
  if (result.count > 0) {
    await prisma.listBroadcast.update({
      where: { id: broadcastId },
      data: { failedCount: { decrement: result.count } },
    });
  }
  return result.count;
}
