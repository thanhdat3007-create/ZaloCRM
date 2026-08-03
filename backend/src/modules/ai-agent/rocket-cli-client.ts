// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * rocket-cli-client.ts — gọi Rocket Agent bằng CLI `hermes -p <profile> -z "<prompt>"`,
 * KHÔNG qua gateway HTTP. Đường vận chuyển mặc định; đổi bằng `ROCKET_AGENT_TRANSPORT`
 * (dispatcher: `rocket-agent-client.ts`).
 *
 * Vì sao có đường này: gateway là một tiến trình phải luôn sống + một khoá phải khớp giữa
 * `.env` và `config.yaml` của Rocket. Gateway tắt là mọi agent Rocket im lặng, và đó là
 * lỗi hay gặp nhất khi vận hành. `-z/--oneshot` không cần gateway, không cần khoá.
 *
 * Đánh đổi (đo trên máy thật, đã ghi trong HUONG-DAN-KET-NOI-ROCKET-AGENT.md):
 *   - Mỗi tin nhắn là một tiến trình mới (~220MB, cộng vài giây khởi động agent).
 *   - Không có số token: `-z` chỉ in text, không có khối `usage` như cổng OpenAI.
 *   - Backend PHẢI chạy đúng user OS sở hữu `~/.rocketagent/` (đường HTTP thì chỉ cần
 *     mở được cổng TCP, nên vượt được ranh giới user/container).
 */
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { config } from '../../config/index.js';
import { listRocketProfiles } from './rocket-profile.js';
import {
  RocketAgentError,
  type RocketCallInput,
  type RocketChatMessage,
  type RocketProbeResult,
  type RocketReply,
} from './rocket-types.js';

const execFileAsync = promisify(execFile);

/** Trả lời Zalo là text ngắn; 1MB đã dư xa mà vẫn chặn được output điên rồ. */
const MAX_STDOUT_BYTES = 1_000_000;

/**
 * Nhãn phía trước mỗi lượt khi ép hội thoại thành MỘT chuỗi prompt. Đường HTTP gửi được
 * mảng messages có role, CLI thì không — mất nhãn là agent không phân biệt nổi câu nào
 * của khách, câu nào của chính nó.
 */
const TURN_LABEL: Record<RocketChatMessage['role'], string> = {
  user: 'Khách',
  assistant: 'Bạn',
};

/**
 * Ép system prompt + lịch sử + tin mới thành một chuỗi duy nhất.
 *
 * Tin cuối cùng được tách riêng khỏi khối lịch sử: đây là câu agent phải trả lời, chôn nó
 * lẫn trong lịch sử là kiểu prompt khiến model trả lời nhầm câu cũ.
 */
export function buildOneshotPrompt(system: string, messages: RocketChatMessage[]): string {
  const blocks: string[] = [system.trim()];

  const history = messages.slice(0, -1);
  const latest = messages[messages.length - 1];

  if (history.length > 0) {
    blocks.push(
      ['--- Hội thoại trước đó ---', ...history.map((m) => `${TURN_LABEL[m.role]}: ${m.content}`)].join('\n'),
    );
  }
  if (latest) {
    const label = latest.role === 'user' ? 'Tin nhắn mới của khách' : `${TURN_LABEL[latest.role]} vừa nói`;
    blocks.push(`--- ${label} ---\n${latest.content}`);
  }

  return blocks.filter(Boolean).join('\n\n');
}

/**
 * Tham số CLI cố định + phần tuỳ agent. Không có mảnh nào ghép chuỗi từ input người dùng.
 *
 * `-p <profile>` không xuất hiện trong `hermes --help` nhưng là cờ thật: chính Hermes dùng
 * nó trong wrapper script do `hermes profile alias` sinh ra. Đã chạy kiểm chứng.
 */
function buildArgs(profile: string, model: string, prompt: string): string[] {
  const args: string[] = [];
  // Profile rỗng = để Hermes dùng profile sticky mặc định của máy.
  if (profile) args.push('-p', profile);
  if (model) args.push('-m', model);
  args.push('-z', prompt);
  return args;
}

