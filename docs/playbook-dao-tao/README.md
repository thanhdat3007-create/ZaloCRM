# Playbook ZaloCRM cho Ngành Đào Tạo

> Bộ cẩm nang thực chiến cho trung tâm đào tạo, coach, và người bán khoá học
> vận hành **phễu bằng nhóm Zalo** trên ZaloCRM.
> Viết cho người **chưa từng dùng CRM** — đọc tới đâu làm được tới đó.

---

## Mô hình mà playbook này phục vụ

```
Quảng cáo / giới thiệu
        ↓
   NHÓM PHỄU (học thử miễn phí)      ← 200–500 người, ồn ào, đa số im lặng
        ↓  buổi Zoom / livestream
   OFFER cuối buổi
        ↓
   NHÓM HỌC CHÍNH THỨC (đã trả tiền) ← 30–80 người, cần chăm kỹ
        ↓
   NHÓM ALUMNI / KHOÁ NÂNG CAO       ← nguồn upsell + giới thiệu
```

Nếu bạn đang chạy mô hình này — **lớp free 2 tiếng, cuối buổi chốt khoá trả phí** —
playbook này viết đúng cho bạn.

---

## Playbook này dành cho ai

| Bạn là | Đọc theo thứ tự |
|---|---|
| **Chủ trung tâm / coach tự chạy** | 00 → 02 → 03 → 04 → 05, rồi 12 khi muốn mở rộng |
| **Trợ giảng / admin nhóm** | 01 → 02 → 03 → 08 → 14 |
| **Sale / tư vấn tuyển sinh** | 03 → 06 → 07 → 08 |
| **Người sẽ code thêm chức năng** | 04 → 05 → **13** (spec kỹ thuật), kèm 11 |
| **Quản lý / vận hành đội** | 10 → 11 → 06 |

---

## Mục lục

### PHẦN A — Nền móng

| Chương | Nội dung | Đọc |
|---|---|---|
| [00 — Trước khi bắt đầu](00-truoc-khi-bat-dau.md) | 5 nỗi đau ngành đào tạo, ZCRM vs Zalo OA, từ điển, chuẩn bị | 10 phút |
| [01 — Ngày đầu tiên](01-ngay-dau-tien.md) | Đấu nick, đổi tên bậc phễu cho ngành, chỉnh hạn mức | 20 phút |
| [02 — Kiến trúc hệ nhóm phễu](02-kien-truc-he-nhom-phieu.md) | ⭐ Quy ước đặt tên nhóm, vòng đời nhóm, dùng mấy nick | 15 phút |

### PHẦN B — Vận hành một lớp phễu

| Chương | Nội dung |
|---|---|
| [03 — Nhịp một lớp phễu, D-7 → D+7](03-nhip-mot-lop-phieu.md) | ⭐ **Chương quan trọng nhất.** Timeline đầy đủ một khoá |
| [04 — Lịch gửi tin tự động vào nhóm](04-lich-gui-tin-tu-dong.md) | ⭐ 19h báo · 20h vào lớp · 22h offer/bài tập. Có cách chạy ngay |
| [05 — Hermes agent trực nhóm](05-hermes-agent-truc-nhom.md) | ⭐ Agent tự trả lời học viên trong nhóm, kiến trúc + guardrail |
| [06 — Chấm điểm học viên & ưu tiên](06-diem-so-va-uu-tien.md) | Sửa từ khoá chấm điểm từ BĐS sang đào tạo |
| [07 — Pipeline & chốt sale sau buổi học](07-pipeline-va-chot-sale.md) | 8 bậc phễu đổi tên cho đào tạo, kịch bản chốt |
| [08 — Kho nội dung & mẫu tin](08-kho-noi-dung-va-mau-tin.md) | Bộ 30 mẫu tin dùng lại mọi khoá |

### PHẦN C — Sau khi bán được

| Chương | Nội dung |
|---|---|
| [09 — Sau khi mua: giữ chân, tái ký, upsell](09-sau-khi-mua.md) | Chống refund, chống bỏ học, bán khoá tiếp theo |
| [10 — Quản lý & báo cáo](10-quan-ly-va-bao-cao.md) | Số liệu cần nhìn, kèm cặp trợ giảng |
| [11 — An toàn nick & tuân thủ](11-an-toan-nick-va-tuan-thu.md) | Ngành đào tạo rủi ro khác BĐS — đọc kỹ |

