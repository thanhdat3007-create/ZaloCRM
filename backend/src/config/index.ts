// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * Centralized configuration loader.
 * All environment variables are read once at startup and typed here.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

// SECURITY FIX (A2): JWT_SECRET and ENCRYPTION_KEY must NOT fall back to dev
// defaults when NODE_ENV=production. Webhook signature forgery / token forgery
// possible if dev defaults leak to a prod container with missing env vars.
const isProd = process.env.NODE_ENV === 'production';

const DEV_JWT_FALLBACK = 'dev-secret-change-me';
const DEV_ENC_FALLBACK = 'dev-key-change-me-16b';

export function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return '';
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") return trimmed;
  const commentAt = trimmed.search(/\s+#/);
  return (commentAt >= 0 ? trimmed.slice(0, commentAt) : trimmed).trim();
}

function requireSecret(name: string, devFallback: string, value: string | undefined): string {
  if (isProd) {
    if (!value || value === devFallback || value.length < 32) {
      // Fail-fast: better to crash boot than run prod with forgeable secrets.
      throw new Error(
        `[config] FATAL: ${name} must be set (≥32 chars, not the dev default) when NODE_ENV=production. ` +
        `Set ${name} in environment before starting the server.`,
      );
    }
    return value;
  }
  return value || devFallback;
}

