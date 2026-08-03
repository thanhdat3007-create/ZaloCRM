// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * document-chunker.ts — cắt tài liệu thành chunk để tìm bằng Postgres FTS.
 *
 * Thuần hàm, không I/O. Quy tắc (KISS):
 *   1. Tách theo heading markdown và dòng trống kép → block.
 *   2. Gộp block liền kề tới ngưỡng ~700 token.
 *   3. Block đơn lẻ dài hơn ngưỡng → cắt theo câu, overlap ~80 token.
 *   4. heading = heading gần nhất phía trên (prepend khi nhồi prompt).
 *   5. Bỏ chunk quá ngắn (< 20 ký tự) — nhiễu, không mang thông tin.
 */

/** Ngưỡng gộp block, tính bằng token ước lượng. */
const TARGET_TOKENS = 700;
/** Overlap khi phải cắt 1 block dài — giữ ngữ cảnh giữa 2 chunk liền kề. */
const OVERLAP_TOKENS = 80;
/** Chunk ngắn hơn ngưỡng này bị loại. */
const MIN_CHUNK_CHARS = 20;

/**
 * Ước lượng token cho tiếng Việt có dấu: ~3.2 ký tự / token.
 * Cố ý xấp xỉ — chỉ dùng để chặn tràn context, không cần chính xác tuyệt đối.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

export interface DocumentChunk {
  chunkIndex: number;
  heading: string | null;
  content: string;
  tokenCount: number;
}

interface Block {
  heading: string | null;
  text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

/** Tách nội dung thành block theo heading markdown + dòng trống kép. */
function splitIntoBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    buffer = [];
    if (text) blocks.push({ heading, text });
  };

  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const headingMatch = HEADING_RE.exec(rawLine);
    if (headingMatch) {
      flush();
      heading = headingMatch[2];
      continue;
    }
    if (rawLine.trim() === '') {
      // Dòng trống = ranh giới đoạn. Chỉ flush khi buffer đã có nội dung để
      // nhiều dòng trống liên tiếp không sinh block rỗng.
      if (buffer.some((l) => l.trim() !== '')) flush();
      continue;
    }
    buffer.push(rawLine);
  }
  flush();
  return blocks;
}

/** Cắt 1 đoạn dài theo câu, có overlap. */
function splitLongText(text: string): string[] {
  // Cắt sau dấu kết câu hoặc xuống dòng; giữ lại dấu câu trong mảnh.
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return [];

  const parts: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const tokens = estimateTokens(sentence);
    // Câu đơn lẻ dài hơn cả ngưỡng → vẫn phải nhận, nếu không sẽ mất nội dung.
    if (currentTokens > 0 && currentTokens + tokens > TARGET_TOKENS) {
      parts.push(current.join(' '));
      // Giữ phần đuôi làm overlap cho chunk kế tiếp.
      const overlap: string[] = [];
      let overlapTokens = 0;
      for (let i = current.length - 1; i >= 0 && overlapTokens < OVERLAP_TOKENS; i--) {
        overlap.unshift(current[i]);
        overlapTokens += estimateTokens(current[i]);
      }
      current = overlap;
      currentTokens = overlapTokens;
    }
    current.push(sentence);
    currentTokens += tokens;
  }
  if (current.length > 0) parts.push(current.join(' '));
  return parts;
}

/**
 * Cắt tài liệu thành chunk. chunkIndex liên tục từ 0 (khớp @@unique
 * [documentId, chunkIndex]).
 */
export function chunkDocument(content: string): DocumentChunk[] {
  const blocks = splitIntoBlocks(content ?? '');
  const chunks: DocumentChunk[] = [];

  let pendingHeading: string | null = null;
  let pending: string[] = [];
  let pendingTokens = 0;

  const push = (heading: string | null, text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHUNK_CHARS) return;
    chunks.push({
      chunkIndex: chunks.length,
      heading,
      content: trimmed,
      tokenCount: estimateTokens(trimmed),
    });
  };

  const flushPending = () => {
    if (pending.length > 0) push(pendingHeading, pending.join('\n\n'));
    pending = [];
    pendingTokens = 0;
  };

  for (const block of blocks) {
    const blockTokens = estimateTokens(block.text);

    // Đổi heading → chốt chunk đang gom, để 1 chunk không trộn 2 mục.
    if (block.heading !== pendingHeading) {
      flushPending();
      pendingHeading = block.heading;
    }

    if (blockTokens > TARGET_TOKENS) {
      flushPending();
      for (const part of splitLongText(block.text)) push(block.heading, part);
      continue;
    }

    if (pendingTokens > 0 && pendingTokens + blockTokens > TARGET_TOKENS) flushPending();
    pending.push(block.text);
    pendingTokens += blockTokens;
  }
  flushPending();

  return chunks;
}
