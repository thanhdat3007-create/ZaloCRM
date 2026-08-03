// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * analysis-guard.ts — Cổng vào chung cho bề mặt phân tích hội thoại (REST + MCP).
 *
 * Mặc định KHÔNG xác thực: trợ lý AI cắm vào là chạy. Ba lớp siết tuỳ chọn, tắt
 * hết theo mặc định, bật bằng biến môi trường khi cần đưa ra internet:
 *   ANALYSIS_API_ENABLED=false  → tắt hẳn bề mặt này
 *   ANALYSIS_API_TOKEN=<chuỗi>  → bắt buộc Bearer token / X-Analysis-Token
 *   ANALYSIS_API_ALLOWED_IPS=…  → chỉ nhận request từ IP khớp tiền tố
 *
 * Ngoài ra module tự giải quyết orgId khi không có phiên đăng nhập: lấy org duy
 * nhất trong DB (cache 60s), hoặc ANALYSIS_ORG_ID, hoặc tham số orgId của caller.
 */
import type { FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';

/** Lỗi mang sẵn HTTP status để REST trả đúng mã, MCP gói thành lỗi tool. */
export class AnalysisError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// ── Kiểm soát truy cập ────────────────────────────────────────────────────────

function tokenFromRequest(request: FastifyRequest): string {
  const explicit = request.headers['x-analysis-token'];
  if (typeof explicit === 'string' && explicit) return explicit.trim();
  const auth = request.headers['authorization'];
  if (typeof auth === 'string') return auth.replace(/^Bearer\s+/i, '').trim();
  return '';
}

/**
 * Chặn request không đủ điều kiện. Ném AnalysisError để caller quyết định cách
 * trả lỗi (REST status vs MCP JSON-RPC error).
 */
export function assertAnalysisAccess(request: FastifyRequest): void {
  if (!config.analysisApiEnabled) {
    throw new AnalysisError('Analysis API đang tắt (ANALYSIS_API_ENABLED=false)', 404);
  }

  const allowed = config.analysisApiAllowedIps;
  if (allowed.length > 0) {
    const ip = request.ip || '';
    if (!allowed.some((prefix) => ip.startsWith(prefix))) {
      throw new AnalysisError('IP không nằm trong ANALYSIS_API_ALLOWED_IPS', 403);
    }
  }

  if (config.analysisApiToken) {
    if (tokenFromRequest(request) !== config.analysisApiToken) {
      throw new AnalysisError('Token không hợp lệ (ANALYSIS_API_TOKEN)', 401);
    }
  }
}

// ── Giải quyết orgId khi không có phiên đăng nhập ─────────────────────────────

const ORG_CACHE_TTL_MS = 60_000;
let cachedOrgId: string | null = null;
let cachedAt = 0;

/** Chỉ dùng trong test để tránh cache rò rỉ giữa các case. */
export function resetOrgCache(): void {
  cachedOrgId = null;
  cachedAt = 0;
}

/**
 * Thứ tự ưu tiên: tham số caller → ANALYSIS_ORG_ID → org duy nhất trong DB.
 * Nhiều org mà không chỉ định → lỗi có hướng dẫn, không đoán bừa.
 */
export async function resolveOrgId(explicitOrgId?: string): Promise<string> {
  const wanted = (explicitOrgId || '').trim() || config.analysisOrgId;
  if (wanted) {
    const org = await runSystemQuery(() =>
      prisma.organization.findUnique({ where: { id: wanted }, select: { id: true } }),
    );
    if (!org) throw new AnalysisError(`Không tìm thấy organization ${wanted}`, 404);
    return org.id;
  }

  if (cachedOrgId && Date.now() - cachedAt < ORG_CACHE_TTL_MS) return cachedOrgId;

  const orgs = await runSystemQuery(() =>
    prisma.organization.findMany({ select: { id: true }, take: 2, orderBy: { createdAt: 'asc' } }),
  );
  if (orgs.length === 0) throw new AnalysisError('Chưa có organization nào trong hệ thống', 404);
  if (orgs.length > 1) {
    throw new AnalysisError(
      'Hệ thống có nhiều organization — truyền tham số orgId hoặc đặt ANALYSIS_ORG_ID trong .env',
      400,
    );
  }

  cachedOrgId = orgs[0]!.id;
  cachedAt = Date.now();
  return cachedOrgId;
}
