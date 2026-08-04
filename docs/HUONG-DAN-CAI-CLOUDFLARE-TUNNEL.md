# Hướng dẫn cài Cloudflare Tunnel để có URL HTTPS

Cập nhật: 2026-08-04 · Phạm vi: bản Community

Đưa ZaloCRM đang chạy ở `localhost` ra một domain HTTPS công khai mà **không cần IP tĩnh,
không mở port trên router, không tự xin chứng chỉ TLS**. Dùng được cho VPS, máy văn phòng,
thậm chí máy ở nhà sau NAT.

Cách hoạt động: tiến trình `cloudflared` chạy cạnh ZaloCRM, tự mở kết nối **đi ra** tới
Cloudflare. Cloudflare nhận request ở domain của bạn rồi đẩy ngược qua kết nối đó vào
`http://localhost:3080`. Không có cổng vào nào mở trên máy chủ.

## Cần chuẩn bị

| Thứ | Ghi chú |
|---|---|
| ZaloCRM đang chạy | `docker compose up -d`, mở được `http://localhost:3080` |
| Tài khoản Cloudflare | Miễn phí là đủ |
| Một domain đã trỏ nameserver về Cloudflare | Bắt buộc với tunnel có tên. Bỏ qua nếu chỉ chạy Quick Tunnel để thử |

Cổng mặc định của các dịch vụ (theo `docker-compose.yml`):

| Dịch vụ | Trên máy chủ | Trong mạng Docker |
|---|---|---|
| App ZaloCRM | `http://localhost:3080` | `http://app:3000` |
| MinIO (ảnh, file chat) | `http://localhost:9000` | `http://minio:9000` |

---

## Cách 1 — Quick Tunnel (thử nhanh, 1 lệnh, không cần domain)

Cho URL ngẫu nhiên dạng `https://<chuoi-ngau-nhien>.trycloudflare.com`, sống tới khi tắt lệnh.

```bash
cloudflared tunnel --url http://localhost:3080
```

URL hiện ngay trong log. **Chỉ dùng để demo hoặc test** — URL đổi mỗi lần khởi động lại,
không có SLA, và bất kỳ ai biết URL đều vào được trang đăng nhập CRM. Không dùng cho
production, cũng không nên dùng để cắm MCP không token.

---

## Cách 2 — Tunnel có tên, quản lý từ Dashboard (khuyến nghị)

Không phải sinh file cấu hình bằng tay; đổi hostname không cần khởi động lại tiến trình.

### 2.1 Tạo tunnel

1. Vào [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Networks → Tunnels**
2. **Create a tunnel** → chọn connector **Cloudflared** → đặt tên (vd `zalocrm`) → **Save**
3. Màn hình tiếp theo hiện lệnh cài kèm **token**. Copy token (chuỗi rất dài bắt đầu bằng `ey...`)

### 2.2 Chạy connector

**Cách gọn nhất — thêm service vào Docker Compose** (cùng mạng với app, không cần mở port ra host):

Tạo file `docker-compose.tunnel.yml` cạnh `docker-compose.yml`:

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: zalo-crm-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}
    depends_on:
      - app
```

Thêm token vào `.env`:

```bash
CF_TUNNEL_TOKEN=eyJhIjoi...
```

Chạy:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
```

> Chạy kiểu này thì Service trong Public Hostname phải là **`http://app:3000`** và
> **`http://minio:9000`** (tên service trong mạng Docker), không phải `localhost`.

**Hoặc cài thẳng lên máy chủ** (Service trỏ tới `http://localhost:3080`):

```bash
# Ubuntu/Debian
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
sudo cloudflared service install <TOKEN>

# macOS
brew install cloudflared
sudo cloudflared service install <TOKEN>
```

Kiểm tra tunnel đã lên: trong Dashboard cột **Status** của tunnel chuyển sang **HEALTHY**.

### 2.3 Khai Public Hostname

Trong tunnel vừa tạo → tab **Public Hostname** → **Add a public hostname**:

| Subdomain | Domain | Service (Docker Compose) | Service (cài trên máy chủ) |
|---|---|---|---|
| `crm` | `domain.com` | `http://app:3000` | `http://localhost:3080` |
| `file` | `domain.com` | `http://minio:9000` | `http://localhost:9000` |

- Hostname #1 là app. WebSocket đi qua tự động — không cần bật gì thêm (quét QR Zalo cần WS).
- Hostname #2 là MinIO, phục vụ `S3_PUBLIC_URL`. **Bỏ hostname này thì ảnh, sticker, logo
  trong chat không hiển thị.**
- DNS record được Cloudflare tạo tự động, không cần tự thêm.

### 2.4 Cập nhật `.env` rồi khởi động lại

```bash
APP_URL=https://crm.domain.com
CRM_LOGIN_URL=https://crm.domain.com
S3_PUBLIC_URL=https://file.domain.com
```

```bash
docker compose up -d app
```

`S3_PUBLIC_URL` **bắt buộc là HTTPS công khai, không kèm port lạ**. Để `http://<ip>:9000`
sẽ bị trình duyệt chặn mixed-content khi trang chạy HTTPS.

