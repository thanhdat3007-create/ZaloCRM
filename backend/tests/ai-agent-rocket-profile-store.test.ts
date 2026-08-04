/**
 * ai-agent-rocket-profile-store.test.ts — đọc profile Rocket từ thư mục cấu hình.
 *
 * Trọng tâm: giải đúng tên profile → CỔNG RIÊNG của nó. Rocket không có gateway đa
 * profile định tuyến theo path (`/p/<tên>` luôn 404); mỗi profile là một api_server trên
 * một cổng. Giải sai cổng = gọi nhầm profile khác hoặc chết im, khách không được trả lời.
 *
 * Ca "có profile nhưng chưa bật api_server" được kiểm riêng: đây là bẫy hay gặp nhất —
 * `hermes profile create` KHÔNG kèm cổng HTTP, nên profile tồn tại mà vẫn không gọi được.
 *
 * Store quét NHIỀU thư mục (`~/.rocketagent/profiles` + `~/.hermes/profiles`) nên có thêm
 * nhóm ca cho phần gộp: đủ profile của cả hai bản cài, một thư mục thiếu không kéo theo
 * thư mục còn lại, và trùng tên phải giải ra CỐ ĐỊNH một cổng.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Thư mục quét TRƯỚC — đóng vai `~/.rocketagent/profiles`. */
let profilesDir = '';
/** Thư mục quét SAU — đóng vai `~/.hermes/profiles` (bản cài cũ). */
let hermesDir = '';

