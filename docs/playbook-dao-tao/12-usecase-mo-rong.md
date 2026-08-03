# Chương 12 — 18 use case mở rộng

*Đọc 25 phút. Chương này để bạn chọn việc làm tiếp, không phải làm hết.*

Ngoài hai chức năng trọng tâm — lịch gửi tin nhóm ([Ch. 4](04-lich-gui-tin-tu-dong.md)) và agent trực nhóm ([Ch. 5](05-hermes-agent-truc-nhom.md)) — đây là 18 use case khác cho ngành đào tạo, xếp theo **tỷ lệ giá trị / công sức**.

Ký hiệu:
- ✅ **Có sẵn** — dùng được ngay trên bản Community
- 🏷️ **[EE]** — cần bản Extension
- 🔧 **[CẦN CODE]** — phải viết thêm, có ước lượng công sức

---

## NHÓM A — Làm được ngay, giá trị cao nhất

### UC-01 · Điểm danh tự động qua nhóm 🔧 *0.5 ngày*

**Vấn đề:** bạn không biết ai thật sự có mặt buổi học. Báo cáo Zoom thì rời rạc và không nối được với hồ sơ CRM.

**Cách làm:** tin 19h50 đã có câu *"vào rồi nhắn OK giúp cô"*. Service webhook đọc mọi tin trong khung 19h50–20h30, ai nhắn thì:
```
→ chuyển bậc sang "Có mặt buổi học"
→ gắn nhãn `co-mat-buoi-{N}`
→ cộng điểm tương tác (hệ thống tự làm)
```

**Giá trị:** đây là **dữ liệu nền cho gần như mọi use case khác** trong chương này. Không có nó thì bạn không phân biệt được người học thật với người ghi danh cho có.

**Mẹo:** đừng chỉ nhận đúng chữ "OK" — nhận cả "ok ạ", "có mặt", "em vào rồi", emoji giơ tay. Người ta không gõ đúng như bạn dặn.

---

### UC-02 · Chào riêng từng người mới vào nhóm 🔧 *0.5 ngày*

**Vấn đề:** người vào nhóm phễu ngày D-5 rồi im lặng tới D0. Không ai chào, họ không có lý do gì để gắn bó.

**Cách làm:** webhook bắt sự kiện `contact.created` (ZCRM tự tạo hồ sơ khi có người nhắn lần đầu trong nhóm) → agent chào riêng trong nhóm:
```
Chào {ten} đến với lớp mình 👋
{ten} làm nghề gì và muốn học Excel để giải quyết việc gì ạ?
Cô hỏi để chuẩn bị nội dung sát hơn cho buổi tối Thứ 3 ạ.
```

**Giá trị:** biến người im lặng thành người đã nói chuyện một lần — và mọi thứ về sau (chấm điểm, phân loại, chốt sale) đều cần điều đó. Trong thực tế, việc này một mình có thể nâng tỷ lệ có mặt buổi học lên đáng kể.

**Cảnh báo:** giới hạn tối đa 8–10 lời chào/giờ, và **gộp lại nếu nhiều người vào cùng lúc**. Chào 30 người liên tiếp là ngập nhóm và lộ máy rõ ràng.

---

### UC-03 · Khảo sát bằng bình chọn trong nhóm ✅ *có sẵn*

**Menu Nhóm → Bình chọn** — ZCRM có sẵn tạo/khoá/chia sẻ bình chọn Zalo.

Bốn câu đáng hỏi:

| Khi nào | Câu hỏi | Dùng để |
|---|---|---|
| D-3 | *"Cả nhà mong học phần nào nhất?"* | Chuẩn bị nội dung đúng nhu cầu |
| Sau buổi học | *"Phần nào mọi người thấy khó nhất?"* | Biết cần nói lại chỗ nào |
| Cuối khoá phễu | *"Nếu học khoá dài hơn, mọi người muốn học tối mấy giờ?"* | Xếp lịch khoá chính thức đúng nhu cầu |
| Nhóm alumni | *"Mọi người muốn khoá tiếp theo về chủ đề gì?"* | Quyết định sản phẩm tiếp theo |

