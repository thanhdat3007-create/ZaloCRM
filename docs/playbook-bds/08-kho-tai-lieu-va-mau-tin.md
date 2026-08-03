# Chương 8 — Kho tài liệu & mẫu tin

*Dựng một lần, dùng cả năm. Chương này tiết kiệm cho bạn khoảng 1 tiếng mỗi ngày.*

---

## 8.1. Bài toán

Một ngày điển hình của sale BĐS:

```
Khách A: "gửi em bảng giá S2.03"
  → mở Drive, tìm file, tải, gửi                          2 phút
Khách B: "chính sách tháng này thế nào"
  → nhớ lại, gõ tay 8 dòng                                3 phút
Khách C: "cho xem mặt bằng 3PN"
  → lục Zalo tìm ảnh đã gửi khách khác                    2 phút
Khách D: "phí quản lý bao nhiêu"
  → gõ lại câu trả lời đã gõ 40 lần                       2 phút
```

**40 lần/ngày × 2 phút = hơn 1 tiếng mỗi ngày.** Chưa kể nguy cơ gửi nhầm bảng giá cũ 3 tháng.

Hai công cụ giải quyết: **Mẫu tin** (cho chữ) và **Kho ảnh** (cho file).

---

## 8.2. Mẫu tin — gõ `/` là xong

### Cách dùng

Trong khung chat, gõ `/` → hiện danh sách mẫu → chọn → nội dung điền vào ô soạn tin → sửa cho hợp cảnh → gửi.

Gõ `/` rồi gõ tiếp **từ khoá gợi nhớ** để nhảy thẳng tới mẫu:

```
/giaOP2      → bảng giá Ocean Park 2
/csT8        → chính sách tháng 8
/phiql       → giải thích phí quản lý
/vay70       → phương án vay 70%
/lichhen     → xác nhận lịch hẹn
```

Mẫu giữ được **định dạng đậm/nghiêng chuẩn Zalo** — tin gửi ra trông chuyên nghiệp, không phải một khối chữ.

### Tổ chức thư mục

Mẫu tin xếp được vào thư mục, và mỗi thư mục/mẫu có chế độ **Công khai** (cả sàn dùng) hoặc **Riêng tư** (chỉ mình bạn).

Cấu trúc gợi ý cho sàn Vinhomes:

```
📁 Ocean Park (công khai)
   ├─ Giới thiệu tổng quan phân khu
   ├─ Bảng giá & quỹ căn
   ├─ Chính sách bán hàng tháng này
   ├─ Tiện ích nội khu (Vinschool, Vinmec, VinWonders)
   └─ Tiến độ xây dựng

📁 Grand Park (công khai)
📁 Royal Island (công khai)

📁 Tài chính & Vay (công khai)
   ├─ Phương án vay 50%
   ├─ Phương án vay 70%
   ├─ Giải thích ân hạn gốc
   ├─ Tiến độ thanh toán chuẩn
   └─ Điều kiện & hồ sơ vay

📁 Pháp lý (công khai)
   ├─ Sổ hồng & thời hạn sở hữu
   ├─ Quy trình ký HĐMB
   ├─ Hồ sơ khách cần chuẩn bị
   └─ Quy định người nước ngoài mua nhà

📁 Xử lý từ chối (công khai)
   ├─ "Giá cao quá"
   ├─ "Để anh suy nghĩ"
   ├─ "Đang xem dự án khác"
   ├─ "Để anh hỏi vợ"
   └─ "Chờ giá xuống"

📁 Vận hành (công khai)
   ├─ Lời mời kết bạn
   ├─ Chào sau khi kết bạn
   ├─ Xác nhận lịch hẹn
   ├─ Nhắc trước 1 ngày
   ├─ Cảm ơn sau buổi xem
   └─ Đánh thức khách im lặng

📁 Cá nhân tôi (riêng tư)
   └─ Cách chào và ký tên riêng của bạn
```

### Nguyên tắc viết mẫu tin tốt

**1. Mẫu là bộ khung, không phải tin gửi thẳng.**
Luôn có chỗ để bạn cá nhân hoá. Khách nhận ra tin copy-paste ngay.

**2. Chừa chỗ trống rõ ràng:**
```
"Dạ em gửi anh/chị [TÊN] bảng giá phân khu [PHÂN KHU] ạ.
Riêng căn [MÃ CĂN] anh/chị hỏi hôm [NGÀY], hiện [TÌNH TRẠNG]."
```

**3. Ngắn.** Tin dài trên Zalo không ai đọc hết. Ba đến năm dòng là vừa.

**4. Kết bằng một câu hỏi** — để khách có cớ trả lời. Tin không có câu hỏi thường chết.

**5. Rà lại hàng tháng.** Chính sách đổi, bảng giá đổi. Mẫu cũ gửi cho khách là mất uy tín. Đặt lịch nhắc đầu mỗi tháng.

### Mười mẫu nên có ngay hôm nay

