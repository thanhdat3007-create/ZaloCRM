# Chương 1 — Ngày đầu tiên

*Làm 20 phút. Mở máy tính, mở điện thoại có nick Zalo bên cạnh.*

Mục tiêu cuối chương: bạn chat được với mọi nhóm học từ một màn hình, và hệ thống đã được đổi từ "bất động sản" sang "đào tạo".

---

## 1.1. Đăng nhập và tạo tổ chức

Lần đầu mở địa chỉ hệ thống (ví dụ `http://ip-may-chu:3080`), bạn được đưa tới trang `/setup`:

1. Đặt **tên tổ chức** — dùng tên trung tâm thật, nó sẽ hiện trên báo cáo
2. Tạo **tài khoản chủ** (Owner) — email + mật khẩu mạnh
3. Đăng nhập

> 💡 Tài khoản Owner là tài khoản duy nhất không ai gỡ được quyền. **Đừng đưa cho trợ giảng.** Trợ giảng dùng tài khoản Member, tạo ở mục 1.6.

---

## 1.2. Đấu nick Zalo bằng mã QR

**Cài đặt → Tài khoản Zalo → Thêm tài khoản**

1. Màn hình hiện **mã QR**
2. Mở Zalo trên điện thoại → biểu tượng quét mã → quét
3. Xác nhận trên điện thoại
4. Đợi vài giây → nick hiện trạng thái **Đã kết nối** (chấm xanh)

Lặp lại cho từng nick. Xem [Chương 2](02-kien-truc-he-nhom-phieu.md) để biết nên đấu mấy nick và mỗi nick làm gì.

### Ba điều cần biết ngay

| Điều | Nghĩa |
|---|---|
| **Đừng đăng xuất Zalo trên điện thoại** | Đăng xuất trên điện thoại có thể làm rớt phiên trong CRM. |
| **Nick rớt là chuyện bình thường** | Zalo đôi khi ngắt phiên. CRM tự kết nối lại; nếu không được thì quét QR lại. Bật cảnh báo ở mục 1.7. |
| **Nick đang rớt thì không gửi được tin** | Lịch tự động sẽ **bỏ lỡ** buổi học nếu nick rớt lúc 20h. Đây là rủi ro thật — [Chương 4](04-lich-gui-tin-tu-dong.md) mục 4.7 nói cách phòng. |

---

## 1.3. ⭐ Đổi 8 bậc phễu từ bất động sản sang đào tạo

Đây là việc **quan trọng nhất** ngày đầu tiên, và hầu hết người dùng bỏ qua.

Hệ thống cài sẵn 8 bậc dành cho bất động sản: *Mới · Tiếp cận · Hẹn gặp · Nóng · Tiềm năng · Chốt · Mất · Thất Bại*. Với đào tạo, những cái tên này vô nghĩa và sẽ khiến cả đội dùng sai.

**Cài đặt → Trạng thái** → sửa tên từng bậc:

| Bậc mặc định | Đổi thành | Nghĩa trong đào tạo |
|---|---|---|
| Mới | **Đăng ký** | Điền form / để lại SĐT, chưa vào nhóm |
| Tiếp cận | **Đã vào nhóm** | Đã ở trong nhóm phễu, chưa học buổi nào |
| Hẹn gặp | **Có mặt buổi học** | Thực sự vào Zoom, có điểm danh |
| Nóng | **Quan tâm khoá phí** | Đã hỏi học phí / lịch khai giảng / chính sách |
| Tiềm năng | **Đã nhận báo giá** | Đã gửi bảng giá + thông tin chuyển khoản |
| Chốt | **Đã đóng tiền** | Đã thanh toán, vào nhóm lớp chính thức |
| Mất | **Ngưng quan tâm** | Rời nhóm, hoặc từ chối rõ ràng |
| Thất Bại | **Không phù hợp** | Sai đối tượng, sai trình độ, không đủ điều kiện |

