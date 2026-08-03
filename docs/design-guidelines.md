# Design Guidelines — ZaloCRM

Cập nhật: 2026-08-03 · Phiên bản: v3.4.0 · Phạm vi: bản Community

Tài liệu mô tả **hệ thiết kế UI hiện tại** đủ để dev mới dựng màn hình đúng phong cách repo. Mọi claim đọc trực tiếp từ `frontend/src/plugins/vuetify.ts`, `frontend/src/assets/tokens.css`, `frontend/src/main.ts`. Chỗ là đề xuất (chưa chốt) được ghi rõ, tách khỏi hiện trạng.

## 1. Kiến trúc 2 tầng

Design system gồm 2 tầng chồng lên nhau, không thay thế nhau:

1. **Theme Vuetify 4** (`frontend/src/plugins/vuetify.ts`) — màu, radius, defaults component qua object `createVuetify({ theme, defaults })`.
2. **CSS custom property + stylesheet global** (`frontend/src/assets/`) — token `--smax-*` (di sản đặt tên "Smax"), utility class, và 1 file CSS lớn chia PART theo màn hình.

### Thứ tự import CSS trong `main.ts` — quan trọng vì cascade

```ts
// frontend/src/main.ts
import './assets/tokens.css';
import './assets/main.css';
import './assets/rbac-page.css';
import './assets/hs-crm-theme.css'; // load CUỐI để thắng cascade (migration 2026-06-05)
import './assets/report-kit.css';
```

`hs-crm-theme.css` cố ý load gần cuối (trước `report-kit.css`) để các rule của redesign "HS Holding" (2026-06-05) thắng các rule cũ hơn trong `tokens.css`/`main.css`/`rbac-page.css` khi cùng specificity. Khi thêm CSS mới cần ghi đè theme hiện tại, đặt file sau `hs-crm-theme.css` trong `main.ts`, hoặc thêm vào trong chính file đó — không chèn trước nó.

`registerSW` (PWA service worker) đang bị **comment/tắt** trong `main.ts` vì `vite-plugin-pwa` chưa tương thích Vite 8, dù dependency + `public/manifest.json` + icon vẫn còn trong repo — coi PWA install prompt là chưa hoạt động cho tới khi được bật lại.

## 2. Bảng token màu

### Theme Vuetify — `hsLight` (mặc định, `defaultTheme: 'hsLight'`)

Redesign "HS Holding" (migration 2026-06-05), định nghĩa tại `frontend/src/plugins/vuetify.ts`:

| Token | Giá trị | Ghi chú |
|---|---|---|
| `primary` | `#1786be` | brand chính |
| `primary-darken-1` | `#0f6fa0` | |
| `secondary` | `#5bb8e5` | brand-bright |
| `accent` | `#0b5880` | brand-700 |
| `background` | `#f7f9fc` | surface-2 |
| `surface` | `#ffffff` | |
| `surface-variant` | `#f1f4f9` | |
| `success` | `#12b76a` | |
| `warning` | `#f5a524` | |
| `error` | `#f04438` | |
| `info` | `#1786be` | |
| `nav-a` / `nav-b` / `nav-accent` | `#0e445a` / `#06222f` / `#5bb8e5` | màu top-nav |

`variables`: `border-color: #e7eaf0`, `theme-radius: 8px`, `high-emphasis-opacity: 1`, `medium-emphasis-opacity: 0.78`.

### Theme dự phòng — dự kiến dọn

`smax-light` và `legacy-dark` vẫn định nghĩa trong `vuetify.ts` để giữ fallback cho view chưa migrate sang `hsLight`. Comment trong code ghi rõ **"sẽ rút ở cụm cleanup cuối"** — không tạo view mới dựa trên 2 theme này.

### Token CSS `--smax-*` — `frontend/src/assets/tokens.css`

Đặt tên di sản "Smax" (mirror `frontend/public/chat-smax-v3.html`), dùng bởi top nav (`DefaultLayout`), `ChatView`, `ContactsView`, `FriendsView`:

| Nhóm | Token tiêu biểu |
|---|---|
| Brand | `--smax-primary: #1786be`, `--smax-primary-hover: #0f6fa0`, `--smax-primary-soft`, `--smax-primary-700` |
| Trạng thái | `--smax-success`, `--smax-warning`, `--smax-info`, `--smax-error` |
| Grey scale | `--smax-grey-50` … `--smax-grey-700`, `--smax-text` |
| Label-chip CRM (6 màu, base + active) | `--smax-chip-red`/`-red-text`/`-red-active`, tương tự cho `purple`, `orange`, `green`, `blue`, `yellow` |
| Typography | `--smax-font-base: 14.3px` (bằng 13px gốc +10%), `--smax-font-small: 12px`, `--smax-font-tiny: 11px`, `--smax-line-height: 1.45` |
| Radius/spacing | `--smax-radius-sm/md/lg/xl` (4/7/9/13px), `--smax-topnav-h: 48px` |