| # | Tên | Gõ tắt |
|---|---|---|
| 1 | Lời mời kết bạn (có ngữ cảnh) | `/kb` |
| 2 | Chào ngay sau khi khách đồng ý | `/chao` |
| 3 | Gửi bảng giá + quỹ căn | `/gia` |
| 4 | Chính sách bán hàng tháng này | `/cs` |
| 5 | Mời đi xem nhà mẫu | `/moi` |
| 6 | Xác nhận lịch hẹn | `/xacnhan` |
| 7 | Nhắc trước 1 ngày | `/nhac` |
| 8 | Cảm ơn sau buổi xem + bước tiếp | `/camon` |
| 9 | Phương án vay + bảng tính | `/vay` |
| 10 | Đánh thức khách im lặng | `/danhthuc` |

Làm 10 mẫu này trong 45 phút, tuần sau bạn tiết kiệm được vài tiếng.

---

## 8.3. Kho ảnh — thư viện dùng chung của sàn

**Menu: Kho ảnh**

![Kho phương tiện chia thư mục Bảng giá, Mặt bằng căn hộ, Hình nhà mẫu, Tiến độ xây dựng](images/07-kho-anh.png)

*Chia thư mục theo loại tài liệu. Con số dưới mỗi ảnh là số lần cả sàn đã gửi nó
cho khách — dùng để biết tài liệu nào thực sự có tác dụng.*

Nơi để tất cả file bán hàng: bảng giá PDF, video nhà mẫu, mặt bằng, phối cảnh, hình tiến độ, hồ sơ pháp lý.

### Vì sao đáng dựng

| Không có kho chung | Có kho chung |
|---|---|
| Mỗi sale giữ một bản bảng giá | Một bản duy nhất, luôn mới |
| Sale mới không biết lấy tài liệu ở đâu | Vào kho là có hết |
| Gửi nhầm bảng giá cũ → mất uy tín | Cập nhật một chỗ, cả sàn dùng đúng |
| Video nhà mẫu nằm trong máy một người | Ai cũng gửi được |

### Cấu trúc album gợi ý

```
📁 Ocean Park 2 — Zenpark
   ├─ Bảng giá & quỹ căn (PDF, cập nhật hàng tuần)
   ├─ Mặt bằng layout (1PN, 2PN, 3PN, duplex)
   ├─ Phối cảnh & hình nhà mẫu
   ├─ Video tour căn hộ mẫu
   ├─ Hình tiến độ xây dựng (theo tháng)
   └─ Tiện ích nội khu

📁 Chính sách bán hàng
   ├─ Chính sách tháng hiện tại
   ├─ Bảng tính vay mẫu
   └─ Tiến độ thanh toán

📁 Pháp lý
   ├─ Giấy phép, quyết định
   ├─ Mẫu HĐMB
   └─ Checklist hồ sơ khách
```

### Quy tắc đặt tên file — quan trọng hơn bạn nghĩ

```
✅ OP2-Zenpark-BangGia-2026-07-25.pdf
✅ OP2-MatBang-3PN-S2.03.jpg
✅ OP2-TienDo-ThangGiap-202607.jpg

❌ banggia.pdf
❌ IMG_20260725_093412.jpg
❌ bang gia moi nhat (2) final.pdf
```

**Có ngày trong tên file** = không bao giờ gửi nhầm bản cũ.

---

## 8.4. Gửi file trong chat

| Cách | Thao tác |
|---|---|
| **Kéo thả** | Kéo file từ máy tính thả vào khung chat — nhanh nhất |
| **Nút đính kèm** | Bấm biểu tượng kẹp giấy |
| **Chuyển tiếp** | Chuyển cả ảnh/video/audio từ hội thoại này sang khách khác |

**Điểm quan trọng:** mọi file gửi/nhận đều được **sao lưu về kho lưu trữ của công ty**, không chỉ nằm trên máy chủ Zalo. Nghĩa là:
- Link Zalo hết hạn vẫn xem lại được
- Khách gửi CCCD, sổ tiết kiệm, giấy tờ vay → lưu trong hồ sơ khách, tra cứu được sau này
- **Mất nick Zalo vẫn còn file** — xem [Chương 11](11-an-toan-nick-va-tuan-thu.md)

Video hiển thị ngay trong bong bóng chat, khách bấm xem được luôn, không phải tải về.

---

## 8.5. Nhãn khách hàng — công cụ bị đánh giá thấp nhất

Nhãn là thứ biến CRM từ "chỗ lưu tin nhắn" thành "công cụ bán hàng".

**Cài đặt → Khách hàng & Lead → Nhãn KH**

### Bộ nhãn chuẩn cho sale Vinhomes

