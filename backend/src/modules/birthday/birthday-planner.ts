// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ════════════════════════════════════════════════════════════════════════
// Chúc sinh nhật (🟢 Community) — lập kế hoạch gửi cho MỘT org.
// ════════════════════════════════════════════════════════════════════════
//
// Tách hẳn khỏi phần gửi: lập kế hoạch chỉ đọc Contact và ghi hàng đợi, rất rẻ,
// chạy được nhiều lần trong ngày mà không sinh tin trùng nhờ
// `@@unique([contactId, occasion, birthdayOn])`.
//
// Nhờ tách vậy, UI xem trước được "hôm nay sẽ chúc những ai" từ chính hàng đợi
// thật, không phải đoán bằng một truy vấn song song dễ lệch với lúc gửi.

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  plannedOccasionsFor, scheduleSpecOf, type OccasionKind, type PlannedOccasion,
} from './birthday-schedule.js';

/** Trần khách/dịp mỗi lần lập kế hoạch — chặn org tệp lớn làm nghẽn một tick. */
export const MAX_CONTACTS_PER_OCCASION = 500;

/**
 * Cấu hình đã nạp từ DB. Định nghĩa Ở ĐÂY (không ở birthday-sender) để phần gửi
 * import xuống planner mà không tạo vòng import ngược.
 */
export interface BirthdayConfig {
  id: string;
  orgId: string;
  enabled: boolean;
  timezone: string;
  sendTime: string;
  lateToleranceMinutes: number;
  beforeEnabled: boolean;
  beforeDays: number;
  beforeTemplateId: string | null;
  onDayEnabled: boolean;
  onDayTemplateId: string | null;
  afterEnabled: boolean;
  afterDays: number;
  afterTemplateId: string | null;
  senderMode: string;
  zaloAccountIds: string[];
  dailyQuota: number;
  perNickDailyQuota: number;
  minDelaySec: number;
  maxDelaySec: number;
  createdById: string | null;
}

/** Dịp đã chọn mẫu tin chưa. Chưa chọn thì không lên lịch — tránh đẻ hàng đợi chết. */
export function templateIdFor(config: BirthdayConfig, occasion: OccasionKind): string | null {
  if (occasion === 'before') return config.beforeTemplateId;
  if (occasion === 'after') return config.afterTemplateId;
  return config.onDayTemplateId;
}

/**
 * Khách đủ điều kiện nhận lời chúc của một dịp.
 *
 * Bắt buộc có hội thoại 1-1 chưa xoá: đó vừa là bằng chứng khách nhắn được, vừa
 * là đường để chọn nick gửi. Khách chỉ có số điện thoại mà chưa từng chat không
 * nằm trong phạm vi tính năng này — việc đó là của chiến dịch nhắn tệp.
 *
 * Bỏ khách đã merge (`merged_into`) để một người không nhận hai lời chúc.
 */
