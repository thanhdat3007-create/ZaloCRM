/**
 * ai-agent-sdk-model.test.ts — cổng cấu hình model.
 *
 * Thiếu key / provider lạ phải ném AiAgentConfigError (worker ghi skipped rồi
 * dừng) thay vì ném lỗi lạ khiến BullMQ retry vô ích tới hết attempts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const registryMock = {
  resolveProviderApiKey: vi.fn(),
  getProviderBaseUrl: vi.fn(),
};
const chatMock = vi.fn(() => ({ modelId: 'stub' }));
const createOpenRouterMock = vi.fn(() => ({ chat: chatMock }));

vi.mock('../src/modules/ai/provider-registry.js', () => registryMock);
vi.mock('@openrouter/ai-sdk-provider', () => ({ createOpenRouter: createOpenRouterMock }));

const { resolveAgentModel, isAgentProvider } = await import('../src/modules/ai-agent/ai-sdk-model.js');
const { AiAgentConfigError } = await import('../src/modules/ai-agent/ai-agent-errors.js');

beforeEach(() => {
  vi.clearAllMocks();
  registryMock.resolveProviderApiKey.mockResolvedValue('sk-or-test');
  registryMock.getProviderBaseUrl.mockResolvedValue('https://openrouter.ai/api/v1');
});

describe('isAgentProvider', () => {
  it('chỉ openrouter được hỗ trợ ở giai đoạn này', () => {
    expect(isAgentProvider('openrouter')).toBe(true);
    expect(isAgentProvider('anthropic')).toBe(false);
  });
});

describe('resolveAgentModel', () => {
  it('dựng model từ key + baseUrl per-org', async () => {
    await resolveAgentModel('org-1', 'openrouter', 'anthropic/claude-sonnet-4.5');

    expect(registryMock.resolveProviderApiKey).toHaveBeenCalledWith('org-1', 'openrouter');
    expect(createOpenRouterMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-or-test', baseURL: 'https://openrouter.ai/api/v1' }),
    );
    expect(chatMock).toHaveBeenCalledWith('anthropic/claude-sonnet-4.5');
  });

  it('thiếu API key → AiAgentConfigError(no_api_key)', async () => {
    registryMock.resolveProviderApiKey.mockResolvedValue('');
    await expect(resolveAgentModel('org-1', 'openrouter', 'model-x')).rejects.toBeInstanceOf(
      AiAgentConfigError,
    );
    await expect(resolveAgentModel('org-1', 'openrouter', 'model-x')).rejects.toMatchObject({
      skipReason: 'no_api_key',
    });
  });

  it('provider không hỗ trợ → AiAgentConfigError, không gọi registry', async () => {
    await expect(resolveAgentModel('org-1', 'anthropic', 'claude')).rejects.toBeInstanceOf(
      AiAgentConfigError,
    );
    expect(registryMock.resolveProviderApiKey).not.toHaveBeenCalled();
  });

  it('chưa chọn model → AiAgentConfigError', async () => {
    await expect(resolveAgentModel('org-1', 'openrouter', '  ')).rejects.toBeInstanceOf(
      AiAgentConfigError,
    );
  });

  it('gửi header nhận diện app cho OpenRouter', async () => {
    await resolveAgentModel('org-1', 'openrouter', 'model-x');
    const opts = createOpenRouterMock.mock.calls[0][0] as { headers: Record<string, string> };
    expect(opts.headers['X-Title']).toBe('Zalo CRM AI Agent');
    expect(opts.headers['HTTP-Referer']).toBeTruthy();
  });
});
