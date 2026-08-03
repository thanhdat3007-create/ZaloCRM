# Chương 4 — Lịch gửi tin tự động vào nhóm

⭐ *Chức năng trọng tâm số 1. Đọc 20 phút, làm 2 tiếng, dùng mãi mãi.*

Mục tiêu: đặt lịch **một lần** cho cả khoá, hệ thống tự gửi 19h nhắc trước, 19h50 gửi link Zoom, 22h thả offer — đúng từng phút, kể cả khi bạn đang dạy hoặc đang ngủ.

---

## 4.1. Trạng thái hiện tại — đọc trước khi làm

🔧 **[CẦN CODE]** — ZCRM **chưa có** nút "hẹn giờ gửi tin vào nhóm" trên giao diện. Nói rõ để bạn không đi tìm cho mất công:

| Thành phần | Trạng thái thật |
|---|---|
| Bảng `automation_broadcasts` có `scheduleKind` (`now`/`scheduled`/`recurring`) + `recurringSpec` | ✅ Có trong cơ sở dữ liệu — nhưng **không có dòng code nào đọc hai trường này**. Schema có, worker chưa có. |
| Automation (Mục tiêu → Luồng → Khối) | Chỉ chạy trên `channel = 'zalo_user'` — tức **nhắn riêng từng người**. Không có kênh `zalo_group`. |
| Broadcast | Bắn DM hàng loạt tới danh sách học viên, **không bắn vào nhóm**. Ngoài ra Broadcast là 🏷️ **[EE]**. |
| Menu Marketing bản Community | Chỉ có **Quét nhóm** và **Tệp khách hàng** |
| **API gửi tin vào nhóm** | ✅ **Có, hoạt động, dùng được ngay** — đây là đường đi của chương này |

**Kết luận:** hai đường để có chức năng này.

| | Đường A — Cron ngoài + API | Đường B — Làm hẳn trong ZCRM |
|---|---|---|
| Công sức | 2–3 tiếng | 3–5 ngày |
| Sửa code ZCRM | Không | Có |
| Chạy được khi nào | **Hôm nay** | Sau khi code xong |
| Đặt lịch ở đâu | Google Sheet / file cấu hình | Ngay trên giao diện |
| Ai đổi lịch được | Người biết mở Sheet | Trợ giảng bất kỳ |
| Báo cáo gửi/lỗi | Tự làm | Có sẵn trong CRM |

**Khuyến nghị: làm đường A trước.** Chạy 2–3 khoá thật, biết chính xác mình cần gì, rồi mới code đường B. Đường A không phải là bản vá tạm bợ — nhiều trung tâm chạy nó vĩnh viễn và không cần gì hơn.

---

## 4.2. Đường A — Cách hoạt động

```
┌──────────────┐   đọc lịch    ┌─────────────┐   POST /api/public/messages/send
│ Google Sheet │ ────────────► │ Script cron │ ──────────────────────────────► ZCRM ──► Nhóm Zalo
│  (lịch lớp)  │  mỗi phút     │ (trên VPS)  │       header: X-Api-Key
└──────────────┘               └─────────────┘
```

Script chạy mỗi phút, hỏi *"có tin nào tới giờ gửi không?"*. Có thì gọi API ZCRM. ZCRM đẩy tin vào nhóm qua nick Zalo đang kết nối.

---

## 4.3. Bước 1 — Lấy API key và ID nhóm

### Lấy API key
**Cài đặt → API & Webhook → Tạo API key**. Lưu lại ngay, chỉ hiện một lần.

Kiểm tra bằng lệnh:
```bash
curl -s http://IP-MAY-CHU:3080/api/public/contacts?limit=1 \
     -H "X-Api-Key: KEY-CUA-BAN"
```
Ra JSON là được. Ra `{"error":"Invalid API key"}` là sai key.

### Lấy ID nhóm và ID nick

Public API chưa có endpoint liệt kê nhóm, nên lấy qua API nội bộ (cần đăng nhập lấy token JWT), hoặc đơn giản hơn: **mở màn hình Marketing → Quét nhóm**, chọn nick, danh sách nhóm hiện ra kèm ID.

