# Chương 13 — Lỗi thường gặp & cách xử lý

*Tra theo triệu chứng. Việc nào cần admin đều được ghi rõ.*

---

## A. Vấn đề nick Zalo

### Nick hiện "Mất kết nối"

| Nguyên nhân | Xử lý |
|---|---|
| Mạng chập chờn | Chờ — hệ thống tự kết nối lại mỗi 5 phút |
| Phiên đăng nhập hết hạn | Vào **Cài đặt → Tài khoản Zalo** → **Kết nối lại**. Nếu vẫn không được, quét lại mã QR |
| Đăng xuất từ điện thoại | Zalo trên điện thoại: Cài đặt → Quản lý thiết bị → kiểm tra. Rồi quét QR lại |
| Nick bị Zalo hạn chế | Xem [Chương 11 mục 11.9](11-an-toan-nick-va-tuan-thu.md) |

> 💡 Nick **ngắt thủ công** sẽ không được tự kết nối lại — cố ý như vậy. Muốn dùng lại phải bấm Kết nối lại.

### Nick rớt liên tục dù mạng ổn

Vào **Báo cáo → Vận hành Nick Zalo**, xem cột uptime.

- Uptime < 90% kéo dài → nick đang có vấn đề. **Giảm hoạt động ngay**, đừng cố chạy tiếp.
- Nhiều nick cùng rớt một lúc → vấn đề ở máy chủ hoặc mạng, báo admin.

### Quét QR mãi không xong

1. Trên điện thoại: Zalo → Cài đặt → **Quản lý thiết bị** → đăng xuất bớt thiết bị lạ
2. Tải lại trang CRM (F5), bấm thêm nick lại
3. Vẫn không được: dùng nick đó trên điện thoại bình thường 2–3 ngày rồi thử lại

---

## B. Vấn đề tin nhắn

### Gửi tin báo lỗi "Đã đạt giới hạn ... /ngày"

**Không phải lỗi — đây là lưới an toàn đang làm việc.**

Bạn đã chạm trần hạn mức của nick hôm nay. Xem [Chương 11](11-an-toan-nick-va-tuan-thu.md).

- **Nên:** dừng lại, dùng nick khác, mai chạy tiếp
- **Không nên:** nhờ admin nâng trần để chạy tiếp — đó là cách mất nick

### Gửi tin báo "Quá nhanh (>N/30s)"

Bạn đang bắn dồn. Chờ 30–60 giây rồi gửi tiếp. Nếu gặp thường xuyên → bạn đang gửi theo kiểu máy, cần rải đều hơn.

### Tin nhắn hiện trùng hai lần

Thường tự hết sau khi tải lại trang. Nếu lặp lại nhiều → báo admin *(có thể do đồng bộ hai chiều)*.

### Ảnh/video khách gửi không xem được

- Thử tải lại trang
- File cũ có thể đang chờ sao lưu về kho — chờ vài phút
- Vẫn lỗi → báo admin kiểm tra kho lưu trữ (MinIO/S3/R2)

### Không thấy hội thoại của một nick

1. Kiểm tra **Phạm vi xem** ở cột trái — có đang lọc theo nick khác không?
2. Kiểm tra nick đó có đang kết nối không
3. Kiểm tra bạn có quyền truy cập nick đó không *(hỏi trưởng nhóm)*
4. Hội thoại có bị chuyển vào **tab "Khác"** không?

---

## C. Vấn đề khách hàng

### Một khách hiện thành 2–3 hồ sơ

**Nguyên nhân:** khách có nhiều SĐT, hoặc chat với nhiều nick trước khi hệ thống nhận ra.

**Xử lý:** dùng chức năng **gộp khách trùng** (dialog 3 cột) để rà và gộp.

⚠️ **Kiểm tra kỹ trước khi gộp** — gộp nhầm hai người khác nhau khó gỡ. Nhìn SĐT, tên Zalo, lịch sử chat để chắc chắn.

### Khách bị gộp nhầm

Có chức năng **tách khách con thành khách cha riêng**. Nếu không tách được, báo admin.

### Điểm số nhìn sai

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| Khách rõ ràng nóng nhưng điểm thấp | Trao đổi qua **điện thoại**, hệ thống không thấy | Ghi chú lại nội dung cuộc gọi, đổi bậc tay |
| Khách không mua nhưng điểm cao | Chat nhiều nhưng không có tín hiệu ý định | Bình thường — nhìn thêm bảng giải thích điểm |
| Điểm không đổi dù khách vừa nhắn | Chờ hệ thống tính (vài phút), hoặc đã chạm giới hạn điểm/ngày | Chờ, hoặc tải lại trang |
| Cả sàn điểm đều thấp | Chưa đủ dữ liệu (mới dùng < 3 tuần) | Chờ thêm. Từ tuần 4 mới đáng tin |

