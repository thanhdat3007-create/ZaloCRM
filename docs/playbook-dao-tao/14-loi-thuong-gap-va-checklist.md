# Chương 14 — Lỗi thường gặp & checklist

*Chương tra cứu. Không cần đọc liền mạch.*

---

## 14.1. Sự cố vận hành

### 🔴 "19h50 rồi mà nhóm chưa nhận được link Zoom"

Đây là sự cố nghiêm trọng nhất. Xử lý theo thứ tự, **đừng dừng lại để tìm nguyên nhân**:

```
1. GỬI TAY NGAY vào nhóm từ điện thoại. Cả lớp đang chờ.
2. Rồi mới tìm nguyên nhân:
   □ Nick có đang kết nối không?  (Cài đặt → Tài khoản Zalo)
   □ Cron còn chạy không?          tail -f /opt/zcrm-lich/nhat-ky.log
   □ Dòng lịch có đúng ngày giờ?   Kiểm tra cột ngay/gio
   □ Cột trang_thai đã bị ghi "da_gui" từ trước chưa?
   □ groupId có đúng nhóm không?
3. Sau buổi học: rà lại và cài cron kiểm tra nick lúc 18h30 (UC-14)
```

### "Tin gửi vào nhầm nhóm"

```
1. Thu hồi tin ngay (Zalo cho thu hồi trong thời gian ngắn)
2. Nếu không kịp: nhắn xin lỗi ngắn gọn, đừng giải thích dài
3. Sửa groupId trong bảng lịch
4. Thêm cột ten_nhom vào bảng lịch để lần sau người đọc kiểm tra được
```

### "Tin bị gửi 2 lần"

Nguyên nhân gần như luôn là: script gửi thành công nhưng lỗi trước lúc ghi `da_gui`.

```
□ Kiểm tra quyền ghi file lịch
□ Thêm flock vào cron: flock -n /tmp/zcrm-lich.lock node gui-tin.mjs
□ Nếu làm bản trong ZCRM: dùng UNIQUE ở bảng run, không dùng cờ trong bộ nhớ
```

### "API trả 422 Zalo account is not connected"

Nick đang rớt. Vào **Cài đặt → Tài khoản Zalo**, quét lại QR. Nếu hay rớt:
```
□ Có ai đăng xuất Zalo trên điện thoại không?
□ Điện thoại giữ nick có bị hết pin / mất mạng thường xuyên?
□ Có đang đăng nhập nick đó ở quá nhiều nơi cùng lúc?
```

### "API trả 401 Invalid API key"

```
□ Header phải là X-Api-Key (không phải Authorization)
□ Key có bị dính khoảng trắng hoặc xuống dòng khi copy không?
□ Key có bị tạo lại (key cũ hết hiệu lực) không?
```

### "Gửi được cho người nhưng không gửi được vào nhóm"

`threadType` phải đúng chuỗi `"group"`. Giá trị khác đều bị hiểu là tin riêng, và khi đó `threadId` của nhóm dùng làm ID người → tin biến mất **không báo lỗi**.

---

## 14.2. Sự cố agent

### "Agent im lặng, không trả lời gì"

```
□ Webhook có tới không?         → xem log service, hoặc bấm "Gửi thử" trong Cài đặt
□ Nhóm có trong bảng NHOM_TRUC? → nhóm lạ bị bỏ qua theo thiết kế
□ Có bị phanh nào chặn không?   → ghi log rõ phanh nào chặn, cực kỳ quan trọng khi gỡ lỗi
□ Đã vượt hạn mức 10 tin/giờ chưa?
□ Có đang ngoài khung 6h–23h không?
□ Hermes có trả lời không?      → thử gọi thẳng bằng curl
```

> 💡 Ghi log **phanh nào chặn** cho mọi tin bị bỏ qua. Không có log này thì bạn sẽ mất hàng giờ đoán mò.

### "Agent trả lời sai thông tin"

Đây là sự cố mức nghiêm trọng. Ngưỡng chấp nhận được là **0 lần**.

```
1. TẮT AGENT NGAY cho nhóm đó
2. Vào nhóm đính chính bằng nick người thật, ngắn gọn, không đổ lỗi cho hệ thống
3. Tìm nguyên nhân:
   □ Prompt có thông tin sai hay thiếu?
   □ Thông tin khoá học có thay đổi mà chưa cập nhật vào prompt?
   □ Phanh 5 (kiểm tra đầu ra) có bắt được không? Nếu không, bổ sung mẫu
4. Quay lại chế độ câm ít nhất 3 ngày trước khi bật lại
```

### "Agent trả lời quá nhiều, nhóm bị ngập"

