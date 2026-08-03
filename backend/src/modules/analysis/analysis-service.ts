// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * analysis-service.ts — Truy vấn CHỈ ĐỌC phục vụ phân tích hội thoại.
 *
 * Một nguồn sự thật duy nhất cho cả REST (/api/analysis/*) và MCP (/mcp): route
 * và tool chỉ là hai lớp vỏ mỏng gọi xuống đây. Mọi hàm chỉ đọc — không create,
 * update, delete, không gọi Zalo SDK.
 *
 * Nguyên tắc định dạng dữ liệu trả về:
 *   - Không trả field BigInt (zaloMsgIdNum) vì JSON.stringify sẽ ném lỗi.
 *   - Đính kèm được tóm tắt thành nhãn ngắn ([ảnh], [file: x.pdf]) thay vì dump
 *     nguyên blob — tiết kiệm token khi LLM đọc transcript dài.
 *   - Thời gian trả cả ISO (máy đọc) lẫn chuỗi theo múi giờ tổ chức (người đọc).
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { config } from '../../config/index.js';
import { AnalysisError } from './analysis-guard.js';

// ── Tiện ích ─────────────────────────────────────────────────────────────────

const DEFAULT_TIMEZONE = '+07:00';

/** Đổi Date sang "YYYY-MM-DD HH:mm" theo offset cố định của tổ chức (vd "+07:00"). */
export function formatInOrgTimezone(date: Date, timezone: string | null | undefined): string {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(timezone || DEFAULT_TIMEZONE);
  const sign = matched?.[1] === '-' ? -1 : 1;
  const offsetMinutes = matched
    ? sign * (Number(matched[2]) * 60 + Number(matched[3]))
    : 7 * 60;
  return new Date(date.getTime() + offsetMinutes * 60_000)
    .toISOString().slice(0, 16).replace('T', ' ');
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function parseDate(value: unknown, field: string): Date | undefined {
  if (value == null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new AnalysisError(`Tham số ${field} không phải thời điểm hợp lệ: ${value}`);
  }
  return date;
}

/** Nhãn hiển thị cho phía gửi — LLM đọc transcript cần phân biệt ai nói. */
function senderLabel(senderType: string, senderName: string | null): string {
  if (senderType === 'contact') return senderName ? `KH ${senderName}` : 'KH';
  if (senderType === 'ai_assistant') return 'AI';
  return senderName ? `NV ${senderName}` : 'NV';
}

/** Tin phi văn bản không có content — thay bằng nhãn ngắn để transcript vẫn liền mạch. */
function renderContent(
  content: string | null,
  contentType: string,
  attachments: unknown,
): string {
  if (content && content.trim()) return content;
  const list = Array.isArray(attachments) ? attachments : [];
  const first = list[0] as Record<string, unknown> | undefined;
  const name = typeof first?.name === 'string' ? first.name : '';
  switch (contentType) {
    case 'image': return list.length > 1 ? `[${list.length} ảnh]` : '[ảnh]';
    case 'video': return '[video]';
    case 'voice': return '[tin thoại]';
    case 'sticker': return '[sticker]';
    case 'link': return name ? `[link: ${name}]` : '[link]';
    case 'file': return name ? `[file: ${name}]` : '[file]';
    default: return `[${contentType}]`;
  }
}

function attachmentSummary(attachments: unknown): { count: number; names: string[] } {
  const list = Array.isArray(attachments) ? attachments : [];
  return {
    count: list.length,
    names: list
      .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>).name : null))
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
      .slice(0, 5),
  };
}

function contactDisplayName(contact: { crmName?: string | null; fullName?: string | null } | null): string | null {
  if (!contact) return null;
  return contact.crmName || contact.fullName || null;
}

async function getOrgTimezone(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone || DEFAULT_TIMEZONE;
}

/** Nhãn hội thoại: tên nhóm với thread group, tên/SĐT khách với thread 1-1. */
function conversationTitle(conv: {
  threadType: string;
  groupName: string | null;
  contact: { crmName?: string | null; fullName?: string | null; phone?: string | null } | null;
}): string {
  if (conv.threadType === 'group') return conv.groupName || 'Nhóm không tên';
  return contactDisplayName(conv.contact) || conv.contact?.phone || 'Khách chưa đặt tên';
}

// ── Nick Zalo ────────────────────────────────────────────────────────────────

