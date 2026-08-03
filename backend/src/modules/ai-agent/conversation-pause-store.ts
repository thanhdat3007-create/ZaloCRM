// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * conversation-pause-store.ts — tạm dừng agent trên 1 hội thoại.
 *
 * Dùng Redis (TTL) thay vì cột DB: trạng thái tạm thời, đọc mỗi tin đến, khỏi
 * migration. Redis chết → key mất → agent chạy lại; chấp nhận được vì kill
 * switch org (AiConfig.enabled) vẫn nằm ở DB.
 *
 * Fallback in-memory khi không có Redis (dev/test) để hành vi vẫn đúng trong 1
 * tiến trình.
 */
import { getRedis } from '../../shared/redis-client.js';
import { logger } from '../../shared/utils/logger.js';

const KEY_PREFIX = 'ai-agent-pause:';
/** Tạm dừng vô thời hạn — Redis không có TTL "mãi mãi" nên dùng mốc quy ước. */
const FOREVER_SECONDS = 3650 * 24 * 3600;

const memoryFallback = new Map<string, number>(); // conversationId → hết hạn (epoch ms)

const key = (conversationId: string) => `${KEY_PREFIX}${conversationId}`;

/**
 * Đặt tạm dừng.
 * @param minutes số phút; `null` = tới khi bật lại thủ công.
 */
export async function pauseConversation(
  conversationId: string,
  minutes: number | null,
  reason = 'manual',
): Promise<void> {
  const seconds = minutes === null ? FOREVER_SECONDS : Math.max(1, Math.round(minutes * 60));
  const redis = await getRedis();
  if (redis) {
    await redis.set(key(conversationId), reason, 'EX', seconds);
    return;
  }
  memoryFallback.set(conversationId, Date.now() + seconds * 1000);
  logger.debug('[ai-agent-pause] không có Redis, dùng bộ nhớ tiến trình conv=%s', conversationId);
}

export async function resumeConversation(conversationId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.del(key(conversationId));
    return;
  }
  memoryFallback.delete(conversationId);
}

/** Trả về lý do tạm dừng ('manual' | 'handoff') hoặc null nếu đang chạy bình thường. */
export async function getPauseReason(conversationId: string): Promise<string | null> {
  const redis = await getRedis();
  if (redis) return redis.get(key(conversationId));

  const until = memoryFallback.get(conversationId);
  if (!until) return null;
  if (until <= Date.now()) {
    memoryFallback.delete(conversationId);
    return null;
  }
  return 'manual';
}
