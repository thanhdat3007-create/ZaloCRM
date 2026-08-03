# Chương 2 — Kiến trúc hệ nhóm phễu

*Đọc 15 phút. Chương này quyết định 6 tháng tới bạn vận hành dễ hay khổ.*

Sai lầm phổ biến nhất của trung tâm chạy phễu Zalo: **dùng lại một nhóm cho mọi khoá**. Nhóm đó sau 5 khoá có 800 người, một nửa đã học xong, một nửa chưa, không ai biết ai đang ở đâu, và mọi tin nhắn đều sai đối tượng.

Chương này dựng cấu trúc để điều đó không xảy ra.

---

## 2.1. Bốn tầng nhóm

```
┌─ TẦNG 1 · NHÓM PHỄU ────────────────────────────────┐
│  "Excel 2H - Khoá 12 - T7/2026"                     │
│  200–500 người · sống 10 ngày · xong thì đóng băng   │
│  Mục tiêu: đưa người vào Zoom, lọc ra ai đáng chốt   │
└─────────────────────────────────────────────────────┘
              ↓ ~5–15% đóng tiền
┌─ TẦNG 2 · NHÓM LỚP CHÍNH THỨC ──────────────────────┐
│  "Excel Nâng Cao - K12 - Học viên"                  │
│  30–80 người · sống suốt khoá + 1 tháng             │
│  Mục tiêu: học viên học đủ, có kết quả, không bỏ    │
└─────────────────────────────────────────────────────┘
              ↓ học xong
┌─ TẦNG 3 · NHÓM ALUMNI ──────────────────────────────┐
│  "Cộng đồng Excel - Học viên đã tốt nghiệp"          │
│  Tích luỹ mãi · không đóng                          │
│  Mục tiêu: upsell khoá sau + giới thiệu người mới   │
└─────────────────────────────────────────────────────┘

┌─ TẦNG 0 · NHÓM NỘI BỘ ──────────────────────────────┐
│  "Vận hành - Trợ giảng"                             │
│  Nơi hệ thống báo sự cố, agent xin trợ giúp          │
└─────────────────────────────────────────────────────┘
```

**Vì sao phải tách?** Vì tin nhắn tự động chỉ đúng khi người nhận đồng nhất. Câu *"22h em gửi ưu đãi cuối cùng, còn 6 suất"* gửi vào nhóm học viên đã đóng tiền là phản cảm và làm mất uy tín.

---

## 2.2. Quy ước đặt tên nhóm — làm ngay từ nhóm đầu tiên

Tên nhóm không chỉ để đọc. Bạn sẽ **lọc theo tên** khi cấu hình lịch gửi tự động, nên nó phải có cấu trúc máy đọc được:

```
<VIẾT TẮT KHOÁ> - <TẦNG> - K<SỐ KHOÁ> - <THÁNG/NĂM>
```

| Ví dụ | Ý nghĩa |
|---|---|
| `EXC - PHEU - K12 - 07.2026` | Nhóm phễu khoá 12 |
| `EXC - LOP - K12 - 07.2026` | Nhóm lớp chính thức khoá 12 |
| `EXC - ALUMNI` | Nhóm alumni, không đánh số khoá |
| `VBA - PHEU - K03 - 08.2026` | Nhóm phễu khoá VBA số 3 |

**Ba từ khoá cố định: `PHEU` · `LOP` · `ALUMNI`.** Đây là thứ script tự động sẽ tìm để biết gửi kịch bản nào. Đặt tên tuỳ hứng kiểu "Lớp Excel free anh em ơi vào đây" là tự chặn đường tự động hoá của chính mình.

> 💡 Tên hiển thị với học viên có thể thân thiện hơn nếu bạn muốn — nhưng phải giữ được 3 từ khoá trên. Ví dụ: `Excel 2H · PHEU K12 · 07.2026`.

---

## 2.3. Vòng đời một nhóm phễu — 10 ngày

| Ngày | Việc | Trạng thái nhóm |
|---|---|---|
| **D-7** | Tạo nhóm, đặt tên đúng quy ước, thả link đăng ký | Mở, mời người vào |
| **D-7 → D-1** | Người đăng ký vào dần, agent chào từng người | Đông dần |
| **D-1** | Nhắc "mai học", chốt sĩ số | Cao trào 1 |
| **D0 · 19h** | Nhắc trước 1 tiếng | |
| **D0 · 19h50** | Gửi link Zoom | Cao trào 2 |
| **D0 · 20h–22h** | Buổi học. Agent trực trả lời trong nhóm | Sôi động nhất |
| **D0 · 22h** | Thả offer + bài tập | Cao trào 3 |
| **D+1 → D+2** | Nhắc ưu đãi, giải đáp, chốt 1-1 | Còn hoạt động |
| **D+3** | Hết ưu đãi. Thông báo đóng nhóm | Giảm dần |
| **D+7** | **Đóng băng nhóm** — chuyển sang chỉ trưởng nhóm được nhắn | Ngưng |

