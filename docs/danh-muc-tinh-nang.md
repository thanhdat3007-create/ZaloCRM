# Danh mục tính năng ZaloCRM

Cập nhật: 2026-08-07 · Phiên bản package: v3.4.0 · Phạm vi chính: bản Community trong checkout hiện tại

## 1. Mục đích và cách đọc

Đây là bản đồ tính năng theo **mã nguồn đang có**, không chỉ theo nội dung quảng bá hoặc model còn lưu trong database. Một tính năng chỉ được coi là hoạt động khi route/job tương ứng được đăng ký trong `backend/src/app.ts` và có bề mặt sử dụng thực tế.

Sau bản phát hành v3.4.0, codebase đã có thêm AI Agent, gửi nhóm/tệp khách hàng theo lịch và chúc sinh nhật tự động nhưng chưa được gắn một số phiên bản package mới. Vì vậy, cột trạng thái dưới đây phản ánh **working tree ngày 2026-08-07**, không phải cam kết rằng mọi mục đều có trong image v3.4.0 cũ.

| Nhãn | Ý nghĩa |
|---|---|
| **Community** | Có trong checkout Community và đang được đăng ký để sử dụng |
| **Có điều kiện** | Có code/route nhưng cần bật biến môi trường, API key hoặc dịch vụ ngoài |
| **Một phần** | Bề mặt chính dùng được nhưng còn số liệu, thao tác hoặc trường hợp chưa hoàn thiện |
| **Extension** | Chỉ được nạp từ bundle `_ee`; bundle này không có trong checkout Community |
| **Chưa hoàn thiện** | Route khung, nút placeholder hoặc code chưa được mount; không nên quảng bá như tính năng đã phát hành |

## 2. Tổng quan nhanh

| Miền | Khả năng chính | Trạng thái |
|---|---|---|
| Tài khoản & onboarding | Khởi tạo tổ chức, đăng nhập, đổi mật khẩu lần đầu, hồ sơ cá nhân | Community |
| Dashboard | KPI cá nhân/đội/hệ thống, việc cần xử lý, sức khỏe nick, funnel | Community |
| Zalo nhiều tài khoản | QR, reconnect, proxy, ACL, quota SDK, đồng bộ dữ liệu | Community |
| Chat realtime | Text/rich text, media, reaction, reply, typing/read, tìm và lọc hội thoại | Community |
| Bạn bè & nhóm | Đồng bộ bạn bè, lời mời kết bạn, quản trị nhóm, poll, quét thành viên | Community |
| CRM khách hàng | Hồ sơ, trạng thái, tag, notes, timeline, dedup/merge, người phụ trách | Community |
| Lịch hẹn | Lịch tuần/danh sách, nhắc Zalo, link public hoàn tất/hủy | Community |
| Lead scoring | Luật điểm, decay, stuck lead, auto-tag, engagement heatmap | Community |
| Marketing | Mẫu tin, tệp KH, quét nhóm, gửi nhóm/tệp theo lịch, chúc sinh nhật | Community |
| Media | Kho ảnh/video/file, dedup, thư mục, watermark, favorite, thùng rác | Community |
| AI trợ lý | Gợi ý trả lời, tóm tắt, cảm xúc, định dạng rich text | Có điều kiện |
| AI Agent | Tự chăm khách, RAG, gán theo nick/nhóm, mô phỏng, log và pause | Có điều kiện |
| Phân tích REST/MCP | Transcript, tìm kiếm, metrics phản hồi và tổng quan tổ chức | Có điều kiện |
| Báo cáo | Điều hành, nick, sale/team, engagement, audit, report tùy chỉnh | Community / Một phần |
| Tích hợp | Telegram bridge, Public API, webhook, Google Sheets, Zapier, push | Community / Có điều kiện |
| Bảo mật & phân quyền | JWT refresh rotation, RBAC, privacy OTP, tenant guard/RLS tùy chọn | Community / Có điều kiện |
| Mobile | Giao diện responsive, layout mobile, queue text offline | Một phần |
| Self-host | Docker Compose, Postgres, Redis, local/S3/R2, installer và upgrade | Community |