Đường lệnh nếu bạn quen dòng lệnh:
```bash
# 1. Đăng nhập lấy token
TOKEN=$(curl -s -X POST http://IP-MAY-CHU:3080/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ban@trungtam.vn","password":"..."}' | jq -r .accessToken)

# 2. Liệt kê nick
curl -s http://IP-MAY-CHU:3080/api/v1/zalo-accounts \
  -H "authorization: Bearer $TOKEN" | jq '.[] | {id, displayName, status}'

# 3. Liệt kê nhóm của một nick
curl -s http://IP-MAY-CHU:3080/api/v1/zalo-accounts/<ACCOUNT_ID>/groups \
  -H "authorization: Bearer $TOKEN" | jq '.[] | {id: .groupId, name}'
```

Ghi lại vào một bảng:
```
Nhóm                         groupId              nick trực
EXC - PHEU  - K12 - 07.2026  1234567890123456789  acc-uuid-treonhom
EXC - LOP   - K12 - 07.2026  9876543210987654321  acc-uuid-treonhom
EXC - ALUMNI                 5555555555555555555  acc-uuid-treonhom
VANHANH - NOI BO             1111111111111111111  acc-uuid-treonhom
```

---

## 4.4. Bước 2 — Gửi thử một tin

```bash
curl -X POST http://IP-MAY-CHU:3080/api/public/messages/send \
  -H "X-Api-Key: KEY-CUA-BAN" \
  -H "content-type: application/json" \
  -d '{
        "zaloAccountId": "acc-uuid-treonhom",
        "threadId":      "1234567890123456789",
        "threadType":    "group",
        "content":       "Test từ hệ thống — cả nhà bỏ qua tin này ạ 🙏"
      }'
```

Nhận `{"success":true}` và thấy tin trong nhóm là xong phần khó nhất.

### Bảng lỗi

| Trả về | Nghĩa | Xử lý |
|---|---|---|
| `401 API key required` / `Invalid API key` | Sai hoặc thiếu key | Kiểm tra header `X-Api-Key` |
| `400 zaloAccountId, threadId, and content are required` | Thiếu trường | Xem lại JSON |
| `404 Zalo account not found` | Nick không thuộc tổ chức này | Sai `zaloAccountId` |
| `409 NICK_ARCHIVED` | Nick đã bị xoá khỏi CRM | Dùng nick khác |
| **`422 Zalo account is not connected`** | **Nick đang rớt** | ⚠️ Lỗi hay gặp nhất. Xem mục 4.7 |
| `422 not active in pool` | Nick chưa nạp vào bộ nhớ | Khởi động lại app hoặc kết nối lại nick |

> ⚠️ **`threadType` phải đúng chữ `"group"`.** Bất kỳ giá trị nào khác đều bị hiểu là tin nhắn riêng — và `threadId` của nhóm dùng làm ID người thì tin biến mất không báo lỗi.

---

## 4.5. Bước 3 — Bảng lịch

Tạo Google Sheet (hoặc file CSV trên máy chủ) tên `lich-gui-tin`, có các cột:

| ngay | gio | groupId | zaloAccountId | noi_dung | trang_thai |
|---|---|---|---|---|---|
| 2026-07-29 | 19:00 | 1234...789 | acc-uuid | ⏰ Còn 1 tiếng nữa mình vào lớp… | |
| 2026-07-29 | 19:50 | 1234...789 | acc-uuid | 🔗 VÀO LỚP THÔI!\nLink: https://… | |
| 2026-07-29 | 22:00 | 1234...789 | acc-uuid | 🎉 Cảm ơn cả nhà…\n🎁 ƯU ĐÃI… | |
| 2026-07-30 | 20:00 | 1234...789 | acc-uuid | 💚 Cảm ơn 8 anh chị đã đăng ký… | |

- Cột `trang_thai` để trống. Script gửi xong ghi `da_gui` vào — **đây là thứ chống gửi trùng**, quan trọng nhất bảng.
- Xuống dòng trong nội dung dùng `\n`.

