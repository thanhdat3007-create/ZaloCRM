# Roadmap & Ưu tiên kỹ thuật — ZaloCRM

Cập nhật: 2026-08-03 · Phiên bản: v3.4.0 · Phạm vi: bản Community

> File này KHÔNG cam kết ngày phát hành hay số version tương lai. Các mục ở §3 là **đề xuất ưu tiên chờ maintainer chốt**, dựa trên gap kỹ thuật xác minh được trong code tại thời điểm viết.

## 1. Trạng thái hiện tại

- Phiên bản hiện hành: **v3.4.0**, phát hành 2026-06-20.
- v3.4.0 là bản đầu tiên chuyển sang mô hình open-core (Community/Enterprise) và **relicense sang AGPL-3.0** (xem `docs/project-overview-pdr.md` §7).
- Nội dung chính của v3.4.0: redesign UI + Dashboard, siết bảo mật (access token ngắn + refresh xoay vòng, CSP, RBAC phòng ban, audit log, Privacy PIN), quét nhóm Zalo, bộ báo cáo mới (Overview/Nick Fleet/Sales/Engagement/Audit/Pipeline), cầu Zalo↔Telegram 2 chiều, API đầy đủ cho ZCRM Mobile App, Public REST API + Postman collection.

Nguồn: `CHANGELOG.md` mục `[3.4.0] - 2026-06-20`.

## 2. Đường phát hành (tag → CHANGELOG)

| Tag | Ghi chú |
|---|---|
| `v1.0.0` → `v3.3.4` | Lịch sử kế thừa từ repo upstream `rocket-ai-global/rocket-zalo-crm`, trước khi tách open-core |
| `v3.3.3` (28/05/2026) | Theo `CHANGELOG.md` |
| `v3.3.4` (06/06/2026) | Bản phát hành thuần tài liệu — không đổi code runtime: `docs/system-architecture.md`, `docs/database-architecture.md`, `docs/api-documentation.md` (+ bản VI), Postman collection, thiết kế tích hợp TCRM |
| `pre-reconcile-oss` | Tag mốc trước khi hợp nhất nhánh open-core |
| `v3.4.0` (20/06/2026) | Bản hiện hành — xem §1 |

Nhịp phát hành quan sát được: gần như hàng tháng trong nửa đầu 2026 (v3.2.0 21/05, v3.3.0 25/05, v3.3.1–v3.3.4 cuối tháng 5/đầu tháng 6, v3.4.0 20/06).

Sau v3.4.0, các commit trên `main` là công việc curate bản Community (không tăng version): dọn brand (Rocket Team, logo mặc định Community), `install.ps1` cho Windows, tự né port trùng khi deploy, chuẩn hoá lệnh cài one-liner theo OS trong docs, và tính năng **gửi tin nhắn hàng loạt vào nhóm Zalo theo lịch** (🟢 Community — `dc592712` backend, `07242fd2` frontend, `3cb3d91c` RLS/comment) — xem `docs/system-architecture.md` §6-7 và `docs/codebase-summary.md` §2/§4 cho chi tiết kỹ thuật.

Nguồn: `CHANGELOG.md`, `git tag --sort=creatordate`, `git log --oneline` (xác minh trực tiếp).

## 3. Việc đang chạy (suy ra từ `plans/`)

2 plan trạng thái **draft/pending — chưa duyệt** trong `plans/`, tạo cùng ngày 2026-08-03:

| Plan | Mục tiêu | Tier | Trạng thái |
|---|---|---|---|
| `plans/260803-1228-ai-cham-soc-tu-dong/` | AI agent tự động trả lời khách trên Zalo: system prompt + kho tài liệu riêng theo agent, gọi model qua OpenRouter bằng Vercel AI SDK, gán agent theo từng số Zalo (nick) | không ghi rõ tier trong `plan.md` | DRAFT — chờ duyệt |
| `plans/260803-1230-i-theme-ui-sang-phong-cch-shopify-polaris/` | Reskin toàn bộ frontend Vue 3 + Vuetify 4 sang ngôn ngữ thị giác Shopify Polaris (đổi palette/typography/spacing/radius, giữ nguyên Vuetify, không chuyển sang React); primary đổi từ `#1786be` sang xanh Shopify `#008060` | frontend | pending, priority P1 |

`plans/260803-1242-gui-tin-nhom-theo-lich/` (gửi tin nhắn hàng loạt vào nhóm Zalo theo lịch) đã **triển khai xong** và lên `main` — không còn ở trạng thái draft, xem §2.

