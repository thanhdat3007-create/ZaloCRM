# Chương 7 — Lịch xem nhà mẫu

*Đặt lịch, khách đến, và cập nhật kết quả. Ba việc, nhưng việc thứ ba mới là chỗ hầu hết sale bỏ sót.*

---

## 7.1. Vì sao lịch hẹn là mắt xích quan trọng nhất

Trong toàn bộ hệ thống điểm số, hai hành động cho điểm cao nhất trước khi cọc là:

| Hành động | Điểm |
|---|---|
| Đặt lịch xem nhà | **+25** |
| **Hoàn thành buổi xem** | **+35** |

Và **"Hoàn thành buổi xem" là điều kiện duy nhất** để khách tự lên bậc **Nóng**.

> ⚠️ **Hệ quả:** nếu bạn không đánh dấu lịch hẹn là "Hoàn thành" sau khi khách đi xem, khách sẽ **kẹt mãi ở bậc Hẹn gặp**, không được cộng 35 điểm, và toàn bộ pipeline của sàn sai lệch. Sếp nhìn báo cáo thấy 40 khách "Hẹn gặp" mà không ai lên Nóng — kết luận sai về đội của bạn.
>
> **Cập nhật lịch hẹn không phải việc hành chính. Đó là việc bán hàng.**

---

## 7.2. Tạo lịch hẹn

![Lịch hẹn xem theo tuần, mỗi lịch một màu theo loại, có đường kẻ báo giờ hiện tại](images/06-lich-hen.png)

**Thời điểm tạo: ngay lúc khách gật đầu, khi đang chat.** Đừng để cuối ngày.

**Ba cách tạo:**
1. Trong khung chat → nút tạo lịch hẹn ở cột hồ sơ khách *(nhanh nhất)*
2. Menu **Lịch hẹn** → thêm mới
3. **AI đọc chat tự gợi ý** — khách nhắn *"chiều thứ 7 anh rảnh"*, hệ thống đề xuất tạo lịch, bạn chỉ cần xác nhận

### Điền gì

| Trường | Ví dụ tốt |
|---|---|
| **Tiêu đề** | `Xem nhà mẫu 3PN — anh Tuấn — Ocean Park 2` |
| **Loại** | Gặp mặt (xem nhà) · Gọi · Nhắn · Follow-up |
| **Ngày giờ** | Chính xác. Không "cuối tuần" |
| **Thời lượng** | 15 phút (gọi) · 90–120 phút (đi xem có xe đưa đón) |
| **Địa điểm** | `Nhà mẫu Ocean Park 2 — cổng Zenpark` (cụ thể tới điểm gặp) |
| **Ghi chú** | ⭐ `Đi 2 người, có vợ. Quan tâm 3PN view hồ tầng cao, NS 5-5.5 tỷ. Đã gửi bảng giá S2.03. Vợ lo trường học cho con — chuẩn bị phần Vinschool.` |

**Ghi chú là phần đáng giá nhất.** Sáng hôm hẹn bạn mở ra đọc 20 giây là nhớ hết bối cảnh — thay vì gặp khách rồi hỏi lại từ đầu.

---

## 7.3. Hệ thống nhắc bạn và nhắc khách thế nào

| Cơ chế | Khi nào |
|---|---|
| **Nhắc trước 1 ngày** | 8h sáng hôm trước, hệ thống quét lịch ngày mai và báo cho bạn |
| **Ô "Lịch hẹn của bạn"** | Hiện thường trực trên Dashboard |
| **Đồng bộ Nhắc hẹn Zalo** | Lịch tạo từ tính năng Nhắc hẹn gốc của Zalo tự chảy vào CRM và ngược lại |
| **Nhắc cập nhật kết quả — 3 lần** | Sau giờ hẹn, hệ thống gửi bạn link để đánh dấu Hoàn thành/Huỷ |
| **Báo cáo trưởng phòng** | Lịch quá hạn chưa cập nhật sẽ vào bản tóm tắt gửi trưởng phòng |

### Cơ chế nhắc 3 lần — hiểu cho đúng

Mặc định khoảng cách `[1, 3, 6]` giờ, cộng dồn sau giờ hẹn:

