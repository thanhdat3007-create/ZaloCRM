// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * document-retriever.ts — lõi RAG. Tìm đoạn tài liệu liên quan bằng Postgres FTS
 * (KHÔNG embedding, KHÔNG pgvector — quyết định D2 của plan).
 *
 * Cột search_vector là generated column `to_tsvector('simple', f_unaccent(...))`,
 * index GIN. f_unaccent cho phép khách gõ không dấu ("can ho") vẫn khớp tài liệu
 * có dấu ("căn hộ").
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { estimateTokens } from './document-chunker.js';

const DEFAULT_MAX_TOKENS = 3500;
const DEFAULT_TOP_K = 6;
/** Truy vấn dài hơn ngưỡng này bị cắt — plainto_tsquery AND mọi từ, câu dài luôn trượt. */
const MAX_QUERY_CHARS = 300;

export interface RetrieveResult {
  text: string;
  chunkIds: string[];
}

interface ChunkRow {
  id: string;
  heading: string | null;
  content: string;
  token_count: number;
  doc_title: string;
  rank: number;
}

/**
 * Chuẩn hoá câu hỏi của khách trước khi đưa vào tsquery: bỏ emoji, URL, số điện
 * thoại (nhiễu, không có trong tài liệu), gộp khoảng trắng, cắt độ dài.
 */
export function normalizeQuery(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b\d[\d\s.-]{7,}\b/g, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_CHARS);
}

/**
 * Escape ranh giới thẻ để nội dung tài liệu không giả mạo được cấu trúc prompt
 * (cùng ý đồ với escapeXmlBoundary trong ai-service.ts).
 */
function escapeTagBoundary(text: string): string {
  return text.replace(/<\/?tai_lieu>/gi, (m) => m.replace(/</g, '‹').replace(/>/g, '›'));
}

function formatChunks(rows: Array<{ heading: string | null; content: string; doc_title: string }>): string {
  const body = rows
    .map((r) => {
      const label = r.heading ? `${r.doc_title} › ${r.heading}` : r.doc_title;
      return `[${escapeTagBoundary(label)}]\n${escapeTagBoundary(r.content)}`;
    })
    .join('\n---\n');
  return `<tai_lieu>\n${body}\n</tai_lieu>`;
}

/**
 * Lấy ngữ cảnh tài liệu cho 1 lượt trả lời.
 *
 * Có fallback "nhồi hết": khi FTS không khớp gì NHƯNG toàn bộ tài liệu gán cho
 * agent vẫn nằm dưới ngưỡng token. Đây là ca phổ biến nhất (playbook vài trang)
 * và tránh việc agent im lặng chỉ vì khách hỏi bằng từ ngữ khác tài liệu.
 */
export async function retrieveContext(input: {
  orgId: string;
  agentId: string;
  query: string;
  maxTokens?: number;
  topK?: number;
}): Promise<RetrieveResult> {
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const topK = input.topK ?? DEFAULT_TOP_K;
  const query = normalizeQuery(input.query);

  let rows: ChunkRow[] = [];
  if (query) {
    try {
      rows = await prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
        SELECT c.id,
               c.heading,
               c.content,
               c.token_count,
               d.title AS doc_title,
               ts_rank_cd(c.search_vector, q.query) AS rank
        FROM ai_agent_document_chunks c
        JOIN ai_agent_document_links l
          ON l.document_id = c.document_id AND l.agent_id = ${input.agentId}
        JOIN ai_agent_documents d
          ON d.id = c.document_id AND d.enabled = true
        CROSS JOIN LATERAL (SELECT plainto_tsquery('simple', f_unaccent(${query})) AS query) q
        WHERE c.org_id = ${input.orgId} AND c.search_vector @@ q.query
        ORDER BY rank DESC
        LIMIT ${topK}
      `);
    } catch (err) {
      // FTS hỏng (thiếu extension trên managed Postgres…) không được làm chết
      // lượt trả lời — rơi xuống fallback nhồi hết ở dưới.
      logger.warn('[ai-agent-retriever] FTS lỗi, dùng fallback: %s', (err as Error).message);
    }
  }

  if (rows.length > 0) {
    const picked: ChunkRow[] = [];
    let total = 0;
    for (const row of rows) {
      const tokens = row.token_count || estimateTokens(row.content);
      if (picked.length > 0 && total + tokens > maxTokens) break;
      picked.push(row);
      total += tokens;
    }
    return { text: formatChunks(picked), chunkIds: picked.map((r) => r.id) };
  }

  // ── Fallback: nhồi toàn bộ tài liệu nếu đủ nhỏ ────────────────────────────
  const chunks = await prisma.aiAgentDocumentChunk.findMany({
    where: {
      orgId: input.orgId,
      document: { enabled: true, agents: { some: { agentId: input.agentId } } },
    },
    orderBy: [{ documentId: 'asc' }, { chunkIndex: 'asc' }],
    select: {
      id: true,
      heading: true,
      content: true,
      tokenCount: true,
      document: { select: { title: true } },
    },
  });
  if (chunks.length === 0) return { text: '', chunkIds: [] };

  const totalTokens = chunks.reduce((sum, c) => sum + (c.tokenCount || estimateTokens(c.content)), 0);
  if (totalTokens > maxTokens) {
    // Kho quá lớn để nhồi hết mà FTS lại trượt → thà không có tài liệu còn hơn
    // đưa đoạn ngẫu nhiên; prompt đã bắt agent nói "không chắc" trong ca này.
    logger.info(
      '[ai-agent-retriever] agent=%s FTS trượt, kho %d token > ngưỡng %d — bỏ qua tài liệu',
      input.agentId,
      totalTokens,
      maxTokens,
    );
    return { text: '', chunkIds: [] };
  }

  const rowsAll = chunks.map((c) => ({
    heading: c.heading,
    content: c.content,
    doc_title: c.document.title,
  }));
  return { text: formatChunks(rowsAll), chunkIds: chunks.map((c) => c.id) };
}

/** Xem trước chunk nào khớp truy vấn — công cụ debug prompt trên UI. */
export async function previewSearch(input: {
  orgId: string;
  agentId: string;
  query: string;
  topK?: number;
}): Promise<Array<{ id: string; heading: string | null; content: string; docTitle: string; rank: number }>> {
  const query = normalizeQuery(input.query);
  if (!query) return [];
  const rows = await prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
    SELECT c.id,
           c.heading,
           c.content,
           c.token_count,
           d.title AS doc_title,
           ts_rank_cd(c.search_vector, q.query) AS rank
    FROM ai_agent_document_chunks c
    JOIN ai_agent_document_links l
      ON l.document_id = c.document_id AND l.agent_id = ${input.agentId}
    JOIN ai_agent_documents d
      ON d.id = c.document_id AND d.enabled = true
    CROSS JOIN LATERAL (SELECT plainto_tsquery('simple', f_unaccent(${query})) AS query) q
    WHERE c.org_id = ${input.orgId} AND c.search_vector @@ q.query
    ORDER BY rank DESC
    LIMIT ${input.topK ?? 10}
  `);
  return rows.map((r) => ({
    id: r.id,
    heading: r.heading,
    content: r.content,
    docTitle: r.doc_title,
    rank: Number(r.rank),
  }));
}
