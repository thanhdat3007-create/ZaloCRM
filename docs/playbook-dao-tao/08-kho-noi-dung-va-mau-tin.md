# Chương 8 — Kho nội dung & mẫu tin

*Đọc 15 phút, dựng 1 tiếng. Tiết kiệm hàng chục giờ mỗi tháng.*

Một trung tâm chạy 4 khoá/tháng gửi đi khoảng 40 tin lặp lại giống hệt nhau. Chương này biến 40 lần gõ tay thành 40 lần chọn.

---

## 8.1. Trạng thái thật của tính năng mẫu tin

Nói rõ trước để bạn không đi tìm nhầm chỗ:

| Chỗ | Trạng thái bản Community |
|---|---|
| **Cài đặt → Mẫu tin** | ⛔ Màn hình "sắp có" — chưa dùng được |
| **Marketing → Mẫu tin nhắn** | 🏷️ **[EE]** |
| **Gõ `/` trong khung chat** | ⚠️ Popup mở được, nhưng **danh sách rỗng** — nó lấy dữ liệu từ endpoint chỉ có ở bản EE |
| **Kho ảnh (Media)** | ✅ **Dùng được đầy đủ** — đây là chỗ bạn lưu file, ảnh, video |
| **Ghim tin trong nhóm Zalo** | ✅ Dùng được (tính năng của Zalo) |

**Kết luận cho bản Community:** kho mẫu tin *chữ* thì quản lý ngoài CRM; kho *file và ảnh* thì dùng Kho ảnh trong CRM. Mục 8.2 nói cách làm gọn.

---

## 8.2. Cách quản lý mẫu tin trên bản Community

Ba nơi, mỗi nơi một việc:

```
1. BẢNG LỊCH GỬI TỰ ĐỘNG  (Google Sheet ở Chương 4)
   → chứa các tin máy tự gửi: nhắc lịch, link Zoom, offer
   → đây đã là kho mẫu tin rồi, chỉ là có thêm cột giờ giấc

2. FILE "MẪU TIN 1-1" dùng chung  (Google Doc / Notion)
   → chứa tin nhắn người thật copy-dán: chốt sale, xử lý từ chối
   → chia mục theo tình huống, trợ giảng mở ra copy

3. KHO ẢNH trong CRM  (menu Kho ảnh)
   → chứa file, ảnh, video: slide, bài tập, ảnh testimonial, QR
   → gửi thẳng từ khung chat, không phải tìm trong máy
```

> 💡 Đừng cố nhét mẫu tin chữ vào Kho ảnh dưới dạng file .txt. Nghe có vẻ gọn nhưng thực tế trợ giảng sẽ không dùng — mở file, tải về, copy, quá nhiều bước. Một Google Doc mở sẵn trong tab bên cạnh nhanh hơn nhiều.

---

## 8.3. Dựng Kho ảnh — cấu trúc thư mục

**Menu Kho ảnh → Tạo thư mục**

```
📁 CHUNG (dùng cho mọi khoá)
   ├─ QR-chuyen-khoan.png
   ├─ thong-tin-tai-khoan.png
   ├─ gioi-thieu-giang-vien.jpg
   └─ cam-ket-hoan-tien.png

📁 EXCEL-CO-BAN
   ├─ 📁 phieu          → slide buổi phễu, file mẫu tặng
   ├─ 📁 buoi-01 … 08   → slide + bài tập từng buổi
   ├─ 📁 bang-gia       → bảng giá, so sánh gói
   └─ 📁 testimonial    → ảnh bài làm học viên cũ, tin nhắn cảm ơn

📁 EXCEL-NANG-CAO
   └─ (cấu trúc tương tự)

📁 TESTIMONIAL-CHUNG
   ├─ tin-nhan-cam-on-*.jpg
   ├─ bai-lam-truoc-sau-*.jpg
   └─ ket-qua-hoc-vien-*.jpg
```

