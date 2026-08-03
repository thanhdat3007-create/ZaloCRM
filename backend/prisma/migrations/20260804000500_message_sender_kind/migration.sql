-- Nguồn gửi chuẩn hoá cho từng tin nhắn (quy trách nhiệm AI / sale nào).
-- Cột NULLABLE và KHÔNG default: NULL mang nghĩa "tin cũ, không biết ai gửi" — khác hẳn
-- với "đã xác định nguồn". Không backfill vì dữ liệu nguồn của tin cũ không tồn tại.
-- ADD COLUMN nullable không default chỉ sửa catalog trên PostgreSQL 11+, không viết lại bảng.
ALTER TABLE "messages" ADD COLUMN "sent_by_kind" TEXT;

-- Đếm tin outbound theo từng sale trong khoảng ngày (báo cáo năng suất).
CREATE INDEX "messages_replied_by_user_id_sent_at_idx"
  ON "messages" ("replied_by_user_id", "sent_at");

-- Đếm tin theo nguồn (AI / người / chiến dịch) trong khoảng ngày.
CREATE INDEX "messages_sent_by_kind_sent_at_idx"
  ON "messages" ("sent_by_kind", "sent_at");
