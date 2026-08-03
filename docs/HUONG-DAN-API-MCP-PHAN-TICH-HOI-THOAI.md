# Hướng dẫn API + MCP phân tích hội thoại

Cập nhật: 2026-08-03 · Phạm vi: bản Community

Bề mặt **chỉ đọc** để trợ lý AI (Claude Code, n8n, script Python…) đọc và phân tích
hội thoại Zalo trong CRM mà không cần tài khoản đăng nhập.

Gồm hai đường vào cùng chung một lớp dữ liệu:

| Đường vào | Địa chỉ | Dùng cho |
|---|---|---|
| REST | `GET /api/analysis/*` | script, n8n, Postman, webhook |
| MCP | `POST /mcp` | Claude Code và mọi client hỗ trợ Model Context Protocol |

## Bề mặt này làm được gì và KHÔNG làm được gì

Làm được: liệt kê nick Zalo, lọc hội thoại, đọc toàn văn transcript, tìm tin nhắn
theo từ khoá, tra hồ sơ khách, tính thời gian phản hồi, thống kê tổng quan.

Không làm được — **không có endpoint nào ghi dữ liệu**: không tạo/sửa/xoá khách,
không gắn nhãn, không tạo lịch hẹn, không gửi tin Zalo. Muốn ghi thì dùng
`/api/public/*` (yêu cầu `X-Api-Key`), xem [zalocrm-api/api-documentation.md](./zalocrm-api/api-documentation.md).

## ⚠ Cảnh báo bảo mật — đọc trước khi mở ra internet

Bề mặt này **mặc định TẮT**. Khi bật, nó **không yêu cầu đăng nhập CRM** — bất kỳ ai
chạm được tới cổng backend đều đọc được **toàn bộ nội dung chat và số điện thoại
khách hàng**. Vì vậy bật phải là hành động có chủ đích, không bật ngầm.

| Biến môi trường | Tác dụng |
|---|---|
| `ANALYSIS_API_ENABLED=true` | Bật `/api/analysis/*` và `/mcp` (mặc định `false` = không đăng ký route) |
| `ANALYSIS_API_TOKEN=<chuỗi>` | Bắt buộc `Authorization: Bearer <token>` hoặc `X-Analysis-Token` |
| `ANALYSIS_API_ALLOWED_IPS=...` | Chỉ nhận request từ IP khớp tiền tố, ngăn cách bởi dấu phẩy |

Khuyến nghị theo môi trường:

- **Backend chỉ chạy localhost / mạng nội bộ** → bật `ANALYSIS_API_ENABLED=true` là đủ.
- **Backend có domain công khai** → đặt `ANALYSIS_API_TOKEN` bằng chuỗi ngẫu nhiên
  dài (`openssl rand -hex 32`). Claude Code gửi token qua header, cấu hình một lần.
- **Có VPN hoặc IP tĩnh cố định** → thêm `ANALYSIS_API_ALLOWED_IPS`.

Bề mặt này **không** áp cơ chế làm mờ nội dung của nick Riêng tư (`privacyMode='main'`).
Nick Riêng tư được thiết kế để che nội dung với người dùng CRM khác; API phân tích trả
nội dung thô. Nếu tổ chức đang dùng nick Riêng tư, hãy bật `ANALYSIS_API_TOKEN`.

## Cấu hình

Thêm vào `.env` ở thư mục gốc (mẫu đầy đủ có sẵn trong `.env.example`):

```bash
ANALYSIS_API_ENABLED=true
ANALYSIS_API_TOKEN=            # rỗng = không cần xác thực
ANALYSIS_API_ALLOWED_IPS=      # rỗng = chấp nhận mọi IP
ANALYSIS_ORG_ID=               # rỗng = tự lấy organization duy nhất
ANALYSIS_MAX_MESSAGES=1000     # trần số tin mỗi lần lấy transcript
```

Khởi động lại backend: `docker compose up -d app`.

Kiểm tra nhanh:

```bash
curl -s http://localhost:3000/api/analysis/health
# {"ok":true,"orgId":"a8c3751d-...","readOnly":true,"tokenRequired":false,...}
```

`orgId: null` nghĩa là chưa xác định được tổ chức — xem mục Xử lý sự cố bên dưới.

## Cắm vào Claude Code

