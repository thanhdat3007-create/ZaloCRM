# Chương 12 — 15 tình huống thực chiến

*Tra cứu nhanh. Mỗi tình huống: dấu hiệu → cách xử lý trong CRM → tin nhắn mẫu.*

---

## 1. Khách "seen" mà không rep

**Dấu hiệu:** hệ thống trừ −3 điểm mỗi lần, tối đa −9/ngày. Nhìn hồ sơ thấy `seen_zoned` lặp lại.

**Nghĩa là:** khách vẫn quan tâm (còn mở tin), nhưng tin của bạn không đủ lý do để trả lời.

**Xử lý:** đổi từ *thông báo* sang *hỏi*. Hỏi câu chỉ cần một từ để trả lời.

```
❌ "Em gửi anh bảng giá mới nhất ạ."          ← không cần rep
✅ "Anh Tuấn, căn 1805 hay 2205 hợp anh hơn ạ?" ← rep 1 từ là xong
✅ "Anh cần em gửi bản tính vay 50% hay 70% ạ?"
```

---

## 2. Khách hỏi giá rồi im luôn

**Dấu hiệu:** `ask_price` +15 điểm, rồi im.

**Nghĩa là:** giá vượt kỳ vọng, hoặc khách đang so sánh chỗ khác.

**Xử lý:** đừng giảm giá. Đổi cách trình bày giá.

> *"Anh Tuấn, em nghĩ con số tổng nhìn hơi lớn ạ.
> Em tính theo dòng tiền thực tế cho anh dễ hình dung:
> • Ký HĐMB: 1,56 tỷ (30%)
> • 24 tháng đầu chỉ trả lãi: ~11tr/tháng
> • Sau ân hạn: ~38tr/tháng
> Con số này so với tiền thuê nhà hiện tại của anh thì thế nào ạ?"*

---

## 3. Khách nói "để anh hỏi vợ"

**Dấu hiệu:** hệ thống +8 điểm cho từ khoá `vợ em / chồng em / gia đình`.

**Nghĩa là:** ⚠️ **Tín hiệu tốt** — khách đã nghĩ thật. Nhưng người quyết định thật sự bạn chưa gặp.

**Xử lý:** đừng để khách đi thuyết phục hộ bạn — họ sẽ làm kém hơn bạn.

> *"Dạ đúng rồi anh, việc lớn phải có chị ạ.
> Hay cuối tuần anh chị cùng qua xem nhà mẫu?
> Nhiều khi chị nhìn góc khác — bếp, phòng cho con, khu vui chơi, trường Vinschool.
> Em chuẩn bị sẵn phần đó cho chị luôn ạ."*

Ghi chú ngay: `Người quyết định: có vợ. Vợ quan tâm trường học + bếp.`

---

## 4. Khách hẹn xem rồi không đến

**Xử lý trong CRM:** đánh dấu **Không đến** (không phải Hoàn thành). Số liệu sai còn tệ hơn không có.

> *"Dạ anh Tuấn, sáng nay chắc anh bận đột xuất ạ. Không sao anh nhé.
> Chủ nhật này hoặc T7 tuần sau anh tiện buổi nào để em sắp lại ạ?"*

**Hoãn 2 lần liên tiếp** → khách chưa thật sự sẵn sàng. Đưa về bậc Tiếp cận, tìm hiểu lại nhu cầu thay vì ép lần 3.

---

## 5. Khách im lặng 3 tuần

**Dấu hiệu:** điểm rơi −3 đến −5 mỗi ngày, nhóm tương tác chuyển sang `cooling`.

**Xử lý:** liên hệ có **giá trị mới**, tuyệt đối không hỏi "anh xem chưa".

> *"Anh Tuấn, tuần này bên em vừa cất nóc toà S2.03.
> Em gửi anh mấy hình tiến độ thực tế — căn 1805 anh xem hôm trước
> giờ nhìn ra hồ rõ lắm ạ. Anh xem cho vui nhé, em không làm phiền anh đâu."*