### Vì sao phải đóng băng, không xoá

- **Không xoá** — bạn cần lịch sử chat để chấm điểm và để tra lại khi người đó quay lại sau 3 tháng
- **Không để mở** — nhóm phễu cũ để mở sẽ thành bãi rác quảng cáo của người khác, và bạn phải trực mãi mãi

Zalo cho phép đặt nhóm ở chế độ chỉ quản trị viên được gửi tin. Dùng chế độ đó, kèm một tin ghim:

```
📌 Lớp Excel 2H Khoá 12 đã kết thúc.
   · Học viên đã đăng ký khoá chính thức: xem nhóm "EXC - LOP - K12"
   · Bạn chưa kịp đăng ký: khoá 13 khai giảng 05/08, nhắn riêng cô Lan để giữ chỗ
   · Tài liệu buổi học: [link]
   Cảm ơn cả nhà đã tham gia ❤️
```

---

## 2.4. Dùng mấy nick, và mỗi nick làm gì

Đây là câu hỏi ai cũng hỏi. Câu trả lời phụ thuộc quy mô:

### Quy mô nhỏ — 1 người tự chạy, dưới 2 lớp/tháng

```
Nick 1 · "Cô Lan - Excel"    → chủ nhóm mọi nhóm, dạy, chăm 1-1
```
Một nick là đủ. Đừng phức tạp hoá sớm.

### Quy mô vừa — có trợ giảng, 4–8 lớp/tháng

```
Nick 1 · "Cô Lan"           → gương mặt thương hiệu. Chỉ xuất hiện ở
                               khoảnh khắc quan trọng: chào lớp, thả offer.
                               ⚠️ Nick này KHÔNG bao giờ dùng để bắn tin hàng loạt.
Nick 2 · "Trợ giảng Mai"    → trực nhóm hàng ngày, gửi lịch, gửi bài tập,
                               nơi agent Hermes trả lời thay
Nick 3 · "Tư vấn viên Hùng" → chăm 1-1 sau buổi học, chốt sale
```

### Quy mô lớn — nhiều dòng khoá, trên 10 lớp/tháng

Thêm nick theo **dòng khoá**, không theo người:
```
Nick trực nhóm Excel   ·   Nick trực nhóm Tiếng Anh   ·   Nick trực nhóm Marketing
```
Nhiều người dùng chung một nick trực nhóm — CRM ghi lại ai gửi tin gì, nên vẫn truy được trách nhiệm.

### Nguyên tắc bất di bất dịch

> **Nick gương mặt thương hiệu và nick chạy tự động phải là hai nick khác nhau.**
>
> Nếu kịch bản tự động có sự cố (gửi nhầm nhóm, gửi sai giờ, spam do lỗi vòng lặp), bạn mất nick chạy tự động — khó chịu nhưng thay được. Còn mất nick "Cô Lan" có 4.000 học viên cũ thì mất luôn tài sản lớn nhất của trung tâm.

### Ai phải là quản trị viên nhóm

Mỗi nhóm luôn có **tối thiểu 2 quản trị viên**:
1. Nick trực nhóm (làm việc hàng ngày)
2. Nick chủ doanh nghiệp (bảo hiểm — không dùng hàng ngày nhưng không mất quyền)

Trợ giảng nghỉ việc mà bạn không có quyền quản trị nhóm là mất trắng cả nhóm.

---

## 2.5. Nhóm nội bộ — thứ ai cũng quên làm

Tạo một nhóm Zalo `VANHANH - NOI BO`, cho vào đó nick chủ + nick trợ giảng.

Nhóm này nhận:
- Cảnh báo nick rớt kết nối
- Báo cáo sau mỗi buổi: đã gửi bao nhiêu tin, bao nhiêu người tương tác
- **Agent xin trợ giúp** — khi có người trong nhóm phễu hỏi câu agent không dám trả lời, nó đẩy sang đây kèm link hội thoại ([Chương 5](05-hermes-agent-truc-nhom.md))

Không có nhóm này thì mọi tự động hoá đều chạy trong bóng tối — hỏng bạn cũng không biết.

