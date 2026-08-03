# Ảnh minh hoạ cho playbook

Sinh lại toàn bộ ảnh trong `docs/playbook-bds/images/` từ **chính app thật**,
với dữ liệu giả.

## Chạy

```bash
# Terminal 1 — dev server (không cần backend, không cần Docker)
cd frontend && npm install && npm run dev

# Terminal 2
cd scripts/playbook-screenshots
npm install
npx playwright install chromium   # lần đầu
node shoot.mjs
```

Ảnh ghi đè vào `docs/playbook-bds/images/*.png`, kèm `_report.json` liệt kê lỗi
console và endpoint chưa mock của lần chạy.

## Nó hoạt động thế nào

Mở app thật bằng Chromium, chặn mọi request `/api/v1/**` ở tầng mạng và trả
dữ liệu trong `mock-data.mjs`. **Không sửa một dòng code frontend nào** — nên
ảnh chụp ra đúng bằng giao diện production, chỉ khác phần dữ liệu.

Ưu điểm so với việc vẽ lại giao diện bằng HTML tay: UI đổi thì chạy lại lệnh là
ảnh tự cập nhật, không bao giờ lệch khỏi app thật.

## Quy tắc khi sửa

**Không bao giờ trỏ script này vào backend thật rồi chụp.** Ảnh playbook là tài
liệu phát ra ngoài; dính tên/SĐT khách thật là lộ thông tin cá nhân. Mọi dữ liệu
trong `mock-data.mjs` phải là dữ liệu bịa.

**Các hằng số phải bám theo backend.** Vài giá trị trong mock không được bịa vì
playbook trích dẫn chúng:

| Thứ | Nguồn sự thật |
|---|---|
| 8 bậc trạng thái KH | `backend/src/modules/contacts/status-migration.ts` → `DEFAULT_STATUSES` |
| Trọng số chấm điểm | `backend/src/modules/scoring/constants.ts` → `DEFAULT_SCORING_CONFIG` |
| Loại / trạng thái lịch hẹn | `frontend/src/composables/use-appointments.ts` → `APPOINTMENT_*_OPTIONS` |

Sai giá trị enum (vd `type: 'viewing'` thay vì `'meeting'`) sẽ khiến bộ lọc mặc
định lọc sạch dữ liệu và ảnh chụp ra màn hình trống — nhưng script vẫn báo ✓.
**Luôn mở ảnh ra xem sau khi chạy**, đừng tin mỗi dòng log.

## Thêm màn hình mới

Thêm một mục vào mảng `SCREENS` cuối `shoot.mjs`:

```js
{ name: '09-bao-cao', path: '/reports', wait: '.v-main', width: 1760, fullPage: true }
```

- `width` — mặc định 1440; bảng nhiều cột cần 1760 nếu không chip sẽ tràn đè cột
- `fullPage` — chụp cả trang thay vì một khung hình

Chạy xong, xem mục "Endpoint chưa mock" ở cuối log rồi bổ sung vào `ROUTES`.
Lưu ý thứ tự: regex cụ thể phải đứng **trước** regex chung (vd `/contacts/stats`
phải đứng trước `/contacts/:id`).
