// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * ai-sdk-model.ts — điểm vào DUY NHẤT để lấy LanguageModel cho Vercel AI SDK.
 *
 * Key + baseUrl luôn resolve qua provider-registry (per-org, AES-GCM trong
 * app_settings) — KHÔNG đọc env trực tiếp, để org tự quản key trên UI như 5
 * provider cũ. Module này KHÔNG đụng tới ai-service.ts (đường AI cũ giữ nguyên).
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { config } from '../../config/index.js';
import { resolveProviderApiKey, getProviderBaseUrl } from '../ai/provider-registry.js';
import { AiAgentConfigError } from './ai-agent-errors.js';

/** Provider mà agent hỗ trợ. 'rocket' được LIỆT KÊ ở đây (để validate route, hiện UI…)
 * nhưng KHÔNG chạy qua hàm này — xem guard bên dưới. Mở rộng thêm khi có nhu cầu thật (YAGNI). */
export const AGENT_PROVIDERS = ['openrouter', 'rocket'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export function isAgentProvider(id: string): id is AgentProvider {
  return (AGENT_PROVIDERS as readonly string[]).includes(id);
}

/**
 * Dựng LanguageModel từ cấu hình agent.
 * @throws AiAgentConfigError khi provider không hỗ trợ, bị gọi nhầm với 'rocket', hoặc
 *         org chưa nhập key — worker bắt lỗi này để ghi skipReason thay vì retry vô ích.
 */
export async function resolveAgentModel(
  orgId: string,
  provider: string,
  modelId: string,
): Promise<LanguageModel> {
  if (provider === 'rocket') {
    // Chốt chặn, không phải đường chạy thật: Rocket không hỗ trợ response_format nên
    // structured output (generateObject) vô nghĩa — đường rocket đi thẳng qua
    // callRocketAgent() trong rocket-agent-client.ts, không qua AI SDK / hàm này.
    // Nếu code rơi vào nhánh này nghĩa là agent-runner gọi nhầm resolveAgentModel.
    throw new AiAgentConfigError(
      'Provider "rocket" không đi qua AI SDK — gọi callRocketAgent() (rocket-agent-client.ts) thay vì resolveAgentModel().',
      'no_api_key',
    );
  }
  if (!isAgentProvider(provider)) {
    throw new AiAgentConfigError(
      `Agent chỉ hỗ trợ provider "openrouter" hoặc "rocket" (nhận được "${provider}").`,
      'no_api_key',
    );
  }
  if (!modelId?.trim()) {
    throw new AiAgentConfigError('Agent chưa chọn model.', 'no_api_key');
  }

  const [apiKey, baseURL] = await Promise.all([
    resolveProviderApiKey(orgId, provider),
    getProviderBaseUrl(orgId, provider),
  ]);
  if (!apiKey) {
    throw new AiAgentConfigError(
      'Chưa có API key OpenRouter cho tổ chức này. Vào Cài đặt → Trợ lý AI để nhập.',
      'no_api_key',
    );
  }

  const openrouter = createOpenRouter({
    apiKey,
    baseURL: baseURL || config.openrouterBaseUrl,
    // OpenRouter dùng 2 header này để hiển thị nguồn gọi trên dashboard.
    headers: {
      'HTTP-Referer': config.aiAgentAppUrl,
      'X-Title': 'Zalo CRM AI Agent',
    },
  });
  return openrouter.chat(modelId);
}
