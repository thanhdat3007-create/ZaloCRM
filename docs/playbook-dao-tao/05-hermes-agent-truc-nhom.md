# Chương 5 — Hermes agent trực nhóm

⭐ *Chức năng trọng tâm số 2. Đọc 25 phút.*

Mục tiêu: khi có người nhắn tin trong nhóm phễu, agent Hermes tự đọc và trả lời trong 30 giây — kể cả lúc 20h30 khi bạn đang dạy, hay 23h khi cả đội đã ngủ.

Nhưng agent làm sai trong nhóm 400 người là sự cố công khai. Chương này dành **một nửa dung lượng cho ranh giới và phanh an toàn** — phần đó quan trọng hơn phần kỹ thuật.

---

## 5.1. Vì sao ngành đào tạo cần agent trực nhóm hơn mọi ngành khác

| Đặc điểm | Hệ quả |
|---|---|
| Câu hỏi **lặp lại tới 80%** | *"link đâu"*, *"có ghi hình không"*, *"file ở đâu"*, *"học phí bao nhiêu"* — hỏi đi hỏi lại mỗi khoá |
| Cao điểm dồn vào **20 phút** | 19h50–20h10 có thể 60 tin. Không người thật nào theo kịp |
| Người dạy **không thể vừa dạy vừa trả lời** | Đúng lúc nhóm cần nhất thì người có thẩm quyền nhất lại bận nhất |
| Câu hỏi để quá 30 phút coi như **mất** | Người ta bỏ đi, không hỏi lại |

Một agent trả lời được 80% câu lặp lại đã giải phóng gần hết gánh nặng — miễn là nó **biết im lặng** ở 20% còn lại.

---

## 5.2. Trạng thái hiện tại

🔧 **[CẦN CODE]** — ZCRM chưa có sẵn agent trực nhóm. Nhưng **cả hai chiều của vòng lặp đều đã có**, chỉ thiếu lớp keo ở giữa:

```
   Học viên nhắn trong nhóm
            ↓
   ZCRM bắn webhook  "message.received"      ✅ CÓ SẴN
            ↓
   ┌────────────────────────────┐
   │  SERVICE TRUNG GIAN        │            🔧 CẦN VIẾT (~200 dòng)
   │  · lọc: có nên trả lời?    │
   │  · gọi Hermes              │
   │  · quyết định: gửi hay im? │
   └────────────────────────────┘
            ↓
   POST /api/public/messages/send            ✅ CÓ SẴN (hỗ trợ nhóm)
            ↓
   Tin xuất hiện trong nhóm
```

**ZCRM không cần sửa dòng nào** cho phiên bản đầu tiên.

### Hai cách dùng Hermes — đừng nhầm

| | Đường A · Hermes làm **model** | Đường B · Hermes làm **agent** |
|---|---|---|
| Cắm ở đâu | Cài đặt → Trợ lý AI | Cài đặt → API & Webhook |
| Công sức | 15 phút, không code | 1–2 ngày |
| Hermes làm gì | Gợi ý câu trả lời cho **người thật** bấm gửi | **Tự** trả lời trong nhóm |
| Nhiều lượt / gọi công cụ | ❌ Không — chỉ 1 lượt, text vào text ra | ✅ Có |
| Dùng khi nào | Muốn AI hỗ trợ, người vẫn quyết | Muốn tự động thật |

Đường A cắm được ngay: chọn provider `OpenAI` (nếu Hermes dùng `max_completion_tokens`) hoặc `Kimi` (nếu dùng `max_tokens`), đổi Base URL, nhập key. Chọn nhầm là lỗi 400 ngay tin đầu.

**Chương này nói về đường B.**

---

## 5.3. Ranh giới — đọc trước khi viết một dòng code

Chia mọi tin nhắn trong nhóm làm bốn vùng:

### 🟢 VÙNG XANH — Agent trả lời tự do

Câu hỏi có **một câu trả lời đúng duy nhất, không đổi, không liên quan tiền bạc**:

```
"link zoom đâu ạ"                  → gửi lại link
"em vào không được"                → hướng dẫn 3 bước xử lý
"buổi học có ghi hình không"       → có, gửi vào nhóm sau 24h
"file mẫu ở đâu ạ"                 → link
"mấy giờ học ạ"                    → 20h tối Thứ 3
"em vào muộn có sao không"         → không sao, cứ vào
"bài tập nộp thế nào"              → gửi vào nhóm, cô chấm
"em cần cài gì trước không"        → Excel bản 2016 trở lên
```

