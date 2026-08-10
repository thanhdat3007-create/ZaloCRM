// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * message-template-routes.ts — CRUD mẫu tin (🟢 Community).
 *
 * PREFIX RIÊNG `/api/v1/message-templates`. Bundle EE giữ `/automation/templates`
 * của nó — hai đường dẫn KHÔNG trùng nhau, chạy song song được.
 *
 * Mỗi mẫu = 1 đoạn chữ + danh sách đính kèm (ảnh/video/file) trỏ Kho phương tiện.
 * Thứ tự đính kèm = thứ tự gửi đi.
 *
 * Quyền: đọc cần `conversation.access`, ghi cần `conversation.edit` — mẫu tin là
 * tài sản của luồng hội thoại. Scope xem: mẫu public của org + mẫu riêng của mình.
 *
 * Community feature — KHÔNG import `_ee`.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  validateAttachments,
  validateTemplateInput,
  resolveTemplateAttachments,
  type ValidationFailure,
} from './message-template-service.js';
import { normalizeZaloStyles } from '../../shared/zalo-rich-text.js';

const BASE = '/api/v1/message-templates';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

interface TemplateBody {
  name?: unknown;
  content?: unknown;
  /** `{ styles: [{st,start,len}] }` — định dạng Zalo do rich-text-editor gửi lên. */
  contentRich?: unknown;
  visibility?: unknown;
  folderId?: unknown;
  tagIds?: unknown;
  attachments?: unknown;
}

function userIdOf(request: FastifyRequest): string {
  const user = request.user as unknown as { userId?: string; id?: string };
  return user.userId ?? user.id ?? '';
}

function sendValidationError(reply: FastifyReply, failure: ValidationFailure) {
  return reply.status(422).send({
    error: failure.message,
    code: failure.code,
    ...(failure.assetIds ? { assetIds: failure.assetIds } : {}),
  });
}

/** Chỉ thấy mẫu public của org + mẫu riêng do mình sở hữu/tạo. */
function visibilityScope(userId: string) {
  return {
    OR: [{ visibility: 'public' }, { ownerUserId: userId }, { createdById: userId }],
  };
}

/**
 * Bất biến của bảng: `content` LUÔN bằng `contentRich.text`.
 * `content` là nguồn sự thật của chữ; body chỉ góp thêm `contentRich.styles`
 * (đậm/nghiêng/màu/cỡ do rich-text-editor trích ra). Ghi lại contentRich mỗi khi
 * đổi content — để nguyên bản cũ sẽ khiến chỗ đọc `contentRich.text` (VD popup
 * chèn mẫu trong chat) chèn đúng đoạn chữ CŨ, và styles bám sai vị trí ký tự.
 */
function richFor(content: string, rawRich: unknown) {
  const styles =
    rawRich && typeof rawRich === 'object'
      ? normalizeZaloStyles((rawRich as { styles?: unknown }).styles, content.length)
      : [];
  return { text: content, styles };
}

function normalizeTagIds(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((t): t is string => typeof t === 'string' && t.trim() !== ''))];
}

