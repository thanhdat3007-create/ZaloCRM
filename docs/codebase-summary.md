# Bản đồ codebase ZaloCRM

Cập nhật: 2026-08-03 · Phiên bản: v3.4.0 · Phạm vi: bản Community

Tài liệu này là bản đồ onboard cho người mới. Kiến trúc chi tiết (luồng khởi động, multi-tenant, auth, realtime...) xem [`system-architecture.md`](./system-architecture.md). API endpoint xem [`zalocrm-api/api-documentation.md`](./zalocrm-api/api-documentation.md). Deploy production xem [`HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md`](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md).

## 1. Cây thư mục cấp cao

| Thư mục | Mục đích |
|---|---|
| `backend/` | API Fastify + TypeScript, Prisma/Postgres, Redis/BullMQ, Socket.IO — 255 file `src`, 111 model Prisma, 110 migration |
| `frontend/` | SPA Vue 3 + Vuetify 4 + Pinia + Vite — 319 file `src`, 228 file `.vue` |
| `docker/` | `Dockerfile` build image production 3 stage |
| `scripts/` | Cài đặt/deploy (`install.sh`, `install.ps1`, `zalocrm-deploy.sh`), migrate storage (`migrate-storage-rclone.sh`, `migrate-storage-urls.sh`) |
| `bin/` | `dev-setup` / `dev-teardown` — bootstrap môi trường dev theo git worktree |
| `docs/` | Tài liệu: runbook triển khai, cấu hình R2/Telegram, API reference, playbook người dùng theo ngành, kiến trúc |
| `plans/` | Kế hoạch triển khai tính năng đang chạy (không phải tài liệu sản phẩm) |
| `assets/` | Tài nguyên tĩnh dùng cho README/branding |
| (root) | `docker-compose.yml` / `docker-compose.dev.yml`, `.env.example`, `README.md`, `CHANGELOG.md`, `NOTICE`, `LICENSE` (AGPL-3.0) |

## 2. Backend — 28 module (`backend/src/modules/*`)

Kiến trúc phẳng: mỗi module có routes + service(s) + helper riêng, **không có repository layer** — gọi Prisma trực tiếp từ route handler/service, không có controller class (hàm đăng ký route đóng vai controller).

| Module | Vai trò | Layering |
|---|---|---|
| `activity` | Activity log / audit trail + timeline | routes + service |
| `ai` | Abstraction AI provider (Anthropic/Gemini/OpenAI-compat), trợ lý chat, gợi ý trả lời/sentiment/tóm tắt | routes + services + `providers/` + `prompts/` + `schemas/` |
| `analytics` | Analytics tùy biến + saved report | routes + service + `reports/` |
| `api` | Public API + webhook settings/dispatch | routes + service |
| `auth` | Login, JWT/refresh token, roles, teams, orgs, onboarding, security audit | routes + service + middleware |
| `birthday` | Chúc sinh nhật tự động: cấu hình 3 dịp (trước/đúng ngày/sau), lập kế hoạch hàng đợi + gửi theo giờ chọn | routes + planner/sender + crons |
| `branding` | Branding trang login theo org | routes |
| `campaign` | Quản lý chiến dịch | routes + service |
| `chat` | Conversation, message, folder, preset, attachment, reaction, Socket.IO, mẫu tin nhắn (CRUD + đính kèm, dùng cho gửi nhóm theo lịch) | routes + helpers + service |
| `config` | Endpoint cấu hình app | routes |
| `contacts` | CRUD contact CRM, lịch hẹn, note, tag, dedup/merge, cron — module lớn nhất (26 file) | routes + services + crons |
| `dashboard` | Dashboard, export Excel, action hub | routes + service |
| `devices` | Đăng ký device/session | routes |
| `engagement` | Heatmap engagement / priority scoring | routes + service + cron |
| `integrations` | Google Sheets, Zapier, Telegram bot + Telegram-bridge (core) | routes + service + `providers/` |
| `lists` | Tệp khách hàng, import, enrichment worker, event handler | routes + service |
| `media` | Upload/storage/GC media, xử lý ảnh (sharp) | routes + service + cron |
| `notifications` | Thông báo in-app | routes |
| `privacy` | Cổng PIN/OTP che dữ liệu, redaction, leak guard | routes + service |
| `push` | Firebase Cloud Messaging | service (không có routes) |
| `rbac` | Department, permission group, gán user, kiểm tra grant | routes + service + middleware |
| `scoring` | Engine chấm điểm lead, cron decay/stuck-detection, auto-tag | routes + service + engine + scheduler |
| `search` | Tìm kiếm toàn cục | routes |
| `system-notifications` | Thông báo hệ thống qua Zalo, handshake internal contact | routes + service |
| `tags` | Tag taxonomy v2 (definition, friend tag, contact CRM tag) | routes + service |
| `zalo` | Pool tài khoản zca-js, friend, group, label, sync, presence, credential, gửi nhóm hàng loạt theo lịch (`group-broadcast-*`, BullMQ queue riêng) — module lớn nhất (45 file) | routes + services + BullMQ queue/worker + crons |

