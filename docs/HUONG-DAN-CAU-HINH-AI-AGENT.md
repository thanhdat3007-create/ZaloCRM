# Hướng dẫn cấu hình AI chăm sóc khách hàng tự động

AI agent tự trả lời khách trên Zalo bằng tài liệu bạn nạp vào. Mỗi agent có prompt riêng,
tài liệu riêng, và được gán cho từng số Zalo (nick) — tách riêng tin nhắn cá nhân với từng hội nhóm.

> **Đọc kỹ phần [Trước khi bật cho khách thật](#7-truoc-khi-bat-cho-khach-that).**
> Agent gửi thẳng câu trả lời cho khách, không có bước duyệt.

---

> Muốn dùng agent chạy ngay trên máy đặt CRM thay vì model đám mây?
> Xem [HUONG-DAN-KET-NOI-ROCKET-AGENT.md](./HUONG-DAN-KET-NOI-ROCKET-AGENT.md).
> Phần nạp tài liệu, gán agent theo nick/nhóm và giới hạn gửi ở tài liệu này vẫn áp dụng nguyên vẹn.

## 1. Chuẩn bị: lấy API key OpenRouter

1. Đăng ký tại <https://openrouter.ai> → **Keys** → **Create Key**.
2. Nạp tiền vào tài khoản (OpenRouter tính tiền theo lượt gọi, mỗi model một giá).
3. Copy key dạng `sk-or-v1-...`.

Nhập key vào CRM: **Cài đặt → Trợ lý AI → phần nhà cung cấp**, chọn `OpenRouter`, dán key và lưu.
Key được mã hoá trước khi lưu vào cơ sở dữ liệu, mỗi tổ chức một key riêng.

Có thể đặt qua biến môi trường thay vì UI:

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

## 2. Bật tính năng ở mức hệ thống

Trong `.env` của backend:

```env
# Bắt buộc bật thì worker mới chạy. Mặc định false.
AI_AGENT_ENABLED=true
# Số lượt trả lời xử lý song song. Để thấp để nhiều nick không bắn tin cùng lúc.
AI_AGENT_WORKER_CONCURRENCY=3
# Sau khi agent bàn giao cho người thật, tạm dừng AI ở hội thoại đó bao nhiêu phút.
AI_AGENT_HANDOFF_PAUSE_MIN=60
```

Khởi động lại backend sau khi đổi. Trang cấu hình agent vẫn dùng được kể cả khi
`AI_AGENT_ENABLED=false` — bạn tạo agent, nạp tài liệu, chạy thử trước rồi mới bật.

## 3. Nạp tài liệu

**Cài đặt → Kho tài liệu AI → Thêm tài liệu.**

Hai cách nhập: dán nội dung trực tiếp, hoặc tải file `.txt` / `.md` (tối đa 2MB).

Mẹo viết tài liệu để AI tìm được:

- Chia mục bằng tiêu đề markdown (`#`, `##`) — hệ thống cắt đoạn theo tiêu đề, tìm kiếm chính xác hơn.
- Viết đúng từ ngữ **khách hay dùng**, không chỉ từ ngữ nội bộ. Khách hỏi "căn 2pn bao nhiêu",
  tài liệu chỉ ghi "sản phẩm mã A2" thì sẽ không khớp.
- Mỗi mục nói một việc. Mục dài lan man làm loãng kết quả tìm kiếm.
- Tìm kiếm bỏ dấu: khách gõ "can ho" vẫn khớp "căn hộ".

Sau khi nạp, dùng ô **Thử tìm kiếm** ở cuối trang: chọn agent, gõ đúng câu khách hay hỏi,
xem có đoạn nào khớp không. **Không khớp = agent sẽ trả lời không có căn cứ.**

## 4. Tạo agent

**Cài đặt → AI chăm sóc tự động → Tạo agent.**

| Mục | Ý nghĩa |
|---|---|
| Model | ID model OpenRouter, vd `anthropic/claude-sonnet-4.5`. Bấm "tải danh sách" để chọn. |
| System prompt | Vai trò, giọng điệu, nhiệm vụ của agent. Bấm "chèn mẫu" để lấy bản mẫu. |
| Temperature | Càng cao càng sáng tạo. Chăm sóc khách nên để 0.4–0.7. |
| Độ trễ min/max | Thời gian chờ trước khi trả lời. **Đừng để quá thấp** — xem mục 7. |
| Tối đa tin/ngày | Trần an toàn cho cả agent. |
| Tối đa tin/hội thoại/ngày | Chặn agent nhắn dai với một khách. |
| Nhường sale | Số phút agent im sau khi sale vừa nhắn. `0` = agent vẫn trả lời. |
| Từ khoá bàn giao | Khách nhắn trúng → agent im lặng và báo chủ nick. |
| Regex bỏ qua tin rác | Tin "ok", "uhm"… không gọi model, đỡ tốn tiền. |

Không cần viết quy tắc an toàn vào prompt: hệ thống tự nối vào cuối các quy tắc
"chỉ dùng thông tin trong tài liệu", "không bịa giá", "không chắc thì chuyển nhân viên".
Prompt của bạn không ghi đè được các quy tắc này.

Chọn tài liệu cho agent ở mục **Tài liệu agent được dùng**. Nếu tổng token vượt ngưỡng,
hệ thống sẽ cảnh báo — nên tách nhỏ tài liệu.

Cuối cùng dùng khung **🧪 Thử nghiệm**: gõ câu khách hay hỏi, xem câu trả lời và
danh sách đoạn tài liệu agent đã dùng. Lặp lại tới khi hài lòng. Khung này **không gửi Zalo**.

## 5. Gán agent cho nick / nhóm

### Theo nick — cả 1-1 lẫn nhóm trong một chỗ

**Cài đặt → AI chăm sóc tự động → tab "Gán theo nick"**. Bảng liệt kê mọi nick kèm agent
đang phụ trách chat riêng, chat nhóm và số nhóm gán riêng — bấm **Cấu hình** ở dòng nick
cần sửa.

Lối vào thứ hai cho cùng màn hình này: **Cài đặt → Tài khoản Zalo →** nút 🤖 trên dòng nick,
tiện khi bạn đang ở sẵn trang quản lý nick.

Nội dung cấu hình:

- **Tin nhắn cá nhân (1-1)**: chọn agent, tick bật. Agent sẽ trả lời mọi khách nhắn riêng cho nick.
- **Tin nhắn nhóm**: chọn agent áp dụng cho *mọi* nhóm của nick này.
- **Giao agent riêng cho từng nhóm**: tick ô này để hiện danh sách nhóm, **mỗi nhóm một ô
  chọn agent riêng**. Cấu hình này đè lên mặc định ở trên.

Nhờ mỗi nhóm một ô chọn, một nick giao được nhiều agent khác nhau trong cùng một lần lưu:

```
Nhóm KH miền Bắc      [ Agent A              ▾ ]
Nhóm CĐT Vinhomes     [ Agent B              ▾ ]
Nhóm nội bộ           [ — theo mặc định —    ▾ ]
```

Mỗi nhóm chỉ thuộc **đúng một agent** — đổi ô chọn chính là chuyển nhóm sang agent khác.
Chọn "theo mặc định của nick" là gỡ cấu hình riêng, nhóm đó quay về dùng agent mặc định
cho mọi nhóm.

### Riêng cho một nhóm (khi đang xem nhóm đó)

**Nhóm Zalo →** chọn nhóm → bấm **AI nhóm này**. Cùng tác dụng với mục trên, tiện khi bạn
đang mở sẵn một nhóm. Bỏ tick "Theo mặc định của nick" để đặt riêng, tick lại để xoá cấu
hình riêng.


### Trong nhóm, agent chỉ nói khi được gọi

Mặc định agent **im lặng** trong nhóm. Nó chỉ lên tiếng khi:

- có người **@nhắc tên nick**, hoặc
- có người **trả lời (quote)** một tin của nick, hoặc
- tin **trúng từ khoá kích hoạt** bạn đặt.

`@all` mặc định **không** tính (nhóm đông sẽ kích hoạt liên tục). Bật riêng nếu thực sự cần.

### Thứ tự ưu tiên khi một hội thoại khớp nhiều cấu hình

```
1. Gán riêng cho 1 khách cụ thể
2. Gán riêng cho 1 nhóm cụ thể
3. Mặc định cho mọi nhóm của nick
4. Mặc định cho mọi chat 1-1 của nick
5. Không có cấu hình nào → agent không trả lời
```

Agent ở cấp cụ thể bị tắt thì hội thoại đó **im lặng**, không rơi xuống cấp tổng quát hơn.

## 6. Vận hành hằng ngày

### Nhận biết tin do AI gửi

Tin agent gửi có badge **🤖 AI tự động · {tên agent}** trong khung chat.

### Tạm dừng AI cho một hội thoại

Trong khung chat, bấm chip **🤖 AI đang chạy** ở góc phải header → chọn dừng 15 phút / 1 giờ /
tới khi bật lại. Dùng khi bạn muốn tự xử lý một ca cụ thể.

### Khi agent bàn giao

Khách nhắn trúng từ khoá bàn giao, hoặc agent tự thấy không đủ thông tin → agent **không gửi gì**,
tạo thông báo cho chủ nick, và tạm dừng AI ở hội thoại đó 60 phút (đổi bằng `AI_AGENT_HANDOFF_PAUSE_MIN`).

### Nhật ký — "sao AI không trả lời?"

**Cài đặt → AI chăm sóc tự động → tab Nhật ký.** Mọi lượt đều được ghi, kể cả lượt bỏ qua,
kèm lý do cụ thể (nick chưa gán agent, nhóm không nhắc tên, hết hạn mức, tin rác…).
Đây là chỗ đầu tiên cần xem khi có vấn đề.

Nhật ký cũ hơn 90 ngày tự dọn mỗi ngày lúc 03:15.

### Tắt khẩn cấp

| Cần tắt | Cách làm | Phạm vi |
|---|---|---|
| Toàn bộ tổ chức, ngay lập tức | **Cài đặt → Trợ lý AI →** công tắc đỏ "Bật toàn bộ AI" | Cả trợ lý ảo lẫn agent |
| Một agent | Bỏ tick "Bật agent" | Mọi nick dùng agent đó |
| Một nick / một nhóm | Bỏ tick trong dialog gán | Đúng nick/nhóm đó |
| Một hội thoại | Chip "AI đang chạy" trong khung chat | Một hội thoại |
| Toàn hệ thống, mức tiến trình | `AI_AGENT_ENABLED=false` + khởi động lại | Tất cả (cần restart) |

## 7. Trước khi bật cho khách thật

Agent gửi thẳng cho khách, không có bước duyệt. Hai rủi ro thật sự:

**Nick Zalo bị khoá vì hành vi bot.** Giảm thiểu:
- Giữ độ trễ trả lời ngẫu nhiên (mặc định 3–12 giây). **Đừng đặt về 1 giây.**
- Đặt hạn mức ngày thấp lúc đầu (50 tin/ngày), tăng dần khi đã yên tâm.
- Nhóm: cứ để mặc định im lặng, chỉ trả lời khi được gọi.

**AI trả lời sai và khách đã đọc.** Giảm thiểu:
- Nạp tài liệu đầy đủ, kiểm bằng ô "Thử tìm kiếm" trước.
- Dùng khung "Thử nghiệm" cho ít nhất 10 câu khách hay hỏi.
- Xem nhật ký mỗi ngày trong tuần đầu — cột "Câu trả lời" cho biết agent đã nói gì.

### Trình tự triển khai đề xuất

1. Cài đặt với `AI_AGENT_ENABLED=false`, chạy migration.
2. Tạo agent, nạp tài liệu, chạy thử trong khung Thử nghiệm.
3. Bật `AI_AGENT_ENABLED=true` trên môi trường thử, gán **1 nick phụ**.
4. Nhắn thử từ một số Zalo cá nhân khác, kiểm 10 lượt hội thoại.
5. Chạy 3 ngày, soi nhật ký mỗi ngày.
6. Sản xuất: bật cho **1 nick thật**, hạn mức 50 tin/ngày, theo dõi 1 tuần.
7. Mở rộng dần theo nick. **Nhóm bật sau cùng.**

**Dừng ngay khi:** nick nhận cảnh báo từ Zalo, hoặc từ 3 khách trở lên phản ánh câu trả lời sai.
Tắt công tắc tổng, rồi soi cột "Câu trả lời" trong nhật ký để tìm nguyên nhân.

## 8. Giới hạn hiện tại

- Chỉ xử lý **tin văn bản**. Ảnh, voice, sticker bị bỏ qua.
- Tài liệu chỉ nhận **`.txt` / `.md`**. Chưa đọc được PDF/DOCX.
- Tìm kiếm tài liệu dùng Postgres full-text search (khớp từ khoá), chưa dùng embedding.
  Kho tài liệu rất lớn (trên ~200 trang) sẽ giảm độ chính xác.
- Agent chỉ trả lời, **không** thao tác CRM (không tạo lịch hẹn, không đổi trạng thái khách).
- Chỉ hỗ trợ nhà cung cấp **OpenRouter**.

## 9. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Agent không trả lời gì | Xem tab Nhật ký, cột "Lý do bỏ qua". Hay gặp nhất: nick chưa gán agent, hoặc `AI_AGENT_ENABLED=false`. |
| Nhật ký ghi `Chưa cấu hình API key OpenRouter` | Nhập key ở Cài đặt → Trợ lý AI, hoặc đặt `OPENROUTER_API_KEY`. |
| Nhật ký ghi `AI của tổ chức đang tắt` | Công tắc tổng đang tắt — bật lại ở Cài đặt → Trợ lý AI. |
| Trong nhóm agent im dù đã gán | Đúng thiết kế. Phải @nhắc tên nick hoặc trúng từ khoá kích hoạt. |
| "Thử tìm kiếm" báo lỗi | Migration FTS chưa chạy. Chạy lại `prisma migrate deploy`. |
| Không tải được danh sách model | Mạng chặn openrouter.ai. Gõ tay ID model vẫn dùng được bình thường. |
| Agent trả lời sai thông tin | Xem `Câu trả lời` + đoạn tài liệu đã dùng trong nhật ký. Thường do tài liệu thiếu hoặc dùng từ ngữ khác khách. |
