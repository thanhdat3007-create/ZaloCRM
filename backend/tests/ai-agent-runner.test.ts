/**
 * ai-agent-runner.test.ts — 2 engine + vòng dự phòng (fallback) 1 cấp.
 *
 * Rủi ro lớn nhất của kiến trúc Rocket local: gateway tắt là MỌI nick dùng Rocket im
 * lặng hoàn toàn. Test này khoá đúng 3 bất biến của cơ chế cứu tin:
 *   1. Fallback kích hoạt với MỌI lỗi của engine chính (kể cả lỗi cấu hình).
 *   2. Lỗi GỐC không bao giờ bị nuốt — worker (agent-reply-worker.ts) dựa vào
 *      `primaryError` để ghi AiAgentRun.error dù status vẫn 'sent'.
 *   3. Engine rocket KHÔNG retry (agent chạy tool có side effect) — chỉ engine
 *      openrouter mới thử lại 1 lần.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateObjectMock = vi.fn();
vi.mock('ai', () => ({ generateObject: generateObjectMock }));

const resolveAgentModelMock = vi.fn();
vi.mock('../src/modules/ai-agent/ai-sdk-model.js', () => ({
  resolveAgentModel: resolveAgentModelMock,
}));

const callRocketAgentMock = vi.fn();
// Giữ NGUYÊN class RocketAgentError thật (qua importActual) — agent-runner.ts phân
// loại lỗi bằng `instanceof RocketAgentError` + `.kind`, mock giả class sẽ làm gãy hết
// nhánh phân loại.
const rocketClientActual = await vi.importActual<
  typeof import('../src/modules/ai-agent/rocket-agent-client.js')
>('../src/modules/ai-agent/rocket-agent-client.js');
vi.mock('../src/modules/ai-agent/rocket-agent-client.js', () => ({
  callRocketAgent: callRocketAgentMock,
  RocketAgentError: rocketClientActual.RocketAgentError,
}));

vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { generateAgentReply, RocketTimeoutExhaustedError, __testing } = await import(
  '../src/modules/ai-agent/agent-runner.js'
);
const { RocketAgentError } = rocketClientActual;
const { AiAgentConfigError } = await import('../src/modules/ai-agent/ai-agent-errors.js');

const PROMPT = {
  system: 'Bạn là trợ lý bán hàng.',
  messages: [{ role: 'user' as const, content: 'giá bao nhiêu' }],
  chunkIds: [],
};

function makeAgent(over: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    name: 'Tư vấn',
    provider: 'rocket',
    model: 'rocket-zalo',
    rocketProfile: 'tuvan-bds',
    fallbackProvider: null,
    fallbackModel: null,
    temperature: 0.6,
    maxTokens: 600,
    ...over,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateAgentReply — engine rocket', () => {
  it('rocket trả lời OK → không fallback, usedModel là model Rocket báo về', async () => {
    callRocketAgentMock.mockResolvedValue({
      text: 'Dạ giá 500k ạ',
      promptTokens: 12,
      completionTokens: 6,
      model: 'rocket-zalo-v2',
    });

    const agent = makeAgent();
    const reply = await generateAgentReply('org-1', agent, PROMPT as any);

    expect(reply).toMatchObject({
      reply: 'Dạ giá 500k ạ',
      handoff: false,
      handoffReason: null,
      usedModel: 'rocket-zalo-v2',
      fallbackUsed: false,
      primaryError: null,
    });
    expect(callRocketAgentMock).toHaveBeenCalledWith({
      profile: 'tuvan-bds',
      model: 'rocket-zalo',
      system: PROMPT.system,
      messages: [{ role: 'user', content: 'giá bao nhiêu' }],
    });
    // Rocket không retry — chỉ gọi đúng 1 lần dù thành công.
    expect(callRocketAgentMock).toHaveBeenCalledTimes(1);
  });

  it('rocket lỗi, KHÔNG retry (agent có tool side effect)', async () => {
    callRocketAgentMock.mockRejectedValue(new RocketAgentError('ECONNREFUSED', 'connection'));

    await expect(generateAgentReply('org-1', makeAgent(), PROMPT as any)).rejects.toThrow();
    expect(callRocketAgentMock).toHaveBeenCalledTimes(1);
  });
});

describe('generateAgentReply — vòng dự phòng 1 cấp', () => {
  it('rocket lỗi + fallback openrouter OK → fallbackUsed=true, primaryError giữ lỗi gốc, usedModel là model fallback', async () => {
    callRocketAgentMock.mockRejectedValue(
      new RocketAgentError('Không kết nối được tới Rocket Agent: ECONNREFUSED', 'connection'),
    );
    resolveAgentModelMock.mockResolvedValue({ modelId: 'stub-fallback-model' });
    generateObjectMock.mockResolvedValue({
      object: { reply: 'Dạ giá 500k ạ (dự phòng)', handoff: false, handoffReason: undefined },
      usage: { inputTokens: 20, outputTokens: 8 },
    });

    const agent = makeAgent({ fallbackProvider: 'openrouter', fallbackModel: 'anthropic/claude-haiku-4.5' });
    const reply = await generateAgentReply('org-1', agent, PROMPT as any);

    expect(reply.fallbackUsed).toBe(true);
    expect(reply.usedModel).toBe('anthropic/claude-haiku-4.5');
    expect(reply.reply).toBe('Dạ giá 500k ạ (dự phòng)');
    expect(reply.primaryError).toMatch(/ECONNREFUSED/);
    // resolveAgentModel LUÔN nhận 'openrouter' cứng cho engine openrouter, bất kể agent
    // đang cấu hình provider CHÍNH là gì.
    expect(resolveAgentModelMock).toHaveBeenCalledWith('org-1', 'openrouter', 'anthropic/claude-haiku-4.5');
  });

  it('rocket lỗi + không cấu hình fallback → ném đúng lỗi gốc, không gọi engine dự phòng', async () => {
    const primaryErr = new RocketAgentError('Rocket Agent trả về HTTP 404', 'http', 404);
    callRocketAgentMock.mockRejectedValue(primaryErr);

    const agent = makeAgent(); // fallbackProvider/fallbackModel = null
    await expect(generateAgentReply('org-1', agent, PROMPT as any)).rejects.toBe(primaryErr);
    expect(resolveAgentModelMock).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('cả 2 engine đều lỗi → thông điệp ném ra chứa cả 2 lỗi', async () => {
    callRocketAgentMock.mockRejectedValue(new RocketAgentError('Rocket sập', 'connection'));
    resolveAgentModelMock.mockResolvedValue({ modelId: 'stub-fallback-model' });
    generateObjectMock.mockRejectedValue(Object.assign(new Error('OpenRouter 500'), { status: 500 }));

    const agent = makeAgent({ fallbackProvider: 'openrouter', fallbackModel: 'anthropic/claude-haiku-4.5' });
    await expect(generateAgentReply('org-1', agent, PROMPT as any)).rejects.toThrow(
      /Rocket sập.*OpenRouter 500/s,
    );
  });

  it('fallback KHÔNG khả dụng (thiếu key org) → ném lỗi GỐC của engine chính, không phải AiAgentConfigError', async () => {
    const primaryErr = new RocketAgentError('Rocket sập', 'connection');
    callRocketAgentMock.mockRejectedValue(primaryErr);
    resolveAgentModelMock.mockRejectedValue(
      new AiAgentConfigError('Chưa có API key OpenRouter cho tổ chức này.', 'no_api_key'),
    );

    const agent = makeAgent({ fallbackProvider: 'openrouter', fallbackModel: 'anthropic/claude-haiku-4.5' });
    await expect(generateAgentReply('org-1', agent, PROMPT as any)).rejects.toBe(primaryErr);
  });

  it('rocket timeout + không cứu được → ném RocketTimeoutExhaustedError (đánh dấu cho agent-reply-queue.ts KHÔNG retry)', async () => {
    callRocketAgentMock.mockRejectedValue(
      new RocketAgentError('Rocket Agent không phản hồi trong thời gian chờ.', 'timeout'),
    );

    const agent = makeAgent(); // không fallback
    await expect(generateAgentReply('org-1', agent, PROMPT as any)).rejects.toBeInstanceOf(
      RocketTimeoutExhaustedError,
    );
  });

  it('timeout nhưng CÓ fallback cứu được → không ném RocketTimeoutExhaustedError, trả lời bình thường', async () => {
    callRocketAgentMock.mockRejectedValue(
      new RocketAgentError('Rocket Agent không phản hồi trong thời gian chờ.', 'timeout'),
    );
    resolveAgentModelMock.mockResolvedValue({ modelId: 'stub' });
    generateObjectMock.mockResolvedValue({
      object: { reply: 'Dạ đợi em kiểm tra ạ', handoff: false, handoffReason: undefined },
      usage: { inputTokens: 5, outputTokens: 5 },
    });

    const agent = makeAgent({ fallbackProvider: 'openrouter', fallbackModel: 'anthropic/claude-haiku-4.5' });
    const reply = await generateAgentReply('org-1', agent, PROMPT as any);
    expect(reply.fallbackUsed).toBe(true);
  });
});

describe('generateAgentReply — engine openrouter (đường cũ, không đổi hành vi)', () => {
  it('thành công → usedModel = agent.model, fallbackUsed=false', async () => {
    resolveAgentModelMock.mockResolvedValue({ modelId: 'stub' });
    generateObjectMock.mockResolvedValue({
      object: { reply: 'Dạ vâng ạ', handoff: false, handoffReason: undefined },
      usage: { inputTokens: 10, outputTokens: 4 },
    });

    const agent = makeAgent({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' });
    const reply = await generateAgentReply('org-1', agent, PROMPT as any);

    expect(reply.usedModel).toBe('anthropic/claude-sonnet-4.5');
    expect(reply.fallbackUsed).toBe(false);
    expect(callRocketAgentMock).not.toHaveBeenCalled();
  });

  it('lỗi 5xx → thử lại đúng 1 lần rồi mới thành công', async () => {
    resolveAgentModelMock.mockResolvedValue({ modelId: 'stub' });
    generateObjectMock
      .mockRejectedValueOnce(Object.assign(new Error('tạm lỗi'), { status: 503 }))
      .mockResolvedValueOnce({
        object: { reply: 'Dạ vâng ạ', handoff: false, handoffReason: undefined },
        usage: { inputTokens: 10, outputTokens: 4 },
      });

    const agent = makeAgent({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' });
    const reply = await generateAgentReply('org-1', agent, PROMPT as any);

    expect(reply.reply).toBe('Dạ vâng ạ');
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it('reply rỗng → handoff=true dù model không tự đặt cờ', async () => {
    resolveAgentModelMock.mockResolvedValue({ modelId: 'stub' });
    generateObjectMock.mockResolvedValue({
      object: { reply: '   ', handoff: false, handoffReason: undefined },
      usage: { inputTokens: 10, outputTokens: 0 },
    });

    const agent = makeAgent({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' });
    const reply = await generateAgentReply('org-1', agent, PROMPT as any);
    expect(reply.handoff).toBe(true);
  });
});

describe('__testing.toRocketMessages', () => {
  it('map role user/assistant, bỏ role khác, ép content về string', () => {
    const out = __testing.toRocketMessages([
      { role: 'user', content: 'câu hỏi' } as any,
      { role: 'assistant', content: 'câu trả lời cũ' } as any,
      { role: 'system', content: 'nên bỏ' } as any,
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'câu hỏi' },
      { role: 'assistant', content: 'câu trả lời cũ' },
    ]);
  });
});

describe('__testing.hasFallbackConfigured', () => {
  it('openrouter cần cả provider lẫn model', () => {
    expect(__testing.hasFallbackConfigured(makeAgent({ fallbackProvider: 'openrouter', fallbackModel: null }))).toBe(
      false,
    );
    expect(
      __testing.hasFallbackConfigured(makeAgent({ fallbackProvider: null, fallbackModel: 'anthropic/x' })),
    ).toBe(false);
    expect(
      __testing.hasFallbackConfigured(
        makeAgent({ fallbackProvider: 'openrouter', fallbackModel: 'anthropic/x' }),
      ),
    ).toBe(true);
  });

  // Rocket bỏ trống model là hợp lệ (dùng model_name mặc định của Hermes). Nếu đòi model
  // thì cấu hình này bị tắt âm thầm — admin tưởng có lưới an toàn mà thực ra không có.
  it('rocket không cần model', () => {
    expect(__testing.hasFallbackConfigured(makeAgent({ fallbackProvider: 'rocket', fallbackModel: null }))).toBe(
      true,
    );
  });
});