## 3. Tài khoản, tổ chức và onboarding

### 3.1 Khởi tạo và xác thực

- Trang `/setup` tạo tổ chức và tài khoản chủ hệ thống ở lần chạy đầu.
- Đăng nhập bằng email hoặc số điện thoại tại `/login`.
- Access token ngắn hạn kết hợp refresh token xoay vòng, phát hiện reuse và vô hiệu hóa phiên sau khi đổi/reset mật khẩu.
- Người dùng mới được cấp mật khẩu tạm phải đổi mật khẩu tại `/setup-password` trước khi vào phần còn lại của CRM.
- Đăng xuất, xem/sửa hồ sơ, avatar và đổi mật khẩu trong **Cài đặt → Tài khoản của tôi**.
- Branding trang đăng nhập theo tổ chức: logo, tên và thông tin hiển thị.

**Bằng chứng:** `backend/src/modules/auth/`, `backend/src/modules/branding/`, `frontend/src/views/LoginView.vue`, `SetupView.vue`, `ForcePasswordChangeView.vue`.

### 3.2 Nhân sự và tổ chức

- CRUD nhân viên; tạo user kèm thông tin Zalo và gửi credential ban đầu.
- Phòng ban dạng cây, leader/deputy, nhóm quyền và gán người dùng.
- Bàn giao khách hàng, nick Zalo và lịch hẹn khi nhân sự nghỉ việc.
- Hồ sơ tổ chức, timezone, branding và audit log.

**UI:** `/settings/rbac/users`, `/settings/rbac/departments`, `/settings/rbac/permission-groups`, `/settings/org/profile`, `/settings/org/audit`.

## 4. Dashboard và trung tâm điều hành

- Dashboard thay đổi theo vai trò: **Việc của tôi**, dữ liệu đội nhóm và sức khỏe hệ thống.
- KPI tin chưa trả lời, lịch hẹn, follow-up, khách mới/nguội/đã chốt và điểm lead.
- Action Hub đưa các hội thoại, lịch hẹn và lead cần xử lý lên đầu.
- Sức khỏe đội nick: online/offline, quota, backlog và cảnh báo vận hành.
- Funnel, hiệu suất phòng ban/sale, marketing đang chạy và sự kiện audit gần đây.
- Checklist onboarding hướng dẫn kết nối nick và hoàn thiện cấu hình ban đầu.

**UI/API:** `/`, `/api/v1/dashboard/*` · **Bằng chứng:** `frontend/src/views/DashboardView.vue`, `backend/src/modules/dashboard/`.

## 5. Quản lý nhiều tài khoản Zalo

- Thêm nick, tạo QR đăng nhập, reconnect bằng session đã lưu và tự reconnect sau khi backend khởi động.
- Ngắt kết nối thủ công; phân biệt mất kết nối thụ động với trường hợp cần quét QR lại.
- Soft-delete/lưu trữ nick, khôi phục nick và xử lý thẻ nick ma.
- Proxy riêng từng nick; sửa thông tin nhận diện và số điện thoại có bước xác nhận xung đột.
- Gán chủ sở hữu và ACL theo người dùng với quyền đọc/chat/quản trị.
- Chế độ **chỉ nhận** chặn các thao tác gửi từ nick đó.
- Trần an toàn SDK và thống kê quota theo nhóm thao tác; theo dõi tin gửi người lạ trong ngày.
- Đồng bộ danh bạ, lịch sử chat, nhãn Zalo; status log, uptime và nguyên nhân disconnect.
- Làm mới presence, bạn bè, tên/avatar nhóm và session bằng job nền.

**UI:** `/settings/channels/zalo`, `/settings/channels/sdk-limits`.

**Giới hạn:** toàn bộ kết nối Zalo dựa trên `zca-js`/`openzca`, không phải API chính thức của Zalo/VNG; thay đổi protocol có thể làm gián đoạn dịch vụ.

## 6. Tin nhắn và hội thoại realtime

### 6.1 Inbox