*Câu cuối quan trọng: nó hạ áp lực và làm khách dễ rep hơn.*

---

## 6. Khách đang xem dự án đối thủ

**Dấu hiệu:** hệ thống trừ −8 cho `bên kia giá / dự án khác giá / so sánh với`.

**Xử lý:** không dìm đối thủ — khách sẽ bênh lựa chọn của họ và bạn thành người bán hàng thiếu chuyên nghiệp.

> *"Dạ dự án đó cũng tốt anh ạ.
> Nếu anh ưu tiên tiện ích nội khu và cộng đồng cư dân thì bên em hợp hơn;
> còn nếu anh cần gần trung tâm hơn thì bên đó hợp hơn thật.
> Em gửi anh bảng so sánh khách quan hai bên để anh dễ quyết ạ."*

Trung thực ở đây thắng về dài hạn — và nghề này sống bằng giới thiệu.

---

## 7. Khách không vay được ngân hàng

**Xử lý:** đây **chưa phải** khách mất.

Ba hướng gỡ:
1. Đổi ngân hàng — mỗi bên một khẩu vị rủi ro khác nhau
2. Giảm tỷ lệ vay, giãn tiến độ thanh toán
3. Chuyển sang căn nhỏ hơn phù hợp khả năng

Không được thì: bậc **Thất bại**, lý do `không vay được`, nhãn `nuôi-dài-hạn`, đặt lịch nhắc **6 tháng**.

---

## 8. Khách đang bán nhà cũ, chờ tiền

**Dấu hiệu:** hay thấy ở khách bậc Tiềm năng, kẹt lâu.

**Xử lý:** đừng thúc, hãy **giúp**.
- Kết nối môi giới bán nhà cũ giúp khách *(bạn tăng giá trị, khách nhớ ơn)*
- Đề xuất giữ chỗ trước bằng khoản nhỏ
- **Đặt lịch Follow-up** hỏi tiến độ bán nhà mỗi 2 tuần

Ghi chú: `Chờ bán căn Cầu Giấy, dự kiến T9. Đã giới thiệu môi giới A.`

---

## 9. Khách nói "đừng nhắn nữa"

**Xử lý bắt buộc:**
1. Đặt trạng thái đồng ý = **`revoked`** (từ chối) → hệ thống tự loại khỏi mọi chiến dịch sau này
2. Đổi bậc = Thất bại
3. Trả lời tử tế và dừng thật:

> *"Dạ em hiểu ạ, em xin phép không làm phiền anh nữa.
> Khi nào anh cần thông tin về dự án cứ nhắn em bất cứ lúc nào ạ.
> Chúc anh một ngày tốt lành!"*

⚠️ **Không được đổi nick nhắn tiếp.** Đây là cách chắc chắn nhất để bị báo xấu — và báo xấu là thứ giết nick nhanh nhất ([Chương 11](11-an-toan-nick-va-tuan-thu.md)).

---

## 10. Hai sale cùng chăm một khách

**Dấu hiệu:** cột **"Cùng chăm (N)"** trong danh sách khách hàng, hoặc hệ thống báo trùng.

**Xử lý:**
1. Kiểm tra **nhật ký hoạt động** — ai liên hệ trước, có bằng chứng thời gian
2. Trưởng nhóm quyết định sale chính, người kia thành người cùng chăm hoặc rút
3. Gộp hồ sơ nếu là cùng một người (dùng chức năng gộp khách trùng)
4. **Tuyệt đối không để khách biết** có tranh chấp nội bộ

**Phòng ngừa:** luôn kiểm tra "Đã là khách CRM" trước khi chạy tệp data mới.

---

## 11. Khách hỏi câu bạn không biết trả lời

**Đừng đoán.** Sai một lần về pháp lý hoặc chính sách là mất cả niềm tin.

> *"Dạ câu này em muốn trả lời chính xác cho anh, để em xác nhận lại
> với bộ phận [pháp lý / tài chính] rồi báo anh trong hôm nay ạ."*