Đây là plan chưa được duyệt/triển khai, chỉ phản ánh **ý định** tại thời điểm viết — không phải cam kết roadmap chính thức.

Nguồn: đọc trực tiếp `plans/260803-1228-ai-cham-soc-tu-dong/plan.md`, `plans/260803-1230-i-theme-ui-sang-phong-cch-shopify-polaris/plan.md`.

## 4. Gap kỹ thuật đã xác minh & đề xuất ưu tiên

Tất cả mục dưới đây là **đề xuất**, chờ maintainer chốt độ ưu tiên và lịch trình thật.

### Ngắn hạn (rủi ro vận hành/bảo mật trực tiếp)

| Hạng mục | Lý do | Tác động | Bằng chứng |
|---|---|---|---|
| Điền `SECURITY.md` thật | File hiện vẫn là template GitHub gốc (bảng version giả `5.1.x`/`4.0.x`, hướng dẫn placeholder "Tell them where to go...") | Không có kênh báo lỗ hổng bảo mật rõ ràng cho cộng đồng/khách hàng self-host | `SECURITY.md` (đọc trực tiếp) |
| Vá link chết trong docs hướng dẫn Telegram bridge | `docs/HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md` trỏ tới `user-guide/07i-telegram-bridge.md` — không tồn tại | Người tự host làm theo hướng dẫn gặp link chết khi cấu hình tính năng core (không phải EE) | `docs/HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md` |
| Sửa link chết `docs/mobile-push-setup-guide.md` trong `.env.example` | Biến push Firebase trỏ tới doc không tồn tại trong checkout | Admin cấu hình push notification không có hướng dẫn | `.env.example` (dòng nhắc `docs/mobile-push-setup-guide.md`) |
| Gỡ hoặc làm rõ nhắc tới `docker-compose.montgomery.yml` | `.env.example` nhắc file compose không có trong bản Community | Gây nhầm lẫn cho người tự host, tưởng thiếu file cấu hình | `.env.example` |
| Cập nhật số liệu lỗi thời ở `docs/architecture/README.md` | Doc ghi "23 module / 93 model" (tạo 2026-06-16); thực tế hiện tại **25 module** (`ls backend/src/modules`), **108 model** (`grep -c "^model " backend/prisma/schema.prisma`) — cả 2 đã xác minh lại trực tiếp trong phiên viết docs này | Sơ đồ kiến trúc tham chiếu sai quy mô hệ thống cho người đọc mới | `docs/architecture/README.md` (dòng 10, 19, 20, 23); đếm trực tiếp `backend/src/modules/`, `backend/prisma/schema.prisma` |

### Trung hạn (nợ kỹ thuật ảnh hưởng chất lượng/tốc độ phát triển)

| Hạng mục | Lý do | Tác động | Bằng chứng |
|---|---|---|---|
| Thiết lập CI (GitHub Actions hoặc tương đương) | Không có thư mục `.github/` — mọi quality gate (`tsc --noEmit`, `vue-tsc -b`, `npm run build`) chạy thủ công trước PR | Rủi ro lọt lỗi build/type khi PR không chạy đủ bước thủ công | xác nhận không có `.github/` trong repo |
| Tăng test coverage frontend | Chỉ 2 file `*.spec.ts` trên 310 file source (`src/components/chat/slash-popup-rules.spec.ts`, `src/composables/work-scope-logic.spec.ts`), dù đã cài `@vue/test-utils` + `jsdom` | Refactor UI (vd plan đổi theme Polaris ở §3) không có lưới an toàn tự động | `frontend/vitest.config.ts`, đếm trực tiếp file `*.spec.ts` |
| Quyết định dứt điểm `vue-i18n`: dùng hoặc gỡ | Package có trong `package.json` nhưng grep `vue-i18n|useI18n|createI18n` trên `frontend/src/` ra 0 kết quả, không có thư mục `locales/` | Dependency chết làm phình bundle/tăng nhiễu khi audit dependency | `frontend/package.json`, xác nhận grep 0 kết quả trên `frontend/src/` |
| Rà soát 2 file CSS có thể chết: `assets/airtable.css`, `assets/atlas-v2-dashboard.css` | 2 file không được `import` trong `frontend/src/main.ts` — **CHƯA xác minh** có view nào `import()` động hay không | Nếu thực sự chết: tăng thời gian audit style; nếu vẫn dùng: cần ghi rõ trong tài liệu design system | `frontend/src/main.ts` (thứ tự import CSS), `frontend/src/assets/airtable.css`, `frontend/src/assets/atlas-v2-dashboard.css` — **cần xác minh thêm bằng grep toàn repo trước khi xoá** |
| Chốt lộ trình gỡ bỏ đường RBAC legacy | 2 tầng RBAC song song đang dual-read: `modules/auth/role-middleware.ts` (`requireRole`) và `modules/rbac/` (grant resource×action); `role === 'owner'` bypass toàn bộ grant trong giai đoạn migrate | Rủi ro cấp/thu quyền không nhất quán nếu chỉ sửa 1 đường; tăng phức tạp khi debug phân quyền | `backend/src/modules/auth/role-middleware.ts`, `backend/src/modules/rbac/rbac-middleware.ts` |
| Thống nhất style Pinia store | `stores/auth.ts` dùng Composition API, `stores/privacy.ts` + `stores/rbac.ts` dùng Options API — chỉ 3 store tổng cộng nhưng đã bất nhất | Tăng chi phí onboarding dev mới, dễ nhầm pattern khi thêm store thứ 4 | `frontend/src/stores/auth.ts`, `frontend/src/stores/privacy.ts`, `frontend/src/stores/rbac.ts` |
| Thống nhất casing tên file component | 222 file `.vue`: đa số PascalCase (126 file, vd `KpiCards.vue`) nhưng 35 file kebab-case (vd `message-bubble.vue`, `friend-list.vue`) — chia theo module cũ (chat/friends/groups/profile) vs module mới | Không chặn phát triển nhưng gây nhiễu khi tìm file bằng Glob/IDE fuzzy search | đếm trực tiếp `frontend/src/components/**/*.vue` |

