// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * mcp-routes.ts — Máy chủ MCP (Model Context Protocol) chạy trên Streamable HTTP,
 * gắn thẳng vào Fastify tại POST /mcp. Claude Code cắm vào bằng một lệnh:
 *
 *   claude mcp add --transport http zalocrm https://<domain>/mcp
 *
 * Chế độ KHÔNG PHIÊN (stateless): mỗi request POST là một lời gọi JSON-RPC độc lập,
 * server không phát sinh Mcp-Session-Id và không mở kênh SSE do server chủ động.
 * Đủ cho bộ tool thuần đọc — không có thông báo đẩy ngược nào cần gửi.
 *
 * Chỉ hiện thực phần giao thức mà bộ tool này cần: initialize, tools/list,
 * tools/call, ping, cộng danh sách resources/prompts rỗng để client dò năng lực
 * không bị lỗi. Tự viết thay vì kéo thêm SDK — bề mặt nhỏ, không thêm phụ thuộc
 * vào ảnh Docker đã dựng sẵn.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { AnalysisError, assertAnalysisAccess } from './analysis-guard.js';
import { callTool, listToolDefinitions } from './mcp-tools.js';

const SERVER_INFO = { name: 'zalocrm-analysis', version: '1.0.0' };
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

// Mã lỗi JSON-RPC 2.0 chuẩn.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

function success(id: JsonRpcId, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function failure(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** Kết quả tool trả về client dưới dạng khối text JSON — client MCP tự parse tiếp. */
function toolContent(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function toolFailure(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Xử lý MỘT thông điệp JSON-RPC. Trả về null cho notification (không có `id`) —
 * theo đặc tả, notification không được phép có phản hồi.
 */
async function dispatch(message: JsonRpcMessage): Promise<object | null> {
  const { method, id } = message;
  const isNotification = id === undefined || id === null;
  const rpcId: JsonRpcId = isNotification ? null : id!;

  if (!method) {
    return isNotification ? null : failure(rpcId, INVALID_REQUEST, 'Thiếu trường "method"');
  }

  switch (method) {
    case 'initialize': {
      const requested = message.params?.protocolVersion;
      const protocolVersion =
        typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : DEFAULT_PROTOCOL_VERSION;
      return success(rpcId, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Bộ công cụ CHỈ ĐỌC để phân tích hội thoại Zalo CRM. Quy trình gợi ý: ' +
          'get_org_overview để nắm bức tranh chung → list_conversations để chọn hội thoại → ' +
          'get_transcript để đọc nội dung → get_conversation_metrics để chấm chất lượng phục vụ. ' +
          'Không có công cụ nào ghi dữ liệu hay gửi tin.',
      });
    }

    case 'ping':
      return isNotification ? null : success(rpcId, {});

    case 'tools/list':
      return success(rpcId, { tools: listToolDefinitions() });

    case 'tools/call': {
      const name = message.params?.name;
      if (typeof name !== 'string') {
        return failure(rpcId, INVALID_REQUEST, 'tools/call thiếu params.name');
      }
      const args = (message.params?.arguments as Record<string, unknown>) ?? {};
      try {
        return success(rpcId, toolContent(await callTool(name, args)));
      } catch (err) {
        // Lỗi khi CHẠY tool là kết quả hợp lệ của giao thức (isError), không phải
        // lỗi JSON-RPC — để trợ lý AI đọc được thông báo và tự sửa tham số.
        const detail = err instanceof Error ? err.message : String(err);
        if (!(err instanceof AnalysisError)) {
          logger.error(`[mcp] tool ${name} lỗi:`, err);
        }
        return success(rpcId, toolFailure(`Lỗi khi chạy tool ${name}: ${detail}`));
      }
    }

    // Client thường dò cả ba năng lực khi kết nối; trả danh sách rỗng thay vì lỗi.
    case 'resources/list':
      return success(rpcId, { resources: [] });
    case 'resources/templates/list':
      return success(rpcId, { resourceTemplates: [] });
    case 'prompts/list':
      return success(rpcId, { prompts: [] });

    default:
      if (isNotification) return null; // notifications/initialized, notifications/cancelled…
      return failure(rpcId, METHOD_NOT_FOUND, `Phương thức không hỗ trợ: ${method}`);
  }
}

export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  if (!config.analysisApiEnabled) return;

  app.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      assertAnalysisAccess(request);
    } catch (err) {
      if (err instanceof AnalysisError) return reply.status(err.statusCode).send({ error: err.message });
      throw err;
    }

    const body = request.body;
    if (body == null || typeof body !== 'object') {
      return reply.status(400).send(failure(null, PARSE_ERROR, 'Thân request phải là JSON-RPC 2.0'));
    }

    try {
      // Batch: mảng thông điệp; lọc bỏ notification khỏi phản hồi. Mảng chỉ chứa
      // notification → 202 rỗng, đúng đặc tả Streamable HTTP.
      if (Array.isArray(body)) {
        const replies = (await Promise.all(body.map((m) => dispatch(m as JsonRpcMessage))))
          .filter((r): r is object => r !== null);
        return replies.length === 0 ? reply.status(202).send() : reply.send(replies);
      }

      const result = await dispatch(body as JsonRpcMessage);
      return result === null ? reply.status(202).send() : reply.send(result);
    } catch (err) {
      logger.error('[mcp] lỗi không mong đợi:', err);
      const id = Array.isArray(body) ? null : ((body as JsonRpcMessage).id ?? null);
      return reply.status(500).send(failure(id, INTERNAL_ERROR, 'Lỗi máy chủ khi xử lý JSON-RPC'));
    }
  });

  // Stateless: không có kênh SSE do server chủ động, không có phiên để xoá.
  // Trả 405 để client MCP biết mà bỏ qua, thay vì treo chờ kết nối.
  const notSupported = async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.status(405).send(failure(null, METHOD_NOT_FOUND, 'Máy chủ chạy chế độ không phiên — chỉ nhận POST /mcp'));
  app.get('/mcp', notSupported);
  app.delete('/mcp', notSupported);

  logger.info('[mcp] đã bật POST /mcp — 9 tool phân tích hội thoại (chỉ đọc)');
}