**Giá trị kép:** vừa lấy được thông tin, vừa **tạo tương tác** — người bấm bình chọn là người đã chạm vào nhóm, và điều đó có ích cho cả thuật toán hiển thị của Zalo lẫn tâm lý gắn bó.

Miễn phí, có sẵn, 2 phút thiết lập. Đây là use case tỷ lệ giá trị/công sức cao nhất chương này.

---

### UC-04 · Theo dõi nộp bài tập 🔧 *1 ngày*

**Cách làm:** agent đọc tin trong nhóm lớp, phát hiện tin có đính kèm file/ảnh → gắn nhãn `da-nop-bai-{N}` cho người gửi.

Sau đó:
```
· Danh sách ai chưa nộp → nhắc riêng, không nhắc trong nhóm
· Người nộp đủ 3 buổi liên tiếp → khen công khai trong nhóm
· Người không nộp bài nào sau 3 buổi → 🚨 nguy cơ bỏ học, gọi ngay
```

**Giá trị:** nộp bài tập là **chỉ báo bỏ học chính xác nhất** trong đào tạo — chính xác hơn cả điểm danh. Người vẫn vào lớp nhưng ngừng nộp bài là người sắp rời đi.

---

### UC-05 · Cảnh báo bỏ học tự động ✅ *có sẵn, chỉ cần cấu hình*

Đã mô tả ở [Chương 9](09-sau-khi-mua.md) mục 9.2. Không cần code gì:

```
Cài đặt → KH bị kẹt → đặt ngưỡng cho bậc "Đã đóng tiền"
Mỗi thứ Hai: Khách hàng → lọc bậc "Đã đóng tiền" → sắp theo điểm tương tác tăng dần
```

**Giá trị:** cứu một học viên sắp bỏ rẻ hơn 5–7 lần so với bán một người mới. Và người được cứu thường thành người trung thành nhất — vì họ nhớ lúc bạn để ý tới họ.

---

### UC-06 · Xin đánh giá & testimonial tự động 🔧 *0.5 ngày*

**Cách làm:** sau buổi cuối khoá, lịch tự động gửi 1-1 cho người có điểm tương tác cao:
```
{ten} ơi, chị vừa hoàn thành khoá rồi ạ 🎓
Cô xin chị 2 phút: chị thấy khoá này giúp được chị điều gì cụ thể nhất ạ?
Chị trả lời ngắn gọn cũng được, cô dùng để cải thiện khoá sau.
(Nếu chị đồng ý cho cô chia sẻ lại thì cô rất cảm kích, không thì cô chỉ đọc thôi ạ.)
```

**Giá trị:** kho testimonial là tài sản không đối thủ nào copy được, và nó làm tăng tỷ lệ chốt của mọi khoá về sau. Xem [Chương 8](08-kho-noi-dung-va-mau-tin.md) mục 8.3.

**Nhớ:** luôn hỏi xin phép trong chính câu hỏi, như mẫu trên.

---

## NHÓM B — Giá trị cao, cần đầu tư vừa

### UC-07 · Chuỗi nuôi dài hạn cho người chưa mua 🔧 *2 ngày* · 🏷️ EE có sẵn dạng khác

**Vấn đề:** người dự phễu mà chưa mua bị bỏ rơi hoàn toàn. Đây là nguồn bị lãng phí lớn nhất — họ đã nghe bạn dạy 2 tiếng, đã biết bạn là ai.

**Cách làm:** chuỗi 6 tuần, mỗi tuần một tin 1-1, **không bán gì trong 5 tuần đầu**:

| Tuần | Nội dung |
|---|---|
| 1 | Một mẹo ngắn dùng được ngay |
| 2 | Bài học từ một học viên có hoàn cảnh giống họ |
| 3 | Trả lời một câu hỏi thường gặp |
| 4 | Một mẹo nữa |
| 5 | Hỏi thăm: *"chị áp dụng được cái nào chưa ạ?"* |
| 6 | Mời dự lớp phễu khoá tiếp theo |

