# Hướng dẫn triển khai ZCRM lên Production (v3.4)

> Runbook **tự chứa** cho ZCRM (mã nguồn mở, **AGPL-3.0**). Gồm 2 luồng: **cài mới từ đầu**
> và **nâng cấp** bản đang chạy lên v3.4. Mọi thao tác **idempotent + giữ dữ liệu**.
>
> Thay `sub.domain.com` / `file.domain.com` bằng domain thật của bạn. Hướng dẫn sử dụng:
> **https://docs.rocket.ai/**.

## 🚀 Quick Start — 1 lệnh (tự động)

> **Mã nguồn (repo):** https://github.com/rocket-ai-global/rocket-zalo-crm

Cài mới **hoặc** nâng cấp chỉ với **1 lệnh duy nhất** — script tự **kiểm tra & cài Docker/Compose/git nếu thiếu**, tải/cập nhật mã nguồn, backup & migrate:

```bash
curl -fsSL https://raw.githubusercontent.com/rocket-ai-global/rocket-zalo-crm/main/scripts/install.sh | bash
```

> Lệnh trên tự: kiểm tra môi trường (Docker · Docker Compose v2 · git · openssl) và **cài phần thiếu** · **clone** mã nguồn (cài mới) hoặc **`git pull`** (cập nhật) vào `~/zcrm` · chạy deploy (tự phát hiện cài mới/nâng cấp, backup DB, migrate, health-check).
> Đổi thư mục cài: `ZCRM_DIR=/srv/zcrm curl -fsSL .../install.sh | bash`. Chỉ tải/cập nhật nguồn (không deploy): thêm `SKIP_DEPLOY=1`.

### 💻 Hệ điều hành hỗ trợ

| OS | Cách chạy |
|---|---|
| **Linux** (Ubuntu/Debian/CentOS/Fedora/Alpine/Arch) | Chạy **trực tiếp** — tự cài Docker qua `get.docker.com`. *(Môi trường khuyến nghị cho VPS/server.)*<br>`curl -fsSL https://raw.githubusercontent.com/rocket-ai-global/rocket-zalo-crm/main/scripts/install.sh \| bash` |
| **Windows** *(đơn giản — không cần WSL thủ công)* | Mở **PowerShell** chạy:<br>`irm https://raw.githubusercontent.com/rocket-ai-global/rocket-zalo-crm/main/scripts/install.ps1 \| iex`<br>Script tự cài **Docker Desktop + Git** (qua winget) → clone/pull → deploy. *(Docker Desktop tự dựng WSL2 backend ngầm.)* |
| **Windows** *(cách thủ công qua WSL2)* | Cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) (bật **WSL2 backend**) → mở **Ubuntu (WSL2)** → chạy như Linux:<br>`curl -fsSL https://raw.githubusercontent.com/rocket-ai-global/rocket-zalo-crm/main/scripts/install.sh \| bash` |
| **macOS** | Cài **Docker Desktop** trước (`git`/`openssl` tự cài qua Homebrew nếu thiếu) → chạy:<br>`curl -fsSL https://raw.githubusercontent.com/rocket-ai-global/rocket-zalo-crm/main/scripts/install.sh \| bash` |

> Yêu cầu chung: **Docker + Docker Compose v2**. Trên Linux script tự cài; trên Windows/macOS cài **Docker Desktop** trước (PowerShell `install.ps1` tự cài Docker Desktop giúp bạn).

**Đã có sẵn mã nguồn?** Dùng thẳng script deploy:

```bash
git clone https://github.com/rocket-ai-global/rocket-zalo-crm.git zalocrm && cd zalocrm
./scripts/zalocrm-deploy.sh          # auto: cài mới nếu chưa có, nâng cấp nếu đã chạy
```

Script tự: sinh `.env` (secret ngẫu nhiên) khi cài mới · **backup DB** trước khi nâng cấp ·
`docker compose up -d --build` (GIỮ dữ liệu, KHÔNG `-v`) · `prisma migrate deploy` · cutover ·
kiểm tra HTTP 200. Cài mới xong → mở **http://localhost:3080** → trang `/setup` tạo tổ chức + chủ.