### 🟡 VÙNG VÀNG — Agent trả lời khung chung + gắn cờ

Câu hỏi **liên quan tiền hoặc quyết định mua**. Agent trả lời an toàn rồi báo người thật:

```
"khoá chính thức bao nhiêu tiền ạ"
→ "Dạ khoá nâng cao 12 buổi học phí 5.990k, tối nay lớp mình có
   ưu đãi riêng ạ. Chị nhắn riêng cô Lan để cô tư vấn xem có phù
   hợp với công việc của chị không rồi mới đăng ký nhé ạ."
→ gắn nhãn `hỏi-học-phí` + báo nhóm nội bộ

"có trả góp không"
→ trả lời có/không theo chính sách, KHÔNG tự bịa kỳ hạn hay lãi suất
→ gắn nhãn `hỏi-trả-góp` + báo nhóm nội bộ
```

### 🔴 VÙNG ĐỎ — Agent KHÔNG trả lời, gọi người ngay

```
"em muốn đăng ký luôn"                    → cơ hội thật, đừng để máy làm hỏng
"chuyển khoản vào số nào"                 → TUYỆT ĐỐI không để máy đọc số tài khoản
"có giảm thêm được không"                 → thương lượng giá = việc của người
"khoá này có lừa đảo không"               → khủng hoảng uy tín
"em học rồi mà không thấy hiệu quả"       → khiếu nại
"cho em xin hoàn tiền"                    → khiếu nại
"bên kia dạy rẻ hơn"                      → so sánh đối thủ
bất kỳ tin nào có ảnh biên lai/màn hình   → xác nhận thanh toán
```

### ⚫ VÙNG ĐEN — Agent im lặng hoàn toàn

```
"điểm danh ạ"  ·  "ok"  ·  "vâng"  ·  "😊"  ·  "cảm ơn cô"
tin của chính nick mình gửi
tin trong nhóm alumni (trừ khi được gọi tên)
```

> ⚠️ **Vùng đen quan trọng ngang vùng đỏ.** Agent nhảy vào cảm ơn 40 tin "điểm danh ạ" sẽ làm ngập nhóm và người thật không tìm thấy câu hỏi thật nữa. Nhóm 400 người mà bot nói nhiều hơn người là nhóm chết.

---

## 5.4. Kiến trúc service trung gian

```javascript
// Khung xử lý — viết đầy đủ ở Chương 13 mục 13.3

async function xuLyWebhook(payload) {
  const { event, data } = payload;
  if (event !== 'message.received') return;         // bỏ tin mình gửi

  const nhom = timNhom(data.conversationId);        // xem mục 5.5
  if (!nhom) return;                                // không phải nhóm mình trực

  // ── PHANH 1 · Vùng đen ──
  if (laTinNhieu(data.content)) return;

  // ── PHANH 2 · Vùng đỏ (khớp từ khoá TRƯỚC khi gọi AI) ──
  if (khopVungDo(data.content)) {
    await baoNhomNoiBo(nhom, data, 'CẦN NGƯỜI XỬ LÝ NGAY');
    return;                                          // KHÔNG trả lời
  }

  // ── PHANH 3 · Hạn mức ──
  if (await vuotHanMuc(nhom.groupId)) return;

  // ── Gọi Hermes ──
  const lichSu = await layLichSu(data.conversationId, 15);
  const ketQua = await hoiHermes({
    prompt: dungPrompt(nhom, lichSu, data.content),
    tools:  [traCuuHocVien, layLichHoc, layTaiLieu],
  });

  // ── PHANH 4 · Agent tự nhận không chắc ──
  if (ketQua.doTinCay < 0.7 || ketQua.canNguoiThat) {
    await baoNhomNoiBo(nhom, data, ketQua.lyDo);
    return;
  }

  // ── PHANH 5 · Kiểm tra đầu ra ──
  if (chuaSoTaiKhoan(ketQua.traLoi) || chuaGiaLa(ketQua.traLoi)) {
    await baoNhomNoiBo(nhom, data, 'Agent định nói số tiền/STK — đã chặn');
    return;
  }

  // ── Độ trễ giống người: 4–12 giây ──
  await doi(4000 + Math.random() * 8000);
  await guiVaoNhom(nhom, ketQua.traLoi);
  await ghiNhatKy(nhom, data, ketQua);
}
```

