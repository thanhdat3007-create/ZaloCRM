-- Lời chúc sinh nhật tự động (Community tier).
-- Mỗi org 1 cấu hình, tối đa 3 dịp gửi quanh ngày sinh (trước / đúng ngày / sau),
-- mỗi dịp một mẫu tin riêng và một giờ gửi chung trong ngày.
--
-- Khoá chống trùng nằm ở birthday_greetings: 1 khách × 1 dịp × 1 năm sinh nhật.
-- Nhờ vậy cron chạy lại, backend nhiều instance, hay admin đổi cấu hình giữa ngày
-- đều không làm khách nhận hai lời chúc.

-- CreateTable
CREATE TABLE "birthday_greeting_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "send_time" TEXT NOT NULL DEFAULT '09:00',
    "late_tolerance_minutes" INTEGER NOT NULL DEFAULT 180,
    "before_enabled" BOOLEAN NOT NULL DEFAULT false,
    "before_days" INTEGER NOT NULL DEFAULT 3,
    "before_template_id" TEXT,
    "on_day_enabled" BOOLEAN NOT NULL DEFAULT true,
    "on_day_template_id" TEXT,
    "after_enabled" BOOLEAN NOT NULL DEFAULT false,
    "after_days" INTEGER NOT NULL DEFAULT 1,
    "after_template_id" TEXT,
    "sender_mode" TEXT NOT NULL DEFAULT 'assigned',
    "zalo_account_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "daily_quota" INTEGER NOT NULL DEFAULT 200,
    "per_nick_daily_quota" INTEGER NOT NULL DEFAULT 40,
    "min_delay_sec" INTEGER NOT NULL DEFAULT 30,
    "max_delay_sec" INTEGER NOT NULL DEFAULT 90,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "birthday_greeting_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birthday_greetings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "birthday_on" DATE NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "zalo_account_id" TEXT,
    "zalo_uid_used" TEXT,
    "zalo_msg_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sent_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "birthday_greetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "birthday_greeting_configs_org_id_key" ON "birthday_greeting_configs"("org_id");

-- CreateIndex
CREATE INDEX "birthday_greetings_state_due_at_idx" ON "birthday_greetings"("state", "due_at");

-- CreateIndex
CREATE INDEX "birthday_greetings_org_id_state_due_at_idx" ON "birthday_greetings"("org_id", "state", "due_at");

-- CreateIndex
CREATE INDEX "birthday_greetings_zalo_account_id_sent_at_idx" ON "birthday_greetings"("zalo_account_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "birthday_greetings_contact_id_occasion_birthday_on_key" ON "birthday_greetings"("contact_id", "occasion", "birthday_on");

-- AddForeignKey
ALTER TABLE "birthday_greeting_configs" ADD CONSTRAINT "birthday_greeting_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_greeting_configs" ADD CONSTRAINT "birthday_greeting_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_greeting_configs" ADD CONSTRAINT "birthday_greeting_configs_before_template_id_fkey" FOREIGN KEY ("before_template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_greeting_configs" ADD CONSTRAINT "birthday_greeting_configs_on_day_template_id_fkey" FOREIGN KEY ("on_day_template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_greeting_configs" ADD CONSTRAINT "birthday_greeting_configs_after_template_id_fkey" FOREIGN KEY ("after_template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_greetings" ADD CONSTRAINT "birthday_greetings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_greetings" ADD CONSTRAINT "birthday_greetings_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "birthday_greeting_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_greetings" ADD CONSTRAINT "birthday_greetings_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
