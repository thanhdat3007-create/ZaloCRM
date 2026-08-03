// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * typing-indicator.ts — giữ bubble "đang soạn tin" sáng suốt lúc AI agent nghĩ.
 *
 * Vì sao cần: một lượt Rocket đo được 13-22 giây. Trước đây `sendTypingEvent` chỉ gọi MỘT
 * lần ngay trước khi gửi, nên khách ngồi nhìn màn hình trống suốt thời gian đó rồi mới thấy
 * bubble loé ~4 giây — đủ lâu để khách tưởng bị lơ và nhắn tiếp hoặc bỏ đi.
 *
 * Bubble của Zalo tự tắt sau vài giây nên phải ping lại theo chu kỳ. Ba con số dưới đây là
 * đánh đổi giữa "bubble liền mạch" và trần SDK: mỗi ping tiêu một lượt `chat_action`, mà
 * category này chỉ có 500 lượt/ngày và 15 lượt/30 giây cho cả nick (dùng chung với thả cảm
 * xúc, xoá tin, báo đã xem — xem sdk-limit-service.ts). Vượt trần không làm hỏng lượt trả
 * lời (ping nuốt lỗi) nhưng sẽ chặn các thao tác khác của nick tới hết ngày.
 */
import { zaloOps } from '../../shared/zalo-operations.js';

/**
 * Chu kỳ ping. Chưa có tài liệu nào của Zalo nói bubble sống bao lâu; 5 giây lấy theo
 * TYPING_TTL_MS mà CRM đang dùng cho typing nội bộ (shared/event-buffer.ts) và đúng thông lệ
 * các ứng dụng nhắn tin. Thấy bubble nhấp nháy trên máy khách thì hạ số này, đổi lại tốn
 * thêm hạn mức chat_action.
 */
const PING_INTERVAL_MS = 5_000;

/**
 * Trần số ping cho MỘT lượt trả lời. 5 ping × 5 giây phủ được ~25 giây — dài hơn lượt Rocket
 * chậm nhất đo được (22 giây). Có trần này thì worker chạy 3 luồng song song cũng chỉ tốn tối
 * đa 15 lượt/30 giây, vừa chạm burst chứ không vượt. Lượt nào lâu hơn thì bubble tắt sớm:
 * thà tắt còn hơn đốt hết hạn mức của nick.
 */
const MAX_PINGS = 5;

/**
 * Chốt chặn cuối theo thời gian, phòng khi ai đó nới MAX_PINGS mà quên: model treo tới
 * timeout 90 giây cũng không được để khách nhìn "đang soạn tin" vô tận.
 */
const MAX_TOTAL_MS = 45_000;

export interface TypingIndicatorOptions {
  accountId: string;
  threadId: string;
  /** 0 = chat 1-1, 1 = nhóm (quy ước của zca-js). */
  threadType: 0 | 1;
}

/**
 * Bật bubble "đang soạn tin" và tự ping lại cho tới khi gọi hàm dừng được trả về.
 *
 * KHÔNG bao giờ ném lỗi và KHÔNG cần await: nick rớt kết nối hay đụng trần SDK giữa chừng
 * chỉ làm mất bubble, không được phép làm hỏng lượt trả lời của khách.
 *
 * @returns hàm dừng — gọi bao nhiêu lần cũng an toàn, kể cả sau khi vòng lặp đã tự hết hạn.
 */
export function startTypingIndicator(opts: TypingIndicatorOptions): () => void {
  // Chế độ mô phỏng dùng để chạy thử qua đêm mà không đụng Zalo thật — vòng ping cũng phải
  // câm, nếu không mỗi lượt thử vẫn đốt hạn mức thật của nick.
  if (process.env.AUTOMATION_STUB_MODE === 'true') return () => {};

  const startedAt = Date.now();
  let pings = 0;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const stop = (): void => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const ping = (): void => {
    if (stopped) return;
    if (pings >= MAX_PINGS || Date.now() - startedAt >= MAX_TOTAL_MS) {
      stop();
      return;
    }
    pings += 1;

    // Không await: ping chậm không được làm trễ vòng kế tiếp, và lỗi thì bỏ qua — bubble
    // mất một nhịp không đáng để đụng tới luồng trả lời.
    void zaloOps
      .sendTypingEvent(opts.accountId, opts.threadId, opts.threadType)
      .catch(() => {});

    // setTimeout đệ quy chứ không setInterval: ping treo lâu hơn chu kỳ sẽ khiến setInterval
    // dồn lệnh chồng lên nhau, càng dễ đụng burst.
    timer = setTimeout(ping, PING_INTERVAL_MS);
    // Không giữ tiến trình sống chỉ vì một bubble đang chờ ping.
    timer.unref?.();
  };

  // Ping ngay, không đợi hết chu kỳ đầu: khách phải thấy bubble trong khoảng một giây —
  // đó chính là điều tính năng này sinh ra để giải quyết.
  ping();

  return stop;
}
