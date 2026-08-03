# Chương 11 — An toàn nick & tuân thủ ⭐

*Chương này trả lời câu hỏi quan trọng nhất: **"Đây không phải API chính thức của Zalo, nick có thể bị khoá — vậy phải làm sao?"***

---

## 11.1. Nói thẳng trước: rủi ro là có thật

ZaloCRM kết nối vào **Zalo cá nhân**, không phải Zalo Official Account API.

Điều đó nghĩa là:

- ❌ **Không có cam kết nào từ Zalo.** Không SLA, không kênh khiếu nại, không ai bảo đảm nick của bạn an toàn.
- ❌ **Không có công cụ nào đảm bảo 100% không bị khoá** — kể cả ZaloCRM, kể cả bất kỳ phần mềm nào khác quảng cáo như vậy. Ai nói ngược lại là đang bán hàng.
- ✅ **Nhưng:** hàng nghìn sale BĐS vẫn dùng Zalo cá nhân mỗi ngày mà không sao. Người bị khoá gần như luôn là người **gửi như máy**, không phải người **dùng như người**.

**Cách tư duy đúng:** đây không phải bài toán "làm sao để không bao giờ bị khoá" (bất khả thi), mà là bài toán **quản trị rủi ro** — giống như sale ngoài đời không đặt hết khách vào một giỏ.

Chương này có ba phần:
- **A.** Giảm xác suất bị khoá (11.2 → 11.6)
- **B.** Giảm thiệt hại khi bị khoá (11.7 → 11.9) ← *phần nhiều người bỏ qua, nhưng quan trọng nhất*
- **C.** Tuân thủ và đạo đức nghề (11.10 → 11.11)

---

# PHẦN A — Giảm xác suất bị khoá

## 11.2. Zalo phát hiện tài khoản bất thường qua đâu

Hiểu cơ chế thì mới biết tránh cái gì:

| Dấu hiệu | Vì sao bị nghi | Mức nguy hiểm |
|---|---|---|
| **Bị nhiều người báo xấu / chặn** | Tín hiệu mạnh nhất | 🔴 Rất cao |
| **Tỷ lệ từ chối kết bạn cao** | Gửi cho người không quen | 🔴 Rất cao |
| **Gửi dồn dập trong thời gian ngắn** | Người thật không gõ 50 tin/phút | 🔴 Cao |
| **Chỉ gửi đi, không bao giờ nhận lại** | Hành vi phát tán một chiều | 🟠 Cao |
| **Nội dung giống hệt nhau hàng loạt** | Dấu hiệu tin rác | 🟠 Trung bình |
| **Đăng nhập từ IP lạ / nhảy vị trí liên tục** | Nghi chiếm tài khoản | 🟠 Trung bình |
| **Nick mới tinh đã gửi kết bạn ồ ạt** | Tài khoản dùng một lần | 🔴 Rất cao |

> 💡 **Rút ra:** thứ giết nick không phải là "dùng phần mềm", mà là **hành vi giống máy và bị người khác báo xấu**. Một nick chat qua lại tự nhiên với 40 khách/ngày an toàn hơn nhiều một nick bắn 200 tin một chiều.

---

## 11.3. Lớp bảo vệ ZaloCRM dựng sẵn

### Trần an toàn hai tầng

Mỗi nick có hạn mức theo **từng loại hành vi**, chặn ở hai tầng:

- **Tầng ngày** — tổng số lệnh trong 24 giờ
- **Tầng dồn (burst)** — số lệnh trong một cửa sổ ngắn, chống bắn liên tiếp

Giá trị mặc định trong hệ thống:

| Loại hành vi | Mặc định/ngày | Chống dồn | Là gì |
|---|---|---|---|
| `message` | **200** | 20 / 30 giây | Gửi tin nhắn |
| `friend_action` | **30** | 8 / 60 giây | ⚠️ Gửi/nhận lời mời kết bạn — **rủi ro cao nhất** |
| `friend_lookup` | 1.000 | 15 / 30 giây | Tra SĐT ra Zalo |
| `profile` | **10** | 3 / 60 giây | Đổi thông tin hồ sơ |
| `group_admin` | 50 | 5 / 60 giây | Thao tác quản trị nhóm |
| `group_read` | 1.000 | 20 / 30 giây | Đọc nhóm, quét thành viên |
| `reaction` | 300 | 10 / 30 giây | Thả cảm xúc |
| `chat_action` | 500 | 15 / 30 giây | Đánh dấu đã đọc, đang gõ… |
| `contact_sync` | 100 | 5 / 60 giây | Đồng bộ danh bạ |
| `query` | 2.000 | 30 / 30 giây | Truy vấn linh tinh |

