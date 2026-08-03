# Chương 11 — An toàn nick & tuân thủ

*Đọc kỹ. Chương này bảo vệ tài sản lớn nhất của trung tâm.*

Một nick Zalo nuôi 12 tháng, có 3.000 học viên cũ, là vốn liếng thật. Mất nó không mua lại được bằng tiền — phải làm lại từ đầu, và mất luôn lịch sử chat với mọi học viên cũ.

Điều đáng mừng: **mô hình nhóm phễu an toàn hơn nhiều so với bắn DM lạnh**. Nhưng nó có những rủi ro riêng mà ngành bất động sản không gặp.

---

## 11.1. Vì sao đào tạo an toàn hơn bất động sản

| | Đào tạo qua nhóm | BĐS bắn DM cold |
|---|---|---|
| Người nhận | **Tự nguyện vào nhóm** | Không quen biết, không xin phép |
| Tin nhắn | Gửi vào nhóm mình là chủ | Gửi riêng cho người lạ |
| Zalo đánh giá | Hoạt động cộng đồng bình thường | Hành vi tiếp thị đại trà |
| Xác suất bị báo xấu | Thấp | Cao |
| Kết bạn hàng loạt | Không cần | Bắt buộc, và đây là rủi ro lớn nhất |

**Nghĩa là:** nếu bạn chỉ vận hành nhóm và nhắn 1-1 với người đã học, rủi ro nick gần như bằng không. Rủi ro chỉ xuất hiện khi bạn đi chệch khỏi mô hình đó.

---

## 11.2. Năm hành vi làm mất nick — xếp theo mức nguy hiểm

### 🔴 Mức 1 — Gần như chắc chắn mất nick

**Quét thành viên nhóm rồi bắn DM hàng loạt.**

Đây là cám dỗ lớn nhất khi bạn thấy nhóm phễu có 400 người. Đừng.

```
Hậu quả kép:
· Zalo hạn chế nick sau vài chục lượt báo xấu
· Bạn bị đá khỏi chính nhóm đó → mất luôn nguồn khách lâu dài
· Người trong nhóm mất niềm tin → nhóm chết dần
```
Tính năng Quét nhóm sinh ra để **nhận diện**, không phải để **phát tán**. Xem [Chương 2](02-kien-truc-he-nhom-phieu.md) mục 2.6.

**Gửi lời mời kết bạn hàng loạt cho người lạ.**

Zalo giới hạn thao tác kết bạn chặt hơn nhiều so với gửi tin. Hệ thống có hạn mức riêng cho nhóm `friend_action` — đừng nâng nó lên.

### 🟠 Mức 2 — Rủi ro cao

**Bắn nhiều nhóm cùng một giây.** Trực 10 nhóm, 20h00 gửi cả 10 cùng lúc là dấu hiệu máy rõ ràng. Luôn để lệch ngẫu nhiên 30–60 giây ([Chương 4](04-lich-gui-tin-tu-dong.md)).

**Agent trả lời trong 0.5 giây.** Không người thật nào gõ được như vậy. Luôn để độ trễ 4–12 giây ([Chương 5](05-hermes-agent-truc-nhom.md)).

**Chạy tự động 24/7.** Nick nhắn tin lúc 3h sáng đều đặn là bất thường. Giới hạn khung giờ 6h–23h.

### 🟡 Mức 3 — Rủi ro tích luỹ

**Chạm trần 200 tin/ngày thường xuyên.** Không chết ngay nhưng đưa nick vào diện theo dõi. Nếu hay chạm trần, giải pháp là **thêm nick**, không phải nâng hạn mức.

**Gửi cùng một đoạn text y hệt cho hàng chục người.** Với tin 1-1, luôn đổi ít nhất phần mở đầu — và điều đó cũng làm tăng tỷ lệ trả lời.

**Nick mới tinh chạy ngay hết công suất.** Nick vừa lập nên đi từ từ: tuần đầu dưới 30 tin/ngày, tăng dần trong một tháng.

---

## 11.3. Bảng hạn mức đề xuất cho trung tâm đào tạo

**Cài đặt → Giới hạn tốc độ**

