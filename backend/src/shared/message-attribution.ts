// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * message-attribution.ts — nguồn duy nhất sinh bộ trường "ai gửi tin này".
 *
 * Vì sao gom về một chỗ: nhiều sale dùng chung một nick Zalo, cộng thêm AI agent tự trả lời
 * và chiến dịch nhóm bắn hàng loạt. Khi khách phàn nàn "ai nói câu này với tôi", câu trả lời
 * phải tra được từ DB. Trước đây mỗi đường ghi tin tự đặt `sentVia` + `metadata.sender` theo
 * trí nhớ người viết, dẫn tới tin chiến dịch bị gắn cùng nhãn với tin sale gõ tay — quy sai
 * trách nhiệm cho một người cụ thể.
 *
 * Ba trường trả về phục vụ ba việc khác nhau, cố ý không gộp:
 *   - `sentByKind`  cột chuẩn hoá MỚI, có index, dùng cho thống kê. NULL (không set) mang
 *                   nghĩa "tin cũ, không rõ nguồn".
 *   - `sentVia`     giữ nguyên từ vựng cũ vì đang có 4 nơi đọc (trigger-gate, analysis-service,
 *                   nick-metrics-service, badge FE) — đổi ngữ nghĩa là làm vỡ hết.
 *   - `metadata.sender` phần hiển thị cho FE (tên người, chú thích), không dùng để thống kê.
 *
 * File này CHỈ ánh xạ thuần: không truy vấn DB, không I/O. Caller tự lấy tên người dùng
 * (chat-helpers.getUserFullName đã có cache 5 phút).
 */

/** Từ vựng chuẩn hoá của cột `messages.sent_by_kind`. */
export type SentByKind =
  | 'sale_crm'
  | 'sale_outside_crm'
  | 'sale_bridge'
  | 'ai_agent'
  | 'automation'
  | 'campaign'
  | 'system'
  | 'contact';

/**
 * Mô tả nguồn gửi. Kiểu union bắt người viết code phải nói rõ mình đang ghi tin thay mặt ai —
 * không thể "quên" truyền người phát động rồi để hệ thống đoán.
 */
export type MessageSource =
  /** Sale gõ tin trong CRM — trường hợp duy nhất quy được trách nhiệm cho một người cụ thể. */
  | { kind: 'sale_crm'; userId: string; userName: string }
  /**
   * Tin đồng bộ ngược từ app Zalo trên máy sale. Zalo KHÔNG cho biết ai đã gõ, mà nick thì
   * dùng chung — nên tuyệt đối không gắn tên người vào đây. Gắn tên chủ nick là bịa danh tính.
   */
  | { kind: 'sale_outside_crm'; nickName: string }
  /** Sale trả lời qua cầu Telegram. userId có thể null khi không map được tài khoản Telegram. */
  | { kind: 'sale_bridge'; userId: string | null; userName: string; via: 'telegram' }
  /** AI agent tự trả lời. Chi tiết lượt chạy nằm ở bảng AiAgentRun, không nhân bản sang đây. */
  | { kind: 'ai_agent'; agentId: string; agentName: string }
  /**
   * Máy soạn nội dung nhưng NGƯỜI bấm gửi (gợi ý NBA). userId là người bấm — họ đã đọc và
   * chịu trách nhiệm nội dung, nên vẫn tính vào năng suất của họ ở tầng báo cáo.
   */
  | { kind: 'automation'; label: string; userId: string | null }
  /**
   * Chiến dịch gửi hàng loạt. Ghi người phát động để truy được, nhưng KHÔNG tính vào năng
   * suất chăm sóc cá nhân: một lần bấm gửi 500 nhóm không phải 500 lần chăm khách.
   */
  | { kind: 'campaign'; userId: string | null; userName: string; campaignName: string }
  /** CRM tự sinh (thông báo hệ thống, thẻ nhắc việc). */
  | { kind: 'system'; label: string }
  /** Tin của khách. Không set sentVia để giữ nguyên default của schema. */
  | { kind: 'contact' };