Chạm trần → hệ thống **chặn lệnh và báo lý do** ngay trên giao diện:
> *"Đã đạt giới hạn 30 friend_action/ngày"* · *"Quá nhanh (>8 friend_action/60s)"*

**Chỉnh ở đâu:** Cài đặt → Kênh & Tự động → **Trần an toàn SDK Zalo**.
Đặt được **mặc định cho cả tổ chức** và **ghi đè riêng từng nick** (nick ghi đè thắng).

> ⚠️ **Một điểm kỹ thuật bạn nên biết:** hệ thống thiết kế theo nguyên tắc *fail-open* — nếu bộ đếm gặp sự cố, lệnh vẫn được cho qua thay vì chặn hết công việc. Nghĩa là **trần an toàn là lưới đỡ, không phải bức tường**. Kỷ luật của người dùng vẫn là lớp bảo vệ số một.

### Các lớp khác

| Lớp | Tác dụng |
|---|---|
| **Proxy riêng từng nick** | Mỗi nick đi một đường mạng riêng, không để 10 nick chung một IP máy chủ |
| **Lưu phiên đăng nhập** | Không phải quét QR mỗi ngày — đăng nhập lại liên tục cũng là tín hiệu bất thường |
| **Tự kết nối lại** | Cron 5 phút quét nick rớt và nối lại; làm mới phiên mỗi ngày một lần |
| **Nhật ký trạng thái nick** | Lưu từng lần kết nối/ngắt — xem được uptime, phát hiện nick "hay rớt" trước khi thành vấn đề |
| **Cảnh báo mất kết nối** | Thông báo ngay khi nick rớt |

---

## 11.4. Chiến lược đội nick — điều quan trọng hơn mọi con số

**Đây là phần quyết định. Đừng để một nick gánh mọi việc.**

Phân vai rõ ràng, mỗi nick một nhiệm vụ, hạn mức khác nhau:

| Vai nick | Việc | `friend_action`/ngày | `message`/ngày | Rủi ro |
|---|---|---|---|---|
| 🔵 **Nick chăm khách VIP** | Chỉ chat khách đã quen, khách Nóng/Tiềm năng/Chốt | **0** | 150 | Rất thấp |
| 🟢 **Nick chăm khách thường** | Khách đã kết bạn, đang chăm | **5** | 200 | Thấp |
| 🟡 **Nick khai thác data** | Chạy data lạnh, gửi lời mời | **20–25** | 100 | ⚠️ Cao |
| 🟣 **Nick nhóm cư dân** | Sinh hoạt trong nhóm, quét nhóm | **0** | 80 | Thấp |

**Nguyên tắc sống còn:**

> 🛑 **TUYỆT ĐỐI không dùng nick chăm khách VIP để chạy data lạnh.**

Nick chứa 40 khách sắp cọc mà đi gửi 25 lời mời/ngày cho người lạ — nếu bị hạn chế, bạn mất kênh liên lạc với đúng nhóm khách đáng giá nhất. Nick khai thác data bị khoá thì thay nick mới, chẳng mất gì ngoài công nuôi.

**Đây chính là câu trả lời cho "nick có thể bị khoá thì sao":** bạn không chống lại rủi ro, bạn **phân bổ** nó vào chỗ mất ít nhất.

---

## 11.5. Nuôi nick mới — 4 tuần

Nick mới tinh gửi kết bạn ồ ạt là công thức bị khoá nhanh nhất.

| Tuần | Kết bạn/ngày | Việc cần làm |
|---|---|---|
| **Tuần 1** | **0** | Đăng nhập điện thoại dùng bình thường. Đặt avatar, ảnh bìa, tên thật, cập nhật vài dòng trạng thái. Chat với đồng nghiệp, người quen. Gọi vài cuộc. |
| **Tuần 2** | **5–8** | Bắt đầu kết bạn với người **thật sự quen** hoặc khách đã liên hệ trước. Vào 2–3 nhóm liên quan BĐS. Đăng 1–2 bài nhật ký. |
| **Tuần 3** | **10–15** | Chạy data ấm (khách đã để lại SĐT, đã nói chuyện điện thoại) |
| **Tuần 4+** | **20–30** | Chạy bình thường, theo dõi tỷ lệ từ chối |