export async function messageTemplateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── List ──────────────────────────────────────────────────────────────────
  app.get(
    BASE,
    { preHandler: requireGrant('conversation', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const userId = userIdOf(request);
      const query = request.query as {
        folderId?: string;
        visibility?: string;
        search?: string;
        limit?: string;
      };
      const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      try {
        const templates = await prisma.messageTemplate.findMany({
          where: {
            orgId,
            archivedAt: null,
            ...(query.folderId ? { folderId: query.folderId } : {}),
            ...(query.visibility ? { visibility: query.visibility } : {}),
            // AND (không spread) vì cả scope quyền lẫn bộ lọc tìm kiếm đều dùng
            // khoá `OR`; spread sẽ để bộ lọc sau ĐÈ scope quyền → lộ mẫu riêng tư
            // của người khác ngay khi có từ khoá tìm kiếm.
            AND: [
              visibilityScope(userId),
              ...(query.search
                ? [{
                    OR: [
                      { name: { contains: query.search, mode: 'insensitive' as const } },
                      { content: { contains: query.search, mode: 'insensitive' as const } },
                    ],
                  }]
                : []),
            ],
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        });
        return { templates };
      } catch (err) {
        logger.error(`[message-templates] list lỗi: ${(err as Error).message}`);
        return reply.status(500).send({ error: 'Không tải được danh sách mẫu tin' });
      }
    },
  );

  // ── Create ────────────────────────────────────────────────────────────────
  app.post(
    BASE,
    { preHandler: requireGrant('conversation', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const userId = userIdOf(request);
      const body = (request.body ?? {}) as TemplateBody;
      const content = typeof body.content === 'string' ? body.content : '';
      try {
        const attachmentResult = await validateAttachments(orgId, userId, body.attachments);
        if (!attachmentResult.ok) return sendValidationError(reply, attachmentResult.error);

        const failure = validateTemplateInput({
          name: body.name,
          content: body.content,
          attachmentCount: attachmentResult.attachments.length,
        });
        if (failure) return sendValidationError(reply, failure);

        const template = await prisma.messageTemplate.create({
          data: {
            orgId,
            name: (body.name as string).trim(),
            content,
            contentRich: richFor(content, body.contentRich),
            visibility: body.visibility === 'public' ? 'public' : 'private',
            folderId: typeof body.folderId === 'string' ? body.folderId : null,
            tagIds: normalizeTagIds(body.tagIds) ?? [],
            attachments: attachmentResult.attachments,
            ownerUserId: userId,
            createdById: userId,
          },
        });
        return reply.status(201).send({ template });
      } catch (err) {
        logger.error(`[message-templates] create lỗi: ${(err as Error).message}`);
        return reply.status(500).send({ error: 'Không tạo được mẫu tin' });
      }
    },
  );

  // ── Detail (kèm đính kèm đã resolve để preview) ───────────────────────────
  app.get(
    `${BASE}/:id`,
    { preHandler: requireGrant('conversation', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const userId = userIdOf(request);
      const { id } = request.params as { id: string };
      try {
        const template = await prisma.messageTemplate.findFirst({
          where: { id, orgId, archivedAt: null, ...visibilityScope(userId) },
        });
        if (!template) return reply.status(404).send({ error: 'Không tìm thấy mẫu tin' });
        const attachments = await resolveTemplateAttachments(orgId, template.attachments);
        return { template, attachments };
      } catch (err) {
        logger.error(`[message-templates] get lỗi: ${(err as Error).message}`);
        return reply.status(500).send({ error: 'Không tải được mẫu tin' });
      }
    },
  );

  // ── Update ────────────────────────────────────────────────────────────────
  app.patch(
    `${BASE}/:id`,
    { preHandler: requireGrant('conversation', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const userId = userIdOf(request);
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as TemplateBody;
      try {
        const existing = await prisma.messageTemplate.findFirst({
          where: { id, orgId, archivedAt: null, ...visibilityScope(userId) },
        });
        if (!existing) return reply.status(404).send({ error: 'Không tìm thấy mẫu tin' });

        // attachments không gửi lên → giữ nguyên bản đang lưu.
        const attachmentResult =
          body.attachments === undefined
            ? ({ ok: true, attachments: null } as const)
            : await validateAttachments(orgId, userId, body.attachments);
        if (!attachmentResult.ok) return sendValidationError(reply, attachmentResult.error);

        const nextName = body.name === undefined ? existing.name : body.name;
        const nextContent = body.content === undefined ? existing.content : body.content;
        const nextAttachmentCount =
          attachmentResult.attachments?.length ??
          (Array.isArray(existing.attachments) ? existing.attachments.length : 0);
        const failure = validateTemplateInput({
          name: nextName,
          content: nextContent,
          attachmentCount: nextAttachmentCount,
        });
        if (failure) return sendValidationError(reply, failure);

        const tagIds = normalizeTagIds(body.tagIds);
        const template = await prisma.messageTemplate.update({
          where: { id },
          data: {
            name: (nextName as string).trim(),
            content: typeof nextContent === 'string' ? nextContent : '',
            // Giữ bất biến content === contentRich.text (xem ghi chú ở richFor).
            // Sửa chữ mà KHÔNG kèm contentRich → bỏ styles cũ: offset của chúng bám
            // theo đoạn chữ trước đó, giữ lại sẽ tô đậm/tô màu lệch chỗ.
            ...(body.content === undefined && body.contentRich === undefined
              ? {}
              : {
                  contentRich: richFor(
                    typeof nextContent === 'string' ? nextContent : '',
                    body.contentRich,
                  ),
                }),
            ...(body.visibility === undefined
              ? {}
              : { visibility: body.visibility === 'public' ? 'public' : 'private' }),
            ...(body.folderId === undefined
              ? {}
              : { folderId: typeof body.folderId === 'string' ? body.folderId : null }),
            ...(tagIds === undefined ? {} : { tagIds }),
            ...(attachmentResult.attachments === null
              ? {}
              : { attachments: attachmentResult.attachments }),
          },
        });
        return { template };
      } catch (err) {
        logger.error(`[message-templates] update lỗi: ${(err as Error).message}`);
        return reply.status(500).send({ error: 'Không cập nhật được mẫu tin' });
      }
    },
  );

  // ── Soft delete ───────────────────────────────────────────────────────────
  app.delete(
    `${BASE}/:id`,
    { preHandler: requireGrant('conversation', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.user!;
      const userId = userIdOf(request);
      const { id } = request.params as { id: string };
      try {
        const existing = await prisma.messageTemplate.findFirst({
          where: { id, orgId, archivedAt: null, ...visibilityScope(userId) },
        });
        if (!existing) return reply.status(404).send({ error: 'Không tìm thấy mẫu tin' });

        // Chặn xoá mẫu đang có chiến dịch chạy — schema đặt onDelete: Restrict,
        // nhưng soft delete không kích hoạt FK nên phải kiểm ở đây.
        const inUse = await prisma.groupBroadcast.findMany({
          where: { orgId, templateId: id, state: { in: ['active', 'paused'] } },
          select: { id: true, name: true },
          take: 20,
        });
        if (inUse.length > 0) {
          return reply.status(409).send({
            error: 'Mẫu tin đang được chiến dịch sử dụng',
            code: 'TEMPLATE_IN_USE',
            broadcasts: inUse,
          });
        }

        await prisma.messageTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
        return { ok: true };
      } catch (err) {
        logger.error(`[message-templates] delete lỗi: ${(err as Error).message}`);
        return reply.status(500).send({ error: 'Không xoá được mẫu tin' });
      }
    },
  );
}
