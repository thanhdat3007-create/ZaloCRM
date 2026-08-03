# 🚀 Hướng Dẫn Cài Đặt Rocket Zalo CRM (Siêu Tốc & Đơn Giản)

> 💡 Ứng dụng đã được đóng gói sẵn thành Docker Image trên Cloud Registry. Bạn **không cần** cài môi trường lập trình, **không cần** biên dịch mã nguồn, và **không phải tự tay sửa file cấu hình nào** — mọi mật khẩu và khoá bảo mật đều được sinh tự động.

Chọn đúng 1 trong 3 cách bên dưới:

| Bạn có gì trong tay | Dùng cách nào |
|---|---|
| Máy chủ Linux/VPS + quyền truy cập mã nguồn | **CÁCH 1** — 1 lệnh duy nhất |
| Máy Windows | **CÁCH 2** — 1 lệnh PowerShell |
| Chỉ có file nén chúng tôi gửi (không có mã nguồn) | **CÁCH 3** — giải nén rồi chạy 1 lệnh |

---

## ⚡ CÁCH 1: Linux / VPS — 1 lệnh duy nhất

Đăng nhập VPS/máy chủ Linux (Ubuntu, Debian, CentOS...) qua SSH và dán duy nhất 1 lệnh:

```bash
curl -fsSL https://raw.githubusercontent.com/rocket-ai-global/rocket-zalo-crm/main/scripts/install.sh | bash
```

### Script tự động làm toàn bộ công việc:
1. ✨ Cài Docker & Docker Compose (nếu VPS chưa có).
2. 🔑 **Tự sinh file `.env`** cùng toàn bộ khoá bảo mật ngẫu nhiên (`JWT_SECRET`, `ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY`, `DB_PASSWORD`, mật khẩu MinIO) — bạn không phải nghĩ hay gõ gì.
3. 🔌 **Tự né port đang bận** — nếu 3080 đã có ứng dụng khác chiếm, script tự nhảy sang 3081 và ghi lại vào `.env`.
4. ⚡ Kéo Docker Image dựng sẵn từ Cloud (không mất thời gian biên dịch).
5. 🗄️ Khởi chạy Postgres, Redis, MinIO rồi chạy Database Migration.
6. 🌐 In ra đường dẫn truy cập ứng dụng.

👉 Chạy xong, mở trình duyệt vào đường dẫn script in ra (mặc định **`http://IP-VPS:3080`**).

---

## 💻 CÁCH 2: Windows (PowerShell — 1 lệnh duy nhất)

Mở **PowerShell** (Run as Administrator) và dán:

```powershell
irm https://raw.githubusercontent.com/rocket-ai-global/rocket-zalo-crm/main/scripts/install.ps1 | iex
```

---

## 📦 CÁCH 3: Cài từ gói gửi tay (không cần mã nguồn)

Dùng khi bạn nhận được file nén `rocket-zalo-crm-<phiên-bản>.zip` từ chúng tôi. Gói chỉ khoảng 20KB vì toàn bộ ứng dụng nằm trong Docker Image trên Cloud.

**Yêu cầu:** máy đã có Docker (Linux/macOS: Docker Engine; Windows: Docker Desktop + WSL2).

```bash
# 1. Giải nén rồi mở terminal trong thư mục vừa giải nén
cd rocket-zalo-crm

# 2. Chạy đúng 1 lệnh này
bash scripts/zalocrm-deploy.sh
```

Xong. Script tự sinh `.env` + khoá bảo mật, tự né port trùng, kéo image, chạy migration rồi in ra link truy cập. **Bạn không cần mở hay sửa bất kỳ file cấu hình nào.**

> ⚠️ Nếu gặp lỗi `denied` khi kéo image: máy bạn chưa có quyền tải image. Liên hệ chúng tôi để được cấp quyền, hoặc đăng nhập bằng `docker login ghcr.io`.

---

## 🏁 BƯỚC TIẾP THEO: Khởi tạo tài khoản & Kết nối Zalo

### 1. Tạo Tài khoản Admin / Chủ hệ thống
- Truy cập vào **`http://IP-VPS:3080/setup`** (thay port nếu script báo port khác).
- Điền **Tên tổ chức**, **Họ tên Admin**, **Email** và **Mật khẩu**.
- Bấm **Tạo tài khoản** để vào giao diện quản trị.

### 2. Kết nối Nick Zalo
- Vào menu **Nick Zalo** (thanh bên trái).
- Bấm **Thêm nick Zalo mới** → Đặt tên gợi nhớ (Ví dụ: *Zalo Sale CSKH 01*).
- Bấm vào biểu tượng **Mã QR** → Quét mã QR bằng ứng dụng Zalo trên điện thoại.
- Sau khi quét thành công, trạng thái chuyển sang **Online / Đã kết nối** (Màu xanh).

---

## 🔄 Cập nhật phiên bản mới nhất (Upgrade)

Chạy lại đúng lệnh đã dùng lúc cài:

```bash
cd rocket-zalo-crm
./scripts/zalocrm-deploy.sh
```

Script tự nhận biết đây là **nâng cấp** (không phải cài mới), **backup database trước**, kéo image mới rồi áp migration. File `.env` đang có được **giữ nguyên** — secret và port của bạn không bị ghi đè.

> 🛡️ **Dữ liệu an toàn:** quy trình nâng cấp không bao giờ xoá volume dữ liệu. Nếu backup thất bại, script dừng lại chứ không nâng cấp tiếp.

---

## 📞 Sao Lưu & Xử Lý Sự Cố

### Xem trạng thái ứng dụng:
```bash
docker compose ps
```

### Xem Log ứng dụng:
```bash
docker compose logs -f app
```

### Sao lưu thủ công Database:
```bash
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-zalocrm.sql
```

---

## 🛠️ Dành cho Dev: build image từ mã nguồn

Mặc định hệ thống kéo image dựng sẵn cho nhanh. Khi bạn sửa mã nguồn và muốn chạy bản của mình:

```bash
ZCRM_BUILD=1 ./scripts/zalocrm-deploy.sh
```

Hoặc gọi trực tiếp Docker Compose với lớp chồng build:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Muốn ghim một phiên bản image cụ thể thay vì `latest`, đặt `ZCRM_TAG` trong `.env`:

```bash
ZCRM_TAG=3.4.1
```