**Đừng bỏ tuần 1.** Đây là tuần rẻ nhất và có giá trị nhất.

**Nick nhìn giống người thật cần:** ảnh đại diện là người thật · tên đầy đủ · ảnh bìa · vài bài đăng nhật ký · có bạn bè hai chiều · có nhóm tham gia · có lịch sử chat qua lại.

---

## 11.6. Bảy quy tắc vận hành hàng ngày

**1. Rải đều, đừng bắn dồn.**
25 lời mời rải 8 tiếng ≈ 1 lời mời mỗi 20 phút. Không phải 25 cái trong 10 phút. Người thật không làm vậy.

**2. Biến đổi nội dung.**
Đừng gửi y hệt một câu cho 200 người. Tối thiểu đổi tên, dự án, ngữ cảnh — đây chính là lý do cột "Ghi chú" trong tệp khách hàng ([Chương 4](04-tu-data-lanh-den-ban-be.md)) quan trọng đến vậy.

**3. Giữ tỷ lệ tương tác hai chiều.**
Nick chỉ gửi đi mà không ai rep là nick đáng nghi. Nếu nick khai thác data có tỷ lệ phản hồi quá thấp → **vấn đề nằm ở data hoặc lời mời**, dừng lại sửa, đừng gửi tiếp.

**4. Tỷ lệ từ chối > 30–40% là báo động đỏ.**
Dừng ngay hôm đó. Xem lại nguồn data và câu mời.

**5. Không chạy data lạnh vào đêm khuya.**
Gửi 2h sáng vừa dễ bị report vừa rõ ràng là máy. Giờ đẹp: 9–11h và 14–17h.

**6. Vẫn dùng nick trên điện thoại như người thật.**
Xem nhật ký bạn bè, thả tim, trả lời tin, thỉnh thoảng gọi điện. Nick chỉ có lưu lượng từ máy chủ là nick trần trụi.

**7. Nhìn Dashboard → ô "Quota nick hôm nay" trước mỗi đợt.**
Sắp đầy thì dừng, đừng cố.

---

# PHẦN B — Giảm thiệt hại khi bị khoá

*Đây là phần trả lời trực diện nhất cho câu hỏi của bạn.*

## 11.7. Vì sao dùng CRM lại **an toàn hơn** không dùng

Nghe có vẻ ngược, nhưng đây là điểm mấu chốt:

### Không dùng CRM — nick bị khoá là mất trắng

```
Nick Zalo bị khoá
 └─ Mất toàn bộ danh bạ khách
 └─ Mất toàn bộ lịch sử chat (khách nói gì, ngân sách bao nhiêu)
 └─ Mất ảnh, file, hợp đồng đã trao đổi
 └─ Không biết khách nào đang ở bậc nào
 └─ Không có cách nào liên hệ lại — vì SĐT cũng nằm trong nick đó
 → Coi như mất luôn tệp khách
```

### Có ZaloCRM — nick bị khoá chỉ là mất **một kênh**

```
Nick Zalo bị khoá
 └─ Khách hàng: VẪN CÒN trong CRM (tên, SĐT, hồ sơ đầy đủ)
 └─ Lịch sử chat: VẪN CÒN, đã lưu về máy chủ công ty
 └─ File, ảnh, video: VẪN CÒN — đã sao lưu về kho lưu trữ riêng,
    không phụ thuộc CDN của Zalo
 └─ Ghi chú, bậc, điểm số, lịch hẹn: VẪN CÒN
 └─ Việc cần làm: đấu nick mới → gửi lại kết bạn cho nhóm khách
    quan trọng, kèm câu "em là Hùng, nick cũ em bị lỗi ạ"
 → Mất công vài ngày, KHÔNG mất khách
```

**Đây là lý do thật sự để dùng CRM cho kênh Zalo cá nhân.** Không phải để gửi được nhiều tin hơn — mà để **tài sản khách hàng không nằm trong một cái nick bạn không sở hữu**.

