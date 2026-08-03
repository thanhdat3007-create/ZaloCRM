// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * lists/group-member-import-service.ts — Nhập thành viên đã quét từ nhóm Zalo
 * (bảng `group_members`) thành một Tệp khách hàng (`CustomerList`).
 *
 * NGƯỢC CHIỀU với luồng nhập SĐT thường:
 *   - Nhập SĐT:  phone → findUser → UID   (entry bắt đầu hasZalo=null, chờ enrichment)
 *   - Nhập nhóm: UID có sẵn, KHÔNG có SĐT (entry sinh ra đã hasZalo=true, 'enriched')
 *
 * Vì vậy entry nguồn nhóm có `phoneRaw=''`, `phoneValid=false` (đúng sự thật: không có
 * số), nhưng `zaloUid` + `resolvedByNickId` được điền sẵn — đủ để chiến dịch nhắn tin
 * lấy đối tượng theo `hasZalo=true`. Worker enrichment bỏ qua các entry này vì nó chỉ
 * bắt `phoneValid=true AND hasZalo=null AND status='validated'`.
 *
 * Chống trùng (không có SĐT nên không dùng được dedup SĐT):
 *   - Trong lượt nhập: 1 UID chỉ 1 entry dù có mặt ở nhiều nhóm.
 *   - Với tệp cũ: UID đã có entry ở tệp khác → đánh dấu dupWithList* + dùng lại contactId.
 *   - Bỏ chính nick đang quét ra khỏi danh sách.
 *
 * Contact: CHỈ nối contactId khi đã có sẵn (member là bạn của nick, hoặc UID đã nhập
 * lần trước). KHÔNG tạo hàng loạt Contact rỗng cho người lạ — giống enrichment SĐT chỉ
 * tạo Contact cho entry match được Friend. Người lạ sẽ có Contact khi thực sự gửi tin.
 */

import { randomUUID } from 'node:crypto';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { recomputeListCounters } from './list-entry-routes.js';
import { buildMessagesFromState, type SystemMessage } from './list-system-messages.js';

/** Trần số entry của 1 lần nhập — chặn cộng đồng khổng lồ tạo tệp không dùng nổi. */
export const MAX_ENTRIES_PER_IMPORT = 5000;
/** Trần số hàng roster đọc lên trước khi gộp trùng UID. */
const MAX_ROWS_FETCHED = 20_000;
/** Kích thước lô cho các truy vấn `IN (...)`. */
const LOOKUP_CHUNK = 1000;

export interface ImportGroupMembersInput {
  orgId: string;
  /** User bấm nhập — thành người tạo tệp (owner scope RBAC). */
  userId: string;
  /** Nick đã quét ra roster. UID thành viên chỉ có nghĩa trong phạm vi nick này. */
  zaloAccountId: string;
  groupIds: string[];
  name?: string | null;
  iconEmoji?: string | null;
  /** true = chỉ nhập người đã là bạn của nick (an toàn nhất khi nhắn tin). */
  onlyFriends?: boolean;
  /** Ghi vào sourceMeta để truy vết tệp sinh ra từ phiên quét nào. */
  scanId?: string | null;
}

export interface ImportGroupMembersResult {
  listId: string;
  name: string;
  /** Số entry đã tạo. */
  imported: number;
  friends: number;
  strangers: number;
  /** Trong số đã tạo, bao nhiêu UID đã tồn tại ở tệp khác. */
  duplicates: number;
  /** Bao nhiêu entry đã nối được Contact sẵn có. */
  linkedContacts: number;
  /** true = roster vượt trần, tệp chỉ chứa phần đầu (ưu tiên người là bạn). */
  truncated: boolean;
}