- Gom hội thoại từ nhiều nick vào một workspace; lọc theo nick, cá nhân/nhóm, chưa đọc, chưa trả lời, ưu tiên, stuck, trạng thái, tag và sale phụ trách.
- Tìm kiếm hội thoại và message; thư mục nick, filter preset và bộ đếm sidebar.
- Deep-link `/chat/:convId`; trạng thái được cập nhật qua Socket.IO.
- Tự refresh token/reconnect socket và tải bù dữ liệu sau khi mất kết nối.

### 6.2 Soạn và xử lý tin

- Text và rich text: định dạng, màu/cỡ chữ, danh sách và mention.
- Ảnh, album, video, audio/voice, file, sticker/GIF, vị trí, link, QR và card chuyển khoản.
- Reply/quote, forward, reaction, typing indicator, read receipt, mark-read, pin, recall và sửa bản ghi local.
- Mẫu tin có biến cá nhân hóa và đính kèm dùng lại trong chat/broadcast.
- Lưu media từ bong bóng chat vào kho và gửi lại từ thư viện.
- Panel bên phải gom hồ sơ khách, notes, timeline, lịch hẹn, tag, trạng thái, score và người cùng chăm.
- Pause AI theo từng hội thoại và chuyển lại cho người thật.

**UI/API:** `/chat`, `/api/v1/conversations`, `/api/v1/chat` · **Bằng chứng:** `backend/src/modules/chat/`, `frontend/src/components/chat/`.

**Chưa hoàn thiện:** một số menu như tìm trong hội thoại, mute/report, lịch sử mở rộng và gửi contact card vẫn hiển thị placeholder; không tính là tính năng hoàn chỉnh.

## 7. Bạn bè và nhóm Zalo

### 7.1 Bạn bè

- Xem theo một nick hoặc toàn bộ nick; lọc friend, pending, stranger, ghost và silent.
- Đồng bộ định kỳ, lookup theo số điện thoại, trạng thái online và gợi ý kết bạn.
- Gửi/rút lời mời, chấp nhận/từ chối lời mời đến, block/unblock và đổi alias đồng bộ về Zalo.
- Mở nhanh chat, hồ sơ khách và cuộc gọi từ danh sách.

### 7.2 Nhóm

- Xem/tạo/đổi tên/rời/giải tán nhóm và lấy link mời.
- Quản lý thành viên, phó nhóm, chuyển chủ, yêu cầu tham gia và danh sách chặn.
- Tạo poll và theo dõi bình chọn.
- Gán AI Agent mặc định theo nick hoặc riêng từng nhóm.
- Quét nhiều nhóm bằng BullMQ, tiếp tục job và nhập roster thành tệp khách hàng.

**UI:** `/friends`, `/groups`, `/marketing/group-scan` · **Giới hạn:** quét member hiện chưa phân trang ở backend.

## 8. CRM khách hàng

- Tạo nhanh và CRUD hồ sơ: tên, nhiều số điện thoại, email, địa chỉ, nghề nghiệp, nguồn và người phụ trách.
- Mô hình một khách canonical/cha với nhiều quan hệ Zalo con từ các nick khác nhau.
- Dedup theo Zalo globalId/số điện thoại, phát hiện cụm trùng và gộp có kiểm soát.
- Pipeline trạng thái tùy biến; trạng thái kết bạn theo từng nick.
- Tag taxonomy v2, tag CRM, auto-tag và nhãn Zalo native; một số luồng hỗ trợ đồng bộ hai chiều với Zalo.
- Notes dạng thread, reaction, timeline hoạt động và lịch sử thay đổi.
- Hồ sơ tổng hợp, thống kê tương tác, các nick đang chăm, biến cá nhân hóa và liên kết tới hội thoại/lịch hẹn.
- Tìm kiếm toàn cục có scope quyền và privacy redaction.

**UI/API:** `/contacts`, `/customers/:id/activity`, `/api/v1/contacts`, `/api/v1/tags`, `/api/v1/search`.

**Chưa hoàn thiện:** nút xuất danh sách ở màn Contacts hiện báo chưa implement; `/contacts/:id/profile` vẫn là màn hình skeleton.

## 9. Lịch hẹn và nhắc việc

