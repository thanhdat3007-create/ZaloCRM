# Chương 4 — Từ data lạnh đến bạn bè

*Bạn có 2.000 SĐT. Chương này biến chúng thành khách hàng thật mà không mất nick.*

---

## 4.1. Sự thật về data BĐS

Một file 2.000 SĐT "khách quan tâm Ocean Park" điển hình:

| | Số lượng | |
|---|---|---|
| Tổng | 2.000 | |
| Trùng nội bộ trong file | ~200 | Nhập 2 lần, sai định dạng |
| Đã có trong CRM (khách cũ) | ~600 | Sale khác đang chăm — **đụng vào là mất lòng** |
| Không có Zalo | ~250 | Gửi kết bạn = phí hạn mức |
| Đã bị 3+ chiến dịch mời rồi | ~150 | Data cháy, tỷ lệ đồng ý cực thấp |
| **Còn lại dùng được** | **~800** | Đây mới là data thật |

**Nếu bạn gửi kết bạn cho cả 2.000:** đốt 60% hạn mức vào số vô ích, đá vào khách của đồng nghiệp, và tỷ lệ từ chối cao khiến Zalo đánh dấu nick bất thường.

ZaloCRM lọc giúp bạn trước khi gửi một lời mời nào.

---

## 4.2. Nhập tệp khách hàng

**Marketing → Tệp khách hàng → Tạo tệp mới**

### Ba cách nhập

| Cách | Khi nào dùng |
|---|---|
| **Dán trực tiếp** | Data lấy từ chat, từ file Word, số lượng ít |
| **Upload CSV / Excel** | File chuẩn từ marketing, telesale |
| **API** | Hệ thống khác đổ vào tự động |

### Đặt tên tệp cho tử tế

Ba tháng sau bạn sẽ cảm ơn chính mình:

```
✅ "Hội thảo Ocean Park 2 — 20/07/2026"
✅ "FB Ads biệt thự Royal Island — T7/2026"
✅ "Data telesale Grand Park — lô 3"

❌ "data moi"
❌ "list1"
```

### Định dạng file Excel/CSV

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| **SĐT** | ✅ | `0912345678`, `84912345678`, `+84912345678` đều được — hệ thống tự chuẩn hoá |
| **Tên** | Nên có | Không có thì lấy tên Zalo sau |
| **Ghi chú** | Rất nên có | ⭐ Xem mục 4.5 — đây là vũ khí lợi hại nhất |

---

## 4.3. Đọc kết quả lọc

Nhập xong, hệ thống trả về ngay bảng thống kê:

| Chỉ số | Nghĩa | Bạn làm gì |
|---|---|---|
| **Hợp lệ** | Số đọc được, đúng định dạng | Đây là mẫu số thật |
| **Số không hợp lệ** | Sai định dạng, thiếu số | Bỏ qua |
| **Trùng trong tệp** | Lặp ngay trong file này | Hệ thống tự gộp |
| **Trùng tệp khác** | Đã nhập ở tệp trước | ⚠️ Kiểm tra trước khi động vào |
| **Đã là khách CRM** | Đã có hồ sơ, có người chăm | 🛑 **Không tự ý gửi kết bạn** — hỏi trưởng nhóm |
| **Có Zalo / Không có Zalo** | Kết quả tra số | Chỉ chạy trên nhóm "có Zalo" |
| **Chưa tra** | Chưa kiểm tra | Bấm tra tiếp |

> ⚠️ **Quy tắc vàng của đội nhóm:** số nào rơi vào **"Đã là khách CRM"** thì đó là khách của người khác. Gửi kết bạn chồng chéo làm khách khó chịu ("sao công ty anh 3 người nhắn tôi?") và gây xung đột nội bộ. Đây là nguyên nhân cãi nhau số 1 ở các sàn.

---

## 4.4. Tra số nào có Zalo

Trong màn hình chi tiết tệp, mỗi dòng có nút **"Tìm Zalo cho KH này"** — chọn nick để tra.