export async function listZaloAccounts(orgId: string) {
  return withTenant(orgId, async () => {
    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId, archivedAt: null },
      select: {
        id: true, displayName: true, phone: true, status: true,
        privacyMode: true, lastConnectedAt: true, createdAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        phone: a.phone,
        status: a.status,
        privacyMode: a.privacyMode,
        lastConnectedAt: a.lastConnectedAt,
        owner: a.owner ? { id: a.owner.id, name: a.owner.fullName, email: a.owner.email } : null,
        conversationCount: a._count.conversations,
      })),
    };
  });
}

// ── Danh sách hội thoại ──────────────────────────────────────────────────────

export interface ListConversationsOptions {
  accountId?: string;
  threadType?: string;
  query?: string;
  unrepliedOnly?: boolean;
  hasUnread?: boolean;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export async function listConversations(orgId: string, options: ListConversationsOptions = {}) {
  return withTenant(orgId, async () => {
    const limit = clampLimit(options.limit, 25, 200);
    const offset = Math.max(0, Number(options.offset) || 0);
    const since = parseDate(options.since, 'since');
    const until = parseDate(options.until, 'until');

    const where: Record<string, unknown> = { orgId, deletedAt: null };
    if (options.accountId) where.zaloAccountId = options.accountId;
    if (options.threadType) {
      if (options.threadType !== 'user' && options.threadType !== 'group') {
        throw new AnalysisError("threadType chỉ nhận 'user' hoặc 'group'");
      }
      where.threadType = options.threadType;
    }
    if (options.unrepliedOnly) where.isReplied = false;
    if (options.hasUnread) where.unreadCount = { gt: 0 };
    if (since || until) {
      where.lastMessageAt = {
        ...(since ? { gte: since } : {}),
        ...(until ? { lte: until } : {}),
      };
    }
    const query = (options.query || '').trim();
    if (query) {
      where.OR = [
        { groupName: { contains: query, mode: 'insensitive' } },
        { contact: { is: { fullName: { contains: query, mode: 'insensitive' } } } },
        { contact: { is: { crmName: { contains: query, mode: 'insensitive' } } } },
        { contact: { is: { phone: { contains: query } } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.conversation.count({ where: where as never }),
      prisma.conversation.findMany({
        where: where as never,
        select: {
          id: true, threadType: true, groupName: true, groupMembersCount: true,
          lastMessageAt: true, unreadCount: true, isReplied: true, tab: true,
          isVirtual: true, createdAt: true,
          zaloAccount: { select: { id: true, displayName: true, status: true } },
          contact: {
            select: {
              id: true, fullName: true, crmName: true, phone: true,
              status: true, leadScore: true, source: true,
            },
          },
          _count: { select: { messages: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return {
      total,
      limit,
      offset,
      conversations: rows.map((c) => ({
        id: c.id,
        title: conversationTitle(c),
        threadType: c.threadType,
        groupMembersCount: c.groupMembersCount,
        tab: c.tab,
        isVirtual: c.isVirtual,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount,
        isReplied: c.isReplied,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        account: c.zaloAccount
          ? { id: c.zaloAccount.id, displayName: c.zaloAccount.displayName, status: c.zaloAccount.status }
          : null,
        contact: c.contact
          ? {
              id: c.contact.id,
              name: contactDisplayName(c.contact),
              phone: c.contact.phone,
              status: c.contact.status,
              leadScore: c.contact.leadScore,
              source: c.contact.source,
            }
          : null,
      })),
    };
  });
}

// ── Chi tiết một hội thoại ───────────────────────────────────────────────────

export async function getConversation(orgId: string, conversationId: string) {
  return withTenant(orgId, async () => {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: {
        id: true, threadType: true, externalThreadId: true, groupName: true,
        groupMembersCount: true, lastMessageAt: true, unreadCount: true,
        isReplied: true, tab: true, isVirtual: true, deletedAt: true, createdAt: true,
        zaloAccount: { select: { id: true, displayName: true, phone: true, status: true } },
        contact: {
          select: {
            id: true, fullName: true, crmName: true, phone: true, email: true,
            status: true, source: true, leadScore: true, tags: true, notes: true,
            province: true, district: true, lastActivity: true, createdAt: true,
          },
        },
        _count: { select: { messages: true } },
      },
    });
    if (!conv) throw new AnalysisError('Không tìm thấy hội thoại', 404);

    const [firstMessage, lastMessage] = await Promise.all([
      prisma.message.findFirst({
        where: { conversationId, isDeleted: false },
        orderBy: { sentAt: 'asc' },
        select: { sentAt: true, senderType: true },
      }),
      prisma.message.findFirst({
        where: { conversationId, isDeleted: false },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, senderType: true, content: true, contentType: true, attachments: true },
      }),
    ]);

    return {
      id: conv.id,
      title: conversationTitle(conv),
      threadType: conv.threadType,
      externalThreadId: conv.externalThreadId,
      groupMembersCount: conv.groupMembersCount,
      tab: conv.tab,
      isVirtual: conv.isVirtual,
      isDeleted: conv.deletedAt != null,
      unreadCount: conv.unreadCount,
      isReplied: conv.isReplied,
      messageCount: conv._count.messages,
      createdAt: conv.createdAt,
      lastMessageAt: conv.lastMessageAt,
      firstMessageAt: firstMessage?.sentAt ?? null,
      lastMessage: lastMessage
        ? {
            sentAt: lastMessage.sentAt,
            senderType: lastMessage.senderType,
            preview: renderContent(lastMessage.content, lastMessage.contentType, lastMessage.attachments),
          }
        : null,
      account: conv.zaloAccount,
      contact: conv.contact
        ? { ...conv.contact, name: contactDisplayName(conv.contact) }
        : null,
    };
  });
}

// ── Transcript ───────────────────────────────────────────────────────────────

export interface TranscriptOptions {
  limit?: number;
  since?: string;
  until?: string;
  order?: 'asc' | 'desc';
  format?: 'text' | 'json';
}

export async function getTranscript(
  orgId: string,
  conversationId: string,
  options: TranscriptOptions = {},
) {
  return withTenant(orgId, async () => {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: {
        id: true, threadType: true, groupName: true,
        contact: { select: { fullName: true, crmName: true, phone: true } },
        zaloAccount: { select: { displayName: true } },
      },
    });
    if (!conv) throw new AnalysisError('Không tìm thấy hội thoại', 404);

    const limit = clampLimit(options.limit, 200, config.analysisMaxMessages);
    const since = parseDate(options.since, 'since');
    const until = parseDate(options.until, 'until');
    const timezone = await getOrgTimezone(orgId);

    const where: Record<string, unknown> = { conversationId, isDeleted: false };
    if (since || until) {
      where.sentAt = { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) };
    }

    // Lấy `limit` tin GẦN NHẤT rồi đảo lại — cửa sổ hữu ích nhất khi hội thoại
    // dài hơn trần cho phép. order='asc' chỉ đổi thứ tự hiển thị cuối cùng.
    const [totalMatching, rows] = await Promise.all([
      prisma.message.count({ where: where as never }),
      prisma.message.findMany({
        where: where as never,
        select: {
          id: true, senderType: true, senderName: true, content: true,
          contentType: true, attachments: true, sentAt: true, sentVia: true,
          editedAt: true, seenAt: true, deliveredAt: true,
        },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
    ]);

    const ordered = options.order === 'desc' ? rows : [...rows].reverse();
    const messages = ordered.map((m) => ({
      id: m.id,
      sentAt: m.sentAt,
      localTime: formatInOrgTimezone(m.sentAt, timezone),
      senderType: m.senderType,
      senderName: m.senderName,
      sender: senderLabel(m.senderType, m.senderName),
      contentType: m.contentType,
      text: renderContent(m.content, m.contentType, m.attachments),
      attachments: attachmentSummary(m.attachments),
      sentVia: m.sentVia,
      edited: m.editedAt != null,
      seenAt: m.seenAt,
    }));

    const header =
      `Hội thoại: ${conversationTitle(conv)} (${conv.threadType === 'group' ? 'nhóm' : '1-1'})\n` +
      `Nick CRM: ${conv.zaloAccount?.displayName || '—'}\n` +
      `Số tin hiển thị: ${messages.length}/${totalMatching} (múi giờ ${timezone})`;

    return {
      conversationId: conv.id,
      title: conversationTitle(conv),
      threadType: conv.threadType,
      timezone,
      totalMatching,
      returned: messages.length,
      truncated: totalMatching > messages.length,
      messages,
      // Dạng văn bản phẳng cho LLM đọc thẳng, rẻ token hơn JSON lồng nhau.
      text: `${header}\n\n${messages
        .map((m) => `[${m.localTime}] ${m.sender}: ${m.text}`)
        .join('\n')}`,
    };
  });
}

// ── Chỉ số chất lượng phục vụ ────────────────────────────────────────────────

/**
 * Kênh gửi do MÁY khởi tạo. Các giá trị còn lại đều là người thật gõ tay:
 *   user        — nhân viên gửi trong giao diện CRM
 *   user_native — nhân viên gửi thẳng từ app Zalo, CRM đồng bộ về
 *   bridge      — nhân viên trả lời qua cầu Telegram
 * Gộp nhầm user_native/bridge vào nhóm máy sẽ thổi phồng tỉ lệ tự động hoá.
 */
const MACHINE_SENT_CHANNELS = new Set(['automation', 'system']);

function percentile(sortedValues: number[], fraction: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(fraction * sortedValues.length) - 1),
  );
  return sortedValues[index] ?? null;
}

export async function getConversationMetrics(orgId: string, conversationId: string) {
  return withTenant(orgId, async () => {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: {
        id: true, threadType: true, groupName: true, isReplied: true, unreadCount: true,
        contact: { select: { fullName: true, crmName: true, phone: true } },
      },
    });
    if (!conv) throw new AnalysisError('Không tìm thấy hội thoại', 404);

    const rows = await prisma.message.findMany({
      where: { conversationId, isDeleted: false },
      select: { sentAt: true, senderType: true, sentVia: true },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
      take: config.analysisMaxMessages,
    });

    if (rows.length === 0) {
      return {
        conversationId: conv.id,
        title: conversationTitle(conv),
        totalMessages: 0,
        note: 'Hội thoại chưa có tin nhắn nào',
      };
    }

    let inbound = 0;
    let outbound = 0;
    let automated = 0;
    const outboundByChannel: Record<string, number> = {};
    const responseSeconds: number[] = [];
    let longestSilenceSeconds = 0;
    // Mốc tin đến ĐẦU TIÊN của chuỗi chưa được trả lời — khách nhắn 5 tin liền
    // rồi mới được reply thì thời gian chờ tính từ tin đầu, không phải tin cuối.
    let pendingInboundAt: Date | null = null;
    let lastInboundAt: Date | null = null;
    let lastOutboundAt: Date | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const isInbound = row.senderType === 'contact';
      if (isInbound) {
        inbound++;
        lastInboundAt = row.sentAt;
        if (!pendingInboundAt) pendingInboundAt = row.sentAt;
      } else {
        outbound++;
        outboundByChannel[row.sentVia] = (outboundByChannel[row.sentVia] ?? 0) + 1;
        if (MACHINE_SENT_CHANNELS.has(row.sentVia)) automated++;
        lastOutboundAt = row.sentAt;
        if (pendingInboundAt) {
          responseSeconds.push((row.sentAt.getTime() - pendingInboundAt.getTime()) / 1000);
          pendingInboundAt = null;
        }
      }
      if (i > 0) {
        const gap = (row.sentAt.getTime() - rows[i - 1]!.sentAt.getTime()) / 1000;
        if (gap > longestSilenceSeconds) longestSilenceSeconds = gap;
      }
    }

    const sorted = [...responseSeconds].sort((a, b) => a - b);
    const average = sorted.length
      ? sorted.reduce((sum, v) => sum + v, 0) / sorted.length
      : null;
    const round = (v: number | null) => (v == null ? null : Math.round(v));

    return {
      conversationId: conv.id,
      title: conversationTitle(conv),
      threadType: conv.threadType,
      windowMessages: rows.length,
      truncated: rows.length === config.analysisMaxMessages,
      totalMessages: rows.length,
      inboundMessages: inbound,
      outboundMessages: outbound,
      automatedOutboundMessages: automated,
      // Phân rã theo kênh gửi để người đọc tự kiểm chứng con số tự động hoá:
      // user = CRM, user_native = app Zalo, bridge = Telegram, automation/system = máy.
      outboundByChannel,
      firstMessageAt: rows[0]!.sentAt,
      lastMessageAt: rows[rows.length - 1]!.sentAt,
      lastInboundAt,
      lastOutboundAt,
      isReplied: conv.isReplied,
      unreadCount: conv.unreadCount,
      // Khách vẫn đang chờ → số giây đã trôi kể từ tin chưa được trả lời.
      awaitingReplySeconds: pendingInboundAt
        ? Math.round((Date.now() - pendingInboundAt.getTime()) / 1000)
        : null,
      responseTimeSeconds: {
        samples: sorted.length,
        average: round(average),
        median: round(percentile(sorted, 0.5)),
        p90: round(percentile(sorted, 0.9)),
        fastest: round(sorted[0] ?? null),
        slowest: round(sorted[sorted.length - 1] ?? null),
      },
      longestSilenceSeconds: Math.round(longestSilenceSeconds),
    };
  });
}

// ── Tìm kiếm tin nhắn ────────────────────────────────────────────────────────

export interface SearchMessagesOptions {
  query: string;
  accountId?: string;
  conversationId?: string;
  senderType?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export async function searchMessages(orgId: string, options: SearchMessagesOptions) {
  return withTenant(orgId, async () => {
    const query = (options.query || '').trim();
    if (query.length < 2) throw new AnalysisError('query cần ít nhất 2 ký tự');

    const limit = clampLimit(options.limit, 50, 200);
    const since = parseDate(options.since, 'since');
    const until = parseDate(options.until, 'until');
    const timezone = await getOrgTimezone(orgId);

    const conversationFilter: Record<string, unknown> = { orgId, deletedAt: null };
    if (options.accountId) conversationFilter.zaloAccountId = options.accountId;

    const where: Record<string, unknown> = {
      isDeleted: false,
      content: { contains: query, mode: 'insensitive' },
      conversation: { is: conversationFilter },
    };
    if (options.conversationId) where.conversationId = options.conversationId;
    if (options.senderType) where.senderType = options.senderType;
    if (since || until) {
      where.sentAt = { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) };
    }

    const rows = await prisma.message.findMany({
      where: where as never,
      select: {
        id: true, conversationId: true, senderType: true, senderName: true,
        content: true, contentType: true, attachments: true, sentAt: true,
        conversation: {
          select: {
            id: true, threadType: true, groupName: true,
            contact: { select: { id: true, fullName: true, crmName: true, phone: true } },
          },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });

    return {
      query,
      returned: rows.length,
      limit,
      messages: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        conversationTitle: conversationTitle(m.conversation),
        threadType: m.conversation.threadType,
        contactId: m.conversation.contact?.id ?? null,
        sentAt: m.sentAt,
        localTime: formatInOrgTimezone(m.sentAt, timezone),
        sender: senderLabel(m.senderType, m.senderName),
        senderType: m.senderType,
        text: renderContent(m.content, m.contentType, m.attachments),
      })),
    };
  });
}