**Giá trị:** người từ chối khoá 12 vì "tháng này bận quyết toán" hoàn toàn có thể mua khoá 14. Bạn chỉ cần còn ở đó khi họ sẵn sàng.

**Lưu ý:** bản EE có sẵn **Luồng kịch bản (Sequence)** với `delayMinutes` + `jitterMinutes` làm được việc này. Bản Community thì tự làm bằng lịch + API, cùng nguyên lý với [Chương 4](04-lich-gui-tin-tu-dong.md).

---

### UC-08 · Agent trả lời câu hỏi chuyên môn 24/7 🔧 *3–4 ngày*

**Vấn đề:** học viên tắc bài lúc 23h. Không ai trả lời tới sáng. Đến sáng họ đã nản và bỏ.

**Cách làm:** nạp giáo trình, slide, và các câu hỏi đáp cũ vào cơ sở tri thức của Hermes. Trong nhóm lớp, agent trả lời câu hỏi *chuyên môn* (không phải câu hỏi bán hàng):

```
Học viên: "hàm VLOOKUP của em báo #N/A là sao ạ"
Agent:    trả lời đúng, kèm ví dụ, trích buổi số mấy có dạy phần đó
```

**Giá trị:** đây là use case **nâng chất lượng sản phẩm**, không chỉ tiết kiệm công. Học viên được hỗ trợ tức thì học tốt hơn → có kết quả → mua khoá tiếp → giới thiệu người khác.

**Ranh giới:** agent chỉ trả lời **câu hỏi chuyên môn trong nhóm lớp**. Mọi câu về tiền, chính sách, khiếu nại vẫn thuộc vùng đỏ ([Chương 5](05-hermes-agent-truc-nhom.md) mục 5.3).

---

### UC-09 · Tóm tắt buổi học tự động 🔧 *1–2 ngày*

**Cách làm:** sau buổi học, lấy bản ghi/phụ đề Zoom → Hermes tóm tắt → gửi vào nhóm lúc 22h30:
```
📝 TÓM TẮT BUỔI {N} — {chu_de}

Ba điều quan trọng nhất hôm nay:
1. ...
2. ...
3. ...

⏱️ Mốc thời gian trong bản ghi:
   05:20 — Hàm VLOOKUP
   32:10 — Xử lý lỗi #N/A
   1:04:00 — Thực hành

📎 Slide: {link}   📝 Bài tập: {link}
```

**Giá trị:** người vắng buổi đó vẫn theo được → giảm bỏ học. Người có học thì dễ ôn lại. Và nó làm nhóm trông chuyên nghiệp hẳn lên.

---

### UC-10 · Nhắc học phí đợt 2 (trả góp) 🔧 *0.5 ngày*

**Vấn đề:** cho trả góp 2 đợt xong thì quên đòi đợt 2, hoặc đòi muộn khi học viên đã học xong.

**Cách làm:** khi ghi nhận đóng tiền đợt 1, tạo luôn **Lịch hẹn** trong CRM cho ngày đến hạn đợt 2. Hệ thống có sẵn nhắc lịch hẹn hàng ngày.

Trước hạn 3 ngày, nhắn nhẹ:
```
{ten} ơi, cô nhắc chị đợt 2 học phí đến hạn ngày {ngay} nhé ạ.
Chị cứ chuyển khi tiện, không gấp đâu ạ 😊
```

**Giá trị:** thu hồi công nợ mà không làm mất lòng. Và cho phép bạn tự tin mở rộng chính sách trả góp — vốn là công cụ chốt sale mạnh nhất với nhóm vướng tiền ([Chương 7](07-pipeline-va-chot-sale.md) mục 7.4).

---

### UC-11 · Chương trình giới thiệu có theo dõi 🔧 *1 ngày*

**Cách làm:** mỗi học viên có một mã giới thiệu ngắn (ví dụ `HUONG12`). Người mới nhắn mã đó khi đăng ký → CRM tự gắn liên kết giữa hai hồ sơ.

```
Người giới thiệu → giảm {X}% khoá tiếp theo, hoặc nhận quà
Người được giới thiệu → giảm {Y}%
```