export interface MessageAttributionFields {
  sentByKind: SentByKind;
  /** Không có ở nguồn 'contact' — để schema tự áp default. */
  sentVia?: string;
  /** Chỉ set khi truy được một user CRM cụ thể. */
  repliedByUserId?: string;
  metadata: { sender: Record<string, unknown> };
}

/**
 * Ánh xạ sang từ vựng `sentVia` ĐANG có trong DB. Bảng này là hợp đồng tương thích ngược:
 * đổi một giá trị ở đây là làm lệch số liệu của mọi báo cáo đã chạy từ trước.
 */
const SENT_VIA_BY_KIND: Record<Exclude<SentByKind, 'contact'>, string> = {
  sale_crm: 'user',
  sale_outside_crm: 'user_native',
  sale_bridge: 'bridge',
  ai_agent: 'automation',
  automation: 'automation',
  campaign: 'system',
  system: 'system',
};

/**
 * Dựng bộ trường attribution để nhét thẳng vào `prisma.message.create`.
 *
 * @throws Error khi nguồn `sale_crm` thiếu userId — quy trách nhiệm cho "một sale nào đó
 * không rõ" là vô nghĩa, thà chết lúc lập trình còn hơn ghi rác vào DB.
 */
export function buildMessageAttribution(source: MessageSource): MessageAttributionFields {
  switch (source.kind) {
    case 'sale_crm': {
      if (!source.userId) {
        throw new Error('[message-attribution] nguồn sale_crm bắt buộc có userId');
      }
      return {
        sentByKind: 'sale_crm',
        sentVia: SENT_VIA_BY_KIND.sale_crm,
        repliedByUserId: source.userId,
        // `kind: 'user_crm'` giữ nguyên để badge FE hiện tại không vỡ.
        metadata: { sender: { kind: 'user_crm', name: source.userName } },
      };
    }

    case 'sale_outside_crm':
      return {
        sentByKind: 'sale_outside_crm',
        sentVia: SENT_VIA_BY_KIND.sale_outside_crm,
        // KHÔNG có repliedByUserId và KHÔNG có tên người: chỉ biết tin đi ra từ nick nào.
        metadata: {
          sender: {
            kind: 'user_native',
            nickName: source.nickName,
            syncedFromNative: true,
          },
        },
      };

    case 'sale_bridge':
      return {
        sentByKind: 'sale_bridge',
        sentVia: SENT_VIA_BY_KIND.sale_bridge,
        ...(source.userId ? { repliedByUserId: source.userId } : {}),
        metadata: {
          sender: { kind: 'bridge', name: source.userName, detail: `Qua ${source.via}` },
        },
      };

    case 'ai_agent':
      return {
        sentByKind: 'ai_agent',
        sentVia: SENT_VIA_BY_KIND.ai_agent,
        metadata: {
          sender: { kind: 'ai_agent', agentId: source.agentId, name: source.agentName },
        },
      };

    case 'automation':
      return {
        sentByKind: 'automation',
        sentVia: SENT_VIA_BY_KIND.automation,
        ...(source.userId ? { repliedByUserId: source.userId } : {}),
        metadata: { sender: { kind: 'bot_automation', detail: source.label } },
      };

    case 'campaign':
      return {
        sentByKind: 'campaign',
        sentVia: SENT_VIA_BY_KIND.campaign,
        ...(source.userId ? { repliedByUserId: source.userId } : {}),
        metadata: {
          sender: {
            // KHÔNG dùng 'user_crm': đó là lý do tin chiến dịch từng hiện y hệt tin sale gõ tay.
            kind: 'bot_automation',
            name: source.userName,
            detail: `Chiến dịch: ${source.campaignName}`,
            campaign: true,
          },
        },
      };

    case 'system':
      return {
        sentByKind: 'system',
        sentVia: SENT_VIA_BY_KIND.system,
        metadata: { sender: { kind: 'bot_system', detail: source.label } },
      };

    case 'contact':
      // Tin của khách: không set sentVia để giữ nguyên hành vi default của schema.
      return { sentByKind: 'contact', metadata: { sender: { kind: 'contact' } } };
  }
}