70 file `*-routes.ts`, ~445 lần đăng ký endpoint (đếm bằng grep trên `backend/src/modules/**/*-routes.ts`).

## 3. `backend/src/shared/*` — tầng dùng chung

| Nhóm | Nội dung |
|---|---|
| `database/` | `prisma-client.ts` — singleton adapter `PrismaPg`, `$extends` tự derive `phoneNormalized`, strip NULL byte, bọc `SET LOCAL` RLS; `safe-contact-write.ts` |
| `tenant/` | `tenant-context.ts` (AsyncLocalStorage), `tenant-guard.ts`, `org-scoped-models.ts` — nền tảng multi-tenant |
| `realtime/` | `socket-auth.ts`, `emit-chat.ts` |
| `security/` | `security-headers.ts` (CSP), `hmac.ts` (chữ ký webhook), `clamav-client.ts` |
| `storage/` | `types.ts`, `local-driver.ts`, `r2-driver.ts` (S3-compatible), `minio-client.ts` — chọn theo `config.storageDriver` |
| `crypto/` | `aes-gcm.ts` — AES-256-GCM cho token/secret |
| `queue/` | `redis-connection.ts` — kết nối Redis dùng chung cho BullMQ |
| `ee-registry/` | `automation.ts`, `event-bus.ts`, `integrations.ts` — registry hook Community gọi vào, no-op khi thiếu `_ee` |
| `templating/`, `phone/` | `template-renderer.ts`, `normalize-vn-phone.ts` |
| `types/` | `.d.ts` augment `FastifyRequest` (`authCtx`) |
| `utils/` | `logger.ts` (tự viết, timestamp giờ VN), `phone.ts`, `image-metadata.ts`, `ssrf-guard.ts` |
| File rời | `redis-client.ts`, `event-buffer.ts`, `bridge-bus.ts`, `zalo-operations.ts`, `voice-sender.ts`, `video-processor.ts`, `friend-serializer.ts`, `text-formatter.ts`, `tag-slug.ts`, `telegram-bridge-config.ts` |

## 4. Frontend map (`frontend/src/*`)

- **Views** (`views/`): Login/Setup/ForcePasswordChange; Dashboard; Chat + MobileChat; Contacts/ContactProfile/MobileContact/CustomerActivityLog; Friends; Groups/GroupScan; Media; Appointments/AppointmentAction; ZaloAccounts; Analytics/Reports (legacy) + `views/reports/*` (7 màn: Overview, NickFleet, Sales, Pipeline, Engagement, Audit + shell); ScoringSettings/StuckLeads; Profile/Integrations/ApiSettings; `views/settings/*` (13 trang con, lồng trong `SettingsLayout.vue` — 6 nhóm: Cá nhân/Tổ chức/Team-RBAC/Cấu hình CRM/Kênh/Dev); `views/rbac/*`; `views/marketing/*` (`CommunityMarketingShell` + ListsView/ListDetailView + GroupBroadcastListView/DetailView/EditView + MessageTemplatesView — gửi tin hàng loạt vào nhóm Zalo theo lịch); NotFound.
- **Components** (`components/`, 222 file, 23 thư mục con): `chat/` là cụm lớn nhất (~50 file: bubble, reaction, editor Tiptap, voice/video message, AI suggestion bar) — trung tâm nghiệp vụ cùng `composables/use-chat.ts`; các nhóm còn lại theo domain: `ai/`, `analytics/`, `appointments/`, `branding/`, `contacts/`, `dashboard/`, `friends/`, `groups/`, `icons/`, `lists/`, `marketing/` (`ScheduleEditor.vue`, `TemplateEditorDialog.vue`, `schedule-model.ts` — dùng cho gửi nhóm theo lịch), `media/`, `onboarding/`, `privacy/`, `profile/`, `rbac/`, `scoring/`, `settings/`, `ui/` (Avatar, ConfirmHost, TagChipList, ToastContainer), `users/`, `zalo/`, `zalo-accounts/`.
- **Composables** (`composables/`, 56 file, tầng business logic/state thực sự — Pinia chỉ 3 store rất mỏng so với tầng này), nhóm theo domain:
  - Chat: `use-chat`, `use-chat-operations`, `use-chat-contact-panel`
  - Contacts: `use-contacts`, `use-contact-cockpit`, `use-contact-profile`
  - Friends: `use-friends`, `use-friends-state`, `use-friend-socket`, `use-friend-display`
  - Groups: `use-groups`, `use-group-operations`, `use-group-avatar-cache`
  - Appointments: `use-appointments`, `appointment-helpers`
  - Zalo accounts: `use-zalo-accounts` (+ dashboard/friend-status/phone-check/presence)
  - Scoring/Dashboard/Analytics: `use-scoring`, `use-dashboard`, `use-dashboard-action-hub`, `use-analytics`
  - Marketing/Automation: `use-automation-rules`, `use-customer-lists`, `use-group-broadcasts`, `use-ce-message-templates` (mẫu tin CE `/message-templates` — khác `use-message-templates` cũ trỏ `/automation/templates` của EE, 2 đường chạy song song)
  - RBAC/Org: `use-privacy-visibility`, `use-tag-taxonomy`, `use-crm-tag-defs`, `use-teams`, `use-users`, `use-work-scope` (+ `work-scope-logic`, có `.spec.ts`), `use-org-timezone`
  - Tiện ích chung: `use-polls`, `use-notes`, `use-timeline`, `use-offline-queue`, `use-pending-mutations`, `use-message-templates`, `use-relative-time`, `use-phone-format`, `use-rich-format`, `use-inbox-filters`, `use-selected-account`, `use-settings-nav`, `use-mobile`, `use-toast`, `use-confirm`