**Giá trị:** giới thiệu là nguồn chốt cao nhất và rẻ nhất ([Chương 9](09-sau-khi-mua.md) mục 9.5). Có mã theo dõi thì bạn **đo được** và thưởng đúng người — không có mã thì chương trình giới thiệu chỉ là lời nói suông.

---

### UC-12 · Phân lớp theo trình độ 🔧 *1 ngày*

**Cách làm:** trước khoá, gửi 5 câu hỏi trắc nghiệm ngắn trong nhóm (dùng bình chọn hoặc link form). Kết quả → gắn nhãn `trinh-do-moi`, `trinh-do-kha`, `trinh-do-tot`.

**Dùng để:**
```
· Tư vấn đúng khoá — người đã khá mà bán khoá cơ bản là mất khách
· Xếp lớp cùng trình độ — giảm hẳn tỷ lệ bỏ học
· Cá nhân hoá tin nhắn chốt sale
```

**Giá trị:** phần lớn ca bỏ học không phải vì nội dung dở, mà vì **sai trình độ** — người mất gốc vào lớp nâng cao, hoặc ngược lại.

---

## NHÓM C — Tự động hoá vận hành

### UC-13 · Báo cáo tự động gửi vào Zalo/Telegram 🔧 *0.5 ngày*

Cron 22h30 mỗi tối có lớp, gửi vào nhóm nội bộ:
```
📊 BÁO CÁO BUỔI {N} — {ten_nhom}
Tin tự động đã gửi: 3/3 ✅
Người nhắn trong nhóm: 47
Điểm danh (nhắn OK): 62
Agent trả lời: 23 tin · đẩy người thật: 4 ca
Người mới hỏi học phí: 8  ← cần chăm ngay
⚠️ Nick "Trợ giảng Mai" rớt 12 phút lúc 20:15
```

**Giá trị:** bạn biết hệ thống có chạy đúng không mà không phải đi kiểm tra. Không có báo cáo này thì mọi tự động hoá chạy trong bóng tối.

> 💡 ZCRM có sẵn **cầu Zalo ↔ Telegram 2 chiều** — mirror nhóm nội bộ sang Telegram để nhận báo cáo trên máy tính. Xem Cài đặt → Tích hợp.

---

### UC-14 · Kiểm tra sức khoẻ nick trước giờ học 🔧 *0.5 ngày*

Cron 18h30 mỗi ngày có lớp:
```
Gọi GET /api/v1/zalo-accounts
Nick nào không "connected" → báo động nhóm nội bộ NGAY
```

**Giá trị:** đây là **phòng thủ quan trọng nhất** của toàn bộ hệ thống tự động. Nick rớt lúc 19h50 = cả lớp không có link Zoom = sự cố nghiêm trọng nhất có thể xảy ra. Phát hiện lúc 18h30 thì còn 80 phút để xử lý.

Chi phí: nửa ngày công. Đáng làm trước cả nhiều use case "hấp dẫn" hơn trong chương này.

---

### UC-15 · Chúc mừng sinh nhật học viên 🔧 *0.5 ngày*

Cron hàng ngày quét hồ sơ có ngày sinh trùng hôm nay → nhắn riêng.

```
❌ "Chúc mừng sinh nhật! Nhân dịp này trung tâm giảm 30%..."
   → biến lời chúc thành quảng cáo, phản tác dụng hoàn toàn

✅ "Chúc mừng sinh nhật chị Hương! Chúc chị một tuổi mới nhiều
    niềm vui và sức khoẻ ạ ❤️"
   → không bán gì. Chấm hết.
```

**Giá trị:** nhỏ nhưng bền. Một lời chúc không kèm bán hàng tạo thiện cảm thật, và người ta nhớ. Bán hàng để dịp khác.

---

### UC-16 · Tái kích hoạt học viên cũ trước khoá mới 🔧 *0.5 ngày*

Trước mỗi khoá 2 tuần, lọc CRM:
```
· Người đã học khoá trước, chưa mua khoá tiếp   → mời ưu đãi học viên cũ
· Người dự phễu cũ chưa mua                      → mời dự phễu khoá mới
· Người từng hỏi học phí rồi im                  → nhắc nhẹ
```

