// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * rocket-agent-client.ts — chọn đường vận chuyển tới Rocket Agent theo
 * `ROCKET_AGENT_TRANSPORT`, giữ nguyên một mặt API cho phần còn lại của hệ thống
 * (agent-runner.ts, ai-agent-routes.ts) — hai nơi đó không cần biết đang đi đường nào.
 *
 *   cli  (mặc định) — `hermes -p <profile> -z` (rocket-cli-client.ts). Không cần gateway,
 *                     không cần khoá API; đổi lại: mỗi tin một tiến trình, không có số token,
 *                     và backend phải chạy đúng user OS sở hữu `~/.rocketagent/`.
 *   http            — cổng OpenAI-compatible (rocket-http-client.ts). Tiến trình nóng, có
 *                     số token, gọi được qua ranh giới user/container — nhưng gateway phải
 *                     luôn sống và khoá phải khớp `.env` ↔ `config.yaml`.
 */
import { config } from '../../config/index.js';
import { callRocketAgentCli, probeRocketAgentCli } from './rocket-cli-client.js';
import { callRocketAgentHttp, probeRocketAgentHttp } from './rocket-http-client.js';
import type { RocketCallInput, RocketProbeResult, RocketReply } from './rocket-types.js';

export {
  RocketAgentError,
  type RocketCallInput,
  type RocketChatMessage,
  type RocketErrorKind,
  type RocketProbeResult,
  type RocketProbeStatus,
  type RocketReply,
} from './rocket-types.js';

function useCli(): boolean {
  return config.rocketAgentTransport === 'cli';
}

/** Chạy 1 lượt trả lời qua đường đang bật. */
export function callRocketAgent(input: RocketCallInput): Promise<RocketReply> {
  return useCli() ? callRocketAgentCli(input) : callRocketAgentHttp(input);
}

/** Dò cấu hình cho nút "Kiểm tra kết nối" — mỗi đường có cách kiểm riêng. */
export function probeRocketAgent(profile: string | null): Promise<RocketProbeResult> {
  return useCli() ? probeRocketAgentCli(profile) : probeRocketAgentHttp(profile);
}
