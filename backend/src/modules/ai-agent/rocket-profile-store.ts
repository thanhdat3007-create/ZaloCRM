// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * rocket-profile-store.ts — đọc thông tin profile Rocket THẲNG TỪ THƯ MỤC CẤU HÌNH
 * (`~/.rocketagent/profiles/<tên>/`), không chạy CLI.
 *
 * Vì sao không dùng `hermes profile list`: backend chạy trong container còn Rocket chạy
 * trên host — container không spawn được tiến trình của host, nên đường CLI chết hẳn ở
 * mô hình triển khai này. Thư mục profile thì mount read-only vào được, và còn nhiều
 * thông tin hơn cả CLI:
 *
 *   config.yaml         → platforms.api_server: enabled + host/port/key/model_name
 *   gateway_state.json  → gateway_state (running/stopped) + trạng thái từng platform
 *
 * Nhờ có port + key theo từng profile, backend tự dựng đúng base URL cho mỗi agent —
 * đây là điểm mấu chốt: Rocket KHÔNG có gateway đa-profile định tuyến theo path
 * (`/p/<tên>/v1/...` luôn trả 404), mỗi profile là một `api_server` riêng trên một cổng
 * riêng.
 *
 * Bảo mật: khoá `api_server.key` chỉ tồn tại trong tiến trình backend để gắn header
 * Authorization — `listRocketProfileRecords()` trả `hasKey: boolean`, KHÔNG trả khoá.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { isValidRocketProfileFormat } from './rocket-profile-name.js';

/** Một profile đọc được từ đĩa. `apiKey` không bao giờ rời khỏi backend. */
export interface RocketProfileRecord {
  name: string;
  /** platforms.api_server.enabled — false = profile này không mở cổng HTTP nào. */
  apiServerEnabled: boolean;
  /** Cổng api_server khai trong config.yaml; null khi không khai. */
  port: number | null;
  /** Host api_server tự bind (thường 127.0.0.1) — chỉ để hiển thị, xem ghi chú ở `buildBaseUrl`. */
  configuredHost: string | null;
  /** model_name của api_server = alias model gửi trong body chat. */
  defaultModel: string | null;
  /** Có khoá API trong config.yaml hay không (KHÔNG trả về giá trị khoá). */
  hasKey: boolean;
  /** gateway_state.json → 'running' | 'stopped' | null (chưa từng chạy / không đọc được). */
  gatewayState: string | null;
  /** Khoá thật — chỉ dùng nội bộ backend, bị loại khi trả ra API (xem toPublicInfo). */
  apiKey: string;
}

export interface RocketProfileStoreResult {
  ok: boolean;
  profiles: RocketProfileRecord[];
  /** Thông báo tiếng Việt viết sẵn cho UI hiển thị thẳng. */
  message: string;
}

/**
 * Cache ngắn: mỗi tin nhắn khách gửi đều phải giải profile → endpoint, đọc đĩa mỗi lượt là
 * phí. 30 giây đủ để admin sửa config.yaml rồi bấm "tải lại danh sách" (hàm đó xoá cache)
 * mà không phải chờ, đồng thời không giữ khoá cũ quá lâu sau khi Rocket xoay khoá.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; result: RocketProfileStoreResult } | null = null;

export function clearRocketProfileCache(): void {
  cache = null;
}

/** Đọc `platforms.api_server` từ config.yaml đã parse. Trả null khi thiếu khối này. */
function readApiServerBlock(doc: unknown): {
  enabled: boolean;
  host: string | null;
  port: number | null;
  key: string;
  modelName: string | null;
} | null {
  if (typeof doc !== 'object' || doc === null) return null;
  const platforms = (doc as Record<string, unknown>).platforms;
  if (typeof platforms !== 'object' || platforms === null) return null;
  const apiServer = (platforms as Record<string, unknown>).api_server;
  if (typeof apiServer !== 'object' || apiServer === null) return null;

  const block = apiServer as Record<string, unknown>;
  const extra = (typeof block.extra === 'object' && block.extra !== null ? block.extra : {}) as Record<
    string,
    unknown
  >;
  const rawPort = extra.port;
  const port = typeof rawPort === 'number' ? rawPort : Number.parseInt(String(rawPort ?? ''), 10);

  return {
    enabled: block.enabled === true,
    host: typeof extra.host === 'string' ? extra.host : null,
    port: Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null,
    key: typeof extra.key === 'string' ? extra.key : '',
    modelName: typeof extra.model_name === 'string' && extra.model_name ? extra.model_name : null,
  };
}

/** Trạng thái gateway từ gateway_state.json. File thiếu = profile chưa từng chạy → null. */
async function readGatewayState(profileDir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(profileDir, 'gateway_state.json'), 'utf8');
    const parsed = JSON.parse(raw) as { gateway_state?: unknown };
    return typeof parsed.gateway_state === 'string' ? parsed.gateway_state : null;
  } catch {
    return null;
  }
}

