# Hướng dẫn nâng cấp các bản cũ

Tài liệu này giữ lại quy trình nâng cấp chi tiết cho từng mốc phiên bản cũ (v2.1 → v3.4).

Từ v3.4 trở đi, cài mới và nâng cấp dùng **chung một lệnh** — script tự nhận biết, tự backup
database trước khi nâng cấp, tự áp migration:

```bash
./scripts/zalocrm-deploy.sh
```

Chỉ cần các bước thủ công bên dưới khi bạn đang ở bản rất cũ hoặc muốn kiểm soát từng bước.

---

## Nâng cấp lên v3.4 (từ v3.x)

> 📘 Hướng dẫn triển khai production đầy đủ: [docs/HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md](docs/HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md)

> ⚠️ **Backup database trước khi nâng cấp.** v3.4 thêm **cầu Zalo ↔ Telegram** (migration additive an toàn, chỉ thêm bảng/field mới), cùng Privacy/RBAC/Zalo UI, media forward và object storage mirror. Không commit `.env` thật lên git.

```bash
# 1. Backup database
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-v3.x-$(date +%Y%m%d-%H%M).sql

# 2. Pull code mới nhất
cd /path/to/ZaloCRM
git fetch origin
git checkout main
git pull origin main

# 3. Đồng bộ biến môi trường mới
#    Mở .env.example mới và copy các biến còn thiếu sang .env thật.
#    Nếu dùng Cloudflare R2, dùng endpoint/account/key của R2 trong block S3_*.
diff .env .env.example

# 4. Rebuild app
docker compose up -d --build app

# 5. Áp migration (migrate deploy thủ công) rồi restart app
docker exec zalo-crm-app npx prisma migrate deploy
docker compose restart app

# 6. Verify
curl http://localhost:3080/
docker logs zalo-crm-app --tail 50 | grep -E "telegram|media|storage|listener|cron"
```

### Biến môi trường cần rà soát ở v3.4

| Nhóm | Biến cần kiểm tra | Ghi chú |
|---|---|---|
| Object storage | `S3_ENDPOINT`, `S3_PUBLIC_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Dùng được cho MinIO, Amazon S3 hoặc Cloudflare R2 |
| MinIO local | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Chỉ dùng khi chạy service MinIO trong Docker Compose |
| Telegram bridge | `TELEGRAM_BRIDGE_BOT_TOKEN` | (tuỳ chọn) bật cầu Zalo ↔ Telegram, để trống = tắt |
| Security | `JWT_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD` | Không để trống ở production |

### Cloudflare R2 example

```env
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_PUBLIC_URL=https://<public-r2-domain-or-custom-domain>
S3_BUCKET=zalocrm-attachments
S3_REGION=auto
S3_ACCESS_KEY=<r2-access-key-id>
S3_SECRET_KEY=<r2-secret-access-key>
```

`S3_PUBLIC_URL` phải là URL browser truy cập được để ảnh/video hiển thị trong CRM. Nếu bucket private, gắn custom domain/public access hoặc cơ chế signed URL phù hợp.

### Backfill media cũ từ Zalo CDN

Sau khi cấu hình storage đúng, chạy lại job/script backfill media của hệ thống nếu DB còn message có URL dạng `zpc.zdn.vn`. Mục tiêu là object mới xuất hiện trong MinIO/S3/R2 và message trong DB trỏ về URL storage mới.

### Rollback về bản v3.x cũ

```bash
docker compose down
git checkout <tag-v3.x-cu>
docker exec zalo-crm-db psql -U crmuser -d zalocrm < backup-v3.x-<datetime>.sql
docker compose up -d --build
```

---

## Nâng cấp từ v3.1 lên v3.2

> ⚠️ **Backup database trước khi nâng cấp.** Schema v3.2 thêm các bảng Phase 6 (ScoringConfig, ScoreSignalRule, StageTransitionRule, StuckThreshold, NbaTemplate) + field `Organization.timezone`, `Contact.priorityScore/priorityUpdatedAt`.

```bash
# 1. Backup database
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-v3.1-$(date +%Y%m%d-%H%M).sql

# 2. Pull code v3.2
git pull origin main

# 3. Rebuild + restart (entrypoint tự `prisma db push --accept-data-loss`)
docker compose up -d --build app

# 4. Verify
curl http://localhost:3080/                                                              # HTTP 200
docker logs zalo-crm-app --tail 30 | grep -E "scoring|stuck|cron-scheduler"
```

### Tính năng mới v3.2

#### 📊 Lead Scoring (Phase 6) — chấm điểm + phát hiện KH đình trệ
- Scoring engine: signal detect (inbound/outbound/meeting) + auto decay
- Auto-tag 7 tags: `cold-lead`, `warm-lead`, `hot-lead`, `champion`, `cooling`, `at-risk`, `dormant`
- Stuck detection cron + `/leads/stuck` dashboard riêng
- Stage promotion logic + breakdown modal explainability
- `/settings/crm/scoring` để cấu hình weights + thresholds

#### 🎨 UI redesigns lớn
- **AppointmentsView** redesign theo Airtable-design spec
- **FriendsView** flat per-pair table + kind tabs
- **ZaloAccountsView** dashboard 2-axis status
- **Settings layout** overhaul: nav nhóm Personal / Team / CRM / Channels / Dev
- **Responsive overhaul** per Airtable breakpoints

#### ⚙️ Other
- ContactProfileView, CustomerActivityLogView
- Touch-profile endpoint: fill gender/phone/birthday/hasZalo từ SDK khi click conv
- Alias 2-way sync: `Friend.aliasInNick` Zalo Real ↔ CRM (pagination 200/page)
- Scripts mới: `deploy-local.sh`

### Rollback về v3.1
```bash
docker compose down
git checkout v3.1.2
docker exec zalo-crm-db psql -U crmuser -d zalocrm < backup-v3.1-<datetime>.sql
docker compose up -d --build
```

---

## Nâng cấp từ v3.0 lên v3.1

> ⚠️ **Backup database trước khi nâng cấp.** Schema v3.1 thêm các bảng mới: `statuses`, `zalo_labels`, `notes`, `crm_tags` và một số field FK trên `contacts`, `friends`, `zalo_accounts`.

```bash
# 1. Backup database
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-v3.0-$(date +%Y%m%d-%H%M).sql