- Chế độ lịch tuần và danh sách; scope cá nhân, phòng ban hoặc toàn tổ chức theo quyền.
- Tạo, sửa, dời lịch, hoàn tất, hủy và đánh dấu no-show.
- Liên kết lịch hẹn với contact, conversation và người phụ trách.
- Nhắc lịch qua Zalo; nhắc hoàn tất theo cấu hình tổ chức.
- Link public có token cho phép sale hoàn tất/hủy từ tin Zalo mà không cần đăng nhập CRM.
- Cảnh báo lịch quá hạn và lịch sắp tới trên Dashboard/notification.

**UI:** `/appointments`, `/appointments/action?t=...` · **Bằng chứng:** `backend/src/modules/contacts/appointment-*`.

## 10. Lead scoring và engagement

- Cấu hình tín hiệu cộng/trừ điểm, luật chuyển stage và ngưỡng lead đình trệ.
- Decay điểm theo thời gian, stuck detection, auto-tag và next-best-action template.
- Danh sách lead kẹt tại `/leads/stuck` và cảnh báo trên Dashboard.
- Engagement heatmap 28 ngày dựa trên tin nhắn, reaction, call, reply và media.
- Timeline ưu tiên, phân loại nhóm khách và job recompute/backfill cho admin.

**UI:** `/settings/crm/scoring`, `/leads/stuck`, `/reports/engagement`.

## 11. Marketing Community

### 11.1 Mẫu tin

- CRUD mẫu text/rich text, biến cá nhân hóa và đính kèm media/file.
- Dùng chung cho chat, gửi nhóm, gửi tệp khách và chúc sinh nhật.
- Route Community riêng `/api/v1/message-templates`, không phụ thuộc Automation Extension.

### 11.2 Tệp khách hàng

- Tạo tệp bằng paste/import hoặc từ kết quả quét nhóm.
- Dry-run, chuẩn hóa, validation, dedup, entry CRUD/bulk, archive, rescan và hoàn tác xóa.
- Enrichment nền đối chiếu Friend DB; lọc theo nguồn và scope owner/phòng ban.
- Mở lead detail và chuyển sang chat theo số điện thoại.

**Giới hạn:** enrichment v1 không tự ép quét SDK cho mọi số chưa biết.

### 11.3 Gửi tin nhóm theo lịch

- Chọn một nick, nhiều nhóm và một mẫu tin; estimate chi phí/quota trước khi bật.
- Lịch gửi ngay, ngày/tuần/tháng; nhiều mốc giờ, khoảng nghỉ ngẫu nhiên và ngân sách an toàn.
- Draft, activate, pause, run-now, cancel; theo dõi run/target và tiến độ realtime.
- Tự dừng khi lỗi liên tiếp; gửi lại các nhóm lỗi mà không gửi trùng phần đã thành công.

### 11.4 Gửi tệp khách hàng

- Chọn tệp, pool nick gửi, mẫu tin, khung giờ, quota và nhịp gửi.
- Dựng hàng đợi người nhận, chạy thử, pause/cancel, đồng bộ lại tệp và retry người lỗi.
- Theo dõi recipient và lịch sử từng lát gửi.

### 11.5 Chúc sinh nhật tự động

- Cấu hình ba dịp: trước sinh nhật, đúng ngày và sau sinh nhật; mỗi dịp dùng mẫu riêng.
- Chọn nick được gán hoặc pool nick, timezone/giờ gửi, quota toàn hệ thống/quota mỗi nick và giãn cách.
- Planner dựng hàng đợi định kỳ, sender gửi khi đến hạn; admin có thể gửi ngay để kiểm tra.

**UI:** `/marketing/message-templates`, `/marketing/lists`, `/marketing/group-broadcasts`, `/marketing/list-broadcasts`, `/marketing/birthday`.

## 12. Kho phương tiện

