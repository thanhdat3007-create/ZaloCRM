# Chương 6 — Chấm điểm học viên & ưu tiên

*Đọc 15 phút, chỉnh 30 phút. Làm một lần, dùng mãi.*

Sau buổi phễu có 200 người trong nhóm. Bạn có 2 tiếng để chăm. Chương này trả lời: **gọi 20 người nào?**

---

## 6.1. Ba loại điểm

| Điểm | Đo cái gì | Dùng khi nào |
|---|---|---|
| **Điểm học viên (Lead Score)** | *Người này muốn mua khoá tới mức nào* | Chốt sale sau buổi phễu |
| **Điểm tương tác (Engagement)** | *Người này chịu tham gia tới mức nào, trong 28 ngày* | Cảnh báo bỏ học với người đã đóng tiền |
| **Điểm ưu tiên (Priority)** | Trộn hai điểm trên | **Con số duy nhất nhìn buổi sáng** |

Với ngành đào tạo, điểm tương tác có **hai vai trò** khác nhau tuỳ người:

```
Người CHƯA mua  → điểm tương tác thấp = ít quan tâm, đừng tốn công
Người ĐÃ mua    → điểm tương tác thấp = SẮP BỎ HỌC, phải cứu ngay
```

Đây là khác biệt lớn nhất so với ngành bất động sản, và là chỗ ZCRM giá trị nhất với trung tâm đào tạo. Xem [Chương 9](09-sau-khi-mua.md).

---

## 6.2. ⭐ Hệ thống đang chấm theo từ khoá bất động sản

Đây là việc **bắt buộc phải sửa**, nếu không điểm số vô nghĩa.

Bốn nhóm tín hiệu và trọng số mặc định:

| Nhóm | Trọng số | Đo gì |
|---|---|---|
| **Tương tác (engagement)** | 35% | Nhắn nhiều không, nhắn dài không, trả lời nhanh không |
| **Ý định (intent)** | 30% | Nói những từ nào — **đây là nhóm phải sửa** |
| **Phù hợp (fit)** | — | Có đúng đối tượng không |
| **Tốc độ (velocity)** | — | Điểm đang tăng hay giảm |

Nhóm **tương tác** và **tốc độ** dùng được nguyên xi — chúng đo hành vi, không đo ngành. Nhóm **ý định** đang chứa từ khoá kiểu *"sổ đỏ"*, *"trả trước"*, *"view hồ"*, *"bàn giao"* — vô dụng với lớp Excel.

---

## 6.3. Bộ từ khoá cho ngành đào tạo

**Cài đặt → Chấm điểm tương tác**

Sửa từng luật, giữ nguyên `signalKey` và điểm, chỉ đổi danh sách từ khoá:

### Tín hiệu cộng điểm

| Luật hệ thống | Điểm | Từ khoá cho đào tạo |
|---|---|---|
| `ask_price` — Hỏi giá | **+15** | `học phí`, `bao nhiêu tiền`, `giá khoá`, `chi phí`, `bao nhiêu ạ`, `học phí thế nào` |
| `ask_payment` — Hỏi thanh toán | **+20** | `trả góp`, `đóng theo tháng`, `chuyển khoản`, `đóng trước`, `thanh toán`, `học trước trả sau`, `chia nhỏ` |
| `ask_project_detail` — Hỏi chi tiết | **+10** | `học mấy buổi`, `học bao lâu`, `nội dung khoá`, `lộ trình`, `giáo trình`, `học online hay offline`, `mấy giờ học`, `khai giảng` |
| `ask_documents` — Xin tài liệu | **+12** | `gửi thông tin`, `xem lộ trình`, `tài liệu khoá`, `gửi em chi tiết`, `cho em xin` |
| `ask_legal` — Hỏi thủ tục | **+18** | `có chứng chỉ không`, `cấp bằng`, `hoá đơn`, `hợp đồng`, `xuất hoá đơn công ty`, `cam kết đầu ra` |
| `ask_promo` — Hỏi ưu đãi | **+10** | `ưu đãi`, `giảm giá`, `khuyến mãi`, `học viên cũ có giảm`, `đăng ký nhóm`, `còn suất không` |
| `mention_decisionmaker` | **+8** | `hỏi ý chồng`, `xin phép công ty`, `bố mẹ`, `sếp em duyệt`, `bàn với vợ` |
| `ask_future` — Câu hỏi tương lai | **+15** | `khoá sau khi nào`, `tháng sau`, `đợt tới`, `khi nào mở lớp`, `học xong thì` |