Cụ thể trong ZaloCRM, những thứ được giữ lại độc lập với nick:
- Hồ sơ khách hàng, đa số điện thoại, hồ sơ BĐS (ngân sách, khu vực, nghề nghiệp)
- Toàn bộ tin nhắn đã đồng bộ
- **Ảnh/video/file khách gửi được sao lưu về kho riêng** (MinIO/S3/R2) — kể cả link Zalo hết hạn vẫn xem được
- Ghi chú, nhãn, bậc, điểm số, lịch hẹn, nhật ký hoạt động

---

## 11.8. Kế hoạch dự phòng — chuẩn bị trước khi cần

### Trước khi có sự cố

| Việc | Vì sao |
|---|---|
| **Mỗi sale ≥ 2 nick, phân vai rõ** | Mất một nick vẫn còn kênh làm việc |
| **Khách Nóng / Tiềm năng / Chốt phải là bạn của ≥ 2 nick** | ⭐ Quan trọng nhất. Khách sắp cọc mà chỉ liên lạc qua một nick là điểm chết. CRM có cột **"Nick chăm"** và **"Cùng chăm (N)"** để bạn kiểm tra |
| **SĐT khách phải có trong hồ sơ CRM** | Mất Zalo vẫn gọi điện được. Đừng chỉ dựa vào chat |
| **Sao lưu cơ sở dữ liệu định kỳ** | Việc của admin — xem hướng dẫn triển khai |
| **Chuẩn bị sẵn 1 nick dự phòng đã nuôi ấm** | Cần là dùng ngay, không phải chờ 4 tuần |

### Kiểm tra nhanh mức độ mong manh

Vào **Khách hàng** → lọc bậc **Nóng** + **Tiềm năng** → nhìn cột **Nick chăm**.
Khách nào chỉ có **một** nick chăm → đó là rủi ro. Cho nick thứ hai kết bạn với họ ngay tuần này.

---

## 11.9. Khi nick đã bị hạn chế — quy trình xử lý

### Nhận biết sớm (trước khi khoá hẳn)

- Gửi tin cho người lạ báo lỗi, nhưng chat với bạn bè vẫn bình thường
- Lời mời kết bạn gửi đi không tới
- Zalo yêu cầu xác minh số điện thoại bất thường
- Nick rớt kết nối liên tục dù mạng ổn (xem **Báo cáo → Vận hành Nick Zalo**, cột uptime)

### Việc cần làm ngay

| Bước | Hành động |
|---|---|
| **1** | **Dừng hết** hoạt động tự động trên nick đó. Đặt `friend_action` và `message` về **0** trong phần Trần an toàn |
| **2** | **Đừng đăng xuất, đừng đấu lại liên tục.** Đăng nhập lại dồn dập làm tình hình xấu hơn |
| **3** | Dùng nick đó trên **điện thoại**, như người thật: chat với người quen, gọi điện, xem nhật ký. 5–7 ngày |
| **4** | Trong lúc chờ: chuyển khách quan trọng sang nick khác. Vào CRM lấy SĐT, **gọi điện** báo khách *"em đổi số Zalo, anh kết bạn giúp em nhé"* |
| **5** | Sau 7 ngày yên ắng, thử lại ở mức **rất thấp** (5 tin/ngày). Ổn thì tăng dần theo lịch nuôi nick ở mục 11.5 |
| **6** | Nếu khoá vĩnh viễn: bỏ nick, đấu nick dự phòng. **Data vẫn nguyên trong CRM** — đây là lúc bạn thu hồi vốn cho công sức dùng CRM |

### Nhật ký sự cố

Ghi lại: nick nào, ngày nào, trước đó chạy gì, gửi bao nhiêu, data từ nguồn nào.
Sau 2–3 lần bạn sẽ nhìn ra quy luật — thường là một nguồn data cụ thể hoặc một mẫu tin cụ thể gây ra.

---

# PHẦN C — Tuân thủ & đạo đức nghề

## 11.10. Tôn trọng ý muốn của khách

Đây không chỉ là đạo đức — **khách bị làm phiền là người bấm nút báo xấu, và báo xấu là thứ giết nick nhanh nhất.** Lịch sự chính là biện pháp kỹ thuật.

### Khi khách nói "đừng nhắn nữa"

Hệ thống có ba trạng thái đồng ý nhận tin:

| Trạng thái | Nghĩa |
|---|---|
| `implicit` (mặc định) | Khách để lại SĐT, chưa nói gì thêm |
| `granted` | Khách chủ động đồng ý nhận thông tin |
| **`revoked`** | ⛔ Khách yêu cầu dừng |

