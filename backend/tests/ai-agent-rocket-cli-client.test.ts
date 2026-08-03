/**
 * ai-agent-rocket-cli-client.test.ts — đường gọi Rocket bằng CLI (`hermes -p … -z …`).
 *
 * Trọng tâm: tham số dựng đúng, hội thoại ép thành prompt không mất nhãn ai-nói-gì, và
 * mọi kiểu hỏng của tiến trình con đều thành RocketAgentError có `kind` — agent-runner
 * chỉ nhìn `kind` để quyết fallback, sai chỗ này là khách bị bỏ rơi im lặng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promisify } from 'node:util';

const execFileMock = vi.fn();

// Giữ đúng hợp đồng promisify.custom của Node: trả { stdout, stderr }, không phải chuỗi.
const execFileStub: any = (...args: unknown[]) => execFileMock(...args);
execFileStub[promisify.custom] = async (...args: unknown[]) => ({
  stdout: await new Promise<string>((resolve, reject) => {
    execFileMock(...args, (err: unknown, stdout: string) => (err ? reject(err) : resolve(stdout)));
  }),
  stderr: '',
});

vi.mock('node:child_process', () => ({ execFile: execFileStub }));

// Probe ở chế độ CLI đối chiếu danh sách profile đọc từ đĩa — mock ở biên module để test
// này chỉ nói về hành vi của rocket-cli-client, không phụ thuộc thư mục thật.
const listProfilesMock = vi.fn();
vi.mock('../src/modules/ai-agent/rocket-profile.js', () => ({
  listRocketProfiles: (...args: unknown[]) => listProfilesMock(...args),
  isValidRocketProfileFormat: (v: string) => /^[a-z0-9][a-z0-9_-]*$/.test(v),
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { callRocketAgentCli, probeRocketAgentCli, buildOneshotPrompt } = await import(
  '../src/modules/ai-agent/rocket-cli-client.js'
);
const { RocketAgentError } = await import('../src/modules/ai-agent/rocket-types.js');

/** stdout của `hermes -z` là câu trả lời thuần, không banner. */
function cliReplies(text: string) {
  execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) =>
    cb(null, text),
  );
}

function cliFails(err: Record<string, unknown>) {
  execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) =>
    cb(Object.assign(new Error(String(err.message ?? 'lỗi')), err)),
  );
}

