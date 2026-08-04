// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * rocket-profile.ts — danh sách profile Rocket cho dropdown trên UI.
 *
 * Nguồn dữ liệu là các thư mục cấu hình của Rocket (rocket-profile-store.ts quét cả
 * `~/.rocketagent/profiles` lẫn `~/.hermes/profiles`), KHÔNG phải `hermes profile list`:
 * backend chạy trong container không spawn được CLI của host, còn thư mục thì mount
 * read-only vào được. Đọc file còn biết thêm hai thứ CLI không nói: profile nào thực sự
 * bật `api_server`, và nó nằm ở cổng nào.
 *
 * File này chỉ lo phần CÔNG KHAI cho UI — khoá API của từng profile ở lại trong store,
 * không bao giờ ra khỏi backend.
 */
import { listRocketProfileRecords, clearRocketProfileCache } from './rocket-profile-store.js';

export { isValidRocketProfileFormat } from './rocket-profile-name.js';

export interface RocketProfileInfo {
  name: string;
  /** Model mặc định (api_server.model_name); null khi profile chưa khai. */
  model: string | null;
  /** 'running' | 'stopped' | null — gateway `stopped` = agent sẽ im lặng hoàn toàn. */
  gateway: string | null;
  /** false = profile không mở cổng HTTP nào → chọn vào là chắc chắn không gọi được. */
  apiServerEnabled: boolean;
  /** Cổng api_server của riêng profile này (mỗi profile một cổng). */
  port: number | null;
  /** Có khoá trong config.yaml không. Thiếu khoá thì gateway trả 401. */
  hasKey: boolean;
  /** Thư mục cài đặt chứa profile (`.rocketagent`, `.hermes`…) — phân biệt hai bản cài. */
  source: string;
}

export interface RocketProfileListResult {
  ok: boolean;
  profiles: RocketProfileInfo[];
  /** Thông báo tiếng Việt viết sẵn cho UI hiển thị thẳng. */
  message: string;
}

/**
 * Đọc danh sách profile. KHÔNG ném lỗi: thư mục chưa mount là thông tin chẩn đoán để hiện
 * cho admin, không phải lỗi của request — UI vẫn cho gõ tay tên profile.
 *
 * `refresh` = admin bấm "tải lại danh sách" → bỏ cache để thấy ngay thay đổi vừa sửa
 * bên Rocket.
 */
export async function listRocketProfiles(refresh = false): Promise<RocketProfileListResult> {
  if (refresh) clearRocketProfileCache();

  const { ok, profiles, message } = await listRocketProfileRecords();
  return {
    ok,
    message,
    profiles: profiles.map((p) => ({
      name: p.name,
      model: p.defaultModel,
      gateway: p.gatewayState,
      apiServerEnabled: p.apiServerEnabled,
      port: p.port,
      hasKey: p.hasKey,
      source: p.source,
    })),
  };
}