> 💡 `ask_payment` **+20 điểm** là tín hiệu mạnh nhất, và đúng cho đào tạo: người hỏi *"có trả góp không"* là người đã quyết muốn học, chỉ vướng tiền. Đây là nhóm chốt được cao nhất — chỉ cần cho họ một cách trả tiền dễ hơn.

### Thêm luật riêng cho đào tạo

Nếu giao diện cho tạo luật mới, thêm ba luật này — chúng bắt tín hiệu đặc thù ngành:

| Luật mới | Điểm | Từ khoá |
|---|---|---|
| Lo không theo kịp | **+12** | `mất gốc`, `em không biết gì`, `có theo kịp không`, `khó không`, `em chậm hiểu` |
| Nói về mục tiêu nghề nghiệp | **+15** | `để xin việc`, `tăng lương`, `sếp yêu cầu`, `chuyển ngành`, `phỏng vấn`, `công việc em cần` |
| Lo về thời gian | **+8** | `bận quá`, `không học trực tiếp được`, `xem lại được không`, `học bù` |

**Vì sao "mất gốc" lại là điểm cộng?** Vì người nói câu đó đang **tưởng tượng mình trong lớp học**. Đó không phải lời từ chối — đó là lời xin được trấn an. Người thực sự không quan tâm thì không hỏi câu này. Trong đào tạo, đây là một trong những tín hiệu mua bị hiểu nhầm nhiều nhất.

### Tín hiệu trừ điểm

| Luật | Điểm | Từ khoá cho đào tạo |
|---|---|---|
| `ask_competitor` | **−8** | `bên kia rẻ hơn`, `trung tâm khác`, `có khoá free trên youtube`, `học trên mạng cũng được` |
| `seen_zoned` — Xem không trả lời | **−3**/lần, tối đa −9/ngày | *(tự động, không cần sửa)* |
| `short_reply` — Trả lời cụt | **−2**/lần | *(tự động)* |
| `refuse_meeting` — Từ chối lịch | **−10** | *(tự động)* |

---

## 6.4. Điểm tự trừ theo thời gian

Người im lặng bị trừ dần:

| Im lặng | Trừ |
|---|---|
| 3–7 ngày | −1 |
| 7–14 ngày | −3 |
| 14–30 ngày | −5 |
| 30–60 ngày | −8 |

Nhờ vậy danh sách ưu tiên tự làm sạch — người hỏi học phí 2 tháng trước rồi biến mất sẽ tự tụt xuống, không chiếm chỗ của người vừa hỏi tối qua.

**Ngược lại:** *"chủ động chat lại sau im lặng"* được **+15 điểm**. Người biến mất 3 tuần rồi tự nhắn *"chị ơi khoá sau khi nào khai giảng"* nhảy vọt lên đầu danh sách — đúng như vậy, vì đó là người đã tự thuyết phục mình xong.

---

## 6.5. Đọc điểm thế nào