**Khách nói dừng → đặt `revoked` ngay.** Hệ thống sẽ tự loại người này khỏi mọi chiến dịch kết bạn về sau — kể cả khi số của họ lại xuất hiện trong một tệp data khác vài tháng sau.

Trả lời khách tử tế:
> *"Dạ em hiểu ạ, em xin phép không làm phiền anh nữa. Khi nào anh cần thông tin về dự án cứ nhắn em bất cứ lúc nào. Chúc anh một ngày tốt lành ạ."*

Khách này ba tháng sau có thể quay lại. Khách bị nhắn tiếp sau khi đã từ chối thì không bao giờ.

### Nguyên tắc ứng xử

| ✅ Nên | ❌ Không nên |
|---|---|
| Nói rõ bạn là ai, từ sàn nào, ngay tin đầu | Giả vờ quen biết, "em là bạn anh A" |
| Nêu ngữ cảnh khách đã để lại thông tin ở đâu | Nhắn như thể khách phải nhớ bạn |
| Dừng ngay khi khách nói dừng | Đổi nick nhắn tiếp người đã từ chối |
| Gửi thông tin có giá trị thật | Bắn ưu đãi mỗi ngày |
| Giờ hành chính | 22h–7h |

---

## 11.11. Bảo vệ dữ liệu khách hàng

Data khách BĐS là dữ liệu cá nhân — tên, SĐT, thu nhập, tài sản. Xử lý cẩu thả là rủi ro pháp lý, không chỉ là chuyện nội bộ.

Công cụ có sẵn trong ZaloCRM:

| Công cụ | Tác dụng |
|---|---|
| **Phân quyền theo phòng ban** | Sale chỉ thấy khách của mình, nhóm A không thấy khách nhóm B |
| **Mã PIN riêng tư** | Che SĐT/thông tin nhạy cảm, phải nhập PIN mới xem |
| **Nhật ký kiểm toán** | Ai xem gì, xuất gì, sửa gì — có dấu vết |
| **Tự host** | Data nằm trên máy chủ công ty bạn, không gửi cho bên thứ ba |

**Ba việc admin nên làm:**
1. Bật phân quyền ngay từ đầu, đừng để mọi sale thấy toàn bộ data
2. Bật PIN riêng tư cho nhóm khách VIP
3. Kiểm tra nhật ký xuất Excel định kỳ — sale sắp nghỉ việc thường xuất data trước

---

## 11.12. Bảng kiểm an toàn — dán cạnh màn hình

**Hàng ngày:**
- [ ] Dashboard → Quota nick hôm nay còn dư?
- [ ] Lời mời kết bạn rải đều, không bắn dồn?
- [ ] Tỷ lệ từ chối hôm nay dưới 30%?
- [ ] Khách nào nói "dừng" → đã đặt `revoked` chưa?

**Hàng tuần:**
- [ ] Báo cáo → Vận hành Nick Zalo: nick nào uptime thấp, hay rớt?
- [ ] Khách bậc Nóng/Tiềm năng đã có ≥ 2 nick chăm chưa?
- [ ] Nick khai thác data có bị nhắc nhở/cảnh báo gì không?

**Hàng tháng:**
- [ ] Nick dự phòng đã nuôi tới đâu?
- [ ] Đã sao lưu cơ sở dữ liệu chưa? (admin)
- [ ] Xem lại nhật ký kiểm toán — có ai xuất data bất thường?

---

## Tóm lại trong ba câu

1. **Không có cách nào loại bỏ hoàn toàn rủi ro bị khoá nick** — ai hứa vậy là nói dối.
2. **Nhưng bạn kiểm soát được xác suất** (nuôi nick, phân vai, rải đều, tôn trọng khách) **và kiểm soát được thiệt hại** (data nằm trong CRM chứ không nằm trong nick, khách quan trọng có 2 nick chăm, có nick dự phòng).
3. **Dùng CRM đúng cách khiến việc mất một nick chuyển từ "mất tệp khách" thành "phiền phức vài ngày".** Đó mới là giá trị thật.

---

➡️ Quay lại: **[Mục lục](README.md)** · Tiếp theo: **[Chương 12 — 15 tình huống thực chiến](12-tinh-huong-thuc-te.md)**