**Thư mục `TESTIMONIAL-CHUNG` là thư mục sinh tiền nhất.** Mỗi lần có học viên khen hoặc khoe kết quả, chụp màn hình bỏ vào đây ngay. Sau 6 tháng bạn có kho bằng chứng xã hội mà không đối thủ nào copy được.

> ⚠️ Xin phép trước khi dùng ảnh/tin nhắn học viên làm testimonial, và che tên nếu họ không đồng ý công khai. Một học viên phát hiện tin nhắn riêng của mình bị đem đi quảng cáo là mất cả uy tín lẫn người đó.

---

## 8.4. Bộ 30 mẫu tin — chép về dùng luôn

Thay `{...}` bằng thông tin của bạn.

### A · Tin tự động vào nhóm (dùng ở [Chương 4](04-lich-gui-tin-tu-dong.md))

**A1 · Chào mừng người mới vào nhóm**
```
Chào mừng {ten} đến với lớp {ten_lop} 👋
Cả nhà điểm danh giúp cô: TÊN - NGHỀ - MONG MUỐN nhé ạ.
Cô đọc hết và sẽ dạy đúng thứ mọi người cần ❤️
```

**A2 · Nhắc trước 1 ngày**
```
⏰ Ngày mai ({thu}, {ngay}) đúng {gio} mình học nhé cả nhà!
Chuẩn bị giúp cô: máy tính, tai nghe, sổ ghi chép.
Link Zoom cô gửi vào nhóm lúc {gio_gui_link} ạ.
Ai bận không tham gia được thì nhắn cô, cô gửi bản ghi lại.
```

**A3 · Còn 1 tiếng (T-60)**
```
⏰ Còn 1 tiếng nữa mình vào lớp rồi cả nhà ơi!
{gio} — {ten_buoi_hoc}
📌 Link Zoom cô gửi lúc {gio_gui_link}
Tối nay có phần tặng {qua_tang} cuối buổi, cố gắng ở lại tới cuối ạ 😊
```

**A4 · Link Zoom (T-10)**
```
🔗 VÀO LỚP THÔI CẢ NHÀ ƠI!
Link: {link_zoom}
Mật khẩu: {mat_khau}
🎥 Buổi học có ghi hình, ai vào muộn cứ vào bình thường ạ
Vào rồi nhắn "OK" giúp cô nhé!
```

**A5 · Nhắc người vào muộn (T+30)**
```
Lớp mình đang học phần {chu_de} rồi ạ.
Ai chưa vào thì vào luôn nhé, còn kịp: {link_zoom}
Cô sẽ tóm tắt lại phần đầu cho ai vào muộn ạ.
```

**A6 · Offer cuối buổi (T+120)** — cấu trúc 5 phần, xem [Chương 3](03-nhip-mot-lop-phieu.md) mục 3.3

**A7 · Bằng chứng xã hội (D+1)**
```
💚 Cảm ơn {so_nguoi} anh chị đã đăng ký khoá {ten_khoa} tối qua!
📝 Bài tập cô đã nhận {so_bai} bài, đang chấm và sẽ nhận xét từng bài.
⏳ Ưu đãi {gia_uu_dai} còn đến {han}. Còn {so_suat} suất tặng kèm ạ.
```

**A8 · Xử lý phản đối (D+2)** — xem [Chương 3](03-nhip-mot-lop-phieu.md) mục 3.5

**A9 · Chốt sổ (D+3)**
```
🔔 Ưu đãi khoá {ten_khoa} đã kết thúc ạ.
Cảm ơn {so_nguoi} anh chị đã tin tưởng. Lớp khai giảng {ngay_khai_giang}.
Anh chị chưa kịp đăng ký: khoá sau khai giảng {ngay_khoa_sau},
nhắn cô giữ chỗ, cô ưu tiên giữ mức giá này cho người của lớp vừa rồi ạ.
```