Một lệnh duy nhất, chạy ở máy của anh (không cần cài gì thêm):

```bash
claude mcp add --transport http zalocrm https://<domain-backend>/mcp
```

Nếu đã bật token:

```bash
claude mcp add --transport http zalocrm https://<domain-backend>/mcp \
  --header "X-Analysis-Token: <token>"
```

Chạy local:

```bash
claude mcp add --transport http zalocrm http://localhost:3000/mcp
```

Kiểm tra kết nối bằng `/mcp` trong phiên Claude Code — server `zalocrm` phải hiện
trạng thái đã kết nối kèm 9 tool.

### Ví dụ câu lệnh cho Claude

- "Dùng zalocrm, tổng quan 7 ngày qua có bao nhiêu hội thoại chưa được trả lời?"
- "Đọc transcript hội thoại với khách Manh Hai rồi tóm tắt nhu cầu và điểm phản đối."
- "Tìm mọi tin nhắn nhắc tới 'báo giá' trong 30 ngày, nhóm theo khách và cho biết
  cái nào chưa được sale trả lời."
- "Chấm chất lượng chăm sóc 10 hội thoại nhiều tin nhất: thời gian phản hồi trung
  vị, khoảng im lặng dài nhất, khách nào đang bị bỏ quên."

## Danh mục tool MCP

Mọi tool nhận thêm tham số tuỳ chọn `orgId`; bỏ trống khi hệ thống chỉ có một tổ chức.

| Tool | Tham số chính | Trả về |
|---|---|---|
| `get_org_overview` | `days` (mặc định 30) | Tổng hội thoại, số chưa trả lời, lượng tin đến/đi, phân bổ theo nick, top hội thoại nhiều tin |
| `list_zalo_accounts` | — | Nick Zalo kèm trạng thái kết nối, chủ sở hữu, số hội thoại |
| `list_conversations` | `accountId`, `threadType`, `query`, `unrepliedOnly`, `hasUnread`, `since`, `until`, `limit`, `offset` | Danh sách hội thoại sắp theo tin mới nhất |
| `get_conversation` | `conversationId` | Chi tiết hội thoại + hồ sơ khách + mốc tin đầu/cuối |
| `get_transcript` | `conversationId`, `limit`, `since`, `until`, `order` | Toàn văn dạng `[giờ] Người gửi: nội dung` |
| `get_conversation_metrics` | `conversationId` | Thời gian phản hồi (TB/trung vị/p90), khoảng im lặng, thời gian khách đang chờ |
| `search_messages` | `query`, `accountId`, `conversationId`, `senderType`, `since`, `until`, `limit` | Tin khớp từ khoá kèm ngữ cảnh hội thoại |
| `search_contacts` | `query`, `limit` | Khách theo tên/SĐT/email kèm điểm lead |
| `get_contact` | `contactId` | Hồ sơ đầy đủ + hội thoại + lịch hẹn |

Quy trình phân tích thường dùng: `get_org_overview` → `list_conversations` →
`get_transcript` → `get_conversation_metrics`.

## Tham chiếu REST

Mọi endpoint là `GET`, nhận `orgId` tuỳ chọn qua query.

| Endpoint | Tham số query |
|---|---|
| `/api/analysis/health` | — |
| `/api/analysis/accounts` | — |
| `/api/analysis/conversations` | `accountId`, `threadType`, `q`, `unrepliedOnly`, `hasUnread`, `since`, `until`, `limit`, `offset` |
| `/api/analysis/conversations/:id` | — |
| `/api/analysis/conversations/:id/transcript` | `limit`, `since`, `until`, `order` |
| `/api/analysis/conversations/:id/metrics` | — |
| `/api/analysis/messages/search` | `q`, `accountId`, `conversationId`, `senderType`, `since`, `until`, `limit` |
| `/api/analysis/contacts` | `q`, `limit` |
| `/api/analysis/contacts/:id` | — |
| `/api/analysis/overview` | `days` |

Ví dụ:

```bash
BASE=http://localhost:3000/api/analysis

# Hội thoại khách nhắn mà chưa ai trả lời
curl -s "$BASE/conversations?unrepliedOnly=true&limit=10"

# Toàn văn 200 tin gần nhất
curl -s "$BASE/conversations/<id>/transcript?limit=200" | jq -r .text

# Tin nhắc tới "báo giá" trong tháng 7
curl -s "$BASE/messages/search?q=b%C3%A1o%20gi%C3%A1&since=2026-07-01&until=2026-07-31"

# Có bật token
curl -s -H "X-Analysis-Token: $TOKEN" "$BASE/overview?days=7"
```

### Quy ước dữ liệu cần biết khi đọc kết quả

- **Thời gian**: `sentAt` là ISO UTC; `localTime` đã đổi sang múi giờ của tổ chức
  (`Organization.timezone`, mặc định `+07:00`).
- **`senderType`**: `contact` = khách gửi · `self` = nhân viên · `ai_assistant` = trợ lý AI.
- **`sentVia`** (kênh gửi tin đi): `user` = gửi trong CRM · `user_native` = sale gõ
  thẳng trong app Zalo · `bridge` = trả lời qua cầu Telegram · `automation` / `system`
  = máy gửi. Chỉ hai giá trị cuối được tính vào `automatedOutboundMessages`.
- **Tin phi văn bản**: `content` rỗng được thay bằng nhãn `[ảnh]`, `[file: x.pdf]`,
  `[tin thoại]`… để transcript không đứt mạch.
- **`truncated: true`**: hội thoại dài hơn `limit` — kết quả là các tin **gần nhất**,
  không phải các tin đầu tiên.
- **Thời gian phản hồi** tính từ tin **đầu tiên** của chuỗi khách chưa được trả lời.
  Khách nhắn liền 3 tin rồi mới được reply thì đồng hồ chạy từ tin đầu.
- Hội thoại đã xoá mềm (`deletedAt`) và tin đã thu hồi (`isDeleted`) đều bị loại.

## Giới hạn đã biết

- `search_messages` dùng `LIKE` không dấu-nhạy-cảm, chưa có index full-text. Trên
  cơ sở dữ liệu vài triệu tin, truy vấn có thể chậm — hãy thu hẹp bằng `since`/`until`
  hoặc `conversationId`.
- Rate limit chung 1200 request/phút/IP áp cho cả `/api/analysis/*` và `/mcp`.
- Máy chủ MCP chạy chế độ **không phiên**: chỉ nhận `POST /mcp`; `GET`/`DELETE /mcp`
  trả 405. Không có kênh SSE do server chủ động (bộ tool thuần đọc không cần đẩy ngược).

## Xử lý sự cố

| Triệu chứng | Nguyên nhân và cách xử lý |
|---|---|
| `404` mọi endpoint | `ANALYSIS_API_ENABLED=false`, hoặc backend chưa khởi động lại sau khi sửa `.env` |
| `401 Token không hợp lệ` | Đã đặt `ANALYSIS_API_TOKEN` — thêm header `X-Analysis-Token` hoặc `Authorization: Bearer` |
| `403 IP không nằm trong...` | IP gọi không khớp `ANALYSIS_API_ALLOWED_IPS`. Sau reverse proxy, IP thấy được là `X-Forwarded-For` |
| `Hệ thống có nhiều organization` | Truyền `?orgId=<id>` hoặc đặt `ANALYSIS_ORG_ID` trong `.env` |
| `health` trả `orgId: null` | Chưa có organization nào trong DB, hoặc backend không kết nối được database |
| Claude Code báo không kết nối được | Kiểm tra `curl <url>/api/analysis/health` từ chính máy chạy Claude Code; nhớ đường dẫn MCP là `/mcp`, không phải `/api/mcp` |

## Vị trí mã nguồn

```
backend/src/modules/analysis/
  analysis-guard.ts     — kiểm soát truy cập + xác định orgId khi không có phiên đăng nhập
  analysis-service.ts   — toàn bộ truy vấn chỉ đọc (nguồn dùng chung cho REST và MCP)
  analysis-routes.ts    — REST /api/analysis/*
  mcp-tools.ts          — khai báo 9 tool MCP và bộ điều phối
  mcp-routes.ts         — giao thức JSON-RPC trên POST /mcp

backend/tests/
  analysis-service.test.ts       — toán chỉ số phản hồi, dựng transcript, múi giờ
  analysis-mcp-protocol.test.ts  — bắt tay MCP, tools/list, tools/call, kiểm soát truy cập
```