export async function findBirthdayContacts(
  orgId: string, monthDays: string[], limit = MAX_CONTACTS_PER_OCCASION,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT ct.id
    FROM contacts ct
    WHERE ct.org_id = ${orgId}
      AND ct.birth_date IS NOT NULL
      AND ct.merged_into IS NULL
      AND to_char(ct.birth_date, 'MM-DD') = ANY (${monthDays}::text[])
      AND EXISTS (
        SELECT 1 FROM conversations cv
        WHERE cv.contact_id = ct.id
          AND cv.deleted_at IS NULL
          AND cv."threadType" = 'user'
      )
    ORDER BY ct.id
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

export interface PlanResult {
  /** Số bản ghi hàng đợi mới tạo. */
  created: number;
  /** Số khách đã có bản ghi cho dịp đó (bỏ qua). */
  skipped: number;
}

/**
 * Lập kế hoạch cho NGÀY LỊCH hiện tại của org.
 *
 * Gọi trong `withTenant(orgId)`. Idempotent: chạy lại trong ngày chỉ bổ sung
 * khách mới nhập ngày sinh, không đụng bản ghi đã có (kể cả đã gửi).
 */
export async function planForOrg(
  config: BirthdayConfig, now: Date = new Date(),
): Promise<PlanResult> {
  if (!config.enabled) return { created: 0, skipped: 0 };

  const spec = scheduleSpecOf(config);
  const occasions = plannedOccasionsFor(spec, now);

  let created = 0;
  let skipped = 0;
  for (const occ of occasions) {
    if (!templateIdFor(config, occ.occasion)) continue;
    const result = await planOneOccasion(config, occ);
    created += result.created;
    skipped += result.skipped;
  }
  return { created, skipped };
}

async function planOneOccasion(
  config: BirthdayConfig, occ: PlannedOccasion,
): Promise<PlanResult> {
  const contactIds = await findBirthdayContacts(config.orgId, occ.monthDays);
  if (contactIds.length === 0) return { created: 0, skipped: 0 };

  if (contactIds.length === MAX_CONTACTS_PER_OCCASION) {
    logger.warn(
      `[birthday-planner] org=${config.orgId} dịp=${occ.occasion} chạm trần ` +
      `${MAX_CONTACTS_PER_OCCASION} khách — phần còn lại sẽ vào hàng đợi ở tick sau`,
    );
  }

  // `skipDuplicates` để lần lập kế hoạch thứ hai trong ngày không ném P2002 —
  // trùng ở đây là chuyện BÌNH THƯỜNG, không phải lỗi.
  const result = await prisma.birthdayGreeting.createMany({
    data: contactIds.map((contactId) => ({
      orgId: config.orgId,
      configId: config.id,
      contactId,
      occasion: occ.occasion,
      birthdayOn: occ.birthdayOn,
      dueAt: occ.dueAt,
    })),
    skipDuplicates: true,
  });

  return { created: result.count, skipped: contactIds.length - result.count };
}

/**
 * Huỷ các lời chúc CHƯA gửi không còn hợp lệ sau khi admin sửa cấu hình
 * (tắt tính năng, tắt một dịp, đổi số ngày lệch, đổi giờ gửi).
 *
 * Không đụng bản ghi đã `sent`/`failed`: đó là nhật ký, sửa cấu hình không viết
 * lại quá khứ. Bản ghi `pending` còn lại sẽ được `planForOrg` tạo lại đúng theo
 * cấu hình mới ở tick kế tiếp.
 */
export async function cancelObsoletePending(
  config: BirthdayConfig, now: Date = new Date(),
): Promise<number> {
  const spec = scheduleSpecOf(config);
  const valid = config.enabled ? plannedOccasionsFor(spec, now) : [];

  // Giữ lại đúng những (dịp, ngày sinh, giờ đến hạn) còn khớp cấu hình mới.
  const keep = valid
    .filter((occ) => templateIdFor(config, occ.occasion) !== null)
    .map((occ) => ({
      occasion: occ.occasion,
      birthdayOn: occ.birthdayOn,
      dueAt: occ.dueAt,
    }));

  const result = await prisma.birthdayGreeting.deleteMany({
    where: {
      orgId: config.orgId,
      configId: config.id,
      state: 'pending',
      ...(keep.length > 0 ? { NOT: { OR: keep } } : {}),
    },
  });
  return result.count;
}

/**
 * Cấu hình của mọi org ĐANG BẬT — cron nạp một lần mỗi tick.
 * Gọi trong `runSystemQuery`: đây là truy vấn cross-org, không thuộc tenant nào.
 */
export async function loadEnabledConfigs(): Promise<BirthdayConfig[]> {
  return prisma.birthdayGreetingConfig.findMany({
    where: { enabled: true },
    select: {
      id: true, orgId: true, enabled: true, timezone: true, sendTime: true,
      lateToleranceMinutes: true,
      beforeEnabled: true, beforeDays: true, beforeTemplateId: true,
      onDayEnabled: true, onDayTemplateId: true,
      afterEnabled: true, afterDays: true, afterTemplateId: true,
      senderMode: true, zaloAccountIds: true,
      dailyQuota: true, perNickDailyQuota: true,
      minDelaySec: true, maxDelaySec: true, createdById: true,
    },
    orderBy: { orgId: Prisma.SortOrder.asc },
  });
}