```
□ Vùng đen có đủ rộng không? Bổ sung "điểm danh", "ok ạ", "vâng ạ", emoji đơn
□ Hạ hạn mức xuống 5 tin/giờ
□ Giới hạn tối đa 3 lượt liên tiếp với cùng một người
```

### "Agent trả lời nhanh quá, lộ là máy"

Độ trễ phải là 4–12 giây ngẫu nhiên. Kiểm tra `await doi()` có thật sự chạy trước khi gửi không — lỗi hay gặp là đặt độ trễ sau lệnh gửi.

---

## 14.3. Sự cố dữ liệu trong CRM

### "Một học viên bị trùng 2-3 hồ sơ"

Xảy ra khi họ nhắn cho nhiều nick khác nhau. Dùng **Khách hàng → Rà soát trùng**, hộp thoại 3 cột để gộp. Gộp giữ lại toàn bộ lịch sử chat của cả hai.

### "Điểm số vô nghĩa, ai cũng như ai"

```
□ Đã đổi từ khoá sang ngành đào tạo chưa?  → Chương 6 mục 6.3
   (đây là nguyên nhân của gần như mọi ca)
□ Hệ thống mới chạy dưới 2 tuần? → cần thời gian tích luỹ dữ liệu
□ Học viên chủ yếu nhắn trong nhóm, ít nhắn riêng? → điểm chủ yếu tính từ
   hội thoại; cân nhắc dùng nhãn thủ công song song
```

### "Tên học viên hiện là 'Unknown'"

Zalo chưa trả về tên. Thường tự sửa sau vài phút. Nếu không, mở hồ sơ và đặt **Tên CRM** — tên này được ưu tiên hiển thị hơn tên Zalo.

### "Không thấy nhóm trong danh sách hội thoại"

```
□ Nick đó có thật sự ở trong nhóm không?
□ Đã có tin nhắn nào trong nhóm từ khi đấu nick chưa? (nhóm im lặng có thể chưa hiện)
□ Thử Marketing → Quét nhóm để hệ thống nạp danh sách nhóm
```

---

## 14.4. Sự cố hệ thống

### "Nâng cấp xong thì lỗi"

```
1. Đã sao lưu trước khi nâng cấp chưa? Nếu có → khôi phục và bình tĩnh
2. Xem log:  docker logs zalo-crm-app --tail 100
3. Đã chạy migrate chưa?
   docker exec zalo-crm-app npx prisma migrate deploy
4. Đã đồng bộ biến môi trường mới chưa?  diff .env .env.example
```

### "Hệ thống chạy chậm"

```
□ Máy chủ đủ 4 GB RAM chưa? v3.x cần Redis + object storage
□ Ổ cứng còn chỗ không?  df -h
□ Media có đang chiếm quá nhiều dung lượng? → dọn thùng rác media
```

---

## 14.5. Checklist in ra dán bàn — TRỢ GIẢNG

```
┌───────────────────────────────────────────────────────────┐
│ MỖI SÁNG — 10 PHÚT                                        │
│  □ Nick có nick nào rớt không                             │
│  □ Tin nhắn → lọc "chưa trả lời" → dọn sạch               │
│  □ Khách hàng → sắp theo Điểm ưu tiên → nhắn 5 người đầu  │
│  □ Xem danh sách học viên kẹt                             │
│                                                           │
│ NGÀY CÓ LỚP                                               │
│  □ 18h30 — kiểm tra nick trực nhóm còn kết nối            │
│  □ 19h00 — xác nhận tin "còn 1 tiếng" đã gửi              │
│  □ 19h50 — XÁC NHẬN LINK ZOOM ĐÃ VÀO NHÓM ⚠️              │
│  □ 20h–22h — trực nhóm nội bộ, xử lý ca agent đẩy sang    │
│  □ 22h00 — xác nhận tin offer đã gửi                      │
│  □ 22h30 — nhắn riêng top 20 điểm cao nhất                │
│                                                           │
│ MỖI KHI NÓI CHUYỆN VỚI HỌC VIÊN                           │
│  □ Ghi 1 dòng ghi chú (20 giây): đau gì · ai quyết ·      │
│    vướng gì · khi nào tiện                                │
│  □ Cập nhật bậc nếu có tiến triển                         │
│                                                           │
│ CUỐI NGÀY — 10 PHÚT                                       │
│  □ Cập nhật bậc cho người có tiến triển                   │
│  □ Đặt lịch hẹn cho ngày mai                              │
│                                                           │
│ TUYỆT ĐỐI KHÔNG                                           │
│  ✗ Quét nhóm rồi bắn tin hàng loạt                        │
│  ✗ Đăng số tài khoản công khai trong nhóm                 │
│  ✗ Nhắn quá 3 lần cho người không trả lời                 │
│  ✗ Nâng hạn mức gửi tin lên trên 200                      │
└───────────────────────────────────────────────────────────┘
```

