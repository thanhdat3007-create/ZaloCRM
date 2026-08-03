// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * rocket-types.ts — hợp đồng chung của 2 đường gọi Rocket Agent (HTTP gateway và CLI).
 *
 * Tách riêng để `rocket-http-client.ts` và `rocket-cli-client.ts` dùng CHUNG một lớp lỗi:
 * agent-runner.ts phân loại lỗi bằng `instanceof RocketAgentError` + `kind`, hai lớp lỗi
 * trùng tên nhưng khác định danh sẽ làm nhánh đó im lặng trượt. Đặt ở file riêng thay vì
 * trong `rocket-agent-client.ts` để tránh import vòng (dispatcher → impl → dispatcher).
 */

export type RocketErrorKind = 'connection' | 'timeout' | 'http' | 'empty' | 'no_base_url';

export class RocketAgentError extends Error {
  readonly kind: RocketErrorKind;
  /** Mã HTTP (đường gateway) hoặc exit code (đường CLI); null khi không có. */
  readonly status: number | null;

  constructor(message: string, kind: RocketErrorKind, status: number | null = null) {
    super(message);
    this.name = 'RocketAgentError';
    this.kind = kind;
    this.status = status;
  }
}

export interface RocketChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RocketReply {
  text: string;
  /** null ở đường CLI: `hermes -z` chỉ in text, không có khối usage. */
  promptTokens: number | null;
  completionTokens: number | null;
  /** Model Rocket báo là đã dùng; fallback về model đã gửi lên. */
  model: string;
}

export interface RocketCallInput {
  /** Tên profile Hermes; null/rỗng = profile mặc định. */
  profile: string | null;
  /** Alias model_routes; rỗng = để Rocket dùng model mặc định của profile. */
  model: string;
  system: string;
  messages: RocketChatMessage[];
  timeoutMs?: number;
}

export type RocketProbeStatus = 'ok' | 'unknown_profile' | 'unreachable' | 'unauthorized' | 'error';

export interface RocketProbeResult {
  ok: boolean;
  status: RocketProbeStatus;
  /** Thông báo tiếng Việt viết sẵn cho UI hiển thị thẳng. */
  message: string;
  /** Model gợi ý cho ô Model trên UI. */
  models: string[];
}
