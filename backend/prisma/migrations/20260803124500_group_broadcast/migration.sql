-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "group_broadcasts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "target_group_ids" TEXT[],
    "group_names_snapshot" JSONB NOT NULL DEFAULT '{}',
    "schedule_kind" TEXT NOT NULL DEFAULT 'now',
    "times_of_day" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "days_of_month" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "min_delay_sec" INTEGER NOT NULL DEFAULT 20,
    "max_delay_sec" INTEGER NOT NULL DEFAULT 45,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "paused_reason" TEXT,
    "consecutive_failed_runs" INTEGER NOT NULL DEFAULT 0,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_broadcast_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "triggered_by" TEXT NOT NULL DEFAULT 'schedule',
    "state" TEXT NOT NULL DEFAULT 'pending',
    "total_targets" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skip_reason" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_broadcast_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_broadcast_targets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_steps" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "zalo_msg_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_broadcast_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_broadcasts_org_id_state_idx" ON "group_broadcasts"("org_id", "state");

-- CreateIndex
CREATE INDEX "group_broadcasts_state_next_run_at_idx" ON "group_broadcasts"("state", "next_run_at");

-- CreateIndex
CREATE INDEX "group_broadcasts_zalo_account_id_idx" ON "group_broadcasts"("zalo_account_id");

-- CreateIndex
CREATE INDEX "group_broadcast_runs_org_id_state_idx" ON "group_broadcast_runs"("org_id", "state");

-- CreateIndex
CREATE INDEX "group_broadcast_runs_broadcast_id_scheduled_for_idx" ON "group_broadcast_runs"("broadcast_id", "scheduled_for" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "group_broadcast_runs_broadcast_id_scheduled_for_key" ON "group_broadcast_runs"("broadcast_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "group_broadcast_targets_run_id_state_idx" ON "group_broadcast_targets"("run_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "group_broadcast_targets_run_id_group_id_key" ON "group_broadcast_targets"("run_id", "group_id");

-- AddForeignKey
ALTER TABLE "group_broadcasts" ADD CONSTRAINT "group_broadcasts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcasts" ADD CONSTRAINT "group_broadcasts_zalo_account_id_fkey" FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcasts" ADD CONSTRAINT "group_broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcasts" ADD CONSTRAINT "group_broadcasts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcast_runs" ADD CONSTRAINT "group_broadcast_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcast_runs" ADD CONSTRAINT "group_broadcast_runs_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "group_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcast_targets" ADD CONSTRAINT "group_broadcast_targets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcast_targets" ADD CONSTRAINT "group_broadcast_targets_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "group_broadcast_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