Lưu ý: `--smax-primary` (`#1786be`) khớp `primary` của theme `hsLight` — 2 tầng đồng bộ về màu brand chính dù khác cơ chế.

## 3. Mặc định component Vuetify toàn cục

Khai báo trong `defaults` của `createVuetify(...)` (`frontend/src/plugins/vuetify.ts`):

```ts
defaults: {
  VBtn: { variant: 'flat', rounded: 'md', style: 'text-transform:none;letter-spacing:0;' },
  VTextField: { variant: 'outlined', density: 'compact' },
  VSelect: { variant: 'outlined', density: 'compact' },
  VAutocomplete: { variant: 'outlined', density: 'compact' },
  VTextarea: { variant: 'outlined', density: 'compact' },
  VCard: { rounded: 'lg', variant: 'flat' },
  VChip: { rounded: 'pill', size: 'small' },
  VDialog: { maxWidth: 600 },
},
```

**Hệ quả: KHÔNG lặp lại các prop này ở từng component instance.** Vd không cần viết `<v-text-field variant="outlined" density="compact" .../>` — chỉ viết `<v-text-field .../>` và mặc định tự áp. Chỉ set prop tường minh khi cần **ghi đè** giá trị mặc định (vd `<v-dialog max-width="900">` cho dialog rộng hơn 600px).

## 4. Utility class có sẵn

Định nghĩa trong `frontend/src/assets/tokens.css`:

| Class | Dùng cho |
|---|---|
| `.smax-status-pill` (+ `.smax-pill-success/-warning/-info/-grey/-error`) | Pill trạng thái nhỏ, màu theo state |
| `.smax-label-chip[data-color="red\|purple\|orange\|green\|blue\|yellow"]` (+ `.active`) | Chip nhãn CRM, viền màu khi thường, nền đặc khi `.active` |
| `.smax-avatar` (+ `.is-group`, `.platform-mark`) | Avatar tròn, gradient theo loại (user/group) |
| `.smax-toggle-pill` (+ `.on`) | Toggle switch dạng pill |

Module Báo cáo có scope CSS riêng `.rpt-scope` trong `frontend/src/assets/report-kit.css` (117 dòng) — style trong file này chỉ áp dụng khi element nằm trong `.rpt-scope`, không rò ra ngoài.

## 5. Màu ngữ nghĩa nghiệp vụ

Các hàm/hằng số ánh xạ giá trị nghiệp vụ sang màu UI, tránh mỗi component tự định nghĩa lại:

- **`scoreLevel(score)`** + **`SCORE_COLORS`** (`frontend/src/plugins/vuetify.ts`) — 4 mức `zero|low|mid|high` theo ngưỡng điểm (0 / <40 / <70 / ≥70), mỗi mức có `{ bg, fg }`.
- **`REL_KIND`** (cùng file) — màu badge theo trạng thái quan hệ Zalo: `friend` (xanh lá, "Đã kết bạn"), `pending_friend` (vàng cam, "Đã gửi mời"), `chatting_stranger` (xanh dương, "Đang nhắn lạ"), `ghost` (xám, "Đã ngắt").
- **`constants/care-status.ts`** — 9 trạng thái chăm sóc theo friend.
- **`lib/source-badge.ts`** — badge nguồn lead (vd `fb-leadads`, `tiktok-leadgen`, `zalo-ads`).

Khi hiển thị điểm số/quan hệ/trạng thái chăm sóc/nguồn lead trong UI mới, tái dùng các hàm/hằng số này thay vì hard-code màu mới.

## 6. Icon

- **MDI** (`@mdi/font`) là hệ chính — 93 file dùng class `mdi-*`, import global qua `import '@mdi/font/css/materialdesignicons.css'` trong `vuetify.ts`.
- **`lucide-vue-next`** xuất hiện ở 19 file mới hơn.

Hiện trạng là **hệ icon hỗn hợp**. **Khuyến nghị** (chưa chốt với maintainer): chọn 1 hệ cho code mới thay vì trộn — do MDI đang là mặc định toàn cục và có số lượng dùng lớn hơn, ưu tiên MDI cho tính nhất quán trừ khi có quyết định khác từ maintainer.

## 7. Layout & responsive