**Năm cái phanh, và chúng đứng trước AI chứ không sau.** Đừng tin agent tự biết dừng — chặn bằng từ khoá trước khi tốn một lượt gọi model.

---

## 5.5. Chi tiết kỹ thuật — những chỗ dễ vấp

### Payload webhook thực tế

ZCRM gửi `POST` tới URL bạn khai, kèm header `X-Webhook-Event`:

```json
{
  "event": "message.received",
  "timestamp": "2026-07-29T13:05:22.104Z",
  "data": {
    "messageId": "uuid",
    "conversationId": "uuid",
    "senderUid": "1234567890",
    "content": "khoá chính thức bao nhiêu tiền ạ",
    "contentType": "text",
    "sentAt": "2026-07-29T13:05:21.980Z"
  }
}
```

> ⚠️ **Payload KHÔNG có `groupId`, `zaloAccountId`, hay `threadType`.** Đây là chỗ vấp đầu tiên của mọi người. Bạn chỉ có `conversationId`, mà để trả lời thì cần `zaloAccountId` + `threadId` + `threadType`.

**Cách giải quyết (không cần sửa ZCRM):** gọi `GET /api/public/conversations?limit=100`, tìm dòng có `id` khớp. Nó trả về `threadType` và `externalThreadId` (chính là `groupId`).

Danh sách này sắp theo tin mới nhất, mà tin vừa đến thì hội thoại đó chắc chắn nằm đầu — nên cách này đáng tin trong thực tế. Riêng `zaloAccountId` thì endpoint không trả về, nên bạn tự khai trong cấu hình:

```javascript
const NHOM_TRUC = {
  '1234567890123456789': { ten: 'EXC-PHEU-K12', tang: 'pheu',   nick: 'acc-uuid-treonhom' },
  '9876543210987654321': { ten: 'EXC-LOP-K12',  tang: 'lop',    nick: 'acc-uuid-treonhom' },
  '5555555555555555555': { ten: 'EXC-ALUMNI',   tang: 'alumni', nick: 'acc-uuid-treonhom' },
};
```

Bảng này còn làm luôn việc **lọc nhóm không trực** — nhóm không có trong bảng thì bỏ qua, đây là phanh an toàn quan trọng.

> 💡 Nếu bạn định sửa ZCRM, việc đáng làm nhất là thêm `GET /api/public/conversations/:id` trả về đủ `zaloAccountId` + `threadType` + `externalThreadId`. Khoảng 20 dòng, xoá sạch chỗ vấp này. Xem [Chương 13](13-lo-trinh-vibe-coding.md) mục 13.5.

### Webhook không có cơ chế thử lại ⚠️

ZCRM bắn webhook theo kiểu **bắn-và-quên**: lỗi chỉ ghi cảnh báo vào log, **không thử lại**.

Nghĩa là service của bạn sập 5 phút thì mất trắng mọi tin trong 5 phút đó, không có cách phát lại.

**Bắt buộc phòng:**
```
1. Service trung gian nhận webhook → GHI VÀO HÀNG ĐỢI NGAY → trả 200
   Xử lý AI làm sau, ở tiến trình khác. Đừng bắt ZCRM chờ Hermes nghĩ.
2. Chạy service dưới trình giám sát (pm2 / systemd) để tự khởi động lại
3. Có một cron 5 phút quét "hội thoại chưa trả lời" như lưới an toàn:
   GET /api/public/conversations → lọc isReplied=false → xử lý bù
```
Điểm 1 quan trọng nhất, và cũng là điểm hay bị làm sai nhất.

### Lịch sử hội thoại

```
GET /api/public/conversations/:id/messages?limit=50
```
Trả về `senderType`, `senderName`, `content`, `sentAt`. Đưa 15 tin gần nhất cho Hermes làm ngữ cảnh — nhóm đông thì 15 tin có thể là của 8 người khác nhau, nên **prompt phải nói rõ đang trả lời ai**.

---

## 5.6. Prompt mẫu cho Hermes

