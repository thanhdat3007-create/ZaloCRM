# Chương 0 — Trước khi bắt đầu

*Đọc 8 phút. Chưa cần mở máy tính.*

---

## 0.1. Bốn nỗi đau của sale BĐS mà ZaloCRM sinh ra để giải quyết

### Đau 1 — "Anh có 4 con điện thoại, mà vẫn sót tin khách"

Sale BĐS điển hình có 2–4 số Zalo: một số telesale chạy data lạnh, một số chăm khách nóng, một số dùng trong nhóm cư dân, một số cá nhân. Đổi qua đổi lại giữa 4 máy, đến tối mới phát hiện khách hỏi "còn căn 2PN view hồ không em" từ 6 tiếng trước.

**ZaloCRM:** tất cả nick đổ về **một màn hình duy nhất** trên máy tính. Tin mới của nick nào cũng nhảy lên cùng chỗ.

---

### Đau 2 — "Data 2.000 số, không biết gọi ai trước"

Sếp đưa file Excel 2.000 SĐT. Bạn gọi từ trên xuống. Khách số 1.847 là người sẵn sàng cọc, nhưng bạn không bao giờ gọi tới đó.

**ZaloCRM:** đọc nội dung chat, tự chấm điểm. Khách hỏi *"trả trước bao nhiêu, vay được không"* được +20 điểm và nhảy lên đầu danh sách. Khách "seen" không rep 3 lần bị trừ điểm và tụt xuống.

---

### Đau 3 — "Khách bảo để suy nghĩ, rồi mất tích, rồi mua của người khác"

Không ai quên khách cố ý. Chỉ là 300 khách trong máy, ai cũng "đang chăm".

**ZaloCRM:** khách kẹt ở bậc **Hẹn gặp** quá 30 ngày sẽ tự nhảy vào danh sách cảnh báo, kèm sẵn câu gợi ý *"Em hiểu đi xem trực tiếp bất tiện, em đề xuất gọi video 15 phút tour thực tế qua camera…"* — bấm một nút là gửi.

---

### Đau 4 — "Sale nghỉ việc mang theo cả data"

**ZaloCRM:** hệ thống chạy trên máy chủ của công ty bạn. Sale nghỉ → gỡ quyền truy cập, data ở lại. Có nhật ký ai xem gì, xuất gì.

---

## 0.2. ZaloCRM khác gì Zalo OA?

|                     | Zalo cá nhân qua ZaloCRM              | Zalo OA (Official Account)    |
| ------------------- | ------------------------------------- | ----------------------------- |
| Khách nhận tin từ   | **Một người thật** (nick sale)        | Một trang doanh nghiệp        |
| Tỷ lệ đọc           | Cao — như tin bạn bè                  | Thấp hơn nhiều, khách hay tắt |
| Gọi điện, gọi video | Được                                  | Không                         |
| Vào nhóm cư dân     | Được                                  | Không                         |
| Chi phí tin nhắn    | Không mất phí                         | Trả phí theo tin              |
| **Rủi ro**          | **Có thể bị hạn chế nick nếu gửi ẩu** | An toàn về mặt chính sách     |

**Kết luận thực tế:** với BĐS cao cấp — nơi một giao dịch vài tỷ và khách cần *nói chuyện với một con người* — Zalo cá nhân thắng tuyệt đối. Đổi lại, bạn phải kỷ luật về tốc độ gửi. Chương 11 hướng dẫn chi tiết.

---

## 0.3. Từ điển — 12 từ bạn sẽ gặp suốt playbook