**Giá trị:** nguồn miễn phí, tỷ lệ chốt cao hơn quảng cáo. Phần lớn trung tâm chỉ nghĩ tới chạy quảng cáo mới mà quên mất danh sách sẵn có trong CRM.

---

## NHÓM D — Nâng cao, làm khi đã ổn định

### UC-17 · Bảng xếp hạng học viên tích cực 🔧 *1–2 ngày*

Cuối mỗi tuần, gửi vào nhóm lớp:
```
🏆 BẢNG VÀNG TUẦN NÀY
1. Chị Hương — nộp đủ 3 bài, tham gia sôi nổi
2. Anh Tuấn — nộp đủ 3 bài
3. Chị Mai   — nộp 2 bài, hỏi nhiều câu hay

Cả nhà cố lên nhé, tuần sau cô sẽ tặng quà cho top 3 🎁
```

**Giá trị:** tăng động lực, giảm bỏ học. Dữ liệu lấy từ UC-01 (điểm danh) và UC-04 (nộp bài).

> ⚠️ **Chỉ nêu tên người tích cực, tuyệt đối không nêu tên người kém.** Bêu tên người chưa nộp bài trong nhóm là cách nhanh nhất khiến họ bỏ học luôn — vì xấu hổ chứ không phải vì lười.

---

### UC-18 · Cấp chứng nhận hoàn thành 🔧 *1–2 ngày*

Học viên đủ điều kiện (dự ≥80% buổi, nộp ≥70% bài) → tự sinh ảnh chứng nhận có tên → gửi riêng kèm lời chúc.

```
🎓 Chúc mừng {ten} đã hoàn thành khoá {ten_khoa}!
Đây là chứng nhận của chị ạ. Chị lưu lại hoặc chia sẻ lên trang cá nhân
nếu muốn nhé ❤️
```

**Giá trị kép:** vừa là phần thưởng, vừa là **kênh marketing tự nhiên** — nhiều người sẽ đăng lên Facebook/LinkedIn kèm tên trung tâm. Đây là quảng cáo do học viên tự nguyện làm, đáng tin hơn mọi quảng cáo trả tiền.

---

## Bảng chọn việc — nên làm gì trước

| Thứ tự | Use case | Công sức | Vì sao ưu tiên |
|---|---|---|---|
| **1** | [Ch. 4](04-lich-gui-tin-tu-dong.md) Lịch gửi tin nhóm | 2–3 tiếng | Nền móng cho mọi thứ |
| **2** | **UC-14** Kiểm tra nick trước giờ học | 0.5 ngày | Phòng thủ cho việc số 1 |
| **3** | **UC-03** Bình chọn trong nhóm | 0 | Có sẵn, dùng luôn |
| **4** | **UC-05** Cảnh báo bỏ học | 0 | Có sẵn, chỉ cấu hình |
| **5** | **UC-01** Điểm danh tự động | 0.5 ngày | Dữ liệu nền cho các UC khác |
| **6** | **UC-02** Chào riêng người mới | 0.5 ngày | Nâng tỷ lệ có mặt buổi học |
| **7** | [Ch. 5](05-hermes-agent-truc-nhom.md) Agent trực nhóm | 1–2 ngày | Giá trị lớn, nhưng cần 3 use case trên làm nền |
| **8** | **UC-13** Báo cáo tự động | 0.5 ngày | Để biết 7 thứ trên có chạy đúng không |
| 9+ | Các UC còn lại | | Chọn theo nỗi đau thực tế của bạn |

> 💡 **Đừng làm song song nhiều use case.** Làm xong một cái, chạy thật một khoá, rồi mới làm cái tiếp. Bạn sẽ phát hiện ra một nửa số thứ mình định làm là không cần — và một thứ không có trong danh sách này lại là thứ bạn cần nhất.

---

➡️ Tiếp theo: **[Chương 13 — Lộ trình vibe coding](13-lo-trinh-vibe-coding.md)**
