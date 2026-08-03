-- rocket_profile: tên profile Hermes ("/p/<ten>/…") khi agent dùng provider Rocket
-- (hạ tầng local, hermes-agent). NULL = profile default của gateway. Cột rỗng với
-- agent dùng provider khác — không ràng buộc chéo vì provider vẫn là chuỗi tự do.
ALTER TABLE "ai_agents" ADD COLUMN "rocket_profile" TEXT;

-- fallback_provider / fallback_model: engine dự phòng chạy khi engine chính lỗi
-- (gateway Rocket tắt, timeout, sai profile, content rỗng…). Rỗng = không dự phòng,
-- lỗi engine chính đi thẳng vào ai_agent_runs.status = 'failed'.
ALTER TABLE "ai_agents" ADD COLUMN "fallback_provider" TEXT;
ALTER TABLE "ai_agents" ADD COLUMN "fallback_model" TEXT;

-- fallback_used: đánh dấu lượt trả lời đã đi qua engine dự phòng. Kèm với đó
-- ai_agent_runs.model ghi model THỰC SỰ trả lời, còn error vẫn giữ lỗi gốc của
-- engine chính — nếu không có cờ này thì Rocket chết âm thầm cả tuần không ai biết,
-- chỉ thấy hoá đơn OpenRouter (fallback) tăng.
ALTER TABLE "ai_agent_runs" ADD COLUMN "fallback_used" BOOLEAN NOT NULL DEFAULT false;