**A10 · Ghim khi đóng băng nhóm** — xem [Chương 2](02-kien-truc-he-nhom-phieu.md) mục 2.3

### B · Tin 1-1 chốt sale

**B1 · Nhắn ngay 22h30** — xem [Chương 3](03-nhip-mot-lop-phieu.md) mục 3.4

**B2 · Nhóm vướng tiền** · **B3 · Nhóm sợ không theo kịp** · **B4 · Nhóm bận** · **B5 · Nhóm im lặng**
→ xem [Chương 7](07-pipeline-va-chot-sale.md) mục 7.4

**B6 · Nhắc nhẹ lần cuối**
```
{ten} ơi, cô nhắn lần cuối thôi không làm phiền chị nữa ạ 😊
Ưu đãi hết {gio} hôm nay. Chị cần gì cứ nhắn cô bất cứ lúc nào,
kể cả khoá sau hay chỉ để hỏi bài cũng được ạ.
Cảm ơn chị đã dành thời gian cho lớp ❤️
```
> Tin này chốt thêm được vài đơn, và quan trọng hơn: nó giữ cửa cho khoá sau. Người từ chối trong thiện cảm vẫn quay lại; người bị làm phiền thì không.

### C · Tin xử lý từ chối
6 mẫu — xem [Chương 7](07-pipeline-va-chot-sale.md) mục 7.5

### D · Tin sau khi đóng tiền

**D1 · Xác nhận nhận tiền**
```
Cô nhận được rồi ạ! Chào mừng {ten} đến khoá {ten_khoa} ❤️
Cô đã thêm chị vào nhóm lớp, chị vào xem tin ghim nhé.
Buổi 1: {ngay_gio}. Tài liệu cô gửi trước 1 ngày ạ.
```

**D2 · Bộ chào mừng vào nhóm lớp**
```
Cả nhà chào đón {ten} — học viên mới của lớp mình nhé! 👏
{ten} giới thiệu đôi chút về mình và mong muốn khi học khoá này nhé ạ.
```

**D3 · Gọi hỏi thăm sau buổi 2** *(bước chống bỏ học)*
```
{ten} ơi, học 2 buổi rồi cô hỏi thăm chút ạ:
Chị theo kịp không? Có phần nào chị thấy khó cần cô nói lại không ạ?
Chị cứ nói thật, cô còn 10 buổi để điều chỉnh cho chị.
```

**D4 · Nhắc học viên vắng**
```
{ten} ơi, buổi {so_buoi} vừa rồi cô không thấy chị.
Bản ghi lại cô gửi chị ở đây: {link}
Có gì khó khăn chị nhắn cô nhé, đừng bỏ dở giữa chừng phí lắm ạ 😊
```

### E · Tin nhóm alumni

**E1 · Mẹo hàng tuần (không bán gì)**
```
💡 Mẹo tuần này: {noi_dung_meo_ngan}
Cả nhà thử xem, có gì thắc mắc cứ hỏi trong nhóm nhé ạ.
```

**E2 · Ưu đãi riêng học viên cũ**
```
Cả nhà ơi, khoá {ten_khoa_moi} khai giảng {ngay}.
Học viên cũ của cô được giữ mức {gia_uu_dai} (giá ngoài là {gia_goc}) ạ.
Ai giới thiệu bạn cùng đăng ký thì cả hai được thêm {uu_dai_gioi_thieu} nhé ❤️
```

---

## 8.5. Biến động — làm tin nhắn không giống tin hàng loạt

Trong bảng lịch và file mẫu tin, dùng ký hiệu `{...}` thống nhất:

| Biến | Ví dụ |
|---|---|
| `{ten}` | Hương |
| `{ten_khoa}` | Excel Nâng Cao |
| `{so_buoi}` | 12 |
| `{gia}` / `{gia_uu_dai}` | 5.990k / 3.990k |
| `{ngay_khai_giang}` | Thứ 2, 05/08 |
| `{link_zoom}` / `{mat_khau}` | |
| `{han_uu_dai}` | 23h59 Thứ 5 (31/07) |

