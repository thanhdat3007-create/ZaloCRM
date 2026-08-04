# Hướng dẫn cắm MCP ZaloCRM vào Claude và ChatGPT

Cập nhật: 2026-08-04 · Phạm vi: bản Community

ZaloCRM có sẵn một máy chủ **MCP (Model Context Protocol)** tại `POST /mcp`, mở 9 công cụ
**chỉ đọc** để trợ lý AI đọc và phân tích hội thoại Zalo. File này chỉ nói về **cách cắm
vào từng ứng dụng AI**. Danh mục tool, tham số và tham chiếu REST nằm ở
[HUONG-DAN-API-MCP-PHAN-TICH-HOI-THOAI.md](./HUONG-DAN-API-MCP-PHAN-TICH-HOI-THOAI.md).

## Chọn cách cắm theo ứng dụng

Máy chủ MCP của ZaloCRM xác thực bằng **header** (`X-Analysis-Token` hoặc
`Authorization: Bearer`). Nó **không có OAuth**. Đây là điểm quyết định cách cắm:

| Ứng dụng | Gửi được header? | Cách cắm | Chạy localhost được? |
|---|---|---|---|
| **Claude Code** (CLI) | ✅ | `claude mcp add --header` | ✅ |
| **Claude Desktop** | ❌ trực tiếp | Cầu `mcp-remote` chèn header hộ | ✅ |
| **claude.ai** (web) | ❌ | Custom connector, **buộc phải tắt token** | ❌ cần HTTPS công khai |
| **ChatGPT** (web) | ❌ | Custom connector ở Developer mode, **buộc phải tắt token** | ❌ cần HTTPS công khai |

> Kết luận thực dụng: **Claude Code là đường dễ và an toàn nhất.** ChatGPT và claude.ai web
> chỉ nhận `No authentication` hoặc OAuth — muốn dùng chúng thì phải để server không token,
> đọc kỹ mục ⚠ bên dưới trước khi làm.

---

## Bước 0 — Bật bề mặt MCP trên server (bắt buộc, làm một lần)

Bề mặt này **mặc định TẮT**. Thêm vào `.env` ở thư mục gốc:

```bash
ANALYSIS_API_ENABLED=true
ANALYSIS_API_TOKEN=            # xem hướng dẫn chọn giá trị bên dưới
```

Sinh token ngẫu nhiên (dùng cho Claude Code / Claude Desktop):

```bash
openssl rand -hex 32
```

Khởi động lại và kiểm tra:

```bash
docker compose up -d app
curl -s http://localhost:3080/api/analysis/health
# {"ok":true,"orgId":"a8c3751d-...","readOnly":true,"tokenRequired":true,...}
```

> Cổng `3080` là mặc định của Docker (`APP_PORT` trong `.env`, ánh xạ ra cổng 3000 bên trong
> container). Chạy backend trực tiếp bằng `npm run dev` thì dùng `http://localhost:3000`.

Cần URL công khai (bắt buộc với ChatGPT và claude.ai web)? Xem
[HUONG-DAN-CAI-CLOUDFLARE-TUNNEL.md](./HUONG-DAN-CAI-CLOUDFLARE-TUNNEL.md).

> Đường dẫn MCP là `/mcp` ở gốc domain — **không phải** `/api/mcp`.

---

## 1. Claude Code (CLI)

Một lệnh, chạy ở máy của bạn:

```bash
# Backend chạy local, không đặt token
claude mcp add --transport http zalocrm http://localhost:3080/mcp

# Có domain và có token
claude mcp add --transport http zalocrm https://crm.domain.com/mcp \
  --header "X-Analysis-Token: <token>"
```

Kiểm tra: gõ `/mcp` trong phiên Claude Code — server `zalocrm` phải hiện **connected** kèm
9 tool. Gỡ ra bằng `claude mcp remove zalocrm`.

Ví dụ câu lệnh:

- "Dùng zalocrm, 7 ngày qua có bao nhiêu hội thoại khách nhắn mà chưa ai trả lời?"
- "Đọc transcript hội thoại với khách Mạnh Hải rồi tóm tắt nhu cầu và điểm phản đối."
- "Chấm chất lượng chăm sóc 10 hội thoại nhiều tin nhất: thời gian phản hồi trung vị,
  khoảng im lặng dài nhất, khách nào đang bị bỏ quên."