```
Bạn là TRỢ GIẢNG ẢO của trung tâm {ten_trung_tam}, đang trực nhóm Zalo
"{ten_nhom}" ({tang_nhom}: pheu = học thử miễn phí / lop = đã đóng tiền
/ alumni = đã tốt nghiệp).

## Bối cảnh khoá học
- Lớp phễu: "{ten_lop_pheu}", 20h00 tối Thứ 3, 2 tiếng, miễn phí, có ghi hình
- Link Zoom: {link_zoom}
- Tài liệu buổi học: {link_tai_lieu}
- Khoá chính thức: "{ten_khoa}", {so_buoi} buổi, học phí {gia} đ
- Ưu đãi hiện tại: {uu_dai} — hạn {han_uu_dai}
- Giảng viên: {ten_giang_vien}
- Trợ giảng người thật: {ten_tro_giang}

## Cách nói
- Xưng "em", gọi học viên "anh/chị". Với người đã biết tên thì gọi tên.
- Ngắn: 1–3 câu. Đây là nhóm chat, không phải email.
- Thân thiện, có emoji nhưng tối đa 1–2 cái.
- KHÔNG bao giờ nói mình là AI, cũng KHÔNG khẳng định mình là người.
  Ai hỏi thẳng "bạn là bot à" → trả lời: "Em là trợ giảng của lớp ạ,
  có gì gấp em gọi cô {ten_giang_vien} vào ngay ạ" rồi báo người thật.

## ĐƯỢC trả lời
Giờ học · link Zoom · lỗi vào Zoom · có ghi hình không · tài liệu ở đâu
· cách nộp bài tập · yêu cầu máy móc · lịch khai giảng · nội dung buổi học

## KHÔNG được trả lời — bắt buộc trả canNguoiThat = true
- Bất kỳ câu nào về SỐ TÀI KHOẢN hoặc cách chuyển tiền
- Thương lượng giá, xin giảm thêm, so sánh với trung tâm khác
- "Em muốn đăng ký luôn" — đây là cơ hội thật, phải để người chốt
- Khiếu nại, đòi hoàn tiền, nghi ngờ uy tín
- Cam kết kết quả học tập ("học xong có tăng lương không")
- Bất kỳ điều gì không có trong bối cảnh trên

## Nguyên tắc cuối
Thà im lặng và gọi người thật, còn hơn trả lời sai trong nhóm 400 người.
Không chắc chắn tuyệt đối → canNguoiThat = true.
TUYỆT ĐỐI KHÔNG bịa: không bịa giá, không bịa ngày, không bịa chính sách,
không bịa link. Không có trong bối cảnh nghĩa là không biết.

## Trả về JSON
{
  "traLoi":       "nội dung gửi vào nhóm, rỗng nếu không trả lời",
  "doTinCay":     0.0-1.0,
  "canNguoiThat": true/false,
  "lyDo":         "vì sao cần người, để trợ giảng đọc",
  "nhanDeXuat":   ["hỏi-học-phí", ...],
  "mucDoGap":     "thap" | "trung" | "cao"
}
```

**Ba câu quan trọng nhất trong prompt trên** là ba câu ở mục "Nguyên tắc cuối". Model mặc định luôn muốn tỏ ra hữu ích — phải nói thẳng rằng im lặng là hành vi được khen thưởng.

---

## 5.7. Báo người thật thế nào

Khi agent gọi người, gửi vào nhóm `VANHANH - NOI BO`:

```
🚨 CẦN NGƯỜI XỬ LÝ — mức độ: CAO

Nhóm:     EXC - PHEU - K12
Người:    Nguyễn Thị Hương (điểm ưu tiên 78)
Nội dung: "em muốn đăng ký luôn ạ, chuyển khoản vào đâu"
Lý do:    Ý định mua rõ ràng + hỏi thanh toán → vùng đỏ

Mở hội thoại: http://ip-may-chu:3080/chat?conversation=<uuid>
```

**Ba mức độ, ba cách báo:**

| Mức | Ví dụ | Cách báo |
|---|---|---|
| 🔴 Cao | Muốn đăng ký, hỏi chuyển khoản, khiếu nại | Báo ngay + kèm link. Cần xử lý trong 15 phút |
| 🟡 Trung | Hỏi học phí, hỏi trả góp | Báo ngay, xử lý trong 2 tiếng |
| ⚪ Thấp | Agent không chắc câu trả lời | Gom lại, báo mỗi 30 phút một lượt |

Đừng để mọi thứ đều "cao" — trợ giảng sẽ tê liệt vì báo động và bắt đầu bỏ qua tất cả.

---

## 5.8. Hạn mức và giới hạn agent