Kết quả:
- ✅ **Có Zalo** — hiện tên, ảnh đại diện Zalo thật của người đó
- ❌ **Không có Zalo** — bỏ qua, đừng phí hạn mức
- Có nút **"Quét lại Zalo"** ở cấp tệp để tra hàng loạt

> 💡 Thao tác tra số cũng tính vào hạn mức an toàn của nick. Đừng tra 2.000 số trong một buổi sáng. Rải ra vài ngày.

---

## 4.5. Cột "Ghi chú" — vũ khí lợi hại nhất

Cột `Ghi chú` trong file Excel được lưu thành **lời mời riêng cho từng số**.

**Đây là khác biệt giữa 10% và 40% tỷ lệ đồng ý kết bạn.**

### So sánh thực tế

Lời mời chung chung:
```
"Chào anh/chị, em là sale dự án bất động sản, kết bạn để gửi thông tin ạ."
→ Tỷ lệ đồng ý điển hình: rất thấp. Khách nhận 5 tin như này mỗi tuần.
```

Lời mời riêng (từ cột Ghi chú):
```
"Chào anh Tuấn, em là Hùng — hôm 20/7 anh có ghé gian hàng Ocean Park 2
ở hội thảo Landmark và hỏi em về căn 3PN view hồ. Em kết bạn để gửi anh
quỹ căn và bảng giá mới nhất ạ."
→ Khách nhớ ra ngay. Tỷ lệ đồng ý cao hơn hẳn.
```

### Cách làm

Khi xin/mua data, **luôn xin kèm ngữ cảnh**. Trong Excel:

| SĐT | Tên | Ghi chú |
|---|---|---|
| 0912345678 | Nguyễn Văn Tuấn | hội thảo 20/7, hỏi 3PN view hồ, NS 6 tỷ |
| 0987654321 | Trần Thị Mai | fanpage inbox 18/7, hỏi biệt thự Royal Island |
| 0909111222 | Lê Minh | khách cũ OP1, hỏi mua thêm cho con |

Rồi biên thành lời mời riêng cho từng dòng.

---

## 4.6. Gửi kết bạn — làm sao cho an toàn

### Bản Community — gửi thủ công, có kiểm soát

1. Vào **Bạn bè** hoặc hồ sơ khách → **tra SĐT** → thấy hồ sơ Zalo
2. Bấm **gửi lời mời kết bạn**, dán lời mời riêng đã soạn
3. Hệ thống ghi lại trạng thái: `đã gửi → đồng ý / từ chối`
4. Khách đồng ý → tự thành bạn bè, hội thoại xuất hiện trong **Tin nhắn**

### 🏷️ [EE] Bản Extension — luồng tự động 5 tin

Bản thương mại có **Mục tiêu (chiến dịch)** chạy nền:

```
1. Lời mời kết bạn (dùng ghi chú riêng từng số)
2. Tin chào mừng — gửi ngay sau khi mời, qua hộp người lạ
3. Tin cảm ơn — gửi khi khách bấm đồng ý
4. Tin nhắc — sau 3 ngày nếu khách chưa phản hồi lời mời
5. Tin xử lý — khi khách từ chối
```

Kèm hai công tắc quan trọng: **tự dừng bám đuổi khi khách trả lời** (để sale vào chat thật), và tách riêng "bám đuổi khi chưa đồng ý" vs "sau khi đã đồng ý".

Ở bản Community, bạn làm 5 bước này thủ công bằng mẫu tin ([Chương 8](08-kho-tai-lieu-va-mau-tin.md)).

---

## 4.7. Nhịp gửi an toàn cho nick BĐS

| Tuổi nick | Kết bạn / ngày | Ghi chú |
|---|---|---|
| Mới đấu, chưa quen | **0** trong 3–5 ngày đầu | Chỉ chat bình thường cho "ấm" nick |
| 1–4 tuần | **10–15** | Tăng từ từ |
| Trên 1 tháng, ổn định | **20–30** | Đừng vượt |
| Nick vừa bị cảnh báo | **0** trong 7 ngày | Dùng như người thật, rồi từ từ lại |

**Nguyên tắc quan trọng hơn con số:**

