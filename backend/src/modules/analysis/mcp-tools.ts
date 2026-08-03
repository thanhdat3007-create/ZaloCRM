// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * mcp-tools.ts — Danh mục tool MCP (chỉ đọc) và bộ điều phối sang analysis-service.
 *
 * Mô tả tool viết cho MÁY ĐỌC: trợ lý AI chọn tool dựa trên `description`, nên mỗi
 * mô tả nói rõ dùng khi nào và trả về gì. Mọi tool nhận `orgId` tuỳ chọn — bỏ trống
 * thì lấy organization duy nhất trong DB.
 */
import { resolveOrgId } from './analysis-guard.js';
import * as service from './analysis-service.js';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, orgId: string) => Promise<unknown>;
}

const ORG_ID_PROP = {
  orgId: {
    type: 'string',
    description: 'ID tổ chức. Bỏ trống nếu hệ thống chỉ có một tổ chức (trường hợp phổ biến).',
  },
} as const;

function object(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties: { ...ORG_ID_PROP, ...properties }, required };
}

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_zalo_accounts',
    description:
      'Liệt kê các nick Zalo (tài khoản gửi/nhận tin) của tổ chức kèm trạng thái kết nối, ' +
      'chủ sở hữu và số hội thoại. Gọi trước tiên khi cần lọc phân tích theo một nick cụ thể.',
    inputSchema: object({}),
    run: (_args, orgId) => service.listZaloAccounts(orgId),
  },
  {
    name: 'list_conversations',
    description:
      'Liệt kê hội thoại theo bộ lọc (nick, loại thread 1-1/nhóm, từ khoá tên/SĐT khách, ' +
      'chỉ hội thoại chưa trả lời, khoảng thời gian). Sắp xếp theo tin mới nhất. ' +
      'Dùng để tìm conversationId trước khi đọc transcript hoặc tính chỉ số.',
    inputSchema: object({
      accountId: str('Chỉ lấy hội thoại của nick Zalo này (lấy từ list_zalo_accounts).'),
      threadType: { type: 'string', enum: ['user', 'group'], description: "'user' = chat 1-1, 'group' = nhóm." },
      query: str('Từ khoá khớp tên khách, tên CRM, số điện thoại hoặc tên nhóm.'),
      unrepliedOnly: bool('true = chỉ hội thoại khách nhắn mà chưa được trả lời.'),
      hasUnread: bool('true = chỉ hội thoại còn tin chưa đọc.'),
      since: str('ISO 8601 — chỉ hội thoại có tin mới từ mốc này (vd 2026-07-01).'),
      until: str('ISO 8601 — chỉ hội thoại có tin mới trước mốc này.'),
      limit: num('Số hội thoại trả về, mặc định 25, tối đa 200.'),
      offset: num('Bỏ qua bao nhiêu bản ghi đầu — dùng để phân trang.'),
    }),
    run: (args, orgId) => service.listConversations(orgId, args as service.ListConversationsOptions),
  },
  {
    name: 'get_conversation',
    description:
      'Lấy chi tiết một hội thoại: hồ sơ khách hàng gắn kèm, nick phụ trách, tổng số tin, ' +
      'mốc tin đầu/cuối và bản xem trước tin gần nhất. Không kèm nội dung đầy đủ — ' +
      'dùng get_transcript cho nội dung.',
    inputSchema: object({ conversationId: str('ID hội thoại.') }, ['conversationId']),
    run: (args, orgId) => service.getConversation(orgId, String(args.conversationId)),
  },
  {
    name: 'get_transcript',
    description:
      'Lấy toàn văn hội thoại theo thứ tự thời gian để phân tích nội dung: nhu cầu khách, ' +
      'phản đối, cam kết, chất lượng tư vấn. Trả về cả mảng messages có cấu trúc và trường ' +
      '`text` dạng "[thời gian] Người gửi: nội dung" đọc thẳng được. Hội thoại dài hơn giới ' +
      'hạn sẽ lấy các tin GẦN NHẤT và đặt cờ truncated=true.',
    inputSchema: object({
      conversationId: str('ID hội thoại.'),
      limit: num('Số tin tối đa, mặc định 200.'),
      since: str('ISO 8601 — chỉ lấy tin từ mốc này.'),
      until: str('ISO 8601 — chỉ lấy tin trước mốc này.'),
      order: { type: 'string', enum: ['asc', 'desc'], description: "Thứ tự hiển thị, mặc định 'asc' (cũ → mới)." },
    }, ['conversationId']),
    // Bỏ mảng `messages` khỏi kết quả MCP: trường `text` đã chứa đủ thời gian,
    // người gửi và nội dung. Giữ cả hai sẽ nhân đôi token mà không thêm thông tin.
    run: async (args, orgId) => {
      const { messages, ...rest } = await service.getTranscript(
        orgId, String(args.conversationId), args as service.TranscriptOptions,
      );
      return rest;
    },
  },
  {
    name: 'get_conversation_metrics',
    description:
      'Tính chỉ số phục vụ khách của một hội thoại: số tin đến/đi, thời gian phản hồi ' +
      '(trung bình, trung vị, p90, nhanh nhất, chậm nhất), khoảng im lặng dài nhất, và ' +
      'thời gian khách đang chờ nếu chưa được trả lời. Dùng để chấm chất lượng chăm sóc.',
    inputSchema: object({ conversationId: str('ID hội thoại.') }, ['conversationId']),
    run: (args, orgId) => service.getConversationMetrics(orgId, String(args.conversationId)),
  },
  {
    name: 'search_messages',
    description:
      'Tìm tin nhắn chứa từ khoá trên toàn tổ chức, kèm ngữ cảnh hội thoại và khách hàng. ' +
      'Dùng để dò chủ đề (báo giá, khiếu nại, tên sản phẩm) xuyên nhiều hội thoại.',
    inputSchema: object({
      query: str('Từ khoá cần tìm trong nội dung tin, tối thiểu 2 ký tự.'),
      accountId: str('Giới hạn trong hội thoại của một nick Zalo.'),
      conversationId: str('Giới hạn trong một hội thoại.'),
      senderType: { type: 'string', enum: ['contact', 'self', 'ai_assistant'], description: "'contact' = khách gửi, 'self' = nhân viên, 'ai_assistant' = trợ lý AI." },
      since: str('ISO 8601 — chỉ tin từ mốc này.'),
      until: str('ISO 8601 — chỉ tin trước mốc này.'),
      limit: num('Số tin trả về, mặc định 50, tối đa 200.'),
    }, ['query']),
    run: (args, orgId) => service.searchMessages(orgId, args as unknown as service.SearchMessagesOptions),
  },
  {
    name: 'search_contacts',
    description:
      'Tìm khách hàng theo tên, số điện thoại hoặc email; trả về điểm lead, trạng thái, ' +
      'nguồn và số hội thoại. Bỏ trống query để lấy các khách có hoạt động gần nhất.',
    inputSchema: object({
      query: str('Tên, số điện thoại hoặc email cần tìm.'),
      limit: num('Số khách trả về, mặc định 25, tối đa 100.'),
    }),
    run: (args, orgId) => service.searchContacts(orgId, args as { query?: string; limit?: number }),
  },
  {
    name: 'get_contact',
    description:
      'Lấy hồ sơ đầy đủ một khách hàng: thông tin liên hệ, trạng thái, nhãn, ghi chú, ' +
      'lịch hẹn và danh sách hội thoại kèm conversationId để đọc transcript tiếp.',
    inputSchema: object({ contactId: str('ID khách hàng.') }, ['contactId']),
    run: (args, orgId) => service.getContact(orgId, String(args.contactId)),
  },
  {
    name: 'get_org_overview',
    description:
      'Thống kê tổng quan tổ chức trong N ngày gần nhất: tổng hội thoại, hội thoại hoạt ' +
      'động, số chưa trả lời, lượng tin đến/đi, phân bổ theo nick, và top hội thoại nhiều ' +
      'tin nhất. Gọi đầu tiên khi cần bức tranh chung trước khi đào sâu.',
    inputSchema: object({ days: num('Số ngày nhìn lại, mặc định 30, tối đa 365.') }),
    run: (args, orgId) => service.getOrgOverview(orgId, args as { days?: number }),
  },
];

const TOOL_BY_NAME = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

/** Danh mục tool đưa cho client MCP (bỏ hàm run — chỉ phần khai báo). */
export function listToolDefinitions() {
  return MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/** Thực thi một tool theo tên; ném Error nếu tên không tồn tại. */
export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new Error(`Tool không tồn tại: ${name}`);
  const orgId = await resolveOrgId(typeof args.orgId === 'string' ? args.orgId : undefined);
  return tool.run(args, orgId);
}