Rồi **tạo lịch hẹn loại Follow-up** để không quên. Trả lời đúng hẹn còn ghi điểm hơn trả lời ngay mà sai.

---

## 12. Khách cũ muốn mua thêm hoặc bán lại

**Đây là khách giá trị nhất.** Họ đã tin bạn.

**Xử lý:**
- Tạo hồ sơ mới nếu là giao dịch mới, **liên kết với hồ sơ cũ** (khách cha – khách con)
- Dán nhãn `khách-cũ` + `mua-đầu-tư` hoặc `bán-lại`
- Hệ thống cộng **+15** cho tín hiệu "người thân/bản thân đã mua dự án cùng"
- Ưu tiên cao nhất trong lịch làm việc

---

## 13. Nick Zalo bị hạn chế giữa chiến dịch

**Xử lý ngay:** xem quy trình 6 bước ở [Chương 11 mục 11.9](11-an-toan-nick-va-tuan-thu.md#119-khi-nick-đã-bị-hạn-chế--quy-trình-xử-lý).

Tóm tắt: đặt trần về 0 → **không đăng xuất, không đấu lại liên tục** → dùng nick trên điện thoại như người thật 5–7 ngày → chuyển khách quan trọng sang nick khác (lấy SĐT từ CRM, **gọi điện** báo khách) → thử lại ở mức rất thấp.

---

## 14. Sale nghỉ việc, bàn giao khách

**Quy trình chuẩn:**
1. Xuất danh sách khách của sale đó *(Báo cáo → xuất Excel)*
2. Chuyển sale phụ trách sang người mới trong CRM
3. **Gỡ quyền truy cập** của sale cũ ngay trong ngày cuối
4. Ngắt nick Zalo cá nhân của sale cũ khỏi hệ thống
5. Sale mới đọc **ghi chú** từng khách trước khi liên hệ
6. Nhắn cho khách quan trọng:

> *"Dạ em chào anh Tuấn, em là Nam — tiếp nhận hỗ trợ anh thay bạn Hùng ạ.
> Em đã nắm đầy đủ thông tin: anh quan tâm căn 3PN view hồ toà S2.03,
> ngân sách 5–5,5 tỷ và đang tính phương án vay 50%.
> Anh cần gì cứ nhắn em nhé ạ."*

*Tin này chứng minh không có gì bị mất trong quá trình bàn giao — đó là toàn bộ giá trị của việc ghi chú tử tế.*

---

## 15. Có quỹ căn mới, muốn báo khách phù hợp

**Đừng bắn cho cả 800 khách.**

**Quy trình đúng:**
1. Xác định đặc điểm quỹ căn: *căn góc, view hồ, 3PN, 5–6 tỷ, vay 70%*
2. **Khách hàng → lọc nhãn:** `view-hồ` + `căn-góc` + `ns-5-8ty` + `cần-vay-70`
3. Sắp theo **điểm ưu tiên** giảm dần
4. Nhắn **từng người**, nhắc đúng thứ họ từng nói:

> *"Anh Tuấn, đúng căn anh tìm hôm trước ạ — góc, view thẳng hồ, tầng 18, 5,4 tỷ.
> Thứ Hai mở bán, đợt này 15 căn thôi.
> Em giữ giúp anh một suất nhé?"*

**34 tin đúng người > 800 tin sai người** — vừa hiệu quả hơn, vừa an toàn cho nick.

---

## Bảng tra nhanh

| Tình huống | Xem mục |
|---|---|
| Khách im lặng / seen không rep | 1, 5 |
| Vấn đề về giá | 2, 6 |
| Người quyết định không phải khách | 3 |
| Vấn đề lịch hẹn | 4 |
| Vấn đề tài chính | 7, 8 |
| Khách từ chối / tuân thủ | 9 |
| Xung đột nội bộ | 10, 14 |
| Khách giá trị cao | 12, 15 |
| Sự cố kỹ thuật | 11, 13 |

---

➡️ Tiếp theo: **[Chương 13 — Lỗi thường gặp](13-loi-thuong-gap.md)**