| Lệnh | Việc |
|---|---|
| `./scripts/zalocrm-deploy.sh` | Tự phát hiện cài mới / nâng cấp |
| `./scripts/zalocrm-deploy.sh install` | Ép **cài mới** |
| `./scripts/zalocrm-deploy.sh upgrade` | Ép **nâng cấp** (vd 3.3 → 3.4) |
| `./scripts/zalocrm-deploy.sh backup`  | Chỉ **backup database** |

> 💡 **Production:** sau khi script tạo `.env`, sửa `APP_URL` + `S3_PUBLIC_URL` thành domain HTTPS
> thật (xem §5) rồi chạy lại script. Muốn làm thủ công từng bước → xem §3 (cài mới) / §6 (nâng cấp) bên dưới.

## Tính năng chính
Chat đa nick Zalo (realtime Socket.IO), danh bạ/CRM + chấm điểm (lead scoring), lịch hẹn & nhắc hẹn,
media (ảnh/video/audio/file qua MinIO/S3/R2), cầu **Zalo ↔ Telegram**, RBAC + tổ chức + audit,
AI assistant (Anthropic/Gemini/OpenAI/Qwen/Kimi), analytics, PWA mobile + push.

---

## 1. Yêu cầu

- Docker + Docker Compose. VPS gợi ý **2–4 vCPU / 4 GB RAM / 80 GB SSD**.
- Domain HTTPS cho app (vd `sub.domain.com`) **và** một domain HTTPS cho ảnh/MinIO (vd `file.domain.com`) — xem §5.

---

## 2. Lấy source + tạo `.env`

```bash
git clone https://github.com/rocket-ai-global/rocket-zalo-crm.git zalocrm && cd zalocrm
cp .env.example .env
```

Điền `.env` — **bắt buộc** với production:

| Biến | Ghi chú |
|---|---|
| `JWT_SECRET`, `ENCRYPTION_KEY` | `openssl rand -hex 32` mỗi cái (đổi `JWT_SECRET` sau = logout toàn bộ) |
| `DB_PASSWORD` | mật khẩu Postgres mạnh (KHỚP phần password trong `DATABASE_URL`) |
| `APP_URL`, `CRM_LOGIN_URL` | domain prod, vd `https://sub.domain.com` — CSP tự ghim `wss://` từ đây |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | đổi khác `minioadmin`; `S3_ACCESS_KEY`/`S3_SECRET_KEY` khớp tương ứng |
| `S3_PUBLIC_URL` | **URL HTTPS công khai** tới MinIO, vd `https://file.domain.com` (xem §5) |
| `TELEGRAM_BRIDGE_BOT_TOKEN` | (tuỳ chọn) bật cầu Zalo↔Telegram; để trống = cầu TẮT |
| `ANTHROPIC_AUTH_TOKEN` … | (tuỳ chọn) token AI nếu dùng |

Để **mặc định** (trỏ service nội bộ compose): `DATABASE_URL` (host `db`), `REDIS_URL` (`redis`),
`S3_ENDPOINT` (`http://minio:9000`).

> `.env` đã được `.gitignore` + `.dockerignore` — không commit, không lọt vào image.

Sinh nhanh secret:
```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "DB_PASSWORD=$(openssl rand -hex 16)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)"
```

---

## 3. Build + chạy + tạo DB

```bash
# clamav + backup là service tuỳ chọn (antivirus mặc định TẮT: MEDIA_AV_ENABLED=0)
# → chỉ chạy core services:
docker compose up -d --build app db redis minio minio-init     # ~3-8 phút lần đầu
docker compose ps                                              # app/db/redis/minio "Up"

# App KHÔNG tự migrate — chạy thủ công:
docker exec zalo-crm-app npx prisma migrate deploy            # → "All migrations ... applied"
docker compose restart app                                    # boot sạch sau khi có bảng
```