```
Giờ hẹn 9:00
├─ 10:00  Nhắc lần 1  (+1h)
├─ 13:00  Nhắc lần 2  (+1+3 = 4h)
└─ 19:00  Nhắc lần 3  (+1+3+6 = 10h)

Vẫn không cập nhật → vào bản tóm tắt gửi trưởng phòng
   (dừng gửi sau 7 ngày kể từ lần đầu — chỉnh được)
```

Mỗi tin nhắc kèm **link ngắn**: bấm vào là đánh dấu **Hoàn thành / Huỷ / Không đến** ngay trên điện thoại, **không cần mở CRM**. Bạn đang ngoài đường vẫn cập nhật được trong 3 giây.

**Admin chỉnh ở:** Cài đặt → Khách hàng & Lead → **Lịch hẹn & Nhắc hẹn**
- Bật/tắt gửi link qua Zalo
- Độ trễ gửi link sau giờ hẹn (mặc định 15 phút)
- Khoảng cách 3 lần nhắc
- Số ngày dừng báo cáo trưởng phòng (mặc định 7)

---

## 7.4. Bộ 3 tin giữ khách đến

Khách hẹn rồi không đến là tổn thất lớn nhất trong ngày của sale — mất cả buổi, mất xe, mất lượt giữ căn.

### Tin 1 — ngay khi chốt lịch

> *"Dạ em xác nhận lịch với anh Tuấn ạ:*
> *📅 Thứ 7, 25/07 — 9h00*
> *📍 Nhà mẫu Ocean Park 2, cổng phân khu Zenpark*
> *🚐 Xe đưa đón đón anh tại [điểm hẹn] lúc 8h15*
>
> *Anh đi mấy người để em báo lễ tân và chuẩn bị nước ạ?"*

*Câu cuối vừa xác nhận cam kết, vừa biết có ai đi cùng để chuẩn bị nội dung.*

### Tin 2 — trước 1 ngày (chiều hôm trước)

> *"Anh Tuấn, mai 9h mình gặp nhau nhé ạ.*
> *Em đã giữ sẵn 3 căn 3PN view hồ đúng tầm ngân sách anh để anh so sánh trực tiếp.*
> *Anh nhớ mang CCCD để qua cổng nhanh ạ. Hẹn gặp anh và chị!"*

### Tin 3 — sáng hôm hẹn

> *"Chào buổi sáng anh Tuấn! Em đang ở nhà mẫu rồi ạ. Anh xuất phát chưa để em canh ra đón?"*

**Nếu khách im ở tin 3 → gọi điện.** Đừng ngồi chờ.

---

## 7.5. Sau buổi xem — 3 việc trong 2 tiếng đầu

Khách vừa về, cảm xúc còn nóng. Đây là cửa sổ quý nhất.

### 1️⃣ Đánh dấu Hoàn thành (30 giây)

Bấm link trong tin nhắc, hoặc vào **Lịch hẹn** → đổi trạng thái.
→ Khách **+35 điểm**, tự lên bậc **Nóng**.

### 2️⃣ Ghi chú ngay (2 phút)

```
Đi 2 vợ chồng + 1 con nhỏ.
Xem 3 căn: S2.03-1805 (thích nhất), S2.03-2205 (chê cao), S1.05-1502 (chê view).
Vợ hỏi kỹ về Vinschool và phòng khám — quan tâm tiện ích hơn giá.
Chồng hỏi phí quản lý và khả năng cho thuê lại.
Chê: bếp hơi nhỏ so với căn họ đang ở.
Ngân sách xác nhận: 5–5.5 tỷ, vay tối đa 50%.
Nói sẽ quyết trong 2 tuần.
→ Bước tiếp: gửi bảng tính căn 1805 + phương án vay 50% + thông tin Vinschool.
```

Ghi chú kiểu này giá trị hơn 10 dòng "khách quan tâm".

### 3️⃣ Nhắn theo dõi trong ngày