**Với tin gửi vào nhóm, đừng dùng `{ten}`** — nhóm có 400 người, không cá nhân hoá được. Chỉ dùng cho tin 1-1.

> 💡 Nếu bạn code chức năng lịch nhóm ([Chương 13](13-lo-trinh-vibe-coding.md)), hãy hỗ trợ sẵn `{ten_nhom}`, `{so_buoi}`, `{ngay_hoc}`, `{link_zoom}` — bốn biến này lấy từ cấu hình lớp, và chúng loại bỏ 90% việc sửa tin thủ công mỗi khoá.

---

## 8.6. Quy tắc viết tin cho nhóm Zalo

| ✅ Nên | ❌ Tránh |
|---|---|
| 3–8 dòng, có xuống dòng, có khoảng trắng | Một khối chữ 15 dòng liền |
| 1–3 emoji làm mốc cho mắt | Emoji rải khắp mỗi câu |
| Một tin một mục đích | Nhồi nhắc lịch + bán hàng + thông báo vào một tin |
| Câu hành động rõ ở cuối | Kết thúc lửng, không biết phải làm gì |
| Xưng hô nhất quán toàn khoá | Lúc "cô", lúc "mình", lúc "bên em" |
| Viết như đang nói | Văn phong thông cáo báo chí |

**Kiểm tra nhanh trước khi lưu một mẫu tin:** đọc to lên. Nếu nghe như quảng cáo thì viết lại. Nhóm Zalo là không gian riêng tư — người ta chịu đựng quảng cáo ở đó kém hơn nhiều so với Facebook.

---

## 8.7. Gửi file nhanh trong chat

Kho ảnh dùng được đầy đủ ở bản Community. Cách nhanh nhất:

1. Mở hội thoại
2. Kéo thả file từ máy vào khung chat, **hoặc** bấm biểu tượng đính kèm → chọn từ Kho ảnh
3. Gửi

Hệ thống hỗ trợ ảnh, video (xem trực tiếp trong khung chat, không cần tải), audio, và file tài liệu (PDF, Excel, Word, ZIP). File được lưu lên kho lưu trữ của bạn (MinIO/S3/R2) nên vẫn xem lại được kể cả khi Zalo hết hạn link.

**Chuyển tiếp nhiều nhóm cùng lúc:** chọn tin → Chuyển tiếp → chọn nhiều hội thoại đích (cả nhóm lẫn cá nhân). Dùng khi gửi cùng một tài liệu cho 3 nhóm lớp.

> ⚠️ Chuyển tiếp hàng loạt vẫn tính vào hạn mức 200 tin/ngày và giới hạn dồn 20 tin/30 giây. Chuyển tiếp cho 30 nhóm liên tiếp là hành vi máy rõ ràng — chia nhỏ và giãn ra.

---

## 8.8. Việc cần làm cuối chương

- [ ] Tạo Google Doc "Mẫu tin 1-1" dùng chung cho cả đội, chia mục theo tình huống
- [ ] Chép 30 mẫu ở mục 8.4 vào, sửa cho đúng khoá học của bạn
- [ ] Dựng cấu trúc thư mục Kho ảnh theo mục 8.3
- [ ] Tải lên: QR chuyển khoản, slide phễu, file tặng, ảnh giảng viên
- [ ] **Tạo thư mục `TESTIMONIAL-CHUNG`**, bắt đầu thói quen chụp lại mọi lời khen
- [ ] Thống nhất bộ biến `{...}` với cả đội
- [ ] Thống nhất xưng hô dùng xuyên suốt

---

➡️ Tiếp theo: **[Chương 9 — Sau khi mua: giữ chân, tái ký, upsell](09-sau-khi-mua.md)**
