// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * rocket-profile-name.ts — quy tắc tên profile Rocket.
 *
 * Tách riêng khỏi rocket-profile.ts để rocket-profile-store.ts dùng được mà không tạo
 * import vòng (rocket-profile.ts đọc danh sách qua store).
 */

/**
 * Tên profile Hermes hợp lệ: chữ thường/số bắt đầu, theo sau là chữ thường/số/`-`/`_`,
 * tối đa 64 ký tự. Giá trị này đi vào đường dẫn thư mục (`<profiles>/<tên>/config.yaml`)
 * và vào argv của `hermes -p <profile>` (rocket-cli-client.ts) — chặn `/`, `..`, khoảng
 * trắng ngay ở biên API, không đợi tới lúc chạm đĩa mới phát hiện path-traversal.
 */
const ROCKET_PROFILE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const ROCKET_PROFILE_MAX_LENGTH = 64;

export function isValidRocketProfileFormat(value: string): boolean {
  return value.length <= ROCKET_PROFILE_MAX_LENGTH && ROCKET_PROFILE_PATTERN.test(value);
}