> *"Cảm ơn anh chị đã dành cả buổi sáng nay ạ.*
> *Em thấy anh chị ưng căn S2.03-1805 nhất — em gửi anh chị:*
> *• Bảng tính chi tiết căn 1805 (giá, tiến độ, phương án vay 50%)*
> *• Thông tin tuyển sinh Vinschool trong khu — phần chị hỏi sáng nay*
>
> *Riêng chuyện bếp, em gửi thêm 2 phương án cải tạo mở bếp mà khách bên em hay làm.*
> *Căn 1805 em giữ giúp anh chị tới thứ 5 nhé ạ."*

*Tin này chứng minh bạn đã nghe — kể cả chuyện cái bếp. Đây là thứ khách nhớ.*

---

## 7.6. Khi khách không đến

**Đừng đánh dấu "Hoàn thành".** Đánh dấu đúng: **Không đến** hoặc **Huỷ**.

Số liệu sai còn tệ hơn không có số liệu.

**Nhắn ngay, không trách móc:**
> *"Dạ anh Tuấn, sáng nay chắc anh bận đột xuất ạ.*
> *Không sao anh nhé, em sắp lịch khác cho anh.*
> *Chủ nhật này hoặc T7 tuần sau anh tiện buổi nào ạ?"*

**Khách hoãn 2 lần liên tiếp** → tín hiệu khách chưa thật sự sẵn sàng. Quay lại bậc Tiếp cận, tìm hiểu lại nhu cầu thay vì ép đi xem lần 3.

**Khách ở xa, ngại đi** → đề xuất **gọi video tour**. Đây cũng là gợi ý của hệ thống khi khách kẹt ở bậc Hẹn gặp quá 30 ngày:

> *"Anh Tuấn, em hiểu đi lại xa bất tiện ạ.*
> *Em đề xuất mình gọi video 15 phút, em đi thực tế trong căn hộ quay cho anh xem —*
> *view thật, kích thước thật, anh hỏi gì em trả lời ngay tại chỗ.*
> *Anh tiện khung giờ nào ạ?"*

Với khách tỉnh mua Ocean Park / Grand Park, đây thường là bước gỡ hiệu quả nhất.

---

## 7.7. Bốn loại lịch hẹn — dùng đủ, đừng chỉ dùng một

| Loại | Dùng khi | Thời lượng |
|---|---|---|
| **Gặp mặt** | Xem nhà mẫu, ký hồ sơ | 60–120 phút |
| **Gọi** | Tư vấn tài chính, đàm phán, chốt | 15–30 phút |
| **Nhắn** | Nhắc mình phải nhắn khách vào lúc nào đó | 5 phút |
| **Follow-up** | Việc cần làm với khách (gửi hồ sơ, kiểm tra kết quả vay) | 15 phút |

⭐ **Dùng loại "Gọi" và "Follow-up" nhiều hơn.** Đây là cách biến ý định thành cam kết có thời hạn:

```
"Thứ 5 gọi anh Tuấn xem kết quả thẩm định vay"
"Thứ 3 gửi chị Mai bảng so sánh 2 căn góc"
"Thứ 6 kiểm tra anh Minh đã bán được nhà cũ chưa"
```

Không đặt lịch cho những việc này = chúng sẽ không xảy ra.

---

## 7.8. Bảng kiểm lịch hẹn

**Khi tạo:**
- [ ] Ngày giờ cụ thể, không mơ hồ
- [ ] Địa điểm tới mức điểm gặp
- [ ] Ghi chú có bối cảnh khách
- [ ] Đã gửi tin xác nhận cho khách

**Trước 1 ngày:**
- [ ] Đã nhắn nhắc + nói rõ đã chuẩn bị gì cho khách
- [ ] Đã đọc lại ghi chú khách
- [ ] Đã chuẩn bị tài liệu cho buổi gặp

**Sau buổi hẹn (trong 2 tiếng):**
- [ ] ⭐ Đã đánh dấu trạng thái (Hoàn thành / Không đến / Huỷ)
- [ ] Đã ghi chú chi tiết
- [ ] Đã nhắn theo dõi kèm thứ khách quan tâm
- [ ] Đã tạo lịch cho bước tiếp theo

---

➡️ Tiếp theo: **[Chương 8 — Kho tài liệu & mẫu tin](08-kho-tai-lieu-va-mau-tin.md)**
