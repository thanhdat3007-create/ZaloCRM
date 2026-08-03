
-- CreateTable
CREATE TABLE "ai_agents" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'openrouter',
    "model" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "max_tokens" INTEGER NOT NULL DEFAULT 600,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reply_delay_min_ms" INTEGER NOT NULL DEFAULT 3000,
    "reply_delay_max_ms" INTEGER NOT NULL DEFAULT 12000,
    "max_replies_per_day" INTEGER NOT NULL DEFAULT 500,
    "max_replies_per_conversation_day" INTEGER NOT NULL DEFAULT 30,
    "pause_after_human_reply_minutes" INTEGER NOT NULL DEFAULT 0,
    "handoff_keywords" TEXT[] DEFAULT ARRAY['gặp nhân viên', 'gặp người thật', 'khiếu nại']::TEXT[],
    "skip_noise_pattern" TEXT NOT NULL DEFAULT '^(ok|oke|okay|uhm|um|ờ|à|ừ|a|o|yes|no|y|n|\.|\.\.|\.\.\.)\s*$',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_documents" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'text',
    "file_name" TEXT,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_document_chunks" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_document_links" (
    "agent_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,

    CONSTRAINT "ai_agent_document_links_pkey" PRIMARY KEY ("agent_id","document_id")
);

-- CreateTable
CREATE TABLE "ai_agent_bindings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "target_thread_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "group_trigger_mode" TEXT NOT NULL DEFAULT 'mention_or_keyword',
    "trigger_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reply_to_all_mention" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "conversation_id" TEXT NOT NULL,
    "trigger_message_id" TEXT NOT NULL,
    "reply_message_id" TEXT,
    "status" TEXT NOT NULL,
    "skip_reason" TEXT,
    "model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER,
    "chunk_ids" JSONB,
    "reply_text" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_agents_org_id_enabled_idx" ON "ai_agents"("org_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agents_org_id_name_key" ON "ai_agents"("org_id", "name");

-- CreateIndex
CREATE INDEX "ai_agent_documents_org_id_enabled_idx" ON "ai_agent_documents"("org_id", "enabled");

-- CreateIndex
CREATE INDEX "ai_agent_document_chunks_org_id_document_id_idx" ON "ai_agent_document_chunks"("org_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_document_chunks_document_id_chunk_index_key" ON "ai_agent_document_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "ai_agent_document_links_org_id_idx" ON "ai_agent_document_links"("org_id");

-- CreateIndex
CREATE INDEX "ai_agent_bindings_org_id_zalo_account_id_enabled_idx" ON "ai_agent_bindings"("org_id", "zalo_account_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_bindings_zalo_account_id_scope_target_thread_id_key" ON "ai_agent_bindings"("zalo_account_id", "scope", "target_thread_id");

-- CreateIndex
CREATE INDEX "ai_agent_runs_org_id_created_at_idx" ON "ai_agent_runs"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_agent_runs_org_id_agent_id_status_created_at_idx" ON "ai_agent_runs"("org_id", "agent_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_agent_runs_conversation_id_created_at_idx" ON "ai_agent_runs"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_documents" ADD CONSTRAINT "ai_agent_documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_document_chunks" ADD CONSTRAINT "ai_agent_document_chunks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_document_chunks" ADD CONSTRAINT "ai_agent_document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ai_agent_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_document_links" ADD CONSTRAINT "ai_agent_document_links_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_document_links" ADD CONSTRAINT "ai_agent_document_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ai_agent_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_document_links" ADD CONSTRAINT "ai_agent_document_links_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_bindings" ADD CONSTRAINT "ai_agent_bindings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_bindings" ADD CONSTRAINT "ai_agent_bindings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_bindings" ADD CONSTRAINT "ai_agent_bindings_zalo_account_id_fkey" FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Phần thủ công — Prisma không quản được tsvector / partial unique index.
-- ════════════════════════════════════════════════════════════════════════════

-- unaccent để tìm được cả "can ho" lẫn "căn hộ".
-- Cần quyền tạo extension ở lần chạy đầu (migration chạy bằng role owner).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() là STABLE → Postgres từ chối dùng trong generated column.
-- Bọc thành IMMUTABLE (pattern chuẩn); chỉ định tường minh dictionary để an toàn
-- với search_path.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Dùng cấu hình 'simple' (không phải 'vietnamese'): Postgres không có dictionary
-- tiếng Việt sẵn. f_unaccent + simple đủ tốt cho truy vấn từ khoá.
ALTER TABLE "ai_agent_document_chunks"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', f_unaccent(coalesce("heading", '') || ' ' || "content"))
  ) STORED;

CREATE INDEX "ai_agent_document_chunks_fts_idx"
  ON "ai_agent_document_chunks" USING GIN ("search_vector");

-- 1 nick chỉ có 1 binding account_dm và 1 binding account_group.
-- @@unique([zaloAccountId, scope, targetThreadId]) KHÔNG chặn được vì Postgres
-- coi mọi NULL là khác nhau.
CREATE UNIQUE INDEX "ai_agent_bindings_account_scope_uniq"
  ON "ai_agent_bindings" ("zalo_account_id", "scope")
  WHERE "target_thread_id" IS NULL;