export const config = {
  port: parseInt(envValue('PORT') || '3000'),
  host: envValue('HOST') || '0.0.0.0',
  nodeEnv: envValue('NODE_ENV') || 'development',
  jwtSecret: requireSecret('JWT_SECRET', DEV_JWT_FALLBACK, envValue('JWT_SECRET')),
  encryptionKey: requireSecret('ENCRYPTION_KEY', DEV_ENC_FALLBACK, envValue('ENCRYPTION_KEY')),
  databaseUrl: envValue('DATABASE_URL') || 'postgresql://crmuser:password@localhost:5432/zalocrm',
  uploadDir: envValue('UPLOAD_DIR') || '/var/lib/zalo-crm/files',
  appUrl: envValue('APP_URL') || 'http://localhost:3000',

  /* --- Storage driver selection (2026-06-20) ---
   * local — lưu file lên ổ đĩa VPS (UPLOAD_DIR), serve qua route tĩnh /files.
   *         Mặc định: chạy ngay, không cần cấu hình R2.
   * r2    — lưu lên Cloudflare R2 (hoặc bất kỳ S3-compatible) qua AWS SDK v3.
   * Đổi driver = chỉ đổi 1 biến env này, không sửa code. */
  storageDriver: (() => {
    const v = (envValue('STORAGE_DRIVER') || 'local').toLowerCase();
    return v === 'r2' ? 'r2' : 'local';
  })() as 'local' | 'r2',

  /* Public base URL cho driver local — nơi route tĩnh /files phục vụ UPLOAD_DIR.
   * Mặc định bám APP_URL (Zalo CDN + trình duyệt tải ảnh qua đây). Đặt riêng nếu
   * file phục vụ qua host khác (vd Cloudflare Tunnel). KHÔNG có dấu / ở cuối. */
  localPublicUrl: (envValue('LOCAL_PUBLIC_URL') || `${envValue('APP_URL') || 'http://localhost:3000'}/files`).replace(/\/+$/, ''),

  /* --- S3 / R2 storage (dùng khi STORAGE_DRIVER=r2) ---
   * R2: s3Endpoint = https://<account>.r2.cloudflarestorage.com,
   *     s3Region   = auto,
   *     s3PublicUrl= domain công khai trỏ THẲNG vào bucket (KHÔNG kèm tên bucket). */
  s3Endpoint: envValue('S3_ENDPOINT') || 'http://localhost:9000',
  s3PublicUrl: (envValue('S3_PUBLIC_URL') || 'http://localhost:9000').replace(/\/+$/, ''),
  s3Bucket: envValue('S3_BUCKET') || 'zalocrm-attachments',
  s3AccessKey: envValue('S3_ACCESS_KEY') || 'minioadmin',
  s3SecretKey: envValue('S3_SECRET_KEY') || 'minioadmin',
  s3Region: envValue('S3_REGION') || 'us-east-1',

  aiDefaultProvider: envValue('AI_DEFAULT_PROVIDER') || 'anthropic',
  aiDefaultModel: envValue('AI_DEFAULT_MODEL') || 'claude-sonnet-4-6',

  /* Legacy keys (kept for backward compat) */
  anthropicApiKey: envValue('ANTHROPIC_API_KEY') || envValue('ANTHROPIC_AUTH_TOKEN') || '',
  geminiApiKey: envValue('GEMINI_API_KEY') || envValue('GEMINI_AUTH_TOKEN') || '',

  /* --- AI Provider configs --- */
  anthropicBaseUrl: envValue('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com',
  anthropicAuthToken: envValue('ANTHROPIC_AUTH_TOKEN') || envValue('ANTHROPIC_API_KEY') || '',
  anthropicDefaultOpusModel: envValue('ANTHROPIC_DEFAULT_OPUS_MODEL') || '',
  anthropicDefaultSonnetModel: envValue('ANTHROPIC_DEFAULT_SONNET_MODEL') || '',
  anthropicDefaultHaikuModel: envValue('ANTHROPIC_DEFAULT_HAIKU_MODEL') || '',

  geminiBaseUrl: envValue('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com',
  geminiAuthToken: envValue('GEMINI_AUTH_TOKEN') || envValue('GEMINI_API_KEY') || '',
  geminiDefaultProModel: envValue('GEMINI_DEFAULT_PRO_MODEL') || '',
  geminiDefaultFlashModel: envValue('GEMINI_DEFAULT_FLASH_MODEL') || '',

  openaiBaseUrl: envValue('OPENAI_BASE_URL') || 'https://api.openai.com',
  openaiAuthToken: envValue('OPENAI_AUTH_TOKEN') || '',
  openaiDefaultGpt4oModel: envValue('OPENAI_DEFAULT_GPT4O_MODEL') || '',
  openaiDefaultGpt4oMiniModel: envValue('OPENAI_DEFAULT_GPT4O_MINI_MODEL') || '',

  qwenBaseUrl: envValue('QWEN_BASE_URL') || 'https://dashscope.aliyuncs.com',
  qwenAuthToken: envValue('QWEN_AUTH_TOKEN') || '',
  qwenDefaultPlusModel: envValue('QWEN_DEFAULT_PLUS_MODEL') || '',
  qwenDefaultTurboModel: envValue('QWEN_DEFAULT_TURBO_MODEL') || '',
  qwenDefaultMaxModel: envValue('QWEN_DEFAULT_MAX_MODEL') || '',

  kimiBaseUrl: envValue('KIMI_BASE_URL') || 'https://api.moonshot.cn',
  kimiAuthToken: envValue('KIMI_AUTH_TOKEN') || '',
  kimiDefaultMoonshotV1Model: envValue('KIMI_DEFAULT_MOONSHOT_V1_MODEL') || '',

  openrouterBaseUrl: envValue('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1',
  openrouterAuthToken: envValue('OPENROUTER_API_KEY') || envValue('OPENROUTER_AUTH_TOKEN') || '',

  /* --- AI agent chăm sóc tự động --- */
  /** Kill switch mức tiến trình: false → worker không khởi động, không tin nào gửi đi. */
  aiAgentEnabled: (envValue('AI_AGENT_ENABLED') || 'false').toLowerCase() === 'true',
  /** Số job trả lời chạy song song. Giữ thấp để nhiều nick không bắn cùng lúc. */
  aiAgentWorkerConcurrency: Number(envValue('AI_AGENT_WORKER_CONCURRENCY') || '3'),
  /** Sau khi bàn giao người thật, tạm dừng agent trên hội thoại đó bao nhiêu phút. */
  aiAgentHandoffPauseMinutes: Number(envValue('AI_AGENT_HANDOFF_PAUSE_MIN') || '60'),
  /** Dùng cho header HTTP-Referer/X-Title của OpenRouter (nhận diện app trên dashboard). */
  aiAgentAppUrl: envValue('AI_AGENT_APP_URL') || 'https://github.com/rocket-ai-global/rocket-zalo-crm',

  /* --- Rocket Agent (hermes-agent chạy local, cổng OpenAI-compatible) ---
   * Mỗi profile Rocket là một api_server RIÊNG trên cổng riêng; backend đọc cổng + khoá
   * của từng profile từ ROCKET_PROFILES_DIR (rocket-profile-store.ts). Hai biến dưới đây
   * chỉ là ĐƯỜNG LÙI cho agent không khai profile, hoặc profile nằm ngoài thư mục đó
   * (vd profile `default` của Rocket). KHÔNG có "/v1" ở cuối.
   * Key cố định trong .env (không per-org): Rocket là hạ tầng local dùng chung,
   * không phải tài khoản của org (xem kiến trúc mục 5.3). */
  rocketAgentBaseUrl: envValue('ROCKET_AGENT_BASE_URL') || 'http://127.0.0.1:8642',
  rocketAgentApiKey: envValue('ROCKET_AGENT_API_KEY') || '',
  /** Thư mục profile của Rocket. Backend chạy trong Docker thì mount thư mục
   * ~/.rocketagent/profiles của host vào container rồi trỏ biến này vào chỗ mount. */
  rocketProfilesDir:
    envValue('ROCKET_PROFILES_DIR') || join(homedir(), '.rocketagent', 'profiles'),
  /** Host dùng khi dựng URL từ cổng đọc được trong config.yaml. config.yaml luôn ghi
   * 127.0.0.1 (host Rocket *bind*), nhưng trong container 127.0.0.1 là chính container →
   * đặt `host.docker.internal` để gọi ngược ra máy host. */
  rocketAgentHost: envValue('ROCKET_AGENT_HOST') || '127.0.0.1',
  /** Rocket chạy vòng lặp agent có tool (đọc skill, tra memory…) — đo thực tế 30-60s,
   * cao hơn nhiều 1 lượt LLM thuần. Mặc định 90s, có thể hạ nếu thấy khách chờ quá lâu. */
  rocketAgentTimeoutMs: Number(envValue('ROCKET_AGENT_TIMEOUT_MS')) || 90_000,
  /** Lệnh CLI của Rocket, chỉ dùng ở transport 'cli' để chạy lượt trả lời. Mặc định tìm
   * `hermes` trong PATH — backend chạy bằng systemd/pm2 thường có PATH tối giản, khi đó
   * đặt đường dẫn đầy đủ (vd /home/<user>/.local/bin/hermes). */
  rocketAgentCli: envValue('ROCKET_AGENT_CLI') || 'hermes',
  /** Đường gọi Rocket: 'http' (mặc định, cổng OpenAI-compatible) hoặc 'cli' (`hermes -z`).
   * 'cli' chỉ chạy được khi backend ở CÙNG máy và ĐÚNG user OS sở hữu `~/.rocketagent/` —
   * backend trong Docker không spawn được tiến trình của host, nên mặc định là 'http'.
   * Xem rocket-agent-client.ts. */
  rocketAgentTransport: ((envValue('ROCKET_AGENT_TRANSPORT') || 'http').toLowerCase() === 'cli'
    ? 'cli'
    : 'http') as 'cli' | 'http',

  isProduction: process.env.NODE_ENV === 'production',

  /**
   * Phase 1a tenant-guard 2026-06-07 — chế độ cô lập tenant ở tầng Prisma:
   *   off     (mặc định) — không kiểm tra (hành vi cũ, zero risk khi deploy)
   *   warn    — log cảnh báo khi org-scoped query chạy ngoài tenant context
   *             (dùng trên staging để phát hiện call-site worker chưa withTenant)
   *   enforce — throw khi thiếu context (bật sau khi warn sạch + RLS đã apply)
   */
  tenantGuardMode: (() => {
    const v = (envValue('TENANT_GUARD_MODE') || 'off').toLowerCase();
    return v === 'warn' || v === 'enforce' ? v : 'off';
  })() as 'off' | 'warn' | 'enforce',

  /* --- Phase 2 token hardening 2026-06-08 --- */
  // Access token sống ngắn (chuỗi @fastify/jwt expiresIn). Mất token chỉ dùng được vài phút.
  accessTokenTtl: envValue('ACCESS_TOKEN_TTL') || '15m',
  // Refresh token sống dài (ms) — sliding mỗi lần xoay. Mặc định 30 ngày.
  refreshTokenTtlMs: parseInt(envValue('REFRESH_TOKEN_TTL_MS') || String(30 * 24 * 60 * 60 * 1000)),
  // Tuổi thọ TUYỆT ĐỐI của một family (ms) — session không xoay quá hạn này dù
  // rotate liên tục. Chống refresh token đánh cắp sống vĩnh viễn. Mặc định 90 ngày.
  refreshFamilyMaxMs: parseInt(envValue('REFRESH_FAMILY_MAX_MS') || String(90 * 24 * 60 * 60 * 1000)),
  // Grace window (ms) hấp thụ race đa tab: token vừa xoay trong cửa sổ này bị
  // gửi lại -> cấp token mới cùng family thay vì coi là reuse (đá session oan).
  refreshGraceMs: parseInt(envValue('REFRESH_GRACE_MS') || '20000'),

  /* --- Phase 3 CSP 2026-06-08 --- */
  // Content-Security-Policy mode:
  //   report-only (mặc định) — browser CHỈ log vi phạm, KHÔNG chặn (rollout an toàn,
  //                            không vỡ SPA prod; quan sát rồi mới enforce)
  //   enforce — chặn thật (bật sau khi report-only sạch trên staging)
  //   off     — không gửi CSP header
  cspMode: (() => {
    const v = (envValue('CSP_MODE') || 'report-only').toLowerCase();
    return v === 'enforce' || v === 'off' ? v : 'report-only';
  })() as 'report-only' | 'enforce' | 'off',

  // C2 2026-06-08 — bật để socket handshake TỪ CHỐI token legacy (thiếu typ:'access').
  // Mặc định false trong giai đoạn cutover (token 7d cũ còn lưu hành). Bật true SAU
  // khi bump jwtTokenVersion toàn bộ + telemetry xác nhận legacy hết (mọi socket ≤15').
  socketRequireAccessTyp: (envValue('SOCKET_REQUIRE_ACCESS_TYP') || 'false').toLowerCase() === 'true',

  /* --- Phase 1a RLS connection-binding 2026-06-09 (Giai đoạn 0) --- */
  // Bật cơ chế set `app.current_org` per-connection (SET LOCAL trong transaction) để
  // Postgres RLS đọc được tenant hiện hành. MẶC ĐỊNH false → cơ chế NẰM IM hoàn toàn
  // (không wrap query, không đổi hành vi). Chỉ bật =true trên staging SAU khi:
  //   (a) mọi interactive transaction đã chuyển sang tenantTransaction(),
  //   (b) đã apply tenant-rls.sql (có clause bypass) + role app NOSUPERUSER.
  // Bật khi RLS CHƯA apply cũng an toàn (chỉ set 1 GUC vô hại) nhưng tốn 1 round-trip/query.
  rlsSetConfig: (envValue('RLS_SET_CONFIG') || 'false').toLowerCase() === 'true',

  /* --- API + MCP phân tích hội thoại (CHỈ ĐỌC) 2026-08-03 ---
   * Bề mặt dành cho trợ lý AI (Claude Code, n8n, script phân tích) đọc hội thoại
   * mà KHÔNG cần đăng nhập CRM. Chỉ đọc, không ghi, không gửi tin — nhưng nội dung
   * đọc được gồm toàn văn chat và số điện thoại khách.
   * MẶC ĐỊNH TẮT: bật ngầm sẽ mở bề mặt PII không xác thực trên mọi deployment
   * nâng cấp lên mà chủ hệ thống không hề biết. Ai cần thì bật có chủ đích, và
   * nên kèm ANALYSIS_API_TOKEN nếu backend ra internet. */
  // Kill switch: false → không đăng ký /api/analysis/* lẫn /mcp.
  analysisApiEnabled: (envValue('ANALYSIS_API_ENABLED') || 'false').toLowerCase() === 'true',
  // Rỗng = KHÔNG yêu cầu xác thực. Có giá trị → mọi request phải kèm
  // `Authorization: Bearer <token>` hoặc header `X-Analysis-Token`.
  analysisApiToken: envValue('ANALYSIS_API_TOKEN') || '',
  // Rỗng = cho phép mọi IP. Danh sách IP/tiền tố ngăn cách bởi dấu phẩy
  // (vd "127.0.0.1,::1,10.0." — so khớp theo tiền tố chuỗi, đủ dùng cho self-host).
  analysisApiAllowedIps: (envValue('ANALYSIS_API_ALLOWED_IPS') || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  // Rỗng = tự lấy organization duy nhất trong DB. Đặt cứng khi hệ thống có nhiều org.
  analysisOrgId: envValue('ANALYSIS_ORG_ID') || '',
  // Trần số tin nhắn 1 lần lấy transcript / tính chỉ số (chặn truy vấn nuốt cả DB).
  analysisMaxMessages: Math.max(50, Number(envValue('ANALYSIS_MAX_MESSAGES') || '1000')),
};