Kiểm tra nhanh:
```bash
curl -s -o /dev/null -w "root / -> %{http_code}\n" http://localhost:3080/        # 200
curl -s http://localhost:3080/api/v1/setup/status                               # {"needsSetup":true}
docker logs zalo-crm-app 2>&1 | grep -i "running on"                            # Zalo CRM running on ...
```

> 🛑 **KHÔNG dùng `-v` khi rebuild — sẽ MẤT DATABASE.** Xem [§3a](#3a-an-toàn-dữ-liệu-khi-rebuild-đừng-mất-database).

---

## 3a. An toàn dữ liệu khi rebuild (ĐỪNG mất database)

> Triệu chứng khi làm sai: **rebuild xong đăng nhập lại bị đá về `/setup-password`** (hoặc `/setup`
> báo `needsSetup:true`). Đó KHÔNG phải bug — là do **database đã bị xoá**: tài khoản mất → app về
> first-run → owner tạo lại có `passwordChangedAt = null` → router guard ép đổi mật khẩu lần đầu.

Dữ liệu (Postgres, MinIO, Redis) nằm trong **Docker named volumes** (`zalocrm_pg_data`,
`zalocrm_minio_data`, `zalocrm_redis_data`, `zalocrm_file_storage`). Còn volume = còn dữ liệu.

| Lệnh | DB/tài khoản | Khi nào dùng |
|---|---|---|
| `docker compose up -d --build app` | ✅ GIỮ | **Rebuild thường (mặc định)** — đổi code, fix |
| `docker compose restart app` | ✅ GIỮ | Đọc lại `.env` sau khi sửa (không đổi code) |
| `docker compose down` | ✅ GIỮ | Tắt tạm; `up -d` lên lại còn nguyên dữ liệu |
| `docker compose down **-v**` | 🛑 **XOÁ SẠCH** | **CHỈ** khi cố ý reset từ đầu |

**Vì sao đôi khi vẫn phải `-v`?** Mật khẩu `DB_PASSWORD` / `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`
được **"đóng băng" vào volume lúc khởi tạo lần đầu**. Đổi các mật khẩu này về sau → muốn áp được
**bắt buộc** `down -v` (và **mất dữ liệu**). → Hãy **chốt mật khẩu ngay từ đầu** (§2). Nếu buộc phải
đổi mà muốn giữ dữ liệu: backup trước rồi restore sau khi recreate.

```bash
# Backup trước mọi thao tác mạo hiểm:
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-$(date +%F-%H%M).sql
```

---

## 4. Tạo tài khoản chủ (owner) lần đầu

Mở `https://sub.domain.com` → trang **/setup** tự hiện → tạo tổ chức + owner. Kiểm tra:
```bash
curl -s https://sub.domain.com/api/v1/setup/status   # {"needsSetup":false} sau khi tạo
```
Sau đó **Cài đặt → Tài khoản Zalo → Thêm nick → quét QR** (KHÔNG mở Zalo Web cùng lúc).

---

## 5. HTTPS qua Cloudflare Tunnel (2 Public Hostname)

Nếu dùng `cloudflared` token (dashboard-managed) → vào **Zero Trust → Networks → Tunnels →
Public Hostname**, thêm:

| Public hostname | Service |
|---|---|
| `sub.domain.com` | `http://localhost:3080` |
| `file.domain.com` | `http://localhost:9000` |

- #1 = app (WebSocket tự đi qua). #2 = MinIO cho `S3_PUBLIC_URL`. Bỏ #2 thì ảnh/sticker/logo
  trong chat không hiển thị.
- `S3_PUBLIC_URL` phải là **HTTPS công khai, không port lạ** (đừng dùng `http://...:9000` —
  CF không proxy port 9000; trang https tải ảnh http bị chặn mixed-content).

Kiểm tra:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://sub.domain.com/                 # 200
curl -sI https://file.domain.com/minio/health/live | head -1                     # 200
```
(App đã `trustProxy: true` → cookie `Secure` + `wss://` chạy đúng sau tunnel.)

> Phương án Caddy + Let's Encrypt trỏ thẳng IP VPS: tạo 2 A record (DNS only), cài `caddy`,
> `reverse_proxy 127.0.0.1:3080` (app) và `127.0.0.1:9000` (MinIO), mở 80/443.

---

## 6. Nâng cấp bản đang chạy lên **v3.4** (từ bản cũ → mới)

> **Idempotent + GIỮ dữ liệu.**

**Có gì mới ở v3.4:** cầu **Zalo ↔ Telegram** (2 chiều, media), media forward/mirror đầy đủ,
clamav image tag `1.4`, nhiều fix hiệu năng & UI. **Migration mới** (additive — an toàn):
`telegram_bridge_phase0` và một số migration phụ. **Biến `.env` mới (tuỳ chọn):**
`TELEGRAM_BRIDGE_BOT_TOKEN`.

```bash
# B1 — BACKUP DB trước (bắt buộc)
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-truoc-nang-cap-$(date +%F-%H%M).sql
ls -lh backup-truoc-nang-cap-*.sql        # phải > 0 byte

# B2 — Lấy code mới
git pull

# B3 — Kiểm .env: GIỮ NGUYÊN JWT_SECRET / ENCRYPTION_KEY / DB_PASSWORD / MinIO (đổi = mất phiên/dữ liệu).
#      (Tuỳ chọn) thêm TELEGRAM_BRIDGE_BOT_TOKEN để bật cầu Telegram.
#      ⚠ Script KHÔNG ghi đè .env đang có → biến MỚI của bản mới KHÔNG tự xuất hiện.
#      So sánh nhanh key thiếu so với .env.example:
#        comm -23 <(grep -oE '^[A-Z_]+=' .env.example | sort -u) <(grep -oE '^[A-Z_]+=' .env | sort -u)
#      Bắt buộc phải có (thiếu = lỗi 400 khi lưu API key AI/Facebook/TikTok):
#        grep -q '^TOKEN_ENCRYPTION_KEY=' .env || echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# B4 — Build lại, GIỮ DB (KHÔNG -v — xem §3a)
docker compose up -d --build app

# B5 — Migrate DB (BẮT BUỘC — LUÔN deploy, KHÔNG "migrate dev")
docker exec zalo-crm-app npx prisma migrate deploy

# B6 — Cutover: ép mọi user đăng nhập lại 1 lần (đóng token cũ)
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "UPDATE users SET jwt_token_version = jwt_token_version + 1;"
docker compose restart app
```

> 🛑 **CHỈ `up -d --build app`, KHÔNG `down -v`** (down -v xoá DB → mất tài khoản → đăng nhập lại bị
> đá về `/setup-password`). Đổi `crmuser`/`zalocrm` nếu `.env` đặt `DB_USER`/`DB_NAME` khác.

**B7 — Kiểm tra sau nâng cấp:**
```bash
curl -s -o /dev/null -w "root → %{http_code}\n" http://localhost:3080/                 # 200
curl -sI http://localhost:3080/ | grep -i content-security-policy                       # có header CSP
docker exec zalo-crm-db psql -U crmuser -d zalocrm -tAc "SELECT count(*) FROM users;"   # >0 (DB còn nguyên)
```
> User cần **đăng nhập lại 1 lần** sau B6 (đúng, không phải lỗi). Đăng nhập xong vào thẳng dashboard.

**B8 — Siết bảo mật SAU vài ngày (không gấp):** `.env` `CSP_MODE=enforce` sau khi `report-only` sạch;
`SOCKET_REQUIRE_ACCESS_TYP=true` sau ~7 ngày → mỗi lần đổi chỉ cần `docker compose up -d app`.

### Đổi `S3_PUBLIC_URL` trên hệ đang chạy (2 việc hay quên)
```bash
docker compose up -d app   # a. restart KHÔNG đủ — phải recreate để đọc lại .env
# b. URL ảnh cũ lưu TUYỆT ĐỐI trong DB → rewrite:
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c \
  "UPDATE media_blobs SET public_url = replace(public_url, '<URL-CŨ>', '<URL-MỚI>') WHERE public_url LIKE '<URL-CŨ>%';"
```

### Rollback (nếu sự cố nặng)
```bash
git checkout <branch-hoặc-commit-cũ> && docker compose up -d --build app
# Migration additive (không drop dữ liệu) → thường KHÔNG cần rollback DB. Nếu cần:
cat backup-truoc-nang-cap-*.sql | docker exec -i zalo-crm-db psql -U crmuser zalocrm
```

---

## 7. Giấy phép — GPL-3.0

ZCRM phát hành theo **GNU General Public License v3.0 (GPL-3.0)** — xem [LICENSE](../LICENSE).
Copyleft: mọi bản **phân phối lại** (kể cả bản đã chỉnh sửa) **bắt buộc** phát hành dưới GPL-3.0 và
kèm **mã nguồn đầy đủ**. Muốn dùng theo điều khoản thương mại (không chịu ràng buộc copyleft) —
dual-license: liên hệ `locnt@rocket.ai`.

---

## 8. Sự cố thường gặp

| Triệu chứng | Xử lý |
|---|---|
| **Rebuild xong đăng nhập bị đá về `/setup-password`** | DB bị xoá do rebuild kèm **`down -v`**. Dùng `docker compose up -d --build app` (giữ volume). Xem [§3a](#3a-an-toàn-dữ-liệu-khi-rebuild-đừng-mất-database). |
| **Nâng cấp xong DB trắng, `/setup` hiện lại** | Đã đổi **thư mục cài** (vd lần đầu `~/zcrm`, lần sau `ZCRM_DIR=/srv/zcrm`). Tên volume gắn theo tên thư mục → bộ volume mới, rỗng. Dữ liệu cũ **vẫn còn**: `docker volume ls \| grep pg_data` → quay lại đúng thư mục cũ chạy tiếp. |
| **Sửa `docker-compose.yml` xong nâng cấp là mất** | `install.sh` chạy `git reset --hard` → xoá mọi sửa đổi file đã track. Đưa tuỳ biến sang **`docker-compose.override.yml`** (không track, compose tự nạp). |
| **Lưu API key AI/Facebook/TikTok báo 400** | `.env` thiếu `TOKEN_ENCRYPTION_KEY` (bản cũ nâng cấp lên không tự thêm). Thêm rồi `docker compose up -d app` — xem B3 [§6](#6-nâng-cấp-bản-đang-chạy-lên-v34-từ-bản-cũ--mới). |
| `migrate deploy` báo lỗi quan hệ/cột | DB thiếu bảng → chụp log gửi dev; KHÔNG `migrate dev` |
| Build fail `npm run build` | `cd backend && npx tsc` xem lỗi thật → vá rồi build lại |
| `clamav/clamav:1.x not found` khi `docker compose up` (không kèm tên service) | clamav/backup tuỳ chọn — chạy `docker compose up -d --build app db redis minio minio-init` |
| Boot đầu log lỗi liên quan bảng chưa tồn tại | transient trước `migrate deploy`; sau migrate + `restart app` hết |
| Ảnh chat không hiển thị | `S3_PUBLIC_URL` chưa HTTPS công khai / chưa thêm hostname `file.domain.com` (§5) |
| Mất kết nối Zalo | tự reconnect ~30s; không được → Tài khoản Zalo quét QR lại (KHÔNG mở Zalo Web) |

---

## 9. Quy tắc phát hành bản mới (dành cho maintainer)

> Mục này dành cho **người ra bản mới**, không phải người cài. Mục tiêu: khách chỉ chạy
> **1 lệnh** `curl -fsSL .../install.sh | bash` (tự `git pull` → backup → build → `migrate deploy`)
> là lên bản mới, **không mất dữ liệu**.

### 9.1 Checklist trước khi merge vào `main`

| Việc | Vì sao |
|---|---|
| **Chỉ THÊM migration mới** — tuyệt đối không sửa/xoá file migration đã publish | Prisma so **checksum** thư mục migration; sửa file cũ ⇒ `migrate deploy` fail ở mọi máy khách |
| Migration phải **additive**: cột mới để `NULL` hoặc có `@default` | `NOT NULL` không default ⇒ fail ngay trên bảng đã có dữ liệu |
| Đổi tên / xoá cột ⇒ tách **2 release**: (1) thêm cột mới + backfill, (2) release sau mới drop cột cũ | Giữa 2 bước app cũ và schema mới vẫn chạy được |
| **Biến `.env` mới phải có default trong code** (`envValue('X') \|\| '<mặc định>'`) | `ensure_env()` trong `scripts/zalocrm-deploy.sh` **return sớm nếu `.env` đã tồn tại** → máy khách cũ không bao giờ nhận key mới |
| Nếu biến mới **bắt buộc** (code `throw` khi thiếu) ⇒ ghi rõ vào §6 B3 + [CHANGELOG](../CHANGELOG.md) | Khách không tự biết phải thêm; xem tiền lệ `TOKEN_ENCRYPTION_KEY` |
| Giữ nguyên **tên volume** (`pg_data`, `minio_data`, `redis_data`, `file_storage`) và **tên service** trong `docker-compose.yml` | Đổi tên = Docker tạo volume mới = DB rỗng |
| Không đổi `DB_USER` / `DB_NAME` / `MINIO_ROOT_*` mặc định | Mật khẩu bị "đóng băng" vào volume lúc init (xem §3a) — đổi về sau chỉ áp được khi `down -v` |
| Tag release + cập nhật `CHANGELOG.md` (migration mới · biến `.env` mới · bước thủ công nếu có) | Khách biết có cần backup thêm / thao tác tay không |

**Ví dụ đúng:** nhóm biến `ANALYSIS_*` (API + MCP phân tích hội thoại) đều có default trong
`backend/src/config/index.ts` → khách nâng cấp không phải đụng `.env`.

**Ví dụ sai (đã xảy ra):** `TOKEN_ENCRYPTION_KEY` chỉ được sinh lúc **cài mới**; bản cũ nâng cấp lên
thiếu key này → `token-encryption.util.ts` **throw** ⇒ lưu API key AI/Facebook/TikTok báo 400,
mọi thứ khác vẫn chạy nên rất khó đoán.

### 9.2 Tự kiểm trước khi tag

```bash
# 1. Migration mới có additive không (không có DROP/NOT NULL trần)?
grep -rniE "drop (column|table)|set not null" backend/prisma/migrations/<migration-mới>/

# 2. Biến mới thêm vào .env.example có default trong code chưa?
comm -23 <(grep -oE '^[A-Z_]+=' .env.example | sort -u) <(git show HEAD~1:.env.example | grep -oE '^[A-Z_]+=' | sort -u)

# 3. Diễn tập nâng cấp thật: cài bản CŨ → có dữ liệu → pull bản MỚI → upgrade → đếm lại users
git checkout <tag-cũ> && ./scripts/zalocrm-deploy.sh install
# …tạo vài contact/tin nhắn…
git checkout main && ./scripts/zalocrm-deploy.sh upgrade
docker exec zalo-crm-db psql -U crmuser -d zalocrm -tAc "SELECT count(*) FROM users;"   # phải giữ nguyên
```

### 9.3 Dặn khách 3 điều

1. **Giữ nguyên thư mục cài** (mặc định `~/zcrm`) — đổi thư mục = volume mới = DB trắng.
2. **Tuỳ biến compose đặt ở `docker-compose.override.yml`** — `install.sh` `git reset --hard` sẽ xoá sửa đổi trong file đã track.
3. **Không bao giờ `docker compose down -v`** khi gỡ rối.