async function readOneProfile(dir: string, name: string): Promise<RocketProfileRecord | null> {
  let doc: unknown;
  try {
    doc = parseYaml(await readFile(join(dir, name, 'config.yaml'), 'utf8'));
  } catch {
    // Thư mục con không phải profile (hoặc config.yaml hỏng) → bỏ qua im lặng: thiếu một
    // dòng trong dropdown còn hơn làm hỏng cả danh sách vì một file lạ.
    return null;
  }

  const api = readApiServerBlock(doc);
  return {
    name,
    apiServerEnabled: api?.enabled ?? false,
    port: api?.port ?? null,
    configuredHost: api?.host ?? null,
    defaultModel: api?.modelName ?? null,
    hasKey: Boolean(api?.key),
    gatewayState: await readGatewayState(join(dir, name)),
    apiKey: api?.key ?? '',
  };
}

/**
 * Đọc toàn bộ profile trong `ROCKET_PROFILES_DIR`. KHÔNG ném lỗi: thư mục chưa mount là
 * thông tin chẩn đoán để hiện cho admin, không phải lỗi của request — UI vẫn cho gõ tay
 * tên profile và rơi về ROCKET_AGENT_BASE_URL trong .env.
 */
export async function listRocketProfileRecords(): Promise<RocketProfileStoreResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;

  const dir = config.rocketProfilesDir;
  let entries: string[];
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message =
      code === 'ENOENT'
        ? `Không thấy thư mục profile Rocket "${dir}". Backend chạy trong Docker thì phải mount ` +
          'thư mục ~/.rocketagent/profiles của máy host vào container (xem docker-compose.yml).'
        : `Không đọc được thư mục profile Rocket "${dir}": ${(err as Error).message}`;
    logger.warn('[ai-agent] %s', message);
    const result: RocketProfileStoreResult = { ok: false, profiles: [], message };
    cache = { at: Date.now(), result };
    return result;
  }

  const records = (
    await Promise.all(
      entries
        .filter((name) => isValidRocketProfileFormat(name))
        .map((name) => readOneProfile(dir, name)),
    )
  ).filter((p): p is RocketProfileRecord => p !== null);

  records.sort((a, b) => a.name.localeCompare(b.name));

  const result: RocketProfileStoreResult = records.length
    ? { ok: true, profiles: records, message: `Đọc được ${records.length} profile từ "${dir}".` }
    : {
        ok: false,
        profiles: [],
        message: `Thư mục "${dir}" chưa có profile Rocket nào. Tạo bằng: hermes profile create <tên>`,
      };

  cache = { at: Date.now(), result };
  return result;
}

/** Kết quả giải một tên profile thành endpoint gọi được. */
export type RocketEndpointResolution =
  | { ok: true; baseUrl: string; apiKey: string; defaultModel: string | null; source: 'profile' | 'env' }
  | { ok: false; reason: 'not_found' | 'api_server_off' | 'no_port'; message: string };

/**
 * Host để gọi tới: config.yaml luôn ghi `127.0.0.1` vì đó là host Rocket *bind*, nhưng
 * từ trong container 127.0.0.1 là chính container. `ROCKET_AGENT_HOST` cho phép trỏ sang
 * `host.docker.internal` mà vẫn giữ đúng cổng riêng của từng profile.
 */
function buildBaseUrl(port: number): string {
  return `http://${config.rocketAgentHost}:${port}`;
}

/**
 * Giải tên profile → base URL + khoá của chính profile đó.
 *
 * Không tìm thấy profile trong thư mục (hoặc tên rỗng) → rơi về ROCKET_AGENT_BASE_URL
 * trong .env. Nhờ vậy cấu hình cũ (một gateway duy nhất khai bằng env) vẫn chạy, và
 * profile `default` — nằm ở ~/.rocketagent/config.yaml chứ không nằm trong profiles/ —
 * vẫn dùng được.
 */
export async function resolveRocketEndpoint(profile: string | null): Promise<RocketEndpointResolution> {
  const name = profile?.trim() || '';
  const envFallback: RocketEndpointResolution = {
    ok: true,
    baseUrl: config.rocketAgentBaseUrl,
    apiKey: config.rocketAgentApiKey,
    defaultModel: null,
    source: 'env',
  };

  if (!name) return envFallback;

  const { profiles } = await listRocketProfileRecords();
  const record = profiles.find((p) => p.name === name);
  if (!record) return envFallback;

  if (!record.apiServerEnabled) {
    return {
      ok: false,
      reason: 'api_server_off',
      message:
        `Profile "${name}" chưa bật cổng API của Rocket (platforms.api_server.enabled = false), ` +
        'nên không có địa chỉ nào để gọi. Bật api_server cho profile này rồi chạy: ' +
        `hermes gateway start`,
    };
  }
  if (!record.port) {
    return {
      ok: false,
      reason: 'no_port',
      message: `Profile "${name}" bật api_server nhưng không khai cổng (platforms.api_server.extra.port).`,
    };
  }

  return {
    ok: true,
    baseUrl: buildBaseUrl(record.port),
    apiKey: record.apiKey,
    defaultModel: record.defaultModel,
    source: 'profile',
  };
}