---

## 2. Claude Desktop (macOS / Windows)

Claude Desktop chỉ chạy MCP server dạng lệnh cục bộ, không tự gửi header tới server HTTP.
Dùng gói `mcp-remote` làm cầu: nó chạy trên máy bạn, nói stdio với Claude Desktop và
chuyển tiếp sang HTTP kèm header.

Cần Node.js 18+. Mở file cấu hình:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "zalocrm": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://crm.domain.com/mcp",
        "--header",
        "X-Analysis-Token:${ZALOCRM_TOKEN}"
      ],
      "env": {
        "ZALOCRM_TOKEN": "<token>"
      }
    }
  }
}
```

> Chú ý viết `X-Analysis-Token:${ZALOCRM_TOKEN}` **liền, không có dấu cách sau dấu hai chấm**,
> và để giá trị thật trong `env`. `mcp-remote` cắt tham số theo dấu cách nên viết
> `"X-Analysis-Token: abc"` sẽ hỏng.

Thoát hẳn Claude Desktop rồi mở lại (đóng cửa sổ là chưa đủ). Server `zalocrm` xuất hiện
trong biểu tượng công cụ ở khung soạn tin.

Không đặt token thì bỏ hẳn hai dòng `--header` và khối `env`.

---

## 3. claude.ai (trình duyệt) — Custom connector

Settings → **Connectors** → **Add custom connector** → dán `https://crm.domain.com/mcp`.

Giao diện web chỉ nhận **không xác thực** hoặc **OAuth**; không có ô nhập header. Vì
ZaloCRM không có OAuth nên phải để `ANALYSIS_API_TOKEN=` rỗng — đọc mục ⚠ bên dưới trước.
Yêu cầu URL là HTTPS công khai; `localhost` không dùng được.

---

## 4. ChatGPT — Custom connector (Developer mode)

Có ở gói **Plus, Pro, Business, Enterprise, Edu**, trên **bản web**.

### 4.1 Bật Developer mode

Settings → **Apps & Connectors** → **Advanced settings** → bật **Developer mode**.

### 4.2 Thêm connector

Settings → **Apps & Connectors** → **Create** / **Add custom connector**, điền:

| Trường | Giá trị |
|---|---|
| Name | `ZaloCRM` |
| Description | `Đọc và phân tích hội thoại Zalo trong CRM (chỉ đọc)` |
| MCP Server URL | `https://crm.domain.com/mcp` |
| Authentication | **No authentication** |

Tick ô xác nhận tin tưởng connector → **Create**. ChatGPT gọi thử `initialize` +
`tools/list`; thành công thì 9 tool hiện ra trong trang connector.

### 4.3 Dùng trong hội thoại

Trong khung chat, mở menu **+** → **Developer mode** → bật `ZaloCRM`. Sau đó hỏi bình thường,
ChatGPT sẽ gọi tool khi cần. Lần gọi đầu mỗi tool thường hiện hộp xin phép.

### 4.4 Giới hạn cứng của ChatGPT

- **Bắt buộc HTTPS công khai.** Không nhận `http://`, không nhận `localhost`, không nhận
  IP nội bộ. Bắt buộc phải có tunnel hoặc reverse proxy.
- **Không gửi được API key hay header tuỳ ý.** Chỉ `No authentication` hoặc OAuth 2.1 kèm
  Dynamic Client Registration. ChatGPT cũng không hỗ trợ client-credentials, service account
  hay mTLS. ZaloCRM chưa có OAuth ⇒ chỉ còn đường không xác thực.

---

## ⚠ Trước khi mở MCP không token ra internet

Không đặt `ANALYSIS_API_TOKEN` nghĩa là **bất kỳ ai biết URL đều đọc được toàn bộ nội dung
chat, tên và số điện thoại khách hàng** — không cần đăng nhập CRM. Bề mặt này cũng không áp
cơ chế làm mờ của nick Riêng tư.

Nếu vẫn phải dùng ChatGPT hoặc claude.ai web, hãy làm đủ các việc sau:

1. **Dùng hostname riêng, khó đoán** cho MCP thay vì gắn vào domain CRM chính — ví dụ
   `mcp-7f3a9c21.domain.com`, trỏ cùng service trong Cloudflare Tunnel. Đây là lớp che, không
   phải lớp khoá, nhưng loại được hầu hết bot quét domain.