| Nhóm | Nhãn |
|---|---|
| **Dự án** | `ocean-park`, `grand-park`, `smart-city`, `royal-island`, `golden-avenue` |
| **Loại hình** | `căn-hộ-1pn`, `căn-hộ-2pn`, `căn-hộ-3pn`, `duplex`, `shophouse`, `biệt-thự`, `liền-kề` |
| **Ngân sách** | `ns-dưới-3ty`, `ns-3-5ty`, `ns-5-8ty`, `ns-8-15ty`, `ns-trên-15ty` |
| **Mục đích** | `mua-ở`, `mua-đầu-tư`, `mua-cho-con`, `mua-cho-thuê` |
| **Tài chính** | `trả-thẳng`, `cần-vay-50`, `cần-vay-70`, `chờ-bán-nhà-cũ`, `chờ-thẩm-định` |
| **Ưu tiên riêng** | `view-hồ`, `view-nội-khu`, `căn-góc`, `tầng-cao`, `hướng-đông-nam`, `gần-trường` |
| **Nguồn** | `fb-ads`, `tiktok`, `hội-thảo`, `khách-giới-thiệu`, `cư-dân-hiện-hữu`, `data-telesale` |
| **Đặc biệt** | `vip`, `khách-cũ`, `người-nước-ngoài`, `nuôi-dài-hạn`, `đã-mua-dự-án-khác` |

### Sức mạnh thật của nhãn

**Tình huống:** thứ Hai tuần sau mở bán 15 căn góc view hồ, giá 5–6 tỷ, chính sách vay 70%.

**Không có nhãn:** bắn tin cho cả 800 khách → làm phiền 780 người, một số bấm báo xấu, nick gặp rủi ro, và bạn tự làm loãng thương hiệu cá nhân.

**Có nhãn:** lọc `view-hồ` + `căn-góc` + `ns-5-8ty` + `cần-vay-70` → **34 người**. Nhắn từng người với đúng thứ họ từng nói muốn:

> *"Anh Tuấn, đúng căn anh tìm hôm trước — góc, view thẳng hồ, tầng 18, 5,4 tỷ.
> Thứ Hai mở bán, có 15 căn thôi.
> Em giữ giúp anh một suất nhé?"*

**34 tin đúng người thắng 800 tin sai người.** Và an toàn cho nick hơn nhiều.

### Kỷ luật dán nhãn

- Dán **ngay khi biết**, đừng để cuối tuần
- Đừng tạo quá nhiều nhãn — trên 40 nhãn là không ai dùng nổi
- Thống nhất cách viết trong cả sàn (`view-hồ` hay `view_ho` — chọn một)
- Rà soát hàng quý, gộp nhãn trùng ý

### Nhãn Zalo gốc

ZaloCRM đồng bộ hai chiều với nhãn (label) gốc của Zalo. Nhãn dán trong CRM hiện trên điện thoại và ngược lại — tiện khi bạn đang đi đường chỉ có điện thoại.

---

## 8.6. Ghi chú — nơi lưu trí nhớ của bạn

Ô ghi chú nằm ở cột hồ sơ khách, dạng dòng thời gian như bảng tin.

### Viết gì

| ✅ Đáng ghi | ❌ Vô nghĩa |
|---|---|
| "NS 5-5.5 tỷ, vay tối đa 50%" | "Khách quan tâm" |
| "Vợ tên Lan, lo trường học cho con lớp 3" | "Đã gọi" |
| "Đang bán căn Cầu Giấy, xong mới xuống tiền, dự kiến T9" | "Sẽ liên hệ lại" |
| "Ghét tầng thấp, chỉ xem từ tầng 15" | "OK" |
| "Anh trai đã mua OP1 toà S1.02 năm ngoái" | |
| "Làm giám đốc công ty xây dựng, hay bận sáng, gọi sau 17h" | |

### Vì sao quan trọng hơn bạn nghĩ

1. **Khách quay lại sau 3 tháng** — bạn nhớ hết, khách cảm nhận được sự chuyên nghiệp
2. **Bạn nghỉ phép** — đồng nghiệp đọc ghi chú là tiếp được ngay, không làm khách khó chịu
3. **Bàn giao khách** — không mất bối cảnh
4. **Trưởng nhóm hỗ trợ** — sếp đọc ghi chú mới góp ý được đúng chỗ

> 💡 Ghi chú tốt là thứ phân biệt sale chuyên nghiệp với sale trí nhớ tốt. Trí nhớ tốt hỏng khi bạn có 300 khách.

---

## 8.7. Việc cần làm cuối chương

Dành **60 phút** làm một lần, dùng cả năm:

- [ ] Tạo 10 mẫu tin ở mục 8.2, đặt từ khoá gõ tắt
- [ ] Upload bộ tài liệu bán hàng lên Kho ảnh, đặt tên có ngày tháng
- [ ] Dựng bộ nhãn ở mục 8.5 (bàn với trưởng nhóm để cả sàn dùng chung)
- [ ] Dán nhãn cho 20 khách đang hoạt động nhất
- [ ] Đặt lịch nhắc **đầu mỗi tháng: rà lại mẫu tin và bảng giá**

---

➡️ Tiếp theo: **[Chương 9 — Nhóm cư dân & nguồn khách](09-nhom-cu-dan-va-nguon-khach.md)**
