// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * analysis-routes.ts — REST CHỈ ĐỌC dưới /api/analysis/* cho trợ lý AI và script
 * phân tích. Không JWT, không API key (trừ khi bật ANALYSIS_API_TOKEN).
 *
 * Mọi endpoint nhận `orgId` tuỳ chọn qua query; bỏ trống thì tự lấy organization
 * duy nhất trong DB. Đây là lớp vỏ mỏng — logic nằm ở analysis-service.ts.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { AnalysisError, assertAnalysisAccess, resolveOrgId } from './analysis-guard.js';
import * as service from './analysis-service.js';

type Query = Record<string, string | undefined>;

const asBool = (v: string | undefined): boolean => v === '1' || v === 'true';

/**
 * Bọc handler: chặn truy cập → giải quyết orgId → gọi service → map lỗi sang HTTP.
 * Giữ mọi route dưới đây chỉ còn đúng phần lấy tham số.
 */
function handler<T>(
  run: (orgId: string, request: FastifyRequest) => Promise<T>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      assertAnalysisAccess(request);
      const { orgId: orgIdParam } = request.query as Query;
      const orgId = await resolveOrgId(orgIdParam);
      return await run(orgId, request);
    } catch (err) {
      if (err instanceof AnalysisError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      logger.error('[analysis-api] lỗi không mong đợi:', err);
      return reply.status(500).send({ error: 'Lỗi máy chủ khi xử lý yêu cầu phân tích' });
    }
  };
}

export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  if (!config.analysisApiEnabled) {
    logger.info('[analysis-api] ANALYSIS_API_ENABLED=false → bỏ qua đăng ký /api/analysis/*');
    return;
  }

  // Ping + cho biết orgId đang phục vụ và các lớp siết đang bật.
  app.get('/api/analysis/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      assertAnalysisAccess(request);
      const { orgId: orgIdParam } = request.query as Query;
      const orgId = await resolveOrgId(orgIdParam).catch(() => null);
      return {
        ok: true,
        orgId,
        readOnly: true,
        tokenRequired: Boolean(config.analysisApiToken),
        ipAllowListActive: config.analysisApiAllowedIps.length > 0,
        maxMessagesPerCall: config.analysisMaxMessages,
      };
    } catch (err) {
      if (err instanceof AnalysisError) return reply.status(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get('/api/analysis/accounts', handler((orgId) => service.listZaloAccounts(orgId)));

  app.get('/api/analysis/conversations', handler((orgId, request) => {
    const q = request.query as Query;
    return service.listConversations(orgId, {
      accountId: q.accountId,
      threadType: q.threadType,
      query: q.query ?? q.q,
      unrepliedOnly: asBool(q.unrepliedOnly),
      hasUnread: asBool(q.hasUnread),
      since: q.since,
      until: q.until,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }));

  app.get('/api/analysis/conversations/:id', handler((orgId, request) => {
    const { id } = request.params as { id: string };
    return service.getConversation(orgId, id);
  }));

  app.get('/api/analysis/conversations/:id/transcript', handler((orgId, request) => {
    const { id } = request.params as { id: string };
    const q = request.query as Query;
    return service.getTranscript(orgId, id, {
      limit: q.limit ? Number(q.limit) : undefined,
      since: q.since,
      until: q.until,
      order: q.order === 'desc' ? 'desc' : 'asc',
    });
  }));

  app.get('/api/analysis/conversations/:id/metrics', handler((orgId, request) => {
    const { id } = request.params as { id: string };
    return service.getConversationMetrics(orgId, id);
  }));

  app.get('/api/analysis/messages/search', handler((orgId, request) => {
    const q = request.query as Query;
    return service.searchMessages(orgId, {
      query: q.query ?? q.q ?? '',
      accountId: q.accountId,
      conversationId: q.conversationId,
      senderType: q.senderType,
      since: q.since,
      until: q.until,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }));

  app.get('/api/analysis/contacts', handler((orgId, request) => {
    const q = request.query as Query;
    return service.searchContacts(orgId, {
      query: q.query ?? q.q,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }));

  app.get('/api/analysis/contacts/:id', handler((orgId, request) => {
    const { id } = request.params as { id: string };
    return service.getContact(orgId, id);
  }));

  app.get('/api/analysis/overview', handler((orgId, request) => {
    const q = request.query as Query;
    return service.getOrgOverview(orgId, { days: q.days ? Number(q.days) : undefined });
  }));

  logger.info('[analysis-api] đã bật /api/analysis/* (chỉ đọc, không auth trừ khi đặt ANALYSIS_API_TOKEN)');
}