### 2.5 Nghiệm thu

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://crm.domain.com/          # 200
curl -sI https://file.domain.com/minio/health/live | head -1              # 200
curl -s https://crm.domain.com/api/v1/setup/status                        # {"needsSetup":false}
```

Mở `https://crm.domain.com` bằng trình duyệt, đăng nhập, vào một hội thoại có ảnh — ảnh
phải hiện. App đã bật `trustProxy` nên cookie `Secure` và `wss://` chạy đúng sau tunnel.

---

## Cách 3 — Tunnel quản lý bằng file cấu hình (CLI)

Dùng khi muốn cấu hình nằm trong Git, hoặc không muốn phụ thuộc Dashboard.

```bash
cloudflared tunnel login                 # mở trình duyệt, chọn domain
cloudflared tunnel create zalocrm        # sinh ~/.cloudflared/<UUID>.json
cloudflared tunnel route dns zalocrm crm.domain.com
cloudflared tunnel route dns zalocrm file.domain.com
```

Tạo `~/.cloudflared/config.yml`:

```yaml
tunnel: zalocrm
credentials-file: /home/<user>/.cloudflared/<UUID>.json

ingress:
  - hostname: crm.domain.com
    service: http://localhost:3080
  - hostname: file.domain.com
    service: http://localhost:9000
  # Luật cuối bắt buộc phải có, nếu không cloudflared từ chối khởi động
  - service: http_status:404
```

Chạy thử rồi cài thành dịch vụ chạy nền:

```bash
cloudflared tunnel run zalocrm       # chạy tay để xem log
sudo cloudflared service install     # cài systemd, tự chạy khi khởi động máy
sudo systemctl status cloudflared
```

Sửa `config.yml` xong phải `sudo systemctl restart cloudflared` mới có hiệu lực.

---

## Siết bảo mật

Tunnel chỉ cho bạn HTTPS — **nó không thêm lớp xác thực nào**. Ai biết domain đều chạm được
tới trang đăng nhập. Tuỳ mức độ nhạy cảm, cân nhắc:

**Cloudflare Access (Zero Trust)** — chặn ngay ở biên, người lạ không tới được app:
Zero Trust → **Access → Applications → Add an application → Self-hosted**, nhập hostname,
tạo policy cho phép theo email hoặc domain email công ty.

> ⚠ Đừng bọc Access lên hostname MinIO (`file.domain.com`) và cũng đừng bọc lên đường dẫn
> `/mcp`: trình duyệt tải ảnh và client MCP đều không qua được màn hình đăng nhập của Access.

**WAF rule giới hạn đường dẫn nhạy cảm** — vd chỉ cho phép `/mcp` từ dải IP đã biết:
Security → WAF → Custom rules, điều kiện `URI Path equals /mcp and IP Source Address not in {...}`
→ Action **Block**.

**Giới hạn 100 MB** — gói Cloudflare miễn phí chặn request body lớn hơn 100 MB. File đính kèm
vượt mức này sẽ upload lỗi (HTTP 413). Cần lớn hơn thì phải lên gói trả phí hoặc dùng
Caddy/Nginx trỏ thẳng IP thay cho tunnel.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân và cách xử lý |
|---|---|
| Tunnel `DOWN` / `INACTIVE` trong Dashboard | `cloudflared` chưa chạy hoặc token sai. Xem log: `docker logs zalo-crm-tunnel` hoặc `journalctl -u cloudflared -f` |
| `Error 1033` / `Argo Tunnel error` | Connector chạy nhưng Cloudflare không thấy. Khởi động lại `cloudflared`, kiểm tra máy chủ ra được internet cổng 7844 |
| `502 Bad Gateway` | Service trong Public Hostname sai. Chạy bằng Docker Compose thì phải là `http://app:3000`, cài trên máy chủ thì `http://localhost:3080` |
| Trang mở được nhưng ảnh chat không hiện | Thiếu hostname `file.domain.com`, hoặc `S3_PUBLIC_URL` chưa đổi sang HTTPS công khai, hoặc chưa `docker compose up -d app` sau khi sửa `.env` |
| Quét QR Zalo xoay mãi không xong | WebSocket bị chặn. Kiểm tra `APP_URL` đã là `https://` (CSP ghim `wss://` từ biến này) rồi khởi động lại app |
| Đăng nhập xong bị đá ra ngay | `APP_URL`/`CRM_LOGIN_URL` còn là `http://localhost` — cookie `Secure` không được gửi kèm |
| Upload file lớn báo lỗi 413 | Chạm trần 100 MB của gói Cloudflare miễn phí |
| URL `trycloudflare.com` đổi sau mỗi lần restart | Đúng bản chất Quick Tunnel. Muốn URL cố định phải dùng Cách 2 hoặc Cách 3 |

---

## Liên quan

- [HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md) — quy trình triển khai đầy đủ, §5 tóm tắt phần tunnel
- [HUONG-DAN-CAI-MCP-CHO-CLAUDE-VA-CHATGPT.md](./HUONG-DAN-CAI-MCP-CHO-CLAUDE-VA-CHATGPT.md) — có URL rồi thì cắm trợ lý AI vào
- [HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md](./HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md) — thay MinIO bằng R2, khi đó không cần hostname `file.domain.com`