interface RosterRow {
  memberUid: string;
  displayName: string | null;
  zaloName: string | null;
  avatarUrl: string | null;
  isFriend: boolean;
  globalId: string | null;
  groupId: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Đọc roster đã quét → gộp trùng UID → tạo Tệp khách hàng + entries.
 * Ném lỗi khi không còn thành viên nào để nhập (caller trả 400).
 */
export async function importGroupMembersToList(
  input: ImportGroupMembersInput,
): Promise<ImportGroupMembersResult> {
  const { orgId, userId, zaloAccountId, groupIds, onlyFriends = false, scanId = null } = input;

  // ── 1. Roster ────────────────────────────────────────────────────────────────
  // isFriend desc trước: nếu chạm trần thì phần giữ lại là nhóm gửi được an toàn.
  const rows = (await prisma.groupMember.findMany({
    where: {
      orgId,
      zaloAccountId,
      groupId: { in: groupIds },
      ...(onlyFriends ? { isFriend: true } : {}),
    },
    select: {
      memberUid: true,
      displayName: true,
      zaloName: true,
      avatarUrl: true,
      isFriend: true,
      globalId: true,
      groupId: true,
    },
    orderBy: [{ isFriend: 'desc' }, { lastSeenAt: 'desc' }],
    take: MAX_ROWS_FETCHED,
  })) as RosterRow[];

  // ── 2. Gộp trùng UID (1 người ở nhiều nhóm = 1 entry) + bỏ chính nick ─────────
  const account = await prisma.zaloAccount.findFirst({
    where: { id: zaloAccountId, orgId },
    select: { zaloUid: true, displayName: true },
  });
  const selfUid = account?.zaloUid ?? null;

  const byUid = new Map<string, RosterRow>();
  for (const r of rows) {
    if (!r.memberUid || r.memberUid === selfUid) continue;
    if (!byUid.has(r.memberUid)) byUid.set(r.memberUid, r);
  }
  const distinct = [...byUid.values()];
  const truncated = rows.length >= MAX_ROWS_FETCHED || distinct.length > MAX_ENTRIES_PER_IMPORT;
  const picked = distinct.slice(0, MAX_ENTRIES_PER_IMPORT);

  if (picked.length === 0) {
    throw new Error('no_members_to_import');
  }
  if (truncated) {
    logger.warn(
      `[group-import] roster vượt trần: giữ ${picked.length}/${distinct.length} thành viên (nick=${zaloAccountId})`,
    );
  }

  const uids = picked.map((m) => m.memberUid);

  // ── 3. UID đã có ở tệp khác → dùng lại contactId + đánh dấu trùng ─────────────
  // KHÔNG có index trên zalo_uid: mỗi lần nhập quét 1 lượt bảng entry (chấp nhận được
  // vì nhập là thao tác thưa, không nằm trong luồng gửi).
  const priorByUid = new Map<
    string,
    { id: string; customerListId: string; contactId: string | null }
  >();
  for (const part of chunk(uids, LOOKUP_CHUNK)) {
    const prior = await prisma.customerListEntry.findMany({
      where: { zaloUid: { in: part }, customerList: { orgId } },
      select: { id: true, customerListId: true, contactId: true, zaloUid: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const p of prior) {
      if (p.zaloUid && !priorByUid.has(p.zaloUid)) {
        priorByUid.set(p.zaloUid, {
          id: p.id,
          customerListId: p.customerListId,
          contactId: p.contactId,
        });
      }
    }
  }

  // ── 4. Member là bạn của nick → đã có Contact sẵn, nối thẳng ─────────────────
  const friendContactByUid = new Map<string, string>();
  for (const part of chunk(uids, LOOKUP_CHUNK)) {
    const friends = await prisma.friend.findMany({
      where: { zaloAccountId, zaloUidInNick: { in: part } },
      select: { zaloUidInNick: true, contactId: true },
    });
    for (const f of friends) {
      if (f.contactId) friendContactByUid.set(f.zaloUidInNick, f.contactId);
    }
  }

  // ── 5. Tạo tệp + entries ─────────────────────────────────────────────────────
  const finalName =
    input.name?.trim() ||
    `Nhóm Zalo ${account?.displayName ? `· ${account.displayName} ` : ''}${new Date().toLocaleString(
      'vi-VN',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' },
    )}`;

  let friends = 0;
  let duplicates = 0;
  let linkedContacts = 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const listId = randomUUID();

  // Dựng sẵn toàn bộ row (kèm số liệu tổng kết) TRƯỚC transaction — transaction chỉ
  // còn 2 lệnh ghi, và bộ đếm không phụ thuộc số lần callback chạy.
  const entryRows = picked.map((m, idx) => {
    const prior = priorByUid.get(m.memberUid) ?? null;
    const contactId = prior?.contactId ?? friendContactByUid.get(m.memberUid) ?? null;
    if (m.isFriend) friends++;
    if (prior) duplicates++;
    if (contactId) linkedContacts++;

    const msgs: SystemMessage[] = buildMessagesFromState({
      invalidReason: null,
      dupInListWithEntryId: null,
      dupWithListId: prior?.customerListId ?? null,
      dupWithListEntryId: prior?.id ?? null,
      dupWithListName: null,
      dupWithContactId: null,
    }).map((msg) => ({ ...msg, ts: nowIso }));

    return {
      id: randomUUID(),
      customerListId: listId,
      rowIndex: idx + 1,
      // Không có SĐT — cột bắt buộc nên để rỗng, phoneValid=false nói đúng sự thật.
      phoneRaw: '',
      nameRaw: m.displayName ?? m.zaloName ?? null,
      phoneE164: null,
      phoneLocal: null,
      phoneValid: false,
      invalidReason: null,
      // Đã có UID từ nhóm → bỏ qua hẳn bước enrichment.
      status: 'enriched',
      enrichedAt: now,
      hasZalo: true,
      zaloUid: m.memberUid,
      zaloGlobalId: m.globalId,
      zaloName: m.zaloName ?? m.displayName ?? null,
      resolvedByNickId: zaloAccountId,
      multiNickCount: 0,
      contactId,
      dupWithListId: prior?.customerListId ?? null,
      dupWithListEntryId: prior?.id ?? null,
      // KHÔNG đặt khoá `source` — khoá đó dành cho nền tảng quảng cáo (FB/TikTok).
      sourceMeta: { origin: 'group_scan', zaloAccountId, groupId: m.groupId, scanId },
      systemMessages: msgs as unknown as object,
    };
  });

  const list = await tenantTransaction(async (tx) => {
    const created = await tx.customerList.create({
      data: {
        id: listId,
        orgId,
        createdById: userId,
        name: finalName,
        iconEmoji: input.iconEmoji ?? '👥',
        sourceType: 'group_scan',
        // rawText = tham số lượt nhập, để truy vết/nhập lại sau này.
        rawText: JSON.stringify({ zaloAccountId, groupIds, onlyFriends, scanId }).slice(0, 100_000),
        status: 'processing',
        startedAt: now,
      },
    });
    await tx.customerListEntry.createMany({ data: entryRows });
    return created;
  });

  // Ô đếm đọc thẳng từ entries (validEntries tính cả entry có Zalo không SĐT).
  await recomputeListCounters(list.id);

  logger.info(
    `[group-import] tệp=${list.id} nick=${zaloAccountId} nhóm=${groupIds.length} entry=${picked.length} bạn=${friends} trùng=${duplicates}`,
  );

  return {
    listId: list.id,
    name: list.name,
    imported: picked.length,
    friends,
    strangers: picked.length - friends,
    duplicates,
    linkedContacts,
    truncated,
  };
}