- **Pinia store** (chỉ 3, tại `stores/`): `auth.ts` (composition-style — user/grants RBAC, token, `canAccess()`, `login/logout/init`), `privacy.ts` (options-style — trạng thái phiên unlock OTP), `rbac.ts` (options-style — cây department/permission group). Bất nhất cố ý: `auth` composition, 2 store còn lại options.
- **API layer** (`api/`): `index.ts` — 1 instance axios `baseURL: /api/v1`, interceptor gắn JWT + xử lý 401 refresh single-flight; `socket.ts` — factory `createAppSocket()`, tự heal khi server ngắt do token hết hạn; `media.ts`, `public-branding.ts` là 2 helper riêng, phần lớn gọi path literal trực tiếp trong composable/store.
- **Constants/lib/utils/layouts**: `constants/` (`activity-types.ts`, `auto-tags.ts`, `care-status.ts`, `template-variables.ts`); `lib/source-badge.ts` (badge nguồn lead); `utils/zalo-rich-to-markup.ts`; `layouts/` (`DefaultLayout.vue` 561 dòng, `MobileLayout.vue`, `AuthLayout.vue`).
- **`_ee-stubs/`**: stub Community cho Enterprise Edition, alias `@ee` fallback khi `src/_ee` vắng mặt — `edition.ts` (`isExtension=false`), `nav.ts`, `routes.ts` (mảng rỗng), `automation/` (component stub rỗng), `lead-pool/components/LeadFloatingButton.vue`.

## 5. Đọc file nào trước (onboard nhanh)

| # | File | Vì sao đọc trước |
|---|---|---|
| 1 | `backend/src/app.ts` | Entry point — thứ tự plugin, socket, open-core loader, ~60 route plugin, cron/worker sau `listen`, graceful shutdown |
| 2 | `backend/src/config/index.ts` | Toàn bộ biến môi trường được đọc 1 lần lúc boot, `requireSecret()` fail-fast production |
| 3 | `backend/src/shared/database/prisma-client.ts` | Prisma client singleton, `$extends` derive phoneNormalized/strip NULL byte, RLS wrapper |
| 4 | `backend/src/shared/tenant/tenant-context.ts` | Nền tảng multi-tenant AsyncLocalStorage — mọi query org-scoped đi qua đây |
| 5 | `backend/prisma/schema.prisma` | Nguồn chân lý data model — 108 model, 2 enum |
| 6 | `frontend/src/main.ts` | Bootstrap app FE — thứ tự import CSS cascade, cài Pinia/router/Vuetify |
| 7 | `frontend/src/router/index.ts` | Toàn bộ route (412 dòng) + guard auth/RBAC/force-password-change |
| 8 | `frontend/src/api/index.ts` | Axios instance + luồng refresh token single-flight — nguồn chân lý cho auth HTTP |
| 9 | `frontend/src/api/socket.ts` | Factory socket + cơ chế heal khi bị server ngắt do token hết hạn |
| 10 | `frontend/src/stores/auth.ts` | State auth + `canAccess()` RBAC phía FE |
| 11 | `frontend/src/plugins/vuetify.ts` | Theme `hsLight` mặc định, defaults component toàn cục |
| 12 | `docker-compose.yml` | Topology 7 service production (app/db/redis/minio/minio-init/backup/clamav) |
| 13 | `scripts/zalocrm-deploy.sh` | Installer/upgrader idempotent — cách hệ thống thực sự lên production |
| 14 | `.env.example` | Toàn bộ biến môi trường khả dụng, nhóm theo tính năng |
| 15 | `backend/vitest.config.ts` / `frontend/vitest.config.ts` | Cấu hình test, phạm vi coverage thực tế |