// ── Khách hàng ───────────────────────────────────────────────────────────────

export async function searchContacts(orgId: string, options: { query?: string; limit?: number } = {}) {
  return withTenant(orgId, async () => {
    const limit = clampLimit(options.limit, 25, 100);
    const query = (options.query || '').trim();

    const where: Record<string, unknown> = { orgId, mergedInto: null };
    if (query) {
      where.OR = [
        { fullName: { contains: query, mode: 'insensitive' } },
        { crmName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
        { email: { contains: query, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.contact.findMany({
      where: where as never,
      select: {
        id: true, fullName: true, crmName: true, phone: true, email: true,
        status: true, source: true, leadScore: true, tags: true,
        lastActivity: true, createdAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { lastActivity: { sort: 'desc', nulls: 'last' } },
      take: limit,
    });

    return {
      returned: rows.length,
      contacts: rows.map((c) => ({
        id: c.id,
        name: contactDisplayName(c),
        phone: c.phone,
        email: c.email,
        status: c.status,
        source: c.source,
        leadScore: c.leadScore,
        tags: c.tags,
        lastActivity: c.lastActivity,
        createdAt: c.createdAt,
        conversationCount: c._count.conversations,
      })),
    };
  });
}

export async function getContact(orgId: string, contactId: string) {
  return withTenant(orgId, async () => {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId },
      select: {
        id: true, fullName: true, crmName: true, phone: true, phone2: true,
        email: true, status: true, source: true, sourceDate: true, leadScore: true,
        tags: true, notes: true, province: true, district: true, ward: true,
        consentStatus: true, hasZalo: true, lastActivity: true,
        nextAppointment: true, createdAt: true, updatedAt: true,
        conversations: {
          where: { deletedAt: null },
          select: {
            id: true, threadType: true, groupName: true, lastMessageAt: true,
            isReplied: true, unreadCount: true,
            zaloAccount: { select: { id: true, displayName: true } },
            _count: { select: { messages: true } },
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 20,
        },
        appointments: {
          select: { id: true, appointmentDate: true, appointmentTime: true, type: true, notes: true },
          orderBy: { appointmentDate: 'desc' },
          take: 10,
        },
      },
    });
    if (!contact) throw new AnalysisError('Không tìm thấy khách hàng', 404);

    const { conversations, ...profile } = contact;
    return {
      ...profile,
      name: contactDisplayName(contact),
      conversations: conversations.map((c) => ({
        id: c.id,
        threadType: c.threadType,
        title: c.threadType === 'group' ? c.groupName : contactDisplayName(contact),
        lastMessageAt: c.lastMessageAt,
        isReplied: c.isReplied,
        unreadCount: c.unreadCount,
        messageCount: c._count.messages,
        account: c.zaloAccount,
      })),
    };
  });
}

// ── Tổng quan tổ chức ────────────────────────────────────────────────────────

export async function getOrgOverview(orgId: string, options: { days?: number } = {}) {
  return withTenant(orgId, async () => {
    const days = Math.min(365, Math.max(1, Number(options.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const conversationScope = { orgId, deletedAt: null };

    const [
      conversationsTotal,
      conversationsActive,
      conversationsUnreplied,
      messagesBySender,
      accountRows,
      topConversationRows,
      contactsTotal,
    ] = await Promise.all([
      prisma.conversation.count({ where: conversationScope }),
      prisma.conversation.count({ where: { ...conversationScope, lastMessageAt: { gte: since } } }),
      prisma.conversation.count({ where: { ...conversationScope, isReplied: false } }),
      prisma.message.groupBy({
        by: ['senderType'],
        where: { isDeleted: false, sentAt: { gte: since }, conversation: { is: conversationScope } },
        _count: { _all: true },
      }),
      prisma.zaloAccount.findMany({
        where: { orgId, archivedAt: null },
        select: {
          id: true, displayName: true, status: true,
          _count: { select: { conversations: true } },
        },
      }),
      prisma.message.groupBy({
        by: ['conversationId'],
        where: { isDeleted: false, sentAt: { gte: since }, conversation: { is: conversationScope } },
        _count: { conversationId: true },
        orderBy: { _count: { conversationId: 'desc' } },
        take: 10,
      }),
      prisma.contact.count({ where: { orgId, mergedInto: null } }),
    ]);

    const topConversations = topConversationRows.length
      ? await prisma.conversation.findMany({
          where: { id: { in: topConversationRows.map((r) => r.conversationId) } },
          select: {
            id: true, threadType: true, groupName: true, lastMessageAt: true, isReplied: true,
            contact: { select: { fullName: true, crmName: true, phone: true } },
          },
        })
      : [];
    const titleById = new Map(topConversations.map((c) => [c.id, c]));

    const countBySender = Object.fromEntries(
      messagesBySender.map((row) => [row.senderType, row._count._all]),
    ) as Record<string, number>;
    const inbound = countBySender.contact ?? 0;
    const outbound = Object.entries(countBySender)
      .filter(([type]) => type !== 'contact')
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      periodDays: days,
      since,
      conversations: {
        total: conversationsTotal,
        activeInPeriod: conversationsActive,
        unreplied: conversationsUnreplied,
      },
      contacts: { total: contactsTotal },
      messagesInPeriod: {
        total: inbound + outbound,
        inbound,
        outbound,
        bySenderType: countBySender,
      },
      accounts: accountRows.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        status: a.status,
        conversationCount: a._count.conversations,
      })),
      topConversations: topConversationRows.map((row) => {
        const conv = titleById.get(row.conversationId);
        return {
          conversationId: row.conversationId,
          title: conv ? conversationTitle(conv) : '(đã xoá)',
          threadType: conv?.threadType ?? null,
          messagesInPeriod: row._count.conversationId,
          isReplied: conv?.isReplied ?? null,
          lastMessageAt: conv?.lastMessageAt ?? null,
        };
      }),
    };
  });
}