### PHẦN D — Mở rộng

| Chương | Nội dung |
|---|---|
| [12 — 18 use case mở rộng](12-usecase-mo-rong.md) | ⭐ Ngoài 2 chức năng chính, còn làm được gì nữa |
| [13 — Lộ trình vibe coding](13-lo-trinh-vibe-coding.md) | ⭐ Spec kỹ thuật từng chức năng, file cần đụng, thứ tự làm |
| [14 — Lỗi thường gặp & checklist](14-loi-thuong-gap-va-checklist.md) | Tra cứu nhanh + 1 trang A4 in ra dán bàn |

---

## Bốn nguyên tắc xuyên suốt playbook

**1. Nhóm Zalo là lớp học, không phải kênh phát thanh.**
Nhóm 400 người mà chỉ có admin nói là nhóm chết. Chỉ số sống còn của nhóm phễu không phải sĩ số — mà là **số người nhắn tin**. Mọi thiết kế trong playbook này đều nhắm vào đó.

**2. Tin nhắn vào nhóm mình là chủ an toàn hơn DM người lạ rất nhiều.**
Zalo không tính spam như tin nhắn cold. Đây là lý do mô hình nhóm phễu chạy được lâu dài, trong khi bắn DM hàng loạt thì chết nick sau vài tuần. Đừng phá lợi thế này bằng cách bắn cả DM ồ ạt — xem [Chương 11](11-an-toan-nick-va-tuan-thu.md).

**3. Tự động hoá phần lặp lại. Đừng tự động hoá phần chốt.**
Nhắc giờ học, gửi link Zoom, gửi bài tập — máy làm, chuẩn từng phút. Nhưng câu *"em đang phân vân giữa khoá 6 tháng và 12 tháng"* thì phải là người thật trả lời. Agent giỏi nhất là agent biết khi nào im lặng và gọi người.

**4. Một buổi Zoom kết thúc là lúc công việc bắt đầu, không phải kết thúc.**
Phần lớn trung tâm bắn offer lúc 22h rồi thôi. Tiền nằm ở 72 giờ sau đó — ở những người đã xem hết buổi nhưng chưa quyết. [Chương 07](07-pipeline-va-chot-sale.md) nói kỹ.

---

## Trạng thái tính năng — đọc trước khi kỳ vọng

Playbook viết cho **bản Community (AGPL-3.0)**. Ba nhãn được dùng xuyên suốt:

| Nhãn | Nghĩa |
|---|---|
| *(không nhãn)* | **Có sẵn**, dùng được ngay trên bản Community |
| 🏷️ **[EE]** | Chỉ có ở **bản Extension** (thương mại) |
| 🔧 **[CẦN CODE]** | **Chưa có trong ZCRM.** Playbook mô tả cách làm + spec ở [Chương 13](13-lo-trinh-vibe-coding.md) |

Hai chức năng trọng tâm của playbook này đều là 🔧 **[CẦN CODE]**:

| Chức năng | Trạng thái hiện tại | Đường đi ngay |
|---|---|---|
| **Lịch gửi tin vào nhóm** (19h/20h/22h) | Bảng dữ liệu đã có `scheduleKind`/`recurringSpec` nhưng **chưa có worker đọc** | Cron ngoài + Public API — chạy được hôm nay ([Ch. 04](04-lich-gui-tin-tu-dong.md)) |
| **Hermes agent trực nhóm** | Webhook + API gửi nhóm đã có 2 chiều, **thiếu lớp keo ở giữa** | Viết 1 service trung gian ([Ch. 05](05-hermes-agent-truc-nhom.md)) |

Bản Community **đã có sẵn** và dùng được ngay: chat nhóm đa nick trên một màn hình, quét nhóm & thành viên, bình chọn trong nhóm, hồ sơ học viên + pipeline, chấm điểm tự động, lịch hẹn + nhắc, kho media, cầu Zalo ↔ Telegram, Public API + webhook, báo cáo.

---

*Viết cho ZaloCRM v3.4 · Tháng 7/2026 · Ngành đào tạo & khoá học*
