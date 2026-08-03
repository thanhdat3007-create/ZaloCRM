// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * ai-agent-document-routes.ts — kho tài liệu chăm sóc khách hàng.
 *
 * Quyền: resource 'settings' (theo pattern ai-routes.ts) — chỉ admin cấu hình
 * được kho tài liệu, sale không sửa.
 * Giai đoạn này chỉ nhận .txt/.md ≤2MB; PDF/DOCX cần thêm dep parse (ngoài scope).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from './document-service.js';
import { previewSearch } from './document-retriever.js';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.markdown'];

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function aiAgentDocumentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  /* Danh sách tài liệu + số chunk + agent đang dùng. */
  app.get(
    '/api/v1/ai-agents/documents',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest) => {
      return { items: await listDocuments(request.user!.orgId) };
    },
  );

  /* Tạo tài liệu — nhận JSON {title, content} hoặc multipart 1 file .txt/.md. */
  app.post(
    '/api/v1/ai-agents/documents',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = request.user!.orgId;

      if (request.isMultipart()) {
        let title = '';
        let fileName: string | null = null;
        let content: string | null = null;
        try {
          for await (const part of request.parts()) {
            if (part.type === 'field' && part.fieldname === 'title') {
              title = String(part.value ?? '');
            } else if (part.type === 'file') {
              if (!hasAllowedExtension(part.filename || '')) {
                return reply.status(415).send({ error: 'Chỉ nhận file .txt hoặc .md' });
              }
              const buf = await part.toBuffer();
              if (buf.length > MAX_UPLOAD_BYTES) {
                return reply.status(413).send({ error: 'File vượt quá 2MB' });
              }
              fileName = part.filename;
              content = buf.toString('utf8');
            }
          }
        } catch (err) {
          return reply.status(400).send({ error: `Lỗi đọc file: ${(err as Error).message}` });
        }
        if (content === null) return reply.status(400).send({ error: 'Chưa chọn file' });
        const finalTitle = title.trim() || (fileName ?? 'Tài liệu');
        const created = await createDocument({
          orgId,
          title: finalTitle,
          content,
          sourceType: 'file',
          fileName,
        });
        return reply.status(201).send(created);
      }

      const body = (request.body ?? {}) as { title?: string; content?: string };
      if (!body.title?.trim()) return reply.status(400).send({ error: 'Thiếu tiêu đề' });
      if (!body.content?.trim()) return reply.status(400).send({ error: 'Thiếu nội dung' });
      const created = await createDocument({
        orgId,
        title: body.title,
        content: body.content,
        sourceType: 'text',
      });
      return reply.status(201).send(created);
    },
  );

  /* Chi tiết 1 tài liệu (để mở form sửa). */
  app.get(
    '/api/v1/ai-agents/documents/:id',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const doc = await getDocument(request.user!.orgId, id);
      if (!doc) return reply.status(404).send({ error: 'Không tìm thấy tài liệu' });
      return doc;
    },
  );

  /* Sửa tài liệu. Nội dung đổi → chia lại chunk. */
  app.put(
    '/api/v1/ai-agents/documents/:id',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { title?: string; content?: string; enabled?: boolean };
      const result = await updateDocument({
        orgId: request.user!.orgId,
        documentId: id,
        title: body.title,
        content: body.content,
        enabled: body.enabled,
      });
      if (!result) return reply.status(404).send({ error: 'Không tìm thấy tài liệu' });
      return result;
    },
  );

  app.delete(
    '/api/v1/ai-agents/documents/:id',
    { preHandler: requireGrant('settings', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ok = await deleteDocument(request.user!.orgId, id);
      if (!ok) return reply.status(404).send({ error: 'Không tìm thấy tài liệu' });
      return { ok: true };
    },
  );

  /* Thử tìm kiếm — xem chunk nào khớp TRƯỚC khi bật agent. */
  app.post(
    '/api/v1/ai-agents/documents/preview-search',
    { preHandler: requireGrant('settings', 'view_all') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as { agentId?: string; query?: string };
      if (!body.agentId) return reply.status(400).send({ error: 'Thiếu agentId' });
      if (!body.query?.trim()) return reply.status(400).send({ error: 'Thiếu truy vấn' });
      try {
        const items = await previewSearch({
          orgId: request.user!.orgId,
          agentId: body.agentId,
          query: body.query,
        });
        return { items };
      } catch (err) {
        logger.warn('[ai-agent-docs] preview-search lỗi: %s', (err as Error).message);
        return reply.status(500).send({ error: 'Không tìm kiếm được. Kiểm tra migration FTS đã chạy chưa.' });
      }
    },
  );
}
