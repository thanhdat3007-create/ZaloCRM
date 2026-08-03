// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * document-service.ts — CRUD tài liệu chăm sóc khách hàng + chia chunk.
 *
 * Mọi thao tác đổi nội dung chạy trong tenantTransaction: tài liệu và chunk phải
 * luôn khớp nhau, không được để trạng thái nửa vời (doc mới + chunk cũ).
 */
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { chunkDocument, estimateTokens } from './document-chunker.js';

export interface DocumentSummary {
  id: string;
  title: string;
  sourceType: string;
  fileName: string | null;
  tokenCount: number;
  enabled: boolean;
  chunkCount: number;
  agentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Bản ghi chunk để ghi hàng loạt. */
function buildChunkRows(orgId: string, documentId: string, content: string) {
  return chunkDocument(content).map((c) => ({
    orgId,
    documentId,
    chunkIndex: c.chunkIndex,
    heading: c.heading,
    content: c.content,
    tokenCount: c.tokenCount,
  }));
}

export async function createDocument(input: {
  orgId: string;
  title: string;
  content: string;
  sourceType?: string;
  fileName?: string | null;
}): Promise<{ id: string; chunkCount: number; tokenCount: number }> {
  const content = input.content ?? '';
  const tokenCount = estimateTokens(content);

  return tenantTransaction(async (tx) => {
    const doc = await tx.aiAgentDocument.create({
      data: {
        orgId: input.orgId,
        title: input.title.trim(),
        content,
        tokenCount,
        sourceType: input.sourceType ?? 'text',
        fileName: input.fileName ?? null,
      },
      select: { id: true },
    });
    const rows = buildChunkRows(input.orgId, doc.id, content);
    if (rows.length > 0) await tx.aiAgentDocumentChunk.createMany({ data: rows });
    return { id: doc.id, chunkCount: rows.length, tokenCount };
  });
}

export async function updateDocument(input: {
  orgId: string;
  documentId: string;
  title?: string;
  content?: string;
  enabled?: boolean;
}): Promise<{ chunkCount: number; tokenCount: number } | null> {
  return tenantTransaction(async (tx) => {
    const existing = await tx.aiAgentDocument.findFirst({
      where: { id: input.documentId, orgId: input.orgId },
      select: { id: true, content: true, tokenCount: true },
    });
    if (!existing) return null;

    const contentChanged = input.content !== undefined && input.content !== existing.content;
    const content = contentChanged ? input.content! : existing.content;
    const tokenCount = contentChanged ? estimateTokens(content) : existing.tokenCount;

    await tx.aiAgentDocument.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(contentChanged ? { content, tokenCount } : {}),
      },
    });

    if (!contentChanged) {
      const chunkCount = await tx.aiAgentDocumentChunk.count({ where: { documentId: existing.id } });
      return { chunkCount, tokenCount };
    }

    // Nội dung đổi → chia lại chunk. Xoá sạch trước để không còn chunk mồ côi
    // (chunkIndex cũ có thể vượt số chunk mới).
    await tx.aiAgentDocumentChunk.deleteMany({ where: { documentId: existing.id } });
    const rows = buildChunkRows(input.orgId, existing.id, content);
    if (rows.length > 0) await tx.aiAgentDocumentChunk.createMany({ data: rows });
    return { chunkCount: rows.length, tokenCount };
  });
}

/** Xoá tài liệu. Chunk + link tự đi theo nhờ onDelete: Cascade. */
export async function deleteDocument(orgId: string, documentId: string): Promise<boolean> {
  const res = await prisma.aiAgentDocument.deleteMany({ where: { id: documentId, orgId } });
  return res.count > 0;
}

export async function listDocuments(orgId: string): Promise<DocumentSummary[]> {
  const docs = await prisma.aiAgentDocument.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      sourceType: true,
      fileName: true,
      tokenCount: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { chunks: true } },
      agents: { select: { agentId: true } },
    },
  });
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    sourceType: d.sourceType,
    fileName: d.fileName,
    tokenCount: d.tokenCount,
    enabled: d.enabled,
    chunkCount: d._count.chunks,
    agentIds: d.agents.map((a) => a.agentId),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

export async function getDocument(orgId: string, documentId: string) {
  return prisma.aiAgentDocument.findFirst({ where: { id: documentId, orgId } });
}

/**
 * Thay TOÀN BỘ danh sách tài liệu gán cho 1 agent (replace, không merge) —
 * UI gửi lên trạng thái cuối cùng, không phải delta.
 */
export async function linkDocumentsToAgent(
  orgId: string,
  agentId: string,
  documentIds: string[],
): Promise<number> {
  return tenantTransaction(async (tx) => {
    const agent = await tx.aiAgent.findFirst({ where: { id: agentId, orgId }, select: { id: true } });
    if (!agent) return 0;

    // Chỉ nhận tài liệu thuộc cùng org — chặn gán chéo tenant qua body request.
    const valid = await tx.aiAgentDocument.findMany({
      where: { orgId, id: { in: documentIds } },
      select: { id: true },
    });

    await tx.aiAgentDocumentLink.deleteMany({ where: { agentId, orgId } });
    if (valid.length > 0) {
      await tx.aiAgentDocumentLink.createMany({
        data: valid.map((d) => ({ agentId, documentId: d.id, orgId })),
      });
    }
    return valid.length;
  });
}

export async function listAgentDocumentIds(orgId: string, agentId: string): Promise<string[]> {
  const links = await prisma.aiAgentDocumentLink.findMany({
    where: { orgId, agentId },
    select: { documentId: true },
  });
  return links.map((l) => l.documentId);
}
