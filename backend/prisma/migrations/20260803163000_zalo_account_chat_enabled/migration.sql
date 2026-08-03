-- Nick CHỈ NHẬN: chat_enabled = false → nick vẫn nhận/lưu tin khách gửi vào (phân tích)
-- nhưng mọi cửa gửi đi đều bị chặn. Mặc định true = giữ nguyên hành vi cũ cho nick cũ.
ALTER TABLE "zalo_accounts" ADD COLUMN "chat_enabled" BOOLEAN NOT NULL DEFAULT true;
