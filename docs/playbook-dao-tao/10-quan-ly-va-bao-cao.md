# Chương 10 — Quản lý & báo cáo

*Dành cho chủ trung tâm và quản lý vận hành. Đọc 15 phút.*

---

## 10.1. Sáu bộ báo cáo có sẵn

**Menu Báo cáo**

| Bộ báo cáo | Dùng để | Xem khi nào |
|---|---|---|
| **Tổng quan điều hành** | Bức tranh chung: đơn, doanh thu, phễu | Hàng tuần |
| **Vận hành Nick Zalo** | Nick nào online bao nhiêu %, rớt mấy lần | **Hàng ngày** |
| **Hiệu suất Sale & Team** | Ai chăm bao nhiêu người, chốt bao nhiêu | Hàng tuần |
| **Tương tác khách hàng** | Ai chưa được trả lời, thời gian phản hồi | Hàng ngày |
| **Audit & Sức khoẻ hệ thống** | Ai xem gì, xuất gì, hệ thống có ổn không | Hàng tháng |
| **Phân tích nâng cao** | Phễu, xu hướng, so sánh kỳ | Cuối mỗi khoá |

Xuất Excel được, lọc theo khoảng thời gian.

---

## 10.2. Bảng số liệu bạn thật sự cần

Đừng nhìn hết mọi biểu đồ. Với trung tâm đào tạo, chỉ 8 con số này đáng theo dõi đều:

### Hàng ngày · 3 phút

| Số | Ở đâu | Báo động khi |
|---|---|---|
| Nick nào đang rớt | Vận hành Nick Zalo | Bất kỳ nick nào rớt trong giờ có lớp |
| Hội thoại chưa trả lời | Tương tác khách hàng | > 10 hội thoại quá 30 phút |
| Học viên kẹt mới phát sinh | Marketing → Học viên kẹt | Tăng đột biến |

### Hàng tuần · 15 phút

| Số | Ở đâu | Ngưỡng tốt |
|---|---|---|
| Số người mới vào phễu | Tổng quan điều hành | Theo mục tiêu tuyển sinh |
| Tỷ lệ vào nhóm → có mặt buổi học | Phân tích nâng cao | > 25% |
| Tỷ lệ nhận báo giá → đóng tiền | Phân tích nâng cao | > 20% |
| Thời gian phản hồi trung bình | Tương tác khách hàng | < 30 phút trong giờ hành chính |
| Học viên đã mua có điểm tương tác < 20 | Khách hàng, lọc + sắp xếp | Số này phải bằng 0 sau khi xử lý |

Con số cuối là **danh sách cứu người** hàng tuần của bạn — xem [Chương 9](09-sau-khi-mua.md).

---

## 10.3. Bảng theo dõi từng khoá

Ngoài báo cáo trong CRM, giữ một bảng tay so sánh các khoá. Đây là thứ cho bạn thấy mình đang tiến bộ hay giậm chân:

| | K10 | K11 | K12 | K13 |
|---|---|---|---|---|
| Chi phí quảng cáo | | | | |
| Người vào nhóm phễu | | | | |
| Người vào Zoom | | | | |
| % vào Zoom | | | | |
| Người ở lại tới 22h | | | | |
| Người nhắn "ĐK" | | | | |
| **Đơn chốt** | | | | |
| **% toàn phễu** | | | | |
| Chi phí / đơn | | | | |
| Hoàn tiền | | | | |

Sau 4–5 khoá, bảng này nói cho bạn biết chính xác nên sửa khâu nào — rõ hơn mọi cảm nhận chủ quan.

---

## 10.4. Phân quyền — ai thấy gì

**Cài đặt → Người dùng · Phòng ban · Nhóm quyền**

Với trung tâm nhiều dòng khoá, chia theo **phòng ban** = dòng khoá:

```
Phòng "Excel"      → trợ giảng Mai, tư vấn Hùng
Phòng "Tiếng Anh"  → trợ giảng Ngọc, tư vấn Trang
```

Mỗi phòng chỉ thấy học viên và nick của phòng mình. Chủ trung tâm thấy tất cả.

### Ba nguyên tắc phân quyền

| Nguyên tắc | Vì sao |
|---|---|
| **Trợ giảng không cần quyền xuất Excel** | Xuất danh sách học viên là đường rò rỉ data phổ biến nhất |
| **Chỉ 1–2 người có quyền xoá** | Xoá nhầm hồ sơ học viên là mất lịch sử chat, không khôi phục được |
| **Tài khoản Owner không dùng hàng ngày** | Dùng tài khoản Admin cho việc thường; Owner để dành |