1. **Rải trong ngày** — 25 lời mời rải 8 tiếng, không phải bắn trong 10 phút
2. **Xen kẽ hoạt động thật** — trong lúc chạy kết bạn vẫn chat, gọi, xem nhóm bình thường
3. **Tỷ lệ từ chối cao là báo động** — trên 40% từ chối nghĩa là data sai hoặc lời mời tệ. Dừng lại sửa, đừng gửi tiếp
4. **Kiểm tra Dashboard → Quota nick hôm nay** trước mỗi đợt

Chi tiết ở [Chương 11](11-an-toan-nick-va-tuan-thu.md).

---

## 4.8. Sau khi khách đồng ý kết bạn — 24 giờ vàng

Khách vừa bấm đồng ý là lúc họ nhớ bạn nhất. Đừng để nguội.

### Kịch bản 3 tin trong 24h đầu

**Tin 1 — ngay sau khi đồng ý (dưới 5 phút nếu được):**
> *"Dạ em cảm ơn anh Tuấn đã nhận kết bạn ạ. Em là Hùng, phụ trách phân khu The Zenpark — Ocean Park 2. Em gửi anh bảng giá và quỹ căn 3PN view hồ đang còn nhé."*
>
> 📎 *(đính kèm PDF bảng giá + 3 hình view thực tế)*

**Tin 2 — sau 1–2 tiếng, nếu khách đã xem:**
> *"Anh xem qua giúp em ạ. Riêng căn 3PN toà S2.03 tầng 18 view thẳng hồ, hiện còn 2 căn và đang có chính sách ân hạn gốc 24 tháng. Anh cần em tính thử phương án thanh toán theo ngân sách của anh không ạ?"*

**Tin 3 — hôm sau, nếu khách im lặng:**
> *"Dạ anh Tuấn, em gửi anh thêm video quay thực tế căn hộ mẫu 3PN để anh hình dung ạ. Cuối tuần này bên em có xe đưa đón tham quan miễn phí, nếu anh sắp xếp được em giữ chỗ cho anh nhé."*

**Sau tin 3 mà khách vẫn im:** đưa vào nhịp chăm dài hạn, đừng nhắn dồn. Hệ thống sẽ tự nhắc bạn khi khách kẹt quá lâu.

---

## 4.9. Bốn lỗi làm hỏng cả lô data

| ❌ Lỗi | Hậu quả | Làm đúng |
|---|---|---|
| Gửi kết bạn cho cả tệp chưa lọc | Đốt hạn mức, đụng khách đồng nghiệp | Lọc trùng + tra Zalo trước |
| Dùng chung một lời mời cho 800 người | Tỷ lệ đồng ý thấp, dễ bị report | Dùng cột Ghi chú làm lời mời riêng |
| Bắn hết hạn mức trong 10 phút đầu ngày | Nick bị đánh dấu bất thường | Rải đều trong ngày |
| Khách đồng ý rồi để đó 3 ngày mới nhắn | Mất 24 giờ vàng, khách quên bạn là ai | Nhắn trong ngày, tốt nhất trong 5 phút |

---

## 4.10. Bảng kiểm trước khi chạy một lô data

- [ ] Đặt tên tệp có ngày tháng và nguồn
- [ ] Đã xem số "Đã là khách CRM" — đã hỏi trưởng nhóm về nhóm này chưa?
- [ ] Đã tra Zalo, chỉ chạy trên nhóm "có Zalo"
- [ ] Đã soạn lời mời riêng theo ngữ cảnh (cột Ghi chú)
- [ ] Đã chọn đúng nick (nick chạy data lạnh, không phải nick chăm khách VIP)
- [ ] Đã kiểm tra quota nick còn dư
- [ ] Đã chuẩn bị sẵn bộ 3 tin cho khách đồng ý ⭐ *(quan trọng nhất — đừng để khách đồng ý xong bạn mới đi soạn tin)*

---

➡️ Tiếp theo: **[Chương 5 — Chăm sóc & đẩy khách qua từng bậc](05-cham-soc-va-chot.md)**