# 2. Pull code v3.1
cd /path/to/ZaloCRM
git fetch origin
git checkout main
git pull origin main

# 3. Rebuild + restart (Dockerfile entrypoint tự `prisma db push --accept-data-loss`)
docker compose up -d --build app

# 4. Verify
curl http://localhost:3080/                                                          # HTTP 200
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "\dt statuses zalo_labels notes crm_tags"
docker logs zalo-crm-app --tail 30 | grep -E "listener|backfill"
```

### Tính năng mới v3.1
| Tính năng | Mô tả |
|-----------|-------|
| **CrmTag system** | Quản lý tag riêng cho CRM, Settings tabs, optimistic UI |
| **Notes thread** | Ghi chú CRM-style trong tab Hồ Sơ, AI suggest lịch hẹn |
| **Zalo Labels 2-way sync** | Native dropdown, on-demand mode (5s cooldown) |
| **DM history backfill** | Endpoint `/sync-history` + UI button — port openzca CLI `db sync` |
| **AI parse fallback** | Rule-based khi Gemini quota 429 |
| **Phone normalization** | `phoneNormalized` canonical, resolve-by-keys |
| **DuplicateReviewDialog** | 3-column compare UX, filter, dismiss |

### Rollback về v3.0
```bash
docker compose down
git checkout v3.0
docker exec zalo-crm-db psql -U crmuser -d zalocrm < backup-v3.0-<datetime>.sql
docker compose up -d --build
```

## Nâng cấp từ v2.1 lên v3.0

> ⚠️ **Backup database trước khi nâng cấp.** Schema v3.0 thêm một số bảng và field aggregate mới.

```bash
# 1. Backup database
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-v2.1-$(date +%Y%m%d-%H%M).sql

# 2. Pull code v3.0
cd /path/to/ZaloCRM
git fetch origin
git checkout main
git pull origin main

# 3. Bổ sung biến môi trường mới vào .env (MinIO/S3)
#    Mở .env.example mới và copy block "Object Storage" + REDIS_URL vào .env
diff .env .env.example   # xem var nào thiếu

# Cần thêm vào .env:
cat >> .env <<'EOF'

# === v3.0 — MinIO/S3 storage ===
REDIS_URL=redis://redis:6379
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_URL=http://<DOMAIN-HOẶC-IP-SERVER>:9000
S3_BUCKET=zalocrm-attachments
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<ĐẶT-MẬT-KHẨU-MẠNH>
EOF

# ⚠️ Quan trọng:
#   - S3_PUBLIC_URL phải là URL trình duyệt user truy cập được (không dùng localhost
#     nếu user khác máy server)
#   - S3_ACCESS_KEY/S3_SECRET_KEY phải khớp MINIO_ROOT_USER/MINIO_ROOT_PASSWORD

# 4. Rebuild + restart stack (Docker Compose sẽ tự tạo container minio + minio-init)
docker compose down
docker compose up -d --build

# 5. Apply schema mới
#    Dockerfile entrypoint tự chạy "prisma db push --accept-data-loss" khi container start
#    → bước này thường không cần làm thủ công. Nếu muốn force:
docker exec zalo-crm-app npx prisma db push --accept-data-loss

# 6. Verify
curl http://localhost:3080/                                              # HTTP 200
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "\dt friends"     # tồn tại
docker logs zalo-crm-app --tail 20                                       # listener OK
```

### Lưu ý khi nâng cấp
| Mục | Chi tiết |
|---|---|
| **`--accept-data-loss`** | v3.0 CHỈ THÊM bảng/field mới, không drop gì → an toàn. Nhưng PHẢI backup trước phòng rollback. |
| **`S3_PUBLIC_URL`** | URL browser dùng để hiển thị file attachment. Production: domain/IP server, không dùng `localhost`. |
| **Tin nhắn cũ** | Vẫn hiển thị bình thường. Chỉ file gửi từ thời điểm v3.0 trở đi mới đi qua MinIO. |
| **Recipient nhận file** | Không ảnh hưởng `S3_PUBLIC_URL` — file gửi trực tiếp qua Zalo CDN, độc lập với MinIO. |

### Rollback về v2.1
```bash
docker compose down
git checkout v2.1
docker compose up -d --build
docker exec zalo-crm-db psql -U crmuser -d zalocrm < backup-v2.1-<datetime>.sql
```