- Upload ảnh/video/file hoặc lưu từ chat; content-hash dedup để tránh lưu trùng.
- Storage local hoặc S3-compatible; giữ tên file thật và nhận diện lại video/file theo phần mở rộng.
- Tìm kiếm/lọc theo loại, tag, thư mục, người tải, thời gian, dung lượng và mức sử dụng.
- Public/private, quyền theo owner, nguồn nick Zalo và cảnh báo chia sẻ media từ nick riêng tư.
- Bulk tag/folder, favorite cá nhân, album, watermark, thống kê và gửi lại vào chat.
- Thùng rác 30 ngày, restore, xóa vĩnh viễn và dọn theo batch.
- Virus scan bằng ClamAV nếu được bật.

**UI/API:** `/media`, `/api/v1/media`.

**Điều kiện:** ClamAV mặc định không bắt buộc và chạy fail-open; cron media trash mặc định dry-run nên phải cấu hình rõ trước khi kỳ vọng xóa dữ liệu thật.

## 13. AI

### 13.1 Trợ lý AI trong CRM

- Quản lý provider/model/API key theo tổ chức.
- Gợi ý câu trả lời, tóm tắt hội thoại, phân tích cảm xúc, tạo nội dung bàn giao sale và định dạng rich text.
- Trợ lý ảo có prompt cấu hình và thống kê usage/quota.
- Provider có adapter cho Anthropic, Gemini, OpenAI/OpenAI-compatible, Qwen, Kimi và OpenRouter tùy cấu hình.

**Trạng thái:** Có điều kiện; cần API key/provider hợp lệ. **UI:** `/settings/crm/ai-assistant`.

### 13.2 AI Agent chăm sóc tự động

- CRUD agent với prompt, model chính/dự phòng, giới hạn token, độ trễ và trigger gate.
- Kho tài liệu RAG, chunk/search và gán nhiều tài liệu cho agent.
- Gán agent theo nick cho chat 1-1, mặc định chat nhóm hoặc riêng từng group/thread.
- Simulator/test không gửi Zalo; nhật ký lượt chạy, tài liệu đã dùng, lỗi và handoff.
- Typing indicator, hàng đợi reply, pause theo hội thoại và bàn giao cho người thật.
- Kết nối OpenRouter hoặc Rocket Agent qua HTTP/CLI; hỗ trợ fallback theo cấu hình.

**Trạng thái:** route quản trị luôn hoạt động, nhưng worker tự gửi chỉ chạy khi `AI_AGENT_ENABLED` được bật. **UI:** `/settings/crm/ai-agents`, `/settings/crm/ai-knowledge`.

**Giới hạn:** kho tài liệu hiện hỗ trợ `.txt`/`.md`, chưa hỗ trợ PDF/DOCX trực tiếp.

### 13.3 REST/MCP phân tích hội thoại

- Tổng quan tổ chức/nick, danh sách và chi tiết hội thoại.
- Transcript chuẩn hóa, metrics thời gian phản hồi/khoảng im lặng/thời gian khách chờ.
- Tìm message, tìm/xem contact và thống kê overview.
- REST read-only tại `/api/analysis/*` và MCP tại `/mcp` cho Claude/ChatGPT/agent khác.

**Trạng thái:** Có điều kiện, mặc định tắt. Khi bật phải cấu hình token và scope mạng an toàn; không nên đưa endpoint không xác thực ra Internet.

## 14. Báo cáo và phân tích

- **Tổng quan điều hành:** KPI CRM, volume, funnel và xu hướng.
- **Vận hành nick:** kết nối, quota, uptime và lỗi.
- **Sale & Team:** leaderboard, response time, lịch hẹn và funnel theo người/phòng ban.
- **Engagement:** heatmap, phân khúc và khách giảm nhiệt.
- **Audit & hệ thống:** hoạt động người dùng, queue/cron và sức khỏe hệ thống.
- Báo cáo cơ bản cũ giữ deep-link và hỗ trợ xuất Excel.
- `/analytics` có report builder, saved report và các biểu đồ tùy chỉnh.

**Một phần:** một số KPI nâng cao trong `report-analytics-routes.ts` còn trả `0`, mảng rỗng hoặc có TODO; cần kiểm chứng dữ liệu thật trước khi dùng làm chỉ số quản trị.