| Điểm ưu tiên | Nghĩa | Làm gì |
|---|---|---|
| **80–100** | Sẵn sàng đóng tiền | Gọi điện trong hôm nay. Đừng nhắn tin — gọi |
| **60–79** | Quan tâm rõ, còn vướng gì đó | Nhắn 1-1, tìm đúng cái vướng (tiền? thời gian? tự tin?) |
| **40–59** | Có quan tâm, chưa chín | Nuôi bằng nội dung, mời khoá phễu tiếp |
| **20–39** | Mờ nhạt | Để trong nhóm, không tốn công riêng |
| **0–19** | Chưa đủ dữ liệu, hoặc không quan tâm | Bỏ qua |

> ⚠️ **Điểm không thay bạn quyết định.** Nó chỉ xếp thứ tự. Người điểm 45 mà bạn *biết* đang cần khoá này vì vừa nói chuyện điện thoại thì cứ ưu tiên — bạn có thông tin mà hệ thống không có. Ghi chú vào hồ sơ để lần sau hệ thống biết.

---

## 6.6. Tuần đầu điểm sẽ sai — chuyện bình thường

Hệ thống cần dữ liệu chat thật để chấm. Lịch trình thực tế:

| Thời gian | Trạng thái điểm |
|---|---|
| Tuần 1 | Gần như vô nghĩa, ai cũng điểm thấp |
| Tuần 2–3 | Bắt đầu phân hoá, nhưng đừng tin tuyệt đối |
| Sau khoá phễu đầu tiên | **Bắt đầu dùng được** — vì có một đợt chat tập trung |
| Sau 2–3 khoá | Đáng tin, dùng làm cơ sở phân công |

**Cách tăng tốc:** sau khoá đầu tiên, lấy danh sách 10 người thực sự đã đóng tiền, mở hồ sơ từng người xem họ đã nói những từ gì. Từ nào lặp lại ở nhiều người mà chưa có trong bộ từ khoá thì thêm vào. Đây là 30 phút có giá trị nhất bạn bỏ ra cho chấm điểm.

---

## 6.7. Học viên kẹt

**Cài đặt → KH bị kẹt** — đặt ngưỡng cho từng bậc:

| Bậc | Kẹt quá | Vì sao |
|---|---|---|
| Đăng ký | **3 ngày** | Đăng ký mà 3 ngày chưa vào nhóm là mất |
| Đã vào nhóm | **10 ngày** | Vào nhóm 10 ngày không học buổi nào |
| Có mặt buổi học | **5 ngày** | Học rồi mà 5 ngày không động tĩnh — đây là nhóm cần cứu nhất |
| Quan tâm khoá phí | **3 ngày** | Đã hỏi giá mà 3 ngày im = đang nguội nhanh |
| Đã nhận báo giá | **2 ngày** | Nhận báo giá 2 ngày không quyết → phải chủ động |

Ngưỡng ngành đào tạo **ngắn hơn nhiều** so với bất động sản. Người mua nhà cân nhắc 3 tháng là bình thường; người mua khoá học quyết trong 3 ngày hoặc không bao giờ — vì cảm xúc từ buổi học nguội rất nhanh.

**Marketing → Học viên kẹt** hàng sáng, đây là danh sách "cứu người" của bạn.

---

## 6.8. Việc cần làm cuối chương

- [ ] Vào **Cài đặt → Chấm điểm tương tác**, đổi toàn bộ từ khoá sang ngành đào tạo (mục 6.3)
- [ ] Thêm 3 luật đặc thù: *mất gốc* · *mục tiêu nghề nghiệp* · *lo thời gian*
- [ ] Sửa từ khoá đối thủ cho đúng ngành (`youtube free`, `trung tâm khác`)
- [ ] Đặt ngưỡng kẹt theo mục 6.7 — ngắn hơn mặc định
- [ ] Sau khoá phễu đầu tiên: đọc hồ sơ 10 người đã mua, bổ sung từ khoá còn thiếu
- [ ] Tập thói quen mở **Khách hàng → sắp theo Điểm ưu tiên** mỗi sáng

---

➡️ Tiếp theo: **[Chương 7 — Pipeline & chốt sale sau buổi học](07-pipeline-va-chot-sale.md)**