vi.mock('../src/config/index.js', () => ({
  config: {
    get rocketProfileDirs() {
      return [profilesDir, hermesDir];
    },
    rocketAgentHost: 'host.docker.internal',
    rocketAgentBaseUrl: 'http://127.0.0.1:8642',
    rocketAgentApiKey: 'env-key',
  },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  listRocketProfileRecords,
  resolveRocketEndpoint,
  clearRocketProfileCache,
} = await import('../src/modules/ai-agent/rocket-profile-store.js');

/** Dựng 1 profile trên đĩa đúng cấu trúc Rocket thật (platforms.api_server.extra). */
async function writeProfile(
  name: string,
  opts: {
    enabled?: boolean;
    port?: number | null;
    key?: string;
    model?: string;
    gateway?: string;
    /** Thư mục chứa profile; mặc định thư mục quét trước. */
    baseDir?: string;
  } = {},
): Promise<void> {
  const dir = join(opts.baseDir ?? profilesDir, name);
  await mkdir(dir, { recursive: true });

  const lines = ['model:', '  default: gpt-5.6-sol', 'platforms:'];
  if (opts.enabled !== undefined) {
    lines.push('  api_server:', `    enabled: ${opts.enabled}`, '    extra:', '      host: "127.0.0.1"');
    if (opts.port) lines.push(`      port: ${opts.port}`);
    if (opts.key) lines.push(`      key: ${opts.key}`);
    if (opts.model) lines.push(`      model_name: "${opts.model}"`);
  }
  await writeFile(join(dir, 'config.yaml'), lines.join('\n'), 'utf8');

  if (opts.gateway) {
    await writeFile(
      join(dir, 'gateway_state.json'),
      JSON.stringify({ pid: 1, gateway_state: opts.gateway }),
      'utf8',
    );
  }
}

beforeEach(async () => {
  profilesDir = await mkdtemp(join(tmpdir(), 'rocket-profiles-'));
  hermesDir = await mkdtemp(join(tmpdir(), 'hermes-profiles-'));
  clearRocketProfileCache();
});

afterEach(async () => {
  await rm(profilesDir, { recursive: true, force: true });
  await rm(hermesDir, { recursive: true, force: true });
});

describe('listRocketProfileRecords', () => {
  it('đọc cổng, model và trạng thái gateway của từng profile', async () => {
    await writeProfile('tony-fb-sp', {
      enabled: true,
      port: 8642,
      key: 'k1',
      model: 'hermes-cskh',
      gateway: 'running',
    });
    await writeProfile('lenxy-shop', { enabled: true, port: 8643, key: 'k2', model: 'hermes-lenxy' });

    const res = await listRocketProfileRecords();

    expect(res.ok).toBe(true);
    expect(res.profiles.map((p) => p.name)).toEqual(['lenxy-shop', 'tony-fb-sp']);
    const tony = res.profiles.find((p) => p.name === 'tony-fb-sp')!;
    expect(tony.port).toBe(8642);
    expect(tony.defaultModel).toBe('hermes-cskh');
    expect(tony.gatewayState).toBe('running');
    expect(tony.hasKey).toBe(true);
    // Gateway chưa từng chạy → không có gateway_state.json, KHÔNG được coi là 'stopped'.
    expect(res.profiles.find((p) => p.name === 'lenxy-shop')!.gatewayState).toBeNull();
  });

  it('profile không khai api_server vẫn được liệt kê nhưng đánh dấu chưa bật', async () => {
    await writeProfile('windy-city-icecream');

    const res = await listRocketProfileRecords();

    expect(res.profiles).toHaveLength(1);
    expect(res.profiles[0].apiServerEnabled).toBe(false);
    expect(res.profiles[0].port).toBeNull();
  });

  it('báo lỗi đọc được cho admin khi KHÔNG thư mục nào mount được, không ném exception', async () => {
    profilesDir = join(profilesDir, 'khong-ton-tai');
    hermesDir = join(hermesDir, 'khong-ton-tai');
    clearRocketProfileCache();

    const res = await listRocketProfileRecords();

    expect(res.ok).toBe(false);
    expect(res.profiles).toEqual([]);
    expect(res.message).toContain('mount');
  });

  it('bỏ qua thư mục con không phải profile thay vì hỏng cả danh sách', async () => {
    await writeProfile('tony-fb-sp', { enabled: true, port: 8642, key: 'k1' });
    await mkdir(join(profilesDir, 'khong-co-config'), { recursive: true });

    const res = await listRocketProfileRecords();

    expect(res.profiles.map((p) => p.name)).toEqual(['tony-fb-sp']);
  });

  // ── Gộp nhiều thư mục (~/.rocketagent + ~/.hermes) ────────────────────────
  //
  // Máy thật hay có cả hai bản cài, mỗi bản giữ profile riêng. Chỉ đọc một bên là
  // admin không thấy nửa số agent trong dropdown và tưởng profile đã mất.

  it('gộp profile của cả hai thư mục cài đặt', async () => {
    await writeProfile('tony-fb-sp', { enabled: true, port: 8642, key: 'k1' });
    await writeProfile('zalo-support', { baseDir: hermesDir, enabled: true, port: 8644, key: 'k3' });

    const res = await listRocketProfileRecords();

    expect(res.ok).toBe(true);
    expect(res.profiles.map((p) => p.name)).toEqual(['tony-fb-sp', 'zalo-support']);
    // Nhãn nguồn = tên thư mục cha, để UI phân biệt được hai bản cài.
    expect(new Set(res.profiles.map((p) => p.source)).size).toBe(2);
  });

  it('thiếu một thư mục vẫn đọc được profile của thư mục còn lại', async () => {
    await writeProfile('zalo-support', { baseDir: hermesDir, enabled: true, port: 8644, key: 'k3' });
    profilesDir = join(profilesDir, 'khong-ton-tai');
    clearRocketProfileCache();

    const res = await listRocketProfileRecords();

    expect(res.ok).toBe(true);
    expect(res.profiles.map((p) => p.name)).toEqual(['zalo-support']);
  });

  it('trùng tên giữa hai thư mục: thư mục quét trước thắng, không tạo dòng trùng', async () => {
    await writeProfile('video-editor', { enabled: true, port: 8642, key: 'k1' });
    await writeProfile('video-editor', { baseDir: hermesDir, enabled: true, port: 9999, key: 'k-cu' });

    const res = await listRocketProfileRecords();

    expect(res.profiles).toHaveLength(1);
    expect(res.profiles[0].port).toBe(8642);
    expect(res.message).toContain('trùng tên');
  });
});

describe('resolveRocketEndpoint', () => {
  it('dựng base URL từ cổng của chính profile, thay host bằng ROCKET_AGENT_HOST', async () => {
    await writeProfile('tony-fb-sp', { enabled: true, port: 8642, key: 'k1', model: 'hermes-cskh' });

    const res = await resolveRocketEndpoint('tony-fb-sp');

    expect(res).toMatchObject({
      ok: true,
      baseUrl: 'http://host.docker.internal:8642',
      apiKey: 'k1',
      defaultModel: 'hermes-cskh',
      source: 'profile',
    });
  });

  it('mỗi profile ra một cổng khác nhau', async () => {
    await writeProfile('tony-fb-sp', { enabled: true, port: 8642, key: 'k1' });
    await writeProfile('lenxy-shop', { enabled: true, port: 8643, key: 'k2' });

    const a = await resolveRocketEndpoint('tony-fb-sp');
    const b = await resolveRocketEndpoint('lenxy-shop');

    expect(a.ok && a.baseUrl).toBe('http://host.docker.internal:8642');
    expect(b.ok && b.baseUrl).toBe('http://host.docker.internal:8643');
    expect(a.ok && a.apiKey).not.toBe(b.ok && b.apiKey);
  });

  it('profile chưa bật api_server → hỏng có lý do, kèm cách sửa', async () => {
    await writeProfile('windy-city-icecream');

    const res = await resolveRocketEndpoint('windy-city-icecream');

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toBe('api_server_off');
    expect(res.ok === false && res.message).toContain('api_server');
  });

  it('giải được profile chỉ có ở thư mục cài đặt thứ hai', async () => {
    await writeProfile('zalo-support', { baseDir: hermesDir, enabled: true, port: 8644, key: 'k3' });

    const res = await resolveRocketEndpoint('zalo-support');

    expect(res).toMatchObject({ ok: true, baseUrl: 'http://host.docker.internal:8644', apiKey: 'k3' });
  });

  it('trùng tên hai thư mục → luôn ra cổng của thư mục quét trước', async () => {
    await writeProfile('video-editor', { enabled: true, port: 8642, key: 'k1' });
    await writeProfile('video-editor', { baseDir: hermesDir, enabled: true, port: 9999, key: 'k-cu' });

    const res = await resolveRocketEndpoint('video-editor');

    expect(res).toMatchObject({ ok: true, baseUrl: 'http://host.docker.internal:8642', apiKey: 'k1' });
  });

  it('tên rỗng hoặc profile lạ → rơi về cấu hình .env', async () => {
    await writeProfile('tony-fb-sp', { enabled: true, port: 8642, key: 'k1' });

    for (const name of ['', 'khong-co-thuc']) {
      const res = await resolveRocketEndpoint(name);
      expect(res).toMatchObject({ ok: true, baseUrl: 'http://127.0.0.1:8642', apiKey: 'env-key', source: 'env' });
    }
  });
});