**Extension:** route `/reports/pipeline` còn tồn tại trong router Community nhưng bị ẩn khỏi menu và gắn với Lead Pool Extension; không coi đây là tính năng Community được hỗ trợ chính thức. Báo cáo Automation do Extension inject.

## 15. Thông báo và tích hợp

### 15.1 Thông báo

- Notification bell cho tin chưa trả lời, lịch hẹn và trạng thái nick.
- Thông báo hệ thống gửi qua một nick Zalo nội bộ: cấu hình người nhận, health check, preview, retry và log.
- Tạo user kèm Zalo, gửi credential/welcome message theo mẫu.
- Firebase push cho thiết bị mobile nếu có credential; thiếu cấu hình thì no-op.

### 15.2 Telegram bridge

- Ánh xạ hội thoại Zalo sang Telegram forum topic.
- Mirror Zalo → Telegram, gồm media được bridge hỗ trợ; Telegram → Zalo có kiểm ACL/link user.
- Link Telegram user với CRM user và provision bridge theo nick.

**Trạng thái:** Có điều kiện; cần Telegram bot/provisioner và cấu hình bảo mật. Xem [Hướng dẫn Telegram Bridge](./HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md).

### 15.3 API, webhook và đồng bộ ngoài

- Public REST API dùng `X-API-Key`: contact, conversation/message, appointment và gửi text.
- Tạo/rotate API key; webhook outbound có HMAC và chức năng gửi test.
- Integration framework cho Google Sheets, Telegram Bot summary và Zapier; cần credential từng provider.
- Postman collection và tài liệu API trong [`zalocrm-api/`](./zalocrm-api/).

**Không phải Community active:** Facebook Lead Ads, Zalo Ads/OA, TikTok lead ingestion, Lead Pool và automation trigger/sequence/care-session được nạp từ `_ee` hoặc chỉ còn model legacy.

## 16. Phân quyền, riêng tư và bảo mật

- RBAC resource × action; menu và router cùng kiểm tra grant.
- Scope theo owner, phòng ban, cấp dưới và ACL riêng cho từng nick Zalo.
- Nick riêng tư: làm mờ dữ liệu, OTP qua Zalo, phiên unlock và guard chống rò rỉ nội dung qua HTTP/Socket/push.
- JWT, refresh rotation, CORS, CSP report-only, security headers, rate limit theo user, SSRF guard và HMAC webhook.
- Multi-tenant dựa trên `orgId`, AsyncLocalStorage tenant context và Prisma guard.
- PostgreSQL RLS và `TENANT_GUARD_MODE=enforce` là lớp tùy chọn, **không mặc định bật**; tài liệu triển khai phải cấu hình rõ nếu cần lớp phòng thủ DB.
- Upload media có kiểm loại file; ClamAV là tùy chọn.

**Bằng chứng:** `backend/src/modules/rbac/`, `privacy/`, `shared/tenant/`, `shared/security/`, `shared/realtime/socket-auth.ts`.

## 17. Mobile, realtime và offline

- Layout responsive tự chuyển ở màn hình nhỏ; Chat và Contacts có view mobile riêng, Appointments dùng list/drawer phù hợp mobile.
- Bottom navigation cho Dashboard, Chat, Contacts và Lịch hẹn.
- Socket.IO dùng JWT, fallback polling, tự reconnect và refetch sau gián đoạn.
- Mobile Chat có hàng đợi `localStorage` cho **tin text** khi offline và gửi lại khi mạng trở lại.
- Có `manifest.json` và icon standalone.

**Một phần:** service worker đang bị tắt trong `frontend/src/main.ts` do tương thích Vite 8. Vì vậy bản hiện tại là **mobile web responsive có manifest**, chưa nên mô tả là PWA offline đầy đủ hoặc cài đặt ổn định trên mọi trình duyệt.

## 18. Self-host, storage và vận hành nền

### 18.1 Triển khai