| Giới hạn | Con số đề xuất | Vì sao |
|---|---|---|
| Tin agent gửi / nhóm / giờ | **10** | Vượt là nhóm bị ngập |
| Tin agent gửi / nhóm / ngày | **40** | |
| Trả lời cùng một người liên tiếp | **tối đa 3 lượt** | Lượt 4 phải là người thật |
| Độ trễ trước khi gửi | **4–12 giây ngẫu nhiên** | Trả lời trong 0.5 giây là lộ máy rõ ràng |
| Khung giờ hoạt động | **6h00 – 23h00** | Ngoài giờ thì gom lại, sáng trả lời |
| Nhóm alumni | **chỉ khi được gọi tên** | Nhóm alumni cực kỳ nhạy với tin thừa |

Cộng thêm hạn mức của chính ZCRM: 200 tin/ngày/nick, dồn tối đa 20 tin/30 giây. Agent trực 10 nhóm với hạn mức trên thì tối đa 400 tin/ngày — **vượt trần**. Nên hoặc giảm hạn mức, hoặc tách nick trực nhóm thành 2 nick.

---

## 5.9. Lộ trình triển khai — 4 tuần, đừng đốt cháy giai đoạn

### Tuần 1 — Chế độ câm
Agent chạy đủ, nhưng **không gửi gì vào nhóm**. Mọi câu trả lời nó định gửi đều đẩy vào nhóm nội bộ để bạn đọc.

Đây là tuần quan trọng nhất. Bạn sẽ phát hiện agent định trả lời sai ở đâu, và sửa prompt trước khi có ai nhìn thấy.

### Tuần 2 — Người duyệt từng tin
Agent soạn, đẩy vào nhóm nội bộ, trợ giảng đọc và **copy gửi thủ công** nếu đúng.

Chậm, nhưng bạn tích luỹ được thống kê: bao nhiêu phần trăm tin agent soạn là dùng được? Dưới 80% thì đừng bật tự động.

### Tuần 3 — Tự động vùng xanh
Bật tự động **chỉ cho vùng xanh** (link, giờ học, tài liệu). Vùng vàng và đỏ vẫn qua người.

### Tuần 4 — Mở vùng vàng
Bật tiếp vùng vàng. **Vùng đỏ vĩnh viễn thuộc về người.**

> ⚠️ Cám dỗ lớn nhất là nhảy thẳng từ tuần 1 lên tuần 4 vì "thấy nó trả lời cũng ổn mà". Một tin sai trong nhóm 400 người sẽ tốn của bạn nhiều hơn 3 tuần tiết kiệm được. Và không xoá kịp — người ta đã đọc rồi.

---

## 5.10. Đo agent có tốt không

Mỗi tuần nhìn 5 con số:

| Chỉ số | Ngưỡng tốt | Nếu tệ thì sao |
|---|---|---|
| % tin agent trả lời mà không cần người sửa | > 85% | Prompt chưa đủ bối cảnh |
| Thời gian phản hồi trung bình | < 60 giây | Kiểm tra hàng đợi có nghẽn không |
| Số ca đẩy sang người / ngày | 5–15 | Quá ít = agent liều. Quá nhiều = ranh giới quá chặt |
| **Số lần agent nói sai thông tin** | **0** | Bất kỳ số nào khác 0 đều phải dừng agent và sửa ngay |
| Tỷ lệ nhóm sống (người nhắn/tổng) | tăng | Agent tốt làm nhóm sôi động hơn, không ngược lại |

**Chỉ số thứ 4 không có ngưỡng chấp nhận được.** Agent nói sai giá một lần là bạn phải xin lỗi công khai trong nhóm.

---

## 5.11. Việc cần làm cuối chương

- [ ] Quyết định dùng đường A, đường B, hay cả hai
- [ ] Nếu đường A: cắm Hermes vào **Cài đặt → Trợ lý AI**, thử một câu
- [ ] Viết ra giấy danh sách vùng xanh / vàng / đỏ **cho khoá học của bạn** — đừng dùng nguyên bản mẫu
- [ ] Tạo API key + khai webhook, bấm **Gửi thử** thấy service nhận được
- [ ] Lập bảng `NHOM_TRUC` — nhóm nào agent được trực
- [ ] Dựng service trung gian với **đủ 5 phanh** ở mục 5.4
- [ ] **Chạy chế độ câm 1 tuần** trước khi cho agent gửi tin thật
- [ ] Lập nhóm nội bộ nhận báo động, thống nhất ai trực

---

➡️ Tiếp theo: **[Chương 6 — Chấm điểm học viên & ưu tiên](06-diem-so-va-uu-tien.md)**