### Khách không tự lên bậc

Kiểm tra ba thứ:
1. Đã đủ điều kiện chuyển bậc chưa? *(xem [Chương 5 mục 5.2](05-cham-soc-va-chot.md))*
2. **Lịch hẹn đã đánh dấu "Hoàn thành" chưa?** ← nguyên nhân số 1
3. Bậc đó có cần xác nhận tay không? *(Nóng → Tiềm năng cần sale xác nhận)*

---

## D. Vấn đề tệp khách hàng

### Nhập file báo lỗi nhiều dòng không hợp lệ

- SĐT sai định dạng, thiếu số, lẫn ký tự chữ
- Excel để cột SĐT ở dạng số → mất số 0 đầu. **Định dạng cột thành Text trước khi lưu file**
- Có dòng trống, dòng tiêu đề lặp

### Số "Đã là khách CRM" quá nhiều

Data trùng nặng với data cũ. **Đừng chạy đè lên.** Báo trưởng nhóm quyết định, hoặc chỉ chạy phần chưa trùng.

### Tra Zalo mãi không xong

- Việc tra số cũng tính vào hạn mức của nick — đang bị giới hạn thì phải chờ
- Đừng tra 2.000 số một lúc, rải ra vài ngày
- Kiểm tra nick dùng để tra có đang kết nối không

---

## E. Vấn đề lịch hẹn

### Không nhận được nhắc lịch hẹn

- Kiểm tra lịch có được gán cho bạn không
- Nhắc chạy 8h sáng hôm trước ngày hẹn
- Kiểm tra **Cài đặt → Lịch hẹn & Nhắc hẹn** có bật gửi qua Zalo không *(việc của admin)*

### Bấm link đánh dấu hoàn thành báo hết hạn

Link có thời hạn. Vào thẳng menu **Lịch hẹn** đổi trạng thái tay.

### Lịch tạo từ Zalo không hiện trong CRM

Cần bật đồng bộ Nhắc hẹn Zalo trong cài đặt *(admin)*. Chỉ đồng bộ lịch tạo sau khi bật.

---

## F. Vấn đề quyền truy cập

### "Bạn không có quyền xem nội dung này"

Đúng như thiết kế — bạn chỉ thấy khách của mình/của nhóm mình. Cần xem thêm thì hỏi trưởng nhóm.

### Không thấy khách mình chắc chắn đang chăm

- Khách có thể đã được chuyển cho sale khác
- Xem **nhật ký hoạt động** để biết ai chuyển, khi nào
- Trao đổi với trưởng nhóm

### Bị hỏi mã PIN khi xem SĐT

Tính năng riêng tư đang bật cho nhóm khách đó. Nhập PIN của bạn. Quên PIN → nhờ admin đặt lại.

---

## G. Việc của admin

### Sao lưu dữ liệu

```bash
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-$(date +%Y%m%d-%H%M).sql
```
Nên chạy hàng ngày và **cất bản sao ở nơi khác** — sao lưu nằm cùng máy chủ không cứu được khi máy chủ hỏng.

### Kiểm tra hệ thống

```bash
docker logs zalo-crm-app --tail 100
curl http://localhost:3080/
```

Hoặc xem **Báo cáo → Audit & Sức khỏe HT** trên giao diện.

### Nâng cấp phiên bản

⚠️ **Sao lưu cơ sở dữ liệu trước.** Quy trình đầy đủ trong [README](../../README.md) và [hướng dẫn triển khai](../HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md).

### Hết dung lượng lưu trữ

Ảnh/video khách gửi chiếm nhiều chỗ. Theo dõi dung lượng kho lưu trữ, mở rộng khi cần. Hệ thống có cơ chế dọn file đã xoá định kỳ.

---

## H. Khi nào cần báo admin

| Tự xử lý được | Cần admin |
|---|---|
| Nick rớt lẻ tẻ, kết nối lại được | Nhiều nick rớt cùng lúc |
| Chạm trần gửi tin | Cần chỉnh trần cho cả tổ chức |
| Gộp khách trùng thông thường | Gộp nhầm không tách được |
| Không thấy hội thoại của một nick | Cả hệ thống không truy cập được |
| Quên PIN riêng tư | Đặt lại PIN, phân quyền, sao lưu, nâng cấp |

**Khi báo admin, gửi kèm:** thao tác đang làm · thông báo lỗi (chụp màn hình) · thời điểm xảy ra · nick/khách nào bị ảnh hưởng.

---

➡️ Tiếp theo: **[Chương 14 — Checklist in ra dán bàn](14-checklist-in-ra.md)**