> 💡 Dùng Google Sheet có lợi thế lớn: trợ giảng sửa lịch được mà không cần đụng máy chủ. Đổi giờ học, đổi link Zoom, sửa câu chữ — sửa trong Sheet là xong.

---

## 4.6. Bước 4 — Script gửi

Đặt tại `/opt/zcrm-lich/gui-tin.mjs` trên chính máy chủ đang chạy ZCRM.

```javascript
#!/usr/bin/env node
/**
 * gui-tin.mjs — đọc lịch, gửi tin đúng giờ vào nhóm Zalo qua ZCRM Public API.
 * Chạy mỗi phút bằng cron. Bản dùng CSV; đổi doc_lich() nếu dùng Google Sheet.
 */
import fs from 'node:fs';

const ZCRM   = process.env.ZCRM_URL  || 'http://localhost:3080';
const KEY    = process.env.ZCRM_KEY;
const FILE   = process.env.LICH_FILE || '/opt/zcrm-lich/lich.csv';
const LOG    = '/opt/zcrm-lich/nhat-ky.log';

// Cửa sổ chấp nhận: tin trễ dưới 5 phút vẫn gửi (phòng cron nghẽn),
// trễ hơn thì BỎ QUA — thà không gửi còn hơn gửi "còn 1 tiếng" lúc 21h.
const TRE_TOI_DA_PHUT = 5;

function ghi(msg) {
  const dong = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, dong);
  console.log(dong.trim());
}

function doc_lich() {
  const dong = fs.readFileSync(FILE, 'utf8').trim().split('\n');
  const cot = dong[0].split(',');
  return dong.slice(1).map((d, i) => {
    const o = Object.fromEntries(d.split(',').map((v, j) => [cot[j], v]));
    o._dong = i + 2;
    return o;
  });
}

function danh_dau_da_gui(soDong) {
  const dong = fs.readFileSync(FILE, 'utf8').split('\n');
  dong[soDong - 1] = dong[soDong - 1].replace(/,\s*$/, ',da_gui');
  fs.writeFileSync(FILE, dong.join('\n'));
}

// Giờ Việt Nam, không phụ thuộc múi giờ máy chủ
function bay_gio_vn() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  return { ngay: s.slice(0, 10), phut: s.slice(11, 16) };
}

function lech_phut(gioLich, gioHienTai) {
  const [h1, m1] = gioLich.split(':').map(Number);
  const [h2, m2] = gioHienTai.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

async function gui(muc) {
  const res = await fetch(`${ZCRM}/api/public/messages/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Api-Key': KEY },
    body: JSON.stringify({
      zaloAccountId: muc.zaloAccountId,
      threadId:      muc.groupId,
      threadType:    'group',
      content:       muc.noi_dung.replace(/\\n/g, '\n'),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}

// ── Chạy ──────────────────────────────────────────────────────────────────────
const { ngay, phut } = bay_gio_vn();
const den_han = doc_lich().filter((m) => {
  if (m.trang_thai?.trim()) return false;         // đã gửi rồi
  if (m.ngay !== ngay) return false;
  const lech = lech_phut(m.gio, phut);
  return lech >= 0 && lech <= TRE_TOI_DA_PHUT;
});

if (!den_han.length) process.exit(0);

for (const [i, muc] of den_han.entries()) {
  // Lệch ngẫu nhiên 0–40 giây giữa các nhóm — đừng bắn nhiều nhóm cùng một giây.
  if (i > 0) await new Promise((r) => setTimeout(r, 3000 + Math.random() * 40_000));
  try {
    await gui(muc);
    danh_dau_da_gui(muc._dong);
    ghi(`OK  nhóm=${muc.groupId} giờ=${muc.gio}`);
  } catch (e) {
    ghi(`LỖI nhóm=${muc.groupId} giờ=${muc.gio} → ${e.message}`);
    // KHÔNG đánh dấu đã gửi → lần chạy sau thử lại, trong giới hạn 5 phút
  }
}
```

Cài cron:
```bash
chmod +x /opt/zcrm-lich/gui-tin.mjs

crontab -e
# thêm dòng:
* * * * * ZCRM_KEY=key-cua-ban /usr/bin/node /opt/zcrm-lich/gui-tin.mjs >> /opt/zcrm-lich/cron.log 2>&1
```

Kiểm tra bằng cách thêm một dòng lịch cách hiện tại 2 phút, rồi `tail -f /opt/zcrm-lich/nhat-ky.log`.

> 💡 Nếu bạn đã dùng **n8n** hoặc **Make**, thay script này bằng một workflow: node Schedule → node Google Sheets → node HTTP Request. Cùng nguyên lý, không phải viết code, và có giao diện xem lịch sử chạy.

---

## 4.7. ⚠️ Bốn rủi ro thật và cách phòng

### Rủi ro 1 — Nick rớt lúc 19h50 *(nghiêm trọng nhất)*

Nick không kết nối thì API trả `422` và **cả lớp không nhận được link Zoom**.

**Phòng:**
```
1. Bật cảnh báo "Nick mất kết nối" (Cài đặt → Thông báo hệ thống)
2. Thêm bước KIỂM TRA SỚM: cron lúc 18h30 gọi
   GET /api/v1/zalo-accounts, nick nào không "connected" thì
   báo vào nhóm nội bộ ngay — còn 80 phút để xử lý
3. Khai báo nick dự phòng trong bảng lịch (cột zaloAccountId_backup),
   script thử nick chính, 422 thì chuyển nick dự phòng
```
Chỉ riêng bước 2 đã loại bỏ gần hết sự cố này.

### Rủi ro 2 — Gửi trùng

Cron chạy mỗi phút. Nếu script lỗi trước lúc ghi `da_gui`, phút sau nó gửi lại → nhóm nhận 2 tin giống nhau.

**Phòng:** ghi `da_gui` **ngay sau khi API trả về thành công**, và giữ cửa sổ trễ tối đa 5 phút. Nếu cần chắc chắn tuyệt đối, thêm khoá file:
```bash
* * * * * flock -n /tmp/zcrm-lich.lock /usr/bin/node /opt/zcrm-lich/gui-tin.mjs
```

### Rủi ro 3 — Gửi nhầm nhóm

Copy nhầm `groupId` là tin offer bay vào nhóm alumni hoặc nhóm học viên đã đóng tiền.

**Phòng:** thêm cột `ten_nhom` vào bảng lịch để người đọc kiểm tra được, và **luôn thử tin đầu tiên của mỗi khoá vào nhóm nội bộ trước**.

### Rủi ro 4 — Bắn nhiều nhóm cùng một giây

Trực 8 nhóm, 20h00 bắn cả 8 cùng lúc → Zalo nhìn thấy hành vi máy rõ ràng.

**Phòng:** script trên đã có lệch ngẫu nhiên 3–43 giây giữa các nhóm. Đừng bỏ đoạn đó đi.

---

## 4.8. Đường B — Làm hẳn trong ZCRM 🔧 [CẦN CODE]

Khi bạn đã chạy 2–3 khoá bằng đường A và biết rõ mình cần gì, đây là hình dung sản phẩm.

### Giao diện mong muốn

```
Marketing → Lịch nhóm → Tạo lịch

  Tên lịch     [ Nhắc lịch học lớp phễu Excel            ]
  Nhóm         [ ☑ EXC - PHEU - K12   ☑ EXC - PHEU - K13 ]
  Nick gửi     [ Trợ giảng Mai ▾ ]   Dự phòng [ Cô Lan ▾ ]

  Lặp lại      ( ) Một lần   (•) Hàng tuần   ( ) Theo lịch buổi học
               Thứ [☑T3]  Giờ [20:00]

  Mốc gửi
   ┌──────────────────────────────────────────────────────┐
   │ T-60 phút  │ [Chọn mẫu ▾ Nhắc còn 1 tiếng      ] │ ✏️ │
   │ T-10 phút  │ [Chọn mẫu ▾ Gửi link Zoom         ] │ ✏️ │
   │ T+120 phút │ [Chọn mẫu ▾ Offer cuối buổi       ] │ ✏️ │
   │ + Thêm mốc                                          │
   └──────────────────────────────────────────────────────┘

  Lệch ngẫu nhiên  [ ±30 ] giây      ☑ Bỏ qua nếu trễ quá [5] phút
  ☑ Báo nhóm nội bộ nếu gửi lỗi

                              [ Xem trước ]  [ Lưu & Kích hoạt ]
```

**Điểm mấu chốt của thiết kế: mốc gửi tính TƯƠNG ĐỐI so với giờ học (T-60, T-10, T+120), không phải giờ tuyệt đối.** Đổi giờ học từ 20h sang 19h30 thì chỉ sửa một chỗ, cả ba mốc tự dịch theo.

### Việc cần code

Xem spec chi tiết ở [Chương 13](13-lo-trinh-vibe-coding.md) mục 13.2. Tóm tắt:

| Việc | Ước lượng |
|---|---|
| Thêm bảng `group_schedules` + `group_schedule_runs` (chống trùng) | 0.5 ngày |
| Worker đọc lịch, đẩy hàng đợi, gửi qua `zaloOps.sendMessage(threadType=1)` | 1.5 ngày |
| API CRUD + màn hình đặt lịch | 1.5 ngày |
| Báo cáo: đã gửi / lỗi / nick rớt | 0.5 ngày |

> 💡 **Đừng tái sử dụng bảng `automation_broadcasts`** cho việc này. Nó thiết kế cho DM theo tệp học viên (`segmentSpec` → danh sách contact), khác hẳn mô hình "một nhóm, một chuỗi mốc thời gian". Nhồi vào sẽ vướng lâu dài. Bảng mới sạch hơn nhiều.

---

## 4.9. Bộ lịch mẫu — chép về dùng luôn

### Lớp phễu, học 20h00 tối Thứ 3

| Mốc | Giờ | Nội dung |
|---|---|---|
| D-3 | 20:00 | Chào mừng + giới thiệu giảng viên |
| D-1 | 20:00 | "Mai học rồi" + dặn chuẩn bị |
| **D0 T-60** | **19:00** | Còn 1 tiếng + nhắc phần quà cuối buổi |
| **D0 T-10** | **19:50** | Link Zoom + "vào rồi nhắn OK" |
| D0 T+30 | 20:30 | Nhắc người vào muộn, gửi lại link |
| **D0 T+120** | **22:00** | Quà + bài tập + offer + hạn |
| D+1 | 20:00 | Bằng chứng xã hội + nhắc ưu đãi |
| D+2 | 20:00 | Xử lý 3 phản đối phổ biến |
| D+3 | 12:00 | Hết ưu đãi + mời khoá sau |

### Nhóm lớp chính thức, học 20h00 T2-T4-T6

| Mốc | Giờ | Nội dung |
|---|---|---|
| T-60 | 19:00 | Nhắc buổi số N, chủ đề hôm nay |
| T-10 | 19:50 | Link Zoom |
| T+120 | 22:00 | Tài liệu + bài tập buổi này + hạn nộp |
| Chủ nhật | 20:00 | Tổng kết tuần, khen người nộp đủ bài |

### Nhóm alumni — tối đa 2 tin/tuần

| Mốc | Nội dung |
|---|---|
| Thứ 4 hàng tuần | 1 mẹo ngắn dùng được ngay (không bán gì) |
| Khi có khoá mới | Ưu đãi riêng cho học viên cũ |

---

## 4.10. Việc cần làm cuối chương

- [ ] Tạo API key, gửi thử thành công một tin vào nhóm nội bộ
- [ ] Lập bảng `groupId` ↔ tên nhóm ↔ nick trực
- [ ] Dựng bảng lịch cho khoá gần nhất, đủ 9 mốc ở mục 4.9
- [ ] Cài script + cron, thử một tin cách hiện tại 2 phút
- [ ] **Thêm cron kiểm tra nick lúc 18h30** — bước phòng thủ quan trọng nhất
- [ ] Chạy thử trọn một khoá bằng đường A trước khi tính tới đường B

---

➡️ Tiếp theo: **[Chương 5 — Hermes agent trực nhóm](05-hermes-agent-truc-nhom.md)**