> ⚠️ **Đừng xoá bậc, chỉ đổi tên.** Ba bậc *Ngưng quan tâm · Không phù hợp · Đã đóng tiền* được đánh dấu **kết thúc (terminal)** trong hệ thống — người ở các bậc này không bị tính vào cảnh báo "kẹt lâu". Xoá rồi tạo mới sẽ mất thuộc tính đó.

Giữ nguyên **thứ tự** — hệ thống dùng thứ tự để vẽ phễu trong báo cáo.

---

## 1.4. Dựng bộ nhãn cho ngành đào tạo

**Cài đặt → Thẻ (tag)**

Nhãn là thứ bạn dán tay hoặc hệ thống tự dán. Bộ tối thiểu cho một trung tâm:

### Nhóm nhãn "Nguồn"
```
nguồn-quảng-cáo-fb      nguồn-tiktok
nguồn-giới-thiệu        nguồn-alumni
nguồn-tự-tìm
```

### Nhóm nhãn "Trình độ" *(quyết định bạn tư vấn khoá nào)*
```
mới-hoàn-toàn           đã-biết-cơ-bản
đã-đi-làm               sinh-viên
```

### Nhóm nhãn "Hành vi trong lớp" *(nhãn quan trọng nhất)*
```
xem-hết-buổi            vào-rồi-thoát-sớm
có-phát-biểu            có-nộp-bài-tập
hỏi-học-phí             hỏi-trả-góp
xin-tài-liệu            im-lặng-hoàn-toàn
```

### Nhóm nhãn "Lịch sử học"
```
đã-học-khoá-1           đã-học-khoá-2
học-viên-cũ-quay-lại    đã-giới-thiệu-người-khác
```

### Nhóm nhãn "Cảnh báo"
```
nguy-cơ-bỏ-học          đã-xin-hoàn-tiền
khiếu-nại               không-gọi-được
```

> 💡 Dùng dấu gạch nối, không dấu cách, viết thường. Gõ nhanh hơn và không bị tạo nhãn trùng do khác hoa thường.

---

## 1.5. Chỉnh hạn mức gửi tin

**Cài đặt → Giới hạn tốc độ**

Hệ thống mặc định cho mỗi nick:

| Loại hành động | Mỗi ngày | Đợt dồn (30 giây) |
|---|---|---|
| **Gửi tin nhắn** | 200 | 20 |
| Thao tác kết bạn | thấp hơn nhiều | — |
| Đọc / tra cứu | 2.000 | 30 |

**Với mô hình nhóm, 200 tin/ngày là rất thoải mái** — một buổi học bạn chỉ gửi 3–5 tin vào mỗi nhóm. Kể cả trực 10 nhóm cũng chưa tới 50 tin.

Hạn mức này bắt đầu chật khi bạn nhắn DM 1-1 sau buổi học. Nguyên tắc:

```
Nick trực nhóm      → giữ 200/ngày, dùng chưa tới 1/4. An toàn tuyệt đối.
Nick chăm 1-1       → giữ 200/ngày, KHÔNG nâng lên. Nếu chạm trần thường
                      xuyên nghĩa là bạn cần thêm nick, không phải thêm hạn mức.
```

> ⚠️ **Đừng nâng hạn mức lên 500 vì thấy "chạy chậm quá".** Con số 200 không phải giới hạn kỹ thuật của ZCRM — nó là ước lượng ngưỡng an toàn của Zalo. Nâng lên là tự rút ngắn tuổi thọ nick. [Chương 11](11-an-toan-nick-va-tuan-thu.md).

---

## 1.6. Tạo tài khoản cho trợ giảng

**Cài đặt → Người dùng → Thêm**

| Vai trò | Cho ai | Làm được gì |
|---|---|---|
| **Owner** | Chủ trung tâm | Tất cả, kể cả xoá tổ chức |
| **Admin** | Quản lý vận hành | Gần như tất cả, trừ thanh toán và xoá tổ chức |
| **Member** | Trợ giảng, sale | Chat, chăm học viên, xem học viên được giao |