| Loại nick | Tin/ngày | Ghi chú |
|---|---|---|
| Nick trực nhóm (chạy tự động + agent) | **giữ 200** | Thực tế dùng 30–60. Rất thoải mái |
| Nick tư vấn 1-1 | **giữ 200** | Nếu hay chạm trần → thêm nick |
| Nick gương mặt thương hiệu | **đặt xuống 80** | Nick này quý nhất, đừng để rủi ro |
| Nick mới lập dưới 1 tháng | **đặt xuống 50** | Tăng dần theo tuần |

Giới hạn dồn 20 tin/30 giây giữ nguyên cho mọi nick.

### Tính thử xem có vượt không

```
Trực 6 nhóm × 5 tin tự động/ngày           =  30 tin
Agent trả lời 6 nhóm × 15 tin/ngày         =  90 tin
                                    ────────────────
                                     Tổng   = 120 tin  ✅ an toàn

Trực 12 nhóm × 5 tin                       =  60 tin
Agent trả lời 12 nhóm × 20 tin             = 240 tin
                                    ────────────────
                                     Tổng   = 300 tin  ⛔ VƯỢT TRẦN
                                     → tách thành 2 nick trực nhóm
```

Làm phép tính này **trước** khi mở rộng số nhóm, không phải sau khi nick bị hạn chế.

---

## 11.4. Rủi ro riêng của ngành đào tạo

Ba thứ mà playbook bất động sản không có:

### Rủi ro 1 — Agent nói sai trong nhóm đông người

Nhóm 400 người, agent nói sai học phí hoặc hứa sai chính sách. Không xoá kịp, ai cũng đã đọc, và bạn phải xin lỗi công khai.

**Phòng:** năm cái phanh ở [Chương 5](05-hermes-agent-truc-nhom.md) mục 5.4, đặc biệt là phanh chặn từ khoá **trước** khi gọi model, và phanh kiểm tra đầu ra không chứa số tiền / số tài khoản.

### Rủi ro 2 — Giả mạo thông tin chuyển khoản

Đây là rủi ro **thật và phổ biến** trong ngành khoá học online: có người vào nhóm, copy tin nhắn của bạn, đổi số tài khoản, rồi nhắn riêng cho học viên.

**Phòng:**
```
✓ KHÔNG bao giờ đăng số tài khoản công khai trong nhóm
✓ Ghim tin cảnh báo: "Trung tâm chỉ nhận chuyển khoản qua tài khoản
  mang tên {TEN_CHINH_XAC}. Mọi số khác đều là giả mạo. Nếu ai
  nhắn riêng xin tiền, cả nhà báo cô ngay ạ."
✓ Nhắc lại cảnh báo này mỗi lần thả offer
✓ Đóng chế độ cho phép người lạ thêm thành viên vào nhóm
```

### Rủi ro 3 — Học viên cũ ở lại nhóm phễu sau khi khoá kết thúc

Nhóm phễu không đóng băng sẽ thành nơi người khác vào quảng cáo, và học viên cũ chứng kiến bạn bán khoá mới với giá thấp hơn giá họ đã trả.

**Phòng:** đóng băng nhóm sau D+7, đúng như [Chương 2](02-kien-truc-he-nhom-phieu.md) mục 2.3.

---

## 11.5. Tuân thủ — điều tối thiểu phải làm

### Xin phép trước khi nhắn riêng

Người trong nhóm chưa đồng nghĩa với người cho phép bạn nhắn riêng. Cách làm đúng:

```
✅ Trong tin ghim của nhóm, nói rõ:
   "Cô và trợ giảng sẽ nhắn riêng để hỗ trợ và tư vấn lộ trình
    cho từng anh chị. Ai không muốn nhận tin riêng thì nhắn cô
    một câu, cô ghi lại ngay ạ."

✅ Ai nói không muốn → CRM gắn nhãn `không-nhắn-riêng`, tôn trọng tuyệt đối
```

Điều này vừa đúng luật, vừa làm giảm hẳn nguy cơ bị báo xấu.

### Dừng khi được yêu cầu dừng