> 💡 Nếu đội bạn dùng Telegram, ZCRM có sẵn **cầu Zalo ↔ Telegram 2 chiều** (Cài đặt → Tích hợp). Mirror nhóm nội bộ sang Telegram để nhận cảnh báo trên máy tính mà không phải mở Zalo.

---

## 2.6. Quét nhóm — dùng đúng cách

**Marketing → Quét nhóm**

Chọn nick → chọn nhóm → hệ thống chạy nền, quét danh sách thành viên, đánh dấu ai **đã là bạn**, ai **người lạ**.

| ✅ Nên dùng để | ❌ Tuyệt đối không |
|---|---|
| Đối chiếu ai trong nhóm phễu **chưa có hồ sơ học viên** → tạo hồ sơ | Bắn DM hàng loạt cho toàn bộ thành viên nhóm |
| Tìm học viên cũ đang ở trong nhóm mới → gắn nhãn `học-viên-cũ-quay-lại` | Gửi lời mời kết bạn ồ ạt cho người lạ trong nhóm |
| Biết sĩ số thật, so với số người thực sự có mặt buổi học | Xuất danh sách rồi bán/chia sẻ ra ngoài |
| Phát hiện nick lạ vào nhóm spam | Kết bạn với thành viên nhóm của trung tâm đối thủ |

> ⚠️ **Quét nhóm rồi bắn DM hàng loạt là con đường ngắn nhất để mất nick.** Học viên báo xấu một lần là nick vào diện theo dõi. Và bạn còn bị đá khỏi nhóm — mất luôn nguồn khách lâu dài. Chưa kể vấn đề riêng tư của người trong nhóm.
>
> Dùng để **nhận diện**, không phải để **phát tán**. [Chương 11](11-an-toan-nick-va-tuan-thu.md).

### Cách dùng dữ liệu quét nhóm mà ít người nghĩ ra

Sau mỗi khoá, so ba danh sách:
```
A. Thành viên nhóm phễu        (từ Quét nhóm)
B. Người thực sự vào Zoom      (từ báo cáo Zoom)
C. Người có nhắn tin trong nhóm (từ CRM)
```
- **A trừ B** = người đăng ký nhưng không học → khoá sau nhắc kỹ hơn, hoặc đối tượng sai
- **B giao C** = người vừa học vừa tương tác → **đây là danh sách chốt sale**, thường chỉ 10–15% sĩ số nhưng chiếm 80% doanh thu
- **C trừ B** = người nhắn tin mà không vào học → thường là người bận, đáng gửi bản ghi lại

---

## 2.7. Bảng tra nhanh — nhóm nào nhận tin gì

| | Nhóm PHỄU | Nhóm LỚP | Nhóm ALUMNI |
|---|---|---|---|
| Nhắc giờ học | ✅ 3 mốc | ✅ 2 mốc | ❌ |
| Link Zoom | ✅ | ✅ | ❌ |
| Bài tập | ✅ (bài mẫu) | ✅ (bài thật, chấm) | ❌ |
| **Offer / bán hàng** | ✅ mạnh | ⚠️ chỉ upsell nhẹ | ✅ ưu đãi riêng |
| Thông báo hành chính | ✅ | ✅ | ⚠️ hạn chế |
| Agent trực trả lời | ✅ **quan trọng nhất** | ✅ | ⚠️ chỉ khi được gọi tên |
| Chúc mừng, ghi nhận | ⚠️ | ✅ **quan trọng** | ✅ |
| Tần suất tin/tuần | 5–8 | 3–5 | **tối đa 2** |

> Nhóm alumni bị bắn tin nhiều là chết nhanh nhất — vì họ không còn nghĩa vụ ở lại. Mỗi tin gửi vào alumni phải là tin họ *muốn* nhận.

---

## 2.8. Việc cần làm cuối chương

- [ ] Vẽ ra giấy bạn cần bao nhiêu nhóm, tầng nào
- [ ] Chốt quy ước đặt tên, **viết vào một file dùng chung cho cả đội**
- [ ] Đổi tên các nhóm hiện có cho đúng quy ước (làm sớm, càng để lâu càng khó)
- [ ] Tạo nhóm `VANHANH - NOI BO`, cho nick chủ + trợ giảng vào
- [ ] Kiểm tra mọi nhóm đều có ≥ 2 quản trị viên, trong đó có nick chủ doanh nghiệp
- [ ] Chạy **Quét nhóm** một lượt cho các nhóm hiện có, xem ai chưa có hồ sơ học viên

---

➡️ Tiếp theo: **[Chương 3 — Nhịp một lớp phễu](03-nhip-mot-lop-phieu.md)**
