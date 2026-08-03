-- Gửi tin nhắn 1-1 hàng loạt cho tệp khách hàng (Community tier).
-- Hàng đợi người nhận sống suốt vòng đời chiến dịch nên tệp lớn hơn hạn mức ngày
-- vẫn chạy được: hết quota thì dừng, hôm sau gửi tiếp đúng phần còn lại.

-- CreateTable
CREATE TABLE "list_broadcasts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_list_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "zalo_account_ids" TEXT[],
    "window_start" TEXT NOT NULL DEFAULT '08:00',
    "window_end" TEXT NOT NULL DEFAULT '17:00',
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "daily_quota" INTEGER NOT NULL DEFAULT 100,
    "per_nick_daily_quota" INTEGER NOT NULL DEFAULT 40,
    "min_delay_sec" INTEGER NOT NULL DEFAULT 45,
    "max_delay_sec" INTEGER NOT NULL DEFAULT 90,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "paused_reason" TEXT,
    "consecutive_failed_runs" INTEGER NOT NULL DEFAULT 0,
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "recipients_synced_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "list_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_broadcast_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "triggered_by" TEXT NOT NULL DEFAULT 'schedule',
    "state" TEXT NOT NULL DEFAULT 'pending',
    "planned_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skip_reason" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_broadcast_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_broadcast_recipients" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "display_name" TEXT,
    "contact_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_steps" INTEGER NOT NULL DEFAULT 0,
    "zalo_account_id" TEXT,
    "zalo_uid_used" TEXT,
    "sent_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "zalo_msg_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "list_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "list_broadcasts_org_id_state_idx" ON "list_broadcasts"("org_id", "state");

-- CreateIndex
CREATE INDEX "list_broadcasts_state_idx" ON "list_broadcasts"("state");

-- CreateIndex
CREATE INDEX "list_broadcasts_customer_list_id_idx" ON "list_broadcasts"("customer_list_id");

-- CreateIndex
CREATE INDEX "list_broadcast_runs_org_id_state_idx" ON "list_broadcast_runs"("org_id", "state");

-- CreateIndex
CREATE INDEX "list_broadcast_runs_broadcast_id_scheduled_for_idx" ON "list_broadcast_runs"("broadcast_id", "scheduled_for" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "list_broadcast_runs_broadcast_id_scheduled_for_key" ON "list_broadcast_runs"("broadcast_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "list_broadcast_recipients_broadcast_id_state_idx" ON "list_broadcast_recipients"("broadcast_id", "state");

-- CreateIndex
CREATE INDEX "list_broadcast_recipients_broadcast_id_sent_at_idx" ON "list_broadcast_recipients"("broadcast_id", "sent_at");

-- CreateIndex
CREATE INDEX "list_broadcast_recipients_zalo_account_id_sent_at_idx" ON "list_broadcast_recipients"("zalo_account_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "list_broadcast_recipients_broadcast_id_entry_id_key" ON "list_broadcast_recipients"("broadcast_id", "entry_id");

-- AddForeignKey
ALTER TABLE "list_broadcasts" ADD CONSTRAINT "list_broadcasts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcasts" ADD CONSTRAINT "list_broadcasts_customer_list_id_fkey" FOREIGN KEY ("customer_list_id") REFERENCES "customer_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcasts" ADD CONSTRAINT "list_broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcasts" ADD CONSTRAINT "list_broadcasts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcast_runs" ADD CONSTRAINT "list_broadcast_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcast_runs" ADD CONSTRAINT "list_broadcast_runs_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "list_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcast_recipients" ADD CONSTRAINT "list_broadcast_recipients_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcast_recipients" ADD CONSTRAINT "list_broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "list_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_broadcast_recipients" ADD CONSTRAINT "list_broadcast_recipients_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "customer_list_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: 3 bảng mới đều org-scoped, cùng khuôn tenant_isolation với các bảng khác.
ALTER TABLE "list_broadcasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "list_broadcasts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "list_broadcasts";
CREATE POLICY tenant_isolation ON "list_broadcasts"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "list_broadcast_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "list_broadcast_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "list_broadcast_runs";
CREATE POLICY tenant_isolation ON "list_broadcast_runs"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "list_broadcast_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "list_broadcast_recipients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "list_broadcast_recipients";
CREATE POLICY tenant_isolation ON "list_broadcast_recipients"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');