- **`DefaultLayout.vue`** (561 dòng) — shell desktop, có top nav; **`MobileLayout.vue`** (66 dòng) — shell mobile; chọn động qua composable `use-mobile.ts` (đọc trong `App.vue`).
- **`AuthLayout.vue`** (18 dòng, Options API) — dùng riêng cho trang đăng nhập/setup (`route.meta.layout === 'auth'`).
- View riêng dành cho mobile (không dùng chung component desktop): `MobileChatView`, `MobileContactView`.
- Component hỗ trợ mobile: `BottomNav`, `MobileQuickActions`, `PullToRefresh`, `OfflineIndicator`.

## 8. Pattern UI dùng lại

`frontend/src/components/ui/` — component UI generic dùng xuyên app: `Avatar`, `CareStatusBadge`, `ConfirmHost`, `TagChipList`, `ToastContainer`.

- **Dialog xác nhận**: dùng composable `use-confirm.ts` thay vì `window.confirm()` gốc trình duyệt. `ConfirmHost` được mount 1 lần global (trong `App.vue`).
- **Toast**: dùng `use-toast.ts` (`useToast().push(...)`), state singleton module-scope, render qua `<ToastContainer/>` mount ở `DefaultLayout`. Hỗ trợ action button kiểu "Hoàn tác" (undo, tự dismiss sau timeout).

## 9. Ràng buộc thương hiệu / pháp lý

Theo `NOTICE` (AGPL-3.0 §7(b) và §13) — đây là **ràng buộc pháp lý bắt buộc**, không phải tuỳ chọn UI:

- **Banner attribution** ("contact-marquee") ở top navigation phải được **giữ nguyên**, không được gỡ/ẩn trong bản deploy phái sinh khi chưa có giấy phép thương mại.
- **Link "Mã nguồn" (Source code)** ở trang đăng nhập trỏ tới repo công khai phải được **giữ nguyên** (AGPL §13 — network use clause).
- Nhãn hiệu **"ZCRM"/logo KHÔNG thuộc phạm vi AGPL** — bên fork phải đổi thương hiệu riêng nếu deploy công khai, nhưng đây là vấn đề nhãn hiệu, tách biệt với nghĩa vụ giữ banner/link nói trên.

Tài liệu này chỉ nêu ràng buộc để dev nhận biết khi động vào top-nav hoặc trang login — **không có hướng dẫn nào ở đây, và sẽ không có, về việc gỡ/ẩn/thay đổi banner hay link nguồn**.

## 10. i18n — hiện trạng: chưa dùng

`vue-i18n` có trong `dependencies` của `frontend/package.json` nhưng **không được sử dụng ở đâu trong `src/`** (không có `useI18n`/`createI18n`, không có thư mục `locales/`). Toàn bộ chuỗi UI hard-code tiếng Việt trực tiếp trong SFC/constant (vd map tiêu đề tab route). Đây là **gap kỹ thuật đã biết**, không phải quy ước "không cần i18n" — coi `vue-i18n` là dependency chưa đấu nối cho tới khi có quyết định khác.

## 11. CSS import cục bộ (không qua `main.ts`)

`frontend/src/assets/airtable.css` (568 dòng) và `frontend/src/assets/atlas-v2-dashboard.css` (178 dòng) **không nằm trong danh sách import của `main.ts`**, nhưng **không phải code chết** — đã xác minh bằng grep: cả hai được import cục bộ ngay trong `<style>` của các SFC dùng chúng, thay vì global.

- `airtable.css` — import qua `@import '@/assets/airtable.css';` trong `<style>` của: `components/appointments/AppointmentDetailPanel.vue`, `AppointmentEditor.vue`, `AppointmentsListView.vue`, `AppointmentsWeekView.vue`, `AppointmentsSidebar.vue`, `views/AppointmentsView.vue` — tức là design system riêng cho cụm màn hình **Lịch hẹn** (Airtable-style layout).
- `atlas-v2-dashboard.css` — import trực tiếp (`import '@/assets/atlas-v2-dashboard.css';`) trong `views/DashboardView.vue`; bản thân file này `@import './airtable.css';` ở dòng đầu (v2 build trên nền v1, class scope dưới `.airtable-scope`, quy ước nội bộ "APPEND, DO NOT REDEFINE" — không ghi đè token/class của `airtable.css`).

Đây là 1 style layer thứ 3 (ngoài Vuetify theme + `--smax-*`/`hs-crm-theme.css`), scope hẹp cho Lịch hẹn/Dashboard, dùng token `--at-*` riêng (vd `--at-coral`). Khi sửa layout Lịch hẹn hoặc Dashboard, cần biết stylesheet áp dụng là `airtable.css`/`atlas-v2-dashboard.css`, không phải `hs-crm-theme.css`.

---

Xem thêm: [`docs/code-standards.md`](./code-standards.md) cho quy ước code chung (bao gồm quy ước comment/naming áp dụng cả cho SFC frontend).