Ai nói *"đừng nhắn nữa"*, *"tôi không quan tâm"*, *"bỏ tôi ra khỏi nhóm"*:
```
1. Trả lời một câu lịch sự, không thuyết phục thêm
2. CRM: chuyển bậc → Ngưng quan tâm, gắn nhãn `không-liên-hệ`
3. Không nhắn nữa. Không bao giờ.
```

### Dữ liệu học viên

| Việc | Quy tắc |
|---|---|
| Thu thập | Chỉ những gì cần cho việc dạy và tư vấn |
| Chia sẻ | Không bán, không chia sẻ danh sách ra ngoài |
| Truy cập | Phân quyền theo phòng ban, không cho ai xem hết |
| Xoá | Học viên yêu cầu xoá → xoá, và xác nhận đã xoá |
| Testimonial | Xin phép trước khi dùng tin nhắn/ảnh của học viên |

### Không hứa điều không giữ được

Ngành đào tạo có cám dỗ hứa kết quả: *"học xong đảm bảo tăng lương"*, *"cam kết có việc"*. Đừng — trừ khi bạn thật sự có cơ chế bảo đảm và chấp nhận thực hiện.

Cam kết an toàn và vẫn hiệu quả: *"học 3 buổi đầu thấy không phù hợp, hoàn 100%, không hỏi lý do"*. Cam kết này bạn kiểm soát được hoàn toàn.

---

## 11.6. Khi nick bị hạn chế — xử lý thế nào

Dấu hiệu: gửi tin báo lỗi, không kết bạn được, hoặc Zalo hiện cảnh báo.

```
1. NGỪNG NGAY mọi hoạt động tự động trên nick đó
   → tắt cron lịch gửi, tắt agent cho nick đó
2. Đừng thử gửi lại nhiều lần — càng làm nặng thêm
3. Dùng nick đó như người bình thường vài ngày:
   nhắn bạn bè, xem tin, không gửi hàng loạt
4. Chuyển việc sang nick dự phòng (đã chuẩn bị từ trước)
5. Sau 3–7 ngày thử lại nhẹ nhàng
6. Rà lại xem hành vi nào gây ra, sửa quy trình
```

> ⚠️ **Chuẩn bị nick dự phòng trước khi cần.** Nick lập ra lúc đang khủng hoảng thì mới tinh, không có bạn bè, và dùng ngay hết công suất — chết tiếp trong một tuần. Nick dự phòng phải được nuôi song song từ trước.

---

## 11.7. Danh sách kiểm tra hàng tháng

- [ ] Không nick nào chạm trần 200 tin/ngày thường xuyên
- [ ] Không có tin nào gửi ngoài khung 6h–23h
- [ ] Agent chưa lần nào nói sai thông tin *(ngưỡng bắt buộc: 0)*
- [ ] Nhóm phễu cũ đã đóng băng hết
- [ ] Tin cảnh báo giả mạo còn được ghim trong mọi nhóm
- [ ] Mọi nhóm có ≥ 2 quản trị viên, gồm nick chủ doanh nghiệp
- [ ] Danh sách `không-nhắn-riêng` và `không-liên-hệ` được tôn trọng
- [ ] Nick dự phòng vẫn đang được nuôi
- [ ] Đã sao lưu và **đã thử khôi phục** trong quý này

---

## 11.8. Ba câu để nhớ

**1. Nick là tài sản, không phải công cụ dùng một lần.**
Đừng đánh đổi một nick nuôi 12 tháng lấy 300 tin nhắn gửi thêm trong một ngày.

**2. Mô hình nhóm đã cho bạn lợi thế an toàn — đừng tự phá.**
Rủi ro không đến từ việc trực 10 nhóm. Nó đến từ khoảnh khắc bạn quyết định quét danh sách thành viên rồi bắn DM.

**3. Agent nói sai một lần đắt hơn 3 tuần triển khai cẩn thận.**
Chạy chế độ câm một tuần. Không có ngoại lệ.

---

➡️ Tiếp theo: **[Chương 12 — 18 use case mở rộng](12-usecase-mo-rong.md)**