---

## 14.6. Checklist in ra dán bàn — CHỦ TRUNG TÂM

```
┌───────────────────────────────────────────────────────────┐
│ HÀNG TUẦN — 15 PHÚT                                       │
│  □ Số người mới vào phễu                                  │
│  □ Tỷ lệ vào nhóm → có mặt buổi học   (tốt: > 25%)        │
│  □ Tỷ lệ nhận báo giá → đóng tiền     (tốt: > 20%)        │
│  □ Học viên ĐÃ MUA có điểm tương tác < 20                 │
│    → đây là danh sách CỨU NGƯỜI, xử lý hết trong tuần     │
│                                                           │
│ SAU MỖI KHOÁ — 45 PHÚT                                    │
│  □ Điền bảng 6 con số (Chương 3 mục 3.6)                  │
│  □ So với khoá trước, tìm chỗ tắc                         │
│  □ CHỌN ĐÚNG 1 THỨ để sửa cho khoá sau                    │
│  □ Đóng băng nhóm phễu cũ                                 │
│                                                           │
│ HÀNG THÁNG — 60 PHÚT                                      │
│  □ Tỷ lệ hoàn thành khoá     (tốt: > 70%)                 │
│  □ Tỷ lệ hoàn tiền           (tốt: < 5%)                  │
│  □ Tỷ lệ mua khoá tiếp       (tốt: > 25%)                 │
│  □ Tỷ lệ đơn từ giới thiệu   (tốt: > 15%)                 │
│  □ Xem nhật ký kiểm toán, tìm dấu hiệu bất thường         │
│  □ Kiểm tra checklist an toàn nick (Chương 11 mục 11.7)   │
│                                                           │
│ HÀNG QUÝ                                                  │
│  □ THỬ KHÔI PHỤC một bản sao lưu ⚠️                       │
│  □ Rà lại quyền truy cập, gỡ người đã nghỉ                │
│  □ Kiểm tra nick dự phòng còn được nuôi không             │
└───────────────────────────────────────────────────────────┘
```

---

## 14.7. Bốn con số nhớ nằm lòng

```
200   tin/ngày/nick — trần an toàn, đừng nâng
 20   tin/30 giây   — trần dồn dập
  3   lần nhắn tối đa cho người không trả lời
  0   lần agent được phép nói sai thông tin
```

---

## 14.8. Đi đâu khi cần gì

| Cần gì | Đọc chương |
|---|---|
| Hiểu tổng thể trước khi bắt đầu | [00](00-truoc-khi-bat-dau.md) |
| Cài đặt lần đầu | [01](01-ngay-dau-tien.md) |
| Đặt tên nhóm, dùng mấy nick | [02](02-kien-truc-he-nhom-phieu.md) |
| Chạy một khoá phễu từ đầu đến cuối | [03](03-nhip-mot-lop-phieu.md) ⭐ |
| Cài lịch gửi tin tự động | [04](04-lich-gui-tin-tu-dong.md) |
| Dựng agent trực nhóm | [05](05-hermes-agent-truc-nhom.md) |
| Sửa từ khoá chấm điểm | [06](06-diem-so-va-uu-tien.md) |
| Chốt sale sau buổi học | [07](07-pipeline-va-chot-sale.md) |
| Mẫu tin, kho tài liệu | [08](08-kho-noi-dung-va-mau-tin.md) |
| Giữ chân học viên, bán khoá tiếp | [09](09-sau-khi-mua.md) |
| Số liệu, phân quyền, sao lưu | [10](10-quan-ly-va-bao-cao.md) |
| An toàn nick, tuân thủ | [11](11-an-toan-nick-va-tuan-thu.md) |
| Ý tưởng mở rộng | [12](12-usecase-mo-rong.md) |
| Spec kỹ thuật để code | [13](13-lo-trinh-vibe-coding.md) |

---

## 14.9. Ba câu kết

**1. Nhóm Zalo là lớp học, không phải kênh phát thanh.**
Chỉ số sống còn không phải sĩ số — mà là số người chịu nhắn tin.

**2. Tự động hoá phần lặp lại. Đừng tự động hoá phần chốt.**
Máy nhắc giờ chuẩn từng phút. Nhưng câu *"em đang phân vân"* phải là người thật trả lời.

**3. Chạy thật một khoá rồi hãy xây thêm.**
Bạn sẽ phát hiện một nửa số thứ định làm là không cần — và thứ cần nhất lại không có trong danh sách ban đầu.

---

⬅️ Về **[Mục lục](README.md)**