Với mỗi trợ giảng, phân rõ **nick nào họ được dùng** — không cho tất cả mọi người dùng tất cả nick. Trợ giảng lớp Excel không cần thấy nhóm lớp Tiếng Anh.

---

## 1.7. Bật cảnh báo — 3 cái phải bật ngay hôm nay

**Cài đặt → Thông báo hệ thống**

| Cảnh báo | Vì sao bắt buộc với ngành đào tạo |
|---|---|
| **Nick Zalo mất kết nối** | Nick rớt lúc 19h50 = cả lớp không nhận được link Zoom. Đây là sự cố nghiêm trọng nhất, phải biết ngay. |
| **Tin chưa trả lời > 30 phút** | Câu hỏi mua hàng trong nhóm phễu để quá 30 phút coi như mất. |
| **Lịch hẹn hôm nay / ngày mai** | Nhắc buổi học, buổi tư vấn 1-1. |

Trợ giảng nên bật cả trên điện thoại — hệ thống có **PWA cài được như app**.

---

## 1.8. Đấu Hermes agent (nếu đã có sẵn)

Có hai đường, phục vụ hai mục đích khác nhau. Chi tiết ở [Chương 5](05-hermes-agent-truc-nhom.md), đây chỉ là bước cấu hình nhanh.

### Đường A — Hermes làm "bộ não gợi ý" trong CRM *(có sẵn, 5 phút)*

**Cài đặt → Trợ lý AI**

1. Chọn provider — **`OpenAI`** nếu Hermes dùng tham số `max_completion_tokens`, hoặc **`Kimi`** nếu Hermes dùng `max_tokens` (chuẩn OpenAI cổ điển)
2. Đổi **Base URL** trỏ về endpoint Hermes
3. Nhập **API key** của Hermes
4. Chọn model — danh sách tự tải nếu Hermes có `GET /v1/models`

Sau bước này Hermes chạy các tính năng AI có sẵn: gợi ý câu trả lời, tóm tắt hội thoại, trích thông tin học viên từ chat, gợi ý đặt lịch.

> Chọn nhầm provider sẽ lỗi 400 ngay tin đầu tiên — vì hai bên gửi tên tham số token khác nhau. Thử một câu là biết.

### Đường B — Hermes làm agent trực nhóm 🔧 [CẦN CODE]

**Cài đặt → API & Webhook**

1. Tạo **API key** — lưu lại, chỉ hiện một lần
2. Khai **URL webhook** trỏ về service trung gian của bạn
3. Bấm **Gửi thử** để kiểm tra

Đường này cần một service nhỏ ở giữa. [Chương 5](05-hermes-agent-truc-nhom.md) mô tả đầy đủ, [Chương 13](13-lo-trinh-vibe-coding.md) có spec.

---

## 1.9. Việc cần làm cuối chương

- [ ] Tạo tổ chức + tài khoản Owner
- [ ] Đấu ít nhất 1 nick Zalo, thấy chấm xanh **Đã kết nối**
- [ ] **Đổi tên 8 bậc phễu sang thuật ngữ đào tạo** (mục 1.3) — đừng bỏ qua bước này
- [ ] Tạo tối thiểu 10 nhãn ở mục 1.4
- [ ] Kiểm tra hạn mức gửi tin đang là 200/ngày
- [ ] Bật 3 cảnh báo ở mục 1.7
- [ ] Tạo tài khoản cho trợ giảng, phân quyền nick
- [ ] Mở menu **Tin nhắn**, xác nhận thấy các nhóm Zalo của bạn hiện ra

---

➡️ Tiếp theo: **[Chương 2 — Kiến trúc hệ nhóm phễu](02-kien-truc-he-nhom-phieu.md)**