| Từ | Nghĩa đơn giản |
|---|---|
| **Nick** | Một tài khoản Zalo. "Đấu nick" = kết nối tài khoản Zalo vào CRM. |
| **Khách hàng (Contact)** | Hồ sơ một người trong CRM: tên, SĐT, ngân sách, quan tâm dự án nào. |
| **Bạn bè (Friend)** | Quan hệ bạn Zalo giữa **một nick của bạn** và **một khách**. Một khách có thể là bạn của 3 nick khác nhau. |
| **Hội thoại** | Một khung chat. Một khách chat với 2 nick = 2 hội thoại, nhưng vẫn là 1 khách hàng. |
| **Trạng thái / Bậc / Stage** | Khách đang ở đâu trong quy trình: Mới → Tiếp cận → Hẹn gặp → Nóng → Tiềm năng → Chốt. |
| **Pipeline** | Toàn bộ đường đi trên, nhìn như một cái phễu. |
| **Điểm khách hàng (Lead Score)** | 0–100. Đo **mức độ muốn mua**. |
| **Điểm tương tác (Engagement)** | 0–100. Đo **mức độ chịu nói chuyện** trong 28 ngày qua. |
| **Điểm ưu tiên (Priority)** | Trộn hai điểm trên. **Đây là con số duy nhất bạn cần nhìn buổi sáng.** |
| **Khách kẹt (Stuck)** | Đứng yên một bậc quá lâu — hệ thống tự cảnh báo. |
| **Tệp khách hàng (List)** | Một lô SĐT bạn nhập vào, ví dụ "Data hội thảo Ocean Park 20/07". |
| **Nhãn / Tag** | Dán nhãn tự do lên khách: `view-hồ`, `mua-đầu-tư`, `khách-tỉnh`, `cần-vay-70%`. |

---

## 0.4. Ba thứ cần chuẩn bị trước khi mở CRM

**1. Điện thoại có sẵn các nick Zalo** — để quét mã QR đăng nhập. Nick phải đang đăng nhập được bình thường trên điện thoại.

**2. Danh sách dự án bạn đang bán** — viết ra giấy. Ví dụ:
```
Vinhomes Ocean Park 1 — căn hộ + shophouse
Vinhomes Ocean Park 2 — biệt thự, liền kề
Vinhomes Grand Park — căn hộ
Vinhomes Royal Island — biệt thự đảo
```
Bạn sẽ dùng danh sách này để dựng nhãn và thư mục tài liệu ở Chương 8.

**3. Bộ tài liệu bán hàng** đang nằm rải rác trong Zalo/Drive/máy tính:
- Bảng giá / quỹ căn từng phân khu
- Chính sách bán hàng tháng này (chiết khấu, hỗ trợ lãi suất, ân hạn gốc)
- Video / hình ảnh nhà mẫu, link tour 360°
- Mặt bằng layout căn hộ theo loại (1PN, 2PN, 3PN, duplex)
- Bộ hồ sơ pháp lý gửi khách

Gom hết vào một thư mục trên máy. Chương 8 sẽ đưa lên CRM một lần, dùng mãi.

---

## 0.5. Kỳ vọng thực tế theo thời gian

| Mốc | Bạn sẽ thấy gì |
|---|---|
| **Ngày 1** | Chat được với mọi khách từ mọi nick trên một màn hình. Đây thôi đã đáng rồi. |
| **Tuần 1** | Không còn sót tin. Biết chính xác ai chưa được trả lời. |
| **Tuần 2–3** | Kho mẫu tin + tài liệu bắt đầu tiết kiệm thời gian rõ rệt. |
| **Tuần 4** | Điểm số bắt đầu chính xác (cần đủ dữ liệu chat để chấm). Danh sách "gọi ai hôm nay" đáng tin. |
| **Tháng 2–3** | Cảnh báo khách kẹt phát huy tác dụng — bạn "cứu" được những khách đáng lẽ đã mất. Báo cáo cho sếp thấy được tắc ở bậc nào. |

**Đừng kỳ vọng tuần đầu điểm số đã chuẩn.** Nó cần dữ liệu chat thật để học. Cứ dùng bình thường, hệ thống tự tích luỹ.

---

➡️ Tiếp theo: **[Chương 1 — Ngày đầu tiên](01-ngay-dau-tien.md)**
