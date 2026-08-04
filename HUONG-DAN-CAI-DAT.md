# 🚀 Hướng Dẫn Cài Đặt Rocket Zalo CRM (Siêu Tốc & Đơn Giản)

> 💡 Ứng dụng đã được đóng gói sẵn thành Docker Image trên Cloud Registry. Bạn **không cần** mã nguồn, **không cần** biên dịch, và **không phải tự tay sửa file cấu hình nào** — mọi mật khẩu và khoá bảo mật đều được sinh tự động.

Cài đặt qua **gói cài đặt (.zip)** chúng tôi gửi — không cần git, không cần quyền truy cập mã nguồn. Gói chỉ khoảng 20KB vì toàn bộ ứng dụng nằm trong Docker Image trên Cloud, gói chỉ chứa `docker-compose.yml`, `.env.example` và script triển khai.

---

## Bước 0 — Cài Docker

Chọn đúng hệ điều hành của máy sẽ chạy CRM:

### Linux (Ubuntu/Debian/CentOS…)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # rồi đăng xuất/đăng nhập lại để chạy docker không cần sudo
```

### Windows

Cài **Docker Desktop** (bật WSL2 backend lúc cài) từ **https://www.docker.com/products/docker-desktop/**. Chạy các lệnh ở Bước 2 trong **Git Bash** hoặc **WSL2 Ubuntu** (script cần shell bash).

### macOS (Intel & Apple Silicon M1/M2/M3/M4)

Docker Desktop **không tự cài được** trên Mac, bạn phải cài tay trước:

- Tải tại **https://www.docker.com/products/docker-desktop/** → chọn đúng bản:
  - **Apple Silicon** (Mac đời 2020 trở lên, chip M1/M2/M3/M4)
  - **Intel Chip** (Mac đời cũ)
  - *Không rõ máy nào?* Bấm  → **About This Mac** → dòng **Chip** / **Processor**.
- Mở file `.dmg` vừa tải → kéo **Docker** vào thư mục **Applications**.
- Mở **Docker** từ Launchpad → bấm **Accept** điều khoản → chờ **biểu tượng con cá voi 🐳** trên thanh menu (góc trên bên phải) hiện chữ **Docker Desktop is running**.

> 🧠 **Cấp đủ RAM cho Docker:** vào 🐳 → **Settings** → **Resources** → kéo **Memory** lên tối thiểu **4 GB** (khuyến nghị 6–8 GB) → **Apply & Restart**. Thiếu RAM thì Postgres/MinIO dễ bị tắt giữa chừng.

*Thay thế (dành cho ai quen dùng Homebrew):*

```bash
brew install --cask docker && open -a Docker
```

> 💡 macOS dùng cho **cài thử / dùng nội bộ trên máy cá nhân**. Chạy thật cho cả team, phục vụ nhiều nhân viên 24/7 thì nên cài trên **VPS Linux** để máy không phải bật liên tục.

---

## Bước 1 — Giải nén gói cài đặt

Nhận file nén `rocket-zalo-crm-<phiên-bản>.zip` từ chúng tôi, giải nén rồi mở terminal trong thư mục vừa giải nén:

```bash
cd rocket-zalo-crm
```

## Bước 2 — Chạy đúng 1 lệnh

```bash
bash scripts/zalocrm-deploy.sh
```

Xong. Script tự sinh `.env` + khoá bảo mật ngẫu nhiên (`JWT_SECRET`, `ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY`, `DB_PASSWORD`, mật khẩu MinIO), tự né port đang bận, kéo Docker Image dựng sẵn, chạy Postgres/Redis/MinIO, chạy Database Migration rồi in ra link truy cập. **Bạn không cần mở hay sửa bất kỳ file cấu hình nào.**

👉 Chạy xong, mở trình duyệt vào đường dẫn script in ra (mặc định **`http://localhost:3080`**, trên VPS thì **`http://IP-VPS:3080`**).

> ⚠️ Nếu gặp lỗi `denied` khi kéo image: máy bạn chưa có quyền tải image (image ở chế độ private). Liên hệ chúng tôi để được cấp một token chỉ-đọc, rồi `docker login ghcr.io -u <user> -p <token>` trước khi chạy lại lệnh trên.

### Lỗi hay gặp

| Thông báo lỗi | Cách xử lý |
|---|---|
| `Cannot connect to the Docker daemon` | Docker chưa chạy → mở Docker Desktop (Windows/Mac) hoặc `sudo systemctl start docker` (Linux), rồi chạy lại lệnh. |
| `command not found: docker` | Chưa cài xong Docker (làm lại Bước 0), hoặc cài rồi thì mở **terminal mới**. |
| Cài xong nhưng không vào được `localhost:3080` | Chờ thêm 1–2 phút cho migration xong, kiểm tra bằng `docker compose ps` (cột STATUS phải là `Up`/`healthy`). |
| Port 3080 bị chiếm | Script tự nhảy sang 3081 và in ra link đúng — cứ dùng link đó. |
| `denied` khi kéo image | Máy chưa có quyền tải image → `docker login ghcr.io` bằng token chúng tôi cấp, hoặc liên hệ chúng tôi. |

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

Vì gói cài đặt không có git, có 2 trường hợp:

### A. Bản vá không đổi cấu hình (đa số các bản)

Chạy lại đúng lệnh đã dùng lúc cài, ngay trong thư mục cũ:

```bash
cd rocket-zalo-crm
bash scripts/zalocrm-deploy.sh
```

Nếu gói cũ có ghim phiên bản (`ZCRM_TAG` trong `.env`), sửa dòng đó thành phiên bản mới (hoặc xoá dòng để tự dùng bản mới nhất) trước khi chạy — nếu không script sẽ pull đúng bản cũ đã ghim.

### B. Bản mới đổi `docker-compose.yml` / thêm biến cấu hình mới

Chúng tôi gửi gói zip mới. Giải nén **đè lên thư mục cũ** (không đụng `.env` đang chạy vì file này không nằm trong gói), rồi chạy lại:

```bash
bash scripts/zalocrm-deploy.sh
```

Script tự nhận biết đây là **nâng cấp** (không phải cài mới), **backup database trước**, tự bổ sung biến cấu hình mới còn thiếu vào `.env` (không ghi đè biến đã có), kéo image mới rồi áp migration.

> 🛡️ **Dữ liệu an toàn:** quy trình nâng cấp không bao giờ xoá volume dữ liệu (`down -v` không được dùng ở đâu trong script). Nếu backup thất bại, script dừng lại chứ không nâng cấp tiếp. Cả 2 trường hợp trên đều giữ nguyên `.env` và toàn bộ dữ liệu — chỉ thêm biến còn thiếu, không sửa/xoá biến đã có.

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

## 🛠️ Dành cho Dev (nội bộ, có quyền truy cập mã nguồn)

Mặc định gói khách hàng kéo image dựng sẵn cho nhanh. Khi có quyền truy cập repo mã nguồn và muốn build bản của mình:

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

`scripts/install.sh` / `scripts/install.ps1` (clone/pull qua git) vẫn dùng được cho môi trường nội bộ có quyền truy cập repo (staging, máy dev) — không dùng cho khách hàng vì repo mã nguồn ở chế độ private.