- Docker Compose cho app, PostgreSQL 16, Redis 7 và MinIO; backup/ClamAV là service tùy chọn theo profile/cách chạy.
- Installer Linux/macOS và PowerShell Windows sinh secret, né port, kéo image hoặc build, chạy `prisma migrate deploy` và health check.
- Nâng cấp có bước backup DB, migrate và vô hiệu token cũ.
- Storage local hoặc S3-compatible, gồm MinIO/Cloudflare R2.

**Lưu ý:** không mặc định coi backup tự động, ClamAV hay xóa media GC là đã bật chỉ vì service/code có trong repo. Xem [hướng dẫn production](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md).

### 18.2 Worker và cron chính

| Job | Vai trò |
|---|---|
| Appointment reminder | Nhắc lịch ngày mai, lịch quá hạn và hoàn tất |
| Zalo health/presence/session | Kiểm tra kết nối, presence, reconnect và refresh session |
| Friend/group sync | Làm mới bạn bè, alias, avatar/tên/sĩ số nhóm |
| Group scan worker | Quét nhóm/thành viên qua BullMQ |
| Group/list broadcast | Materialize lịch, gửi, retry và quét run kẹt |
| Birthday planner/sender | Dựng hàng đợi và gửi lời chúc đến hạn |
| Contact intelligence | Phát hiện im lặng, enrich profile và interaction |
| Scoring/engagement | Decay, stuck detection, auto-tag và heatmap |
| AI Agent reply | Xử lý trả lời tự động khi feature được bật |
| Media trash GC | Dọn record quá hạn; mặc định dry-run |
| Customer-list enrichment | Chuẩn hóa/đối chiếu entry nền |

## 19. Không được coi là tính năng hoàn chỉnh

- Các trang `SettingsComingSoon`: thông báo cá nhân, theme, phiên đăng nhập, billing, stuck rule, folder/template cấu hình, rate-limit UI, public token, feature flag và backup UI.
- Contact Profile route dạng skeleton và các nút export/import chỉ hiện toast “chưa implement”.
- Chat menu lịch sử/tìm/mute/report và một số contact-card action còn placeholder.
- `campaign-routes.ts` có code nhưng không được đăng ký trong `app.ts`.
- `/conversations/:id/send-block` trả `AUTOMATION_DISABLED` khi registry Extension vắng mặt.
- Automation Block/Sequence/Trigger/Care Session, Lead Pool, Facebook Lead Ads, Zalo Ads và các route `_ee` không thuộc Community checkout.
- Model Prisma hoặc file service legacy không tự động chứng minh một tính năng đang hoạt động.

## 20. Tài liệu liên quan

- [Tổng quan sản phẩm và PDR](./project-overview-pdr.md)
- [Bản đồ codebase](./codebase-summary.md)
- [Kiến trúc hệ thống](./system-architecture.md)
- [Chuẩn code](./code-standards.md)
- [Hướng dẫn triển khai production](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md)
- [Hướng dẫn AI Agent](./HUONG-DAN-CAU-HINH-AI-AGENT.md)
- [Hướng dẫn Rocket Agent](./HUONG-DAN-KET-NOI-ROCKET-AGENT.md)
- [Hướng dẫn REST/MCP phân tích hội thoại](./HUONG-DAN-API-MCP-PHAN-TICH-HOI-THOAI.md)
- [API reference và Postman collection](./zalocrm-api/)
- [Playbook bất động sản](./playbook-bds/) · [Playbook đào tạo](./playbook-dao-tao/)

## 21. Nguồn kiểm chứng

Danh mục được đối chiếu trực tiếp từ:

- Route, worker và cron: `backend/src/app.ts`.
- Cấu hình/gate: `backend/src/config/index.ts`.
- Data model: `backend/prisma/schema.prisma`.
- Menu/route/gate Community–Extension: `frontend/src/router/index.ts`, `frontend/src/layouts/DefaultLayout.vue`, `frontend/src/_ee-stubs/`.
- Module backend: `backend/src/modules/*` và regression test trong `backend/tests/`.
- Màn hình/composable frontend: `frontend/src/views/`, `frontend/src/components/`, `frontend/src/composables/`.
- Runtime/deploy: `docker-compose*.yml`, `scripts/zalocrm-deploy.sh`, `backend/package.json`, `frontend/package.json`.