### Privacy PIN

Hệ thống có **Privacy PIN** — che thông tin nhạy cảm (số điện thoại, nội dung chat) cho tới khi nhập mã. Bật cho các tài khoản dùng chung máy, hoặc máy đặt ở khu vực nhiều người qua lại.

---

## 10.5. Nhật ký kiểm toán

**Cài đặt → Nhật ký kiểm toán**

Ghi lại: ai đăng nhập, ai xem hồ sơ nào, ai xuất dữ liệu, ai xoá gì.

Kiểm tra hàng tháng, tìm ba dấu hiệu:
```
· Một tài khoản xem hàng trăm hồ sơ trong thời gian ngắn
· Xuất Excel ngoài giờ làm việc
· Đăng nhập từ thiết bị lạ
```

Đây không phải là không tin nhân viên — đây là để khi có chuyện thì bạn có bằng chứng, và để nhân viên biết là có ghi lại nên không nảy ý định.

---

## 10.6. Kèm cặp trợ giảng bằng số liệu

Thay vì "em chăm khách chưa tốt", dùng số cụ thể:

| Số của trợ giảng | Nếu kém thì vấn đề là |
|---|---|
| Thời gian phản hồi trung bình | Không trực đủ, hoặc không dùng bộ lọc *chưa trả lời* |
| Số hội thoại để quá 30 phút | Nhận quá nhiều học viên, hoặc trực sai giờ |
| Tỷ lệ *nhận báo giá → đóng tiền* | Kỹ năng chốt — đọc lại [Chương 7](07-pipeline-va-chot-sale.md) cùng nhau |
| Số ghi chú trên mỗi học viên | Không nhập liệu → khoá sau mất hết ngữ cảnh |
| Số học viên kẹt tồn đọng | Không rà danh sách kẹt hàng ngày |

**Cách kèm hiệu quả nhất:** mở một hội thoại thật mà trợ giảng chốt hụt, đọc lại cùng nhau, chỉ ra chỗ có thể làm khác. Cụ thể hơn mọi buổi đào tạo kỹ năng chung chung.

---

## 10.7. Nhịp họp đề xuất

| Họp | Tần suất | Nội dung | Thời lượng |
|---|---|---|---|
| Đứng đầu ngày | Hàng ngày | Nick có ổn không · ai chưa trả lời · hôm nay có lớp gì | 10 phút |
| Tổng kết khoá | Sau mỗi khoá | Điền bảng 10.3, tìm 1 thứ sửa cho khoá sau | 45 phút |
| Rà chất lượng | Hàng tháng | 4 con số ở [Chương 9](09-sau-khi-mua.md) mục 9.6 | 60 phút |

> 💡 Trong họp tổng kết khoá, **chỉ chọn 1 thứ để sửa** cho khoá sau. Chọn 5 thứ thì không cái nào được làm tới nơi. Một cải tiến mỗi khoá, sau 10 khoá là 10 cải tiến đã thật sự đi vào vận hành.

---

## 10.8. Sao lưu — việc 5 phút cứu cả doanh nghiệp

**Cài đặt → Sao lưu**, hoặc chạy tay trên máy chủ:

```bash
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-$(date +%Y%m%d).sql
```

| Việc | Tần suất |
|---|---|
| Sao lưu cơ sở dữ liệu | Hàng ngày, tự động |
| Chép bản sao lưu ra nơi khác (máy khác / cloud) | Hàng tuần |
| **Thử khôi phục một bản sao lưu** | **Hàng quý** |

> ⚠️ Bản sao lưu chưa từng được thử khôi phục thì không phải là bản sao lưu — nó chỉ là một file bạn hy vọng là dùng được. Mỗi quý thử một lần, 30 phút.

Sao lưu trước mọi lần nâng cấp phiên bản. Đây là quy tắc không có ngoại lệ.

---

## 10.9. Việc cần làm cuối chương

- [ ] Mở đủ 6 bộ báo cáo một lượt để biết cái gì ở đâu
- [ ] Lập bảng theo dõi khoá (mục 10.3), điền số của khoá gần nhất
- [ ] Phân quyền theo phòng ban nếu có nhiều dòng khoá
- [ ] Gỡ quyền xuất Excel của trợ giảng
- [ ] Bật sao lưu tự động hàng ngày
- [ ] **Thử khôi phục một bản sao lưu** — làm ngay, đừng đợi
- [ ] Đặt lịch họp tổng kết sau khoá gần nhất

---

➡️ Tiếp theo: **[Chương 11 — An toàn nick & tuân thủ](11-an-toan-nick-va-tuan-thu.md)**