### Dài hạn (rủi ro nền tảng/kiến trúc)

| Hạng mục | Lý do | Tác động | Bằng chứng |
|---|---|---|---|
| Giảm phụ thuộc vào `zca-js` không chính thức | Toàn bộ tính năng lõi (chat, bạn bè, nhóm, presence) dựa trên SDK reverse-engineer Zalo, không phải API chính thức VNG | Zalo đổi protocol có thể làm gãy toàn hệ thống bất kỳ lúc nào, không có SLA từ nhà cung cấp | `backend/src/modules/zalo/zalo-pool.ts` và toàn bộ module `zalo` (43 file) |
| Chính thức hoá gate `_ee` bằng CI thật | Comment trong `backend/src/modules/zalo/group-scan-queue.ts` nhắc "CI `scripts/check-no-ee-leak.sh` fail nếu import `_ee`" nhưng file này **không tồn tại** trong `scripts/` của checkout — chỉ là quy ước ghi trong comment | Không có gate tự động chặn Community vô tình import `_ee`, rủi ro rò rỉ code EE vào bản Community qua PR bất cẩn | xác nhận `scripts/check-no-ee-leak.sh` không có trong `scripts/`; nhắc tới trong `backend/src/modules/zalo/group-scan-queue.ts` dòng 9 |
| Đánh giá bật `RLS_SET_CONFIG` / `TENANT_GUARD_MODE=enforce` mặc định | Cô lập multi-tenant hiện dựa chính vào AsyncLocalStorage + Prisma `$extends` guard; Postgres Row-Level-Security (`prisma/rls/tenant-rls.sql`) là tuỳ chọn, **mặc định tắt** | Nếu guard tầng ứng dụng có lỗi, không có lớp phòng thủ thứ 2 ở tầng DB trừ khi admin tự bật | `backend/src/config/index.ts` (`rlsSetConfig`, `tenantGuardMode`), `backend/prisma/rls/tenant-rls.sql` |
| Xem xét mặc định bật ClamAV (`MEDIA_AV_ENABLED`) | Service `clamav` có sẵn trong `docker-compose.yml` nhưng `app` không `depends_on`, mặc định fail-open | File upload từ khách hàng qua chat có thể chứa mã độc mà không bị quét trừ khi admin tự bật | `docker-compose.yml` (service `clamav`), `.env.example` (`MEDIA_AV_ENABLED`) |

Nguồn tổng hợp: đọc trực tiếp các file mã nguồn/doc liệt kê trong cột "Bằng chứng"; đối chiếu với `git log`, `CHANGELOG.md`.

## 5. Liên kết liên quan

- Bối cảnh sản phẩm & mô hình open-core: `./project-overview-pdr.md`
- Kiến trúc kỹ thuật: `./system-architecture.md`
- Chuẩn code: `./code-standards.md`
- Sơ đồ hệ thống hiện có (số liệu cần cập nhật — xem §4 Ngắn hạn): `./architecture/README.md`