/** Gộp lỗi spawn/exit thành RocketAgentError có `kind` — agent-runner quyết theo kind. */
function toRocketError(err: unknown, cli: string): RocketAgentError {
  const e = err as {
    code?: string | number;
    killed?: boolean;
    stderr?: string;
    message?: string;
  };
  if (e.code === 'ENOENT') {
    return new RocketAgentError(
      `Không tìm thấy lệnh "${cli}" trên máy chạy backend. Cài Rocket Agent trên chính máy ` +
        'này, hoặc đặt ROCKET_AGENT_CLI=<đường dẫn đầy đủ tới hermes> trong .env.',
      'connection',
    );
  }
  // Kiểm TRƯỚC `killed`: Node cũng kill tiến trình con khi tràn maxBuffer, gộp chung sẽ
  // báo nhầm thành timeout và admin đi chỉnh sai chỗ.
  if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return new RocketAgentError('Rocket Agent in ra quá nhiều dữ liệu cho một câu trả lời.', 'http');
  }
  if (e.killed) {
    return new RocketAgentError('Rocket Agent không trả lời kịp thời gian chờ (timeout).', 'timeout');
  }
  const detail = (e.stderr || e.message || '').trim().slice(0, 300);
  const exitCode = typeof e.code === 'number' ? e.code : null;
  return new RocketAgentError(
    `Lệnh Rocket Agent lỗi${exitCode !== null ? ` (exit ${exitCode})` : ''}${detail ? `: ${detail}` : ''}`,
    'http',
    exitCode,
  );
}

/**
 * Chạy 1 lượt trả lời. KHÔNG dùng `--resume`/`--continue`: ZaloCRM tự gửi lại lịch sử mỗi
 * lượt (prompt-builder.ts), bật session của Hermes sẽ tạo 2 nguồn lịch sử lệch nhau —
 * cùng lý do đường HTTP không gắn `X-Hermes-Session-Id`.
 */
export async function callRocketAgentCli(input: RocketCallInput): Promise<RocketReply> {
  const cli = config.rocketAgentCli;
  const profile = input.profile?.trim() || '';
  const model = input.model.trim();
  const prompt = buildOneshotPrompt(input.system, input.messages);

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(cli, buildArgs(profile, model, prompt), {
      timeout: input.timeoutMs ?? config.rocketAgentTimeoutMs,
      maxBuffer: MAX_STDOUT_BYTES,
      // Chạy ở thư mục tạm, KHÔNG phải thư mục backend: `-z` nạp AGENTS.md/.cursorrules
      // của CWD vào agent. Spawn từ repo ZaloCRM là agent trả lời khách nuốt luôn quy tắc
      // nội bộ của repo. Không dùng --ignore-rules vì cờ đó chặn cả SOUL.md + memory của
      // profile — tức là chặn đúng phần "bộ não" mà người dùng chọn Rocket để có.
      cwd: tmpdir(),
    }));
  } catch (err) {
    throw toRocketError(err, cli);
  }

  const text = stdout.trim();
  if (!text) {
    throw new RocketAgentError('Rocket Agent trả về nội dung rỗng.', 'empty');
  }

  return {
    text,
    // `-z` chỉ in text. Nhật ký sẽ để trống cột token ở đường CLI — có chủ ý, không phải sót.
    promptTokens: null,
    completionTokens: null,
    model: model || `rocket:${profile || 'default'}`,
  };
}

/**
 * Nút "Kiểm tra kết nối" ở chế độ CLI: đối chiếu với `hermes profile list` thay vì chạy
 * thật một lượt agent — chạy thật tốn 10-90 giây và tốn token của profile chỉ để biết
 * cấu hình có đúng không.
 */
export async function probeRocketAgentCli(profile: string | null): Promise<RocketProbeResult> {
  const trimmedProfile = profile?.trim() || '';
  const listed = await listRocketProfiles();

  if (!listed.ok) {
    return { ok: false, status: 'unreachable', message: listed.message, models: [] };
  }

  // Tên rỗng = để Rocket tự chọn profile mặc định. Không tra được profile nào là "mặc
  // định" từ thư mục cấu hình: profile `default` nằm ở ~/.rocketagent/config.yaml chứ
  // không nằm trong profiles/ — nên bỏ qua bước đối chiếu thay vì đoán sai.
  const found = trimmedProfile ? listed.profiles.find((p) => p.name === trimmedProfile) : undefined;

  if (trimmedProfile && !found) {
    return {
      ok: false,
      status: 'unknown_profile',
      message: `Không có profile "${trimmedProfile}" trên Rocket. Tạo bằng: ${config.rocketAgentCli} profile create ${trimmedProfile}`,
      models: [],
    };
  }

  return {
    ok: true,
    status: 'ok',
    // Nói rõ đang chạy đường nào: gateway tắt vẫn "thành công" ở chế độ CLI, không nói ra
    // thì admin tưởng báo cáo sai.
    message: `Gọi Rocket bằng CLI (không cần gateway). Profile "${found?.name ?? (trimmedProfile || 'mặc định')}" sẵn sàng.`,
    models: found?.model ? [found.model] : [],
  };
}