2. **Chặn ở biên Cloudflare**: WAF Custom rule cho `URI Path equals /mcp`, chặn hết trừ dải IP
   quan sát được trong log của OpenAI. Kèm Rate limiting rule cho đường dẫn này.
3. **Chỉ bật khi dùng.** Xong việc thì đặt lại `ANALYSIS_API_ENABLED=false` và
   `docker compose up -d app` — route bị gỡ hẳn, không chỉ trả 401.
4. **Không dùng chung với dữ liệu thật nhạy cảm** nếu tổ chức có nick Riêng tư đang hoạt động.

Còn với Claude Code và Claude Desktop thì **luôn đặt token** — không có lý do gì để bỏ.

---

## Nghiệm thu bằng tay (khi client báo lỗi mà không rõ nguyên nhân)

Gọi thẳng giao thức, không qua ứng dụng AI:

```bash
URL=https://crm.domain.com/mcp
TOKEN=<token>          # bỏ dòng -H nếu không đặt token

# Bắt tay
curl -s -X POST "$URL" -H 'Content-Type: application/json' -H "X-Analysis-Token: $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# Liệt kê tool — phải thấy đủ 9 cái
curl -s -X POST "$URL" -H 'Content-Type: application/json' -H "X-Analysis-Token: $TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.result.tools[].name'

# Gọi thử một tool
curl -s -X POST "$URL" -H 'Content-Type: application/json' -H "X-Analysis-Token: $TOKEN" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_org_overview","arguments":{"days":7}}}'
```

Ba lệnh này chạy được thì server ổn — lỗi nằm ở phía cấu hình client.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân và cách xử lý |
|---|---|
| `404` khi gọi `/mcp` | `ANALYSIS_API_ENABLED` chưa `true`, hoặc chưa `docker compose up -d app` sau khi sửa `.env` |
| `401 Token không hợp lệ` | Client chưa gửi header. Claude Code: thêm `--header`. Claude Desktop: kiểm tra chính tả `X-Analysis-Token:${...}` không có dấu cách |
| `403 IP không nằm trong...` | `ANALYSIS_API_ALLOWED_IPS` đang bật. Sau tunnel/proxy, IP server thấy là `X-Forwarded-For` — thường phải bỏ hẳn biến này |
| `405` khi client kết nối | Client đang thử `GET /mcp` để mở SSE. Server chạy chế độ không phiên, chỉ nhận `POST`. Claude Code phải khai `--transport http`, không phải `sse` |
| `Hệ thống có nhiều organization` | Đặt `ANALYSIS_ORG_ID` trong `.env`, hoặc truyền tham số `orgId` cho tool |
| `health` trả `orgId: null` | Chưa có organization nào, hoặc backend không kết nối được database |
| ChatGPT báo `Connector is not safe` / lỗi 400 khi tạo | Thường do URL không công khai được, hoặc đang bật token nên ChatGPT nhận 401. Chạy khối nghiệm thu bên trên **không kèm** header để chắc chắn server trả 200 khi không xác thực |
| ChatGPT tạo connector xong nhưng không thấy tool | Chưa bật connector trong menu **+ → Developer mode** của khung chat |
| Claude Desktop không thấy server | Chưa thoát hẳn ứng dụng, thiếu Node.js, hoặc JSON sai cú pháp — kiểm tra bằng `python3 -m json.tool < claude_desktop_config.json` |
| Tool chạy chậm hoặc timeout | `search_messages` dùng `LIKE` chưa có index full-text. Thu hẹp bằng `since`/`until` hoặc `conversationId` |

---

## Liên quan

- [HUONG-DAN-API-MCP-PHAN-TICH-HOI-THOAI.md](./HUONG-DAN-API-MCP-PHAN-TICH-HOI-THOAI.md) — 9 tool, tham số, tham chiếu REST, quy ước dữ liệu
- [HUONG-DAN-CAI-CLOUDFLARE-TUNNEL.md](./HUONG-DAN-CAI-CLOUDFLARE-TUNNEL.md) — lấy URL HTTPS công khai
- Ứng dụng khác (n8n, Cursor, script Python): dùng REST `GET /api/analysis/*` cho nhanh, không cần nói giao thức MCP
