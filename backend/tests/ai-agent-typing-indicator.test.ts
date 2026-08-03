/**
 * ai-agent-typing-indicator.test.ts — vòng ping giữ bubble "đang soạn tin".
 *
 * Ba thứ file này bảo vệ, đều là lỗi im lặng nếu vỡ:
 *  1. Ping ĐẦU phát ra ngay — trễ một chu kỳ là mất đúng khoảng khách dễ bỏ đi nhất.
 *  2. Vòng lặp dừng hẳn ở mọi lối thoát — rò một timer là bubble treo và ping tiếp tục đốt
 *     hạn mức chat_action (500/ngày, dùng chung với thả cảm xúc / xoá tin / báo đã xem).
 *  3. Ping lỗi không được văng ra ngoài — nick rớt kết nối giữa chừng chỉ được mất bubble,
 *     không được làm hỏng lượt trả lời khách.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendTypingEventMock = vi.fn();

vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: { sendTypingEvent: (...args: unknown[]) => sendTypingEventMock(...args) },
}));

const { startTypingIndicator } = await import('../src/modules/ai-agent/typing-indicator.js');

const OPTS = { accountId: 'acc-1', threadId: 'thread-1', threadType: 0 as const };

/** Cùng con số với module: chu kỳ 5s, tối đa 5 ping. */
const INTERVAL = 5_000;
const MAX_PINGS = 5;

beforeEach(() => {
  vi.useFakeTimers();
  sendTypingEventMock.mockReset();
  sendTypingEventMock.mockResolvedValue({ status: 0 });
  delete process.env.AUTOMATION_STUB_MODE;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startTypingIndicator', () => {
  it('ping ngay lập tức, không đợi hết chu kỳ đầu', () => {
    const stop = startTypingIndicator(OPTS);

    expect(sendTypingEventMock).toHaveBeenCalledTimes(1);
    expect(sendTypingEventMock).toHaveBeenCalledWith('acc-1', 'thread-1', 0);

    stop();
  });

  it('ping lại theo chu kỳ trong lúc agent còn đang soạn', async () => {
    const stop = startTypingIndicator(OPTS);

    await vi.advanceTimersByTimeAsync(INTERVAL * 2);

    expect(sendTypingEventMock).toHaveBeenCalledTimes(3); // ngay + 2 nhịp
    stop();
  });

  it('dừng hẳn sau stop(), không còn ping nào', async () => {
    const stop = startTypingIndicator(OPTS);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    const before = sendTypingEventMock.mock.calls.length;

    stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(sendTypingEventMock).toHaveBeenCalledTimes(before);
  });

  it('gọi stop() nhiều lần không lỗi', async () => {
    const stop = startTypingIndicator(OPTS);
    stop();
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(sendTypingEventMock).toHaveBeenCalledTimes(1);
  });

  it('tự dừng khi chạm trần số ping — lượt chạy lâu không được đốt hết hạn mức', async () => {
    const stop = startTypingIndicator(OPTS);

    // Chạy lâu gấp nhiều lần thời gian một lượt trả lời bình thường.
    await vi.advanceTimersByTimeAsync(INTERVAL * 20);

    expect(sendTypingEventMock).toHaveBeenCalledTimes(MAX_PINGS);
    stop();
  });

  it('ping lỗi thì nuốt, không văng ra ngoài và vòng lặp vẫn chạy tiếp', async () => {
    sendTypingEventMock.mockRejectedValue(new Error('Zalo account not connected'));

    const stop = startTypingIndicator(OPTS);
    await vi.advanceTimersByTimeAsync(INTERVAL * 2);

    expect(sendTypingEventMock).toHaveBeenCalledTimes(3);
    stop();
  });

  it('chế độ mô phỏng không gọi SDK', async () => {
    process.env.AUTOMATION_STUB_MODE = 'true';

    const stop = startTypingIndicator(OPTS);
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(sendTypingEventMock).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});