const BASE_INPUT = {
  profile: 'tuvan-bds',
  model: '',
  system: 'Bạn là nhân viên tư vấn.',
  messages: [{ role: 'user' as const, content: 'Giá bao nhiêu?' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildOneshotPrompt', () => {
  it('tách tin mới ra khỏi khối lịch sử, giữ nhãn từng lượt', () => {
    const prompt = buildOneshotPrompt('SYSTEM', [
      { role: 'user', content: 'chào shop' },
      { role: 'assistant', content: 'em chào anh' },
      { role: 'user', content: 'còn hàng không' },
    ]);

    expect(prompt).toContain('SYSTEM');
    expect(prompt).toContain('Khách: chào shop');
    expect(prompt).toContain('Bạn: em chào anh');
    // Tin cuối phải nằm ngoài khối lịch sử, nếu không model dễ trả lời nhầm câu cũ.
    const historyAt = prompt.indexOf('--- Hội thoại trước đó ---');
    const latestAt = prompt.indexOf('--- Tin nhắn mới của khách ---');
    expect(historyAt).toBeGreaterThan(-1);
    expect(latestAt).toBeGreaterThan(historyAt);
    expect(prompt.slice(historyAt, latestAt)).not.toContain('còn hàng không');
  });

  it('hội thoại chỉ có 1 tin → không sinh khối lịch sử rỗng', () => {
    const prompt = buildOneshotPrompt('SYSTEM', [{ role: 'user', content: 'alo' }]);
    expect(prompt).not.toContain('Hội thoại trước đó');
    expect(prompt).toContain('alo');
  });
});

describe('callRocketAgentCli', () => {
  it('dựng đúng tham số CLI và chạy ở thư mục tạm, không phải thư mục backend', async () => {
    cliReplies('Dạ giá 2 tỷ ạ.\n');

    const res = await callRocketAgentCli(BASE_INPUT);

    const [, args, opts] = execFileMock.mock.calls[0] as [string, string[], { cwd: string }];
    expect(args.slice(0, 2)).toEqual(['-p', 'tuvan-bds']);
    expect(args[2]).toBe('-z');
    expect(args[3]).toContain('Giá bao nhiêu?');
    // Spawn từ repo là agent nuốt AGENTS.md/.cursorrules của repo vào prompt khách hàng.
    expect(opts.cwd).not.toBe(process.cwd());
    expect(res.text).toBe('Dạ giá 2 tỷ ạ.');
  });

  it('profile rỗng → bỏ cờ -p (dùng profile mặc định của máy)', async () => {
    cliReplies('ok');
    await callRocketAgentCli({ ...BASE_INPUT, profile: null });
    expect((execFileMock.mock.calls[0][1] as string[]).includes('-p')).toBe(false);
  });

  it('có model → thêm -m, và báo lại đúng model đó', async () => {
    cliReplies('ok');
    const res = await callRocketAgentCli({ ...BASE_INPUT, model: 'MiniMax-M3' });
    expect(execFileMock.mock.calls[0][1]).toContain('-m');
    expect(res.model).toBe('MiniMax-M3');
  });

  it('không có model → nhật ký ghi profile để biết ai trả lời', async () => {
    cliReplies('ok');
    const res = await callRocketAgentCli(BASE_INPUT);
    expect(res.model).toBe('rocket:tuvan-bds');
  });

  it('không có số token — đường CLI không trả usage', async () => {
    cliReplies('ok');
    const res = await callRocketAgentCli(BASE_INPUT);
    expect(res.promptTokens).toBeNull();
    expect(res.completionTokens).toBeNull();
  });

  it('thiếu lệnh hermes → kind "connection" kèm hướng dẫn ROCKET_AGENT_CLI', async () => {
    cliFails({ code: 'ENOENT', message: 'spawn hermes ENOENT' });
    const err = await callRocketAgentCli(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(RocketAgentError);
    expect(err.kind).toBe('connection');
    expect(err.message).toContain('ROCKET_AGENT_CLI');
  });

  it('quá thời gian chờ → kind "timeout" (agent-runner dựa vào đúng kind này)', async () => {
    cliFails({ killed: true, message: 'timeout' });
    const err = await callRocketAgentCli(BASE_INPUT).catch((e) => e);
    expect(err.kind).toBe('timeout');
  });

  it('exit code khác 0 → kind "http", giữ lời báo lỗi của CLI', async () => {
    cliFails({ code: 1, stderr: "Error: Profile 'x' does not exist." });
    const err = await callRocketAgentCli(BASE_INPUT).catch((e) => e);
    expect(err.kind).toBe('http');
    expect(err.status).toBe(1);
    expect(err.message).toContain('does not exist');
  });

  it('stdout rỗng → kind "empty", không trả chuỗi rỗng cho khách', async () => {
    cliReplies('   \n');
    const err = await callRocketAgentCli(BASE_INPUT).catch((e) => e);
    expect(err.kind).toBe('empty');
  });
});

/*
 * Danh sách profile nay đọc từ THƯ MỤC cấu hình của Rocket, không phải `hermes profile
 * list` — backend trong container không spawn được CLI của host. Probe ở chế độ CLI vì
 * thế chỉ đối chiếu danh sách đó, không chạy thật một lượt agent (tốn 10-90 giây + token).
 */
describe('probeRocketAgentCli', () => {
  it('profile có trong danh sách → ok kể cả khi gateway đang tắt', async () => {
    listProfilesMock.mockResolvedValue({
      ok: true,
      message: 'ok',
      profiles: [
        { name: 'tuvan-bds', model: 'MiniMax-M3', gateway: 'stopped', apiServerEnabled: false, port: null, hasKey: false },
      ],
    });

    const res = await probeRocketAgentCli('tuvan-bds');

    expect(res).toMatchObject({ ok: true, status: 'ok', models: ['MiniMax-M3'] });
    expect(res.message).toContain('CLI');
    // Không chạy thử lượt agent nào.
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('profile không tồn tại → unknown_profile, không chạy thử lượt agent', async () => {
    listProfilesMock.mockResolvedValue({
      ok: true,
      message: 'ok',
      profiles: [
        { name: 'tuvan-bds', model: 'MiniMax-M3', gateway: 'running', apiServerEnabled: true, port: 8642, hasKey: true },
      ],
    });

    const res = await probeRocketAgentCli('khong-co');

    expect(res.status).toBe('unknown_profile');
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('không đọc được thư mục profile → unreachable kèm lời chẩn đoán', async () => {
    listProfilesMock.mockResolvedValue({
      ok: false,
      profiles: [],
      message: 'Không thấy thư mục profile Rocket "/rocket-profiles".',
    });

    const res = await probeRocketAgentCli('tuvan-bds');

    expect(res).toMatchObject({ ok: false, status: 'unreachable' });
    expect(res.message).toContain('/rocket-profiles');
  });
});
