// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * Lỗi riêng của module agent. Worker phân biệt 2 loại:
 *   - AiAgentConfigError  → cấu hình sai (thiếu key, provider lạ). Retry vô ích,
 *                           ghi AiAgentRun status='skipped' rồi dừng.
 *   - AiAgentGateError    → một cổng chặn đã từ chối lượt này. Không phải lỗi;
 *                           mang theo skipReason để ghi nhật ký.
 */

/** Lý do bỏ qua — dùng chung giữa gate, worker và cột AiAgentRun.skipReason. */
export type SkipReason =
  | 'no_binding'
  | 'org_disabled'
  | 'agent_disabled'
  | 'binding_disabled'
  | 'not_inbound'
  | 'internal_nick'
  | 'unsupported_type'
  | 'noise'
  | 'not_mentioned'
  | 'handoff_active'
  | 'conversation_paused'
  | 'human_active'
  | 'handoff_keyword'
  | 'quota'
  | 'nick_cap'
  | 'no_api_key'
  /** Nick đang ở chế độ CHỈ NHẬN — tầng gửi tin sẽ chặn, nên dừng từ đầu. */
  | 'chat_disabled';

export class AiAgentConfigError extends Error {
  readonly code = 'ai_agent_config' as const;
  readonly skipReason: SkipReason;
  constructor(message: string, skipReason: SkipReason = 'no_api_key') {
    super(message);
    this.name = 'AiAgentConfigError';
    this.skipReason = skipReason;
  }
}

export class AiAgentGateError extends Error {
  readonly code = 'ai_agent_gate' as const;
  readonly skipReason: SkipReason;
  constructor(skipReason: SkipReason, message?: string) {
    super(message ?? `Agent bỏ qua: ${skipReason}`);
    this.name = 'AiAgentGateError';
    this.skipReason = skipReason;
  }
}