## 6. Script npm

**Backend** (`backend/package.json`):

| Script | Lệnh | Mục đích |
|---|---|---|
| `dev` | `tsx watch src/app.ts` | Chạy dev với hot-reload |
| `build` | `tsc` | Biên dịch TypeScript sang `dist/` |
| `start` | `node dist/app.js` | Chạy production build |
| `db:migrate` | `prisma migrate dev` | Tạo/áp migration ở dev |
| `db:push` | `prisma db push` | Đồng bộ schema không qua migration |
| `db:seed` | `tsx prisma/seed.ts` | Seed dữ liệu mẫu |
| `db:studio` | `prisma studio` | UI xem/sửa DB |
| `test` | `vitest run` | Chạy toàn bộ test 1 lần |
| `test:watch` | `vitest` | Chạy test ở chế độ watch |
| `test:coverage` | `vitest run --coverage` | Chạy test kèm coverage v8 |

**Frontend** (`frontend/package.json`):

| Script | Lệnh | Mục đích |
|---|---|---|
| `dev` | `vite` | Dev server |
| `build` | `vue-tsc -b && vite build` | Typecheck rồi build production |
| `preview` | `vite preview` | Xem thử build production |
| `test` | `vitest run` | Chạy test 1 lần |
| `test:watch` | `vitest` | Test watch mode |

## 7. Tình trạng test

- **Backend**: 89 file Vitest (`backend/tests/`) — 67 file phẳng ở root (gồm 6 file cho gửi nhóm theo lịch: `group-broadcast-{schedule,cron,routes,send,worker}.test.ts`, `message-template-routes.test.ts`) + `tests/security/` (10 file: tenant-guard, refresh-token-service, socket-auth, security-headers, security-audit, require-active-user, auth-flow, hmac, tenant-context, ai-capabilities) + `tests/unit/` (12 file: Facebook AES-GCM/webhook/form-discovery/token-refresh, lead-field-mapper, chuẩn hoá phone, round-robin-assigner, tag apply/dual-write/merge/slug, zalo-field-mapper), cộng 1 test đặt cạnh source (`src/modules/contacts/zalo-profile-capture.test.ts`). Thiên về **regression** (nhiều tên file gắn bug cụ thể, vd `regression-m51-4-dup-status.test.ts`) — trọng tâm privacy/redaction, dedup/merge, group scan, media dedup/GC, care-session/sequence gate, RBAC/tenant/security primitive, SSRF/SQLi guard. Không có suite CRUD happy-path theo route.
  - Chạy: `cd backend && npm run test` (hoặc `test:coverage`). `DATABASE_URL` giả mặc định cho phép unit test import `prisma-client.ts` không cần DB thật.
- **Frontend**: chỉ **2 file spec** trên 319 file (`src/components/chat/slash-popup-rules.spec.ts`, `src/composables/work-scope-logic.spec.ts`) dù đã cài `@vue/test-utils` + `jsdom`. Coverage cấu hình chỉ tính `src/composables/**/*.ts`.
  - Chạy: `cd frontend && npm run test`.
- Không có CI (`.github/` không tồn tại) — quality gate hiện là thủ công (`tsc --noEmit`, `vue-tsc -b`, `npm run build`) theo `CONTRIBUTING.md`.

## 8. Tài liệu khác

| Tài liệu | Nội dung |
|---|---|
| [`docs/system-architecture.md`](./system-architecture.md) | Kiến trúc hệ thống chi tiết (sơ đồ, luồng boot, multi-tenant, auth, realtime, async, storage, open-core, deploy, bảo mật) |
| [`docs/HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md`](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md) | Runbook production chuẩn (cài 1 lệnh, domain/HTTPS, upgrade) |
| [`docs/HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md`](./HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md) | Cấu hình Cloudflare R2 |
| [`docs/HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md`](./HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md) | Cấu hình Telegram bridge (bot + provisioner MTProto) |
| [`docs/zalocrm-api/api-documentation.md`](./zalocrm-api/api-documentation.md) | Tham chiếu REST API đầy đủ (bản tiếng Việt: `api-documentation-vi.md`) |
| [`docs/architecture/README.md`](./architecture/README.md) | 3 bộ diagram cũ (system architecture, module map, data model Contact-vs-Friend). Số liệu đã lệch (ghi 23 module/93 model) — số đúng hiện tại là **25 module / 108 model** |
| `docs/playbook-bds/*`, `docs/playbook-dao-tao/*` | Playbook người dùng cuối theo ngành (bất động sản, đào tạo) |
| `README.md` (root) | Landing: tính năng, yêu cầu hệ thống, quick install, tech stack |
| `CHANGELOG.md` | Lịch sử phiên bản v1.0.0 → v3.4.0 |
