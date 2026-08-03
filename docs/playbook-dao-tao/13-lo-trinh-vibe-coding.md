# Chương 13 — Lộ trình vibe coding

*Dành cho người sẽ viết code. Đọc 25 phút.*

Chương này là **spec kỹ thuật** cho các chức năng còn thiếu: đụng file nào, dữ liệu ra sao, cạm bẫy ở đâu. Viết dựa trên mã nguồn ZCRM v3.4 nhánh Community.

---

## 13.0. Bản đồ mã nguồn — đọc trước khi sửa gì

| Khu vực | Đường dẫn | Ghi chú |
|---|---|---|
| Lược đồ CSDL | [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma) | Prisma, Postgres |
| API công khai (X-Api-Key) | [backend/src/modules/api/public-api-routes.ts](../../backend/src/modules/api/public-api-routes.ts) | 9 endpoint |
| Webhook đi ra | [backend/src/modules/api/webhook-service.ts](../../backend/src/modules/api/webhook-service.ts) | `emitWebhook()` |
| Gửi tin Zalo | [backend/src/shared/zalo-operations.ts](../../backend/src/shared/zalo-operations.ts) | `sendMessage(accountId, threadId, threadType, msg, io?)` |
| Hạn mức gửi | [backend/src/modules/zalo/sdk-limit-service.ts](../../backend/src/modules/zalo/sdk-limit-service.ts) | `message: { daily: 200, burst: 20 }` |
| Bể kết nối nick | [backend/src/modules/zalo/zalo-pool.ts](../../backend/src/modules/zalo/zalo-pool.ts) | `zaloPool.getApi(accountId)` |
| Xử lý tin đến | [backend/src/modules/chat/message-handler.ts](../../backend/src/modules/chat/message-handler.ts) | Nơi `emitWebhook` được gọi |
| Đăng ký cron | [backend/src/app.ts](../../backend/src/app.ts) | Mẫu: `startEngagementCron()` |
| Menu Marketing Community | [frontend/src/views/marketing/CommunityMarketingShell.vue](../../frontend/src/views/marketing/CommunityMarketingShell.vue) | Chỉ 2 mục |
| Định tuyến | [frontend/src/router/index.ts](../../frontend/src/router/index.ts) | Cổng `!isExtension` |
| Nhà cung cấp AI | [backend/src/modules/ai/provider-registry.ts](../../backend/src/modules/ai/provider-registry.ts) | `PROVIDER_IDS` cứng 5 id |
| Gọi model AI | [backend/src/modules/ai/ai-service.ts](../../backend/src/modules/ai/ai-service.ts) | Điều phối theo provider |

### Ba quy ước của mã nguồn này — tôn trọng nếu không muốn vỡ

**1. Đa tổ chức (multi-tenant).** Gần như mọi bảng có `orgId`. Truy vấn thiếu `orgId` là lỗ hổng rò rỉ dữ liệu giữa các tổ chức. Có sẵn `runSystemQuery` / `withTenant` trong `shared/tenant/tenant-context.ts` — dùng chúng.

**2. Ranh giới Community ↔ EE.** Bản EE nạp qua `@ee/*` (xem `frontend/src/_ee-stubs/`). Code Community **không được** phụ thuộc vào `@ee/*` nếu muốn chạy độc lập. Backend có `shared/ee-registry/` với các hàm rỗng mặc định — đây là điểm cắm đúng.

**3. Giấy phép AGPL-3.0.** Mỗi file mới cần hai dòng đầu:
```typescript
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 <tên bạn>
```

---

## 13.1. Thứ tự làm — 5 giai đoạn

| GĐ | Việc | Công sức | Sửa ZCRM? |
|---|---|---|---|
| **0** | Cron ngoài + API gửi tin nhóm ([Ch. 4](04-lich-gui-tin-tu-dong.md)) | 2–3 tiếng | ❌ Không |
| **1** | Service webhook + agent Hermes ([Ch. 5](05-hermes-agent-truc-nhom.md)) | 1–2 ngày | ❌ Không |
| **2** | Vá API nhỏ để bớt vướng (13.5) | 0.5 ngày | ✅ Có, ít |
| **3** | Lịch nhóm hẳn trong ZCRM (13.2) | 3–5 ngày | ✅ Có |
| **4** | Kênh `zalo_group` cho automation (13.6) | 1–2 tuần | ✅ Nhiều |

**Chạy thật giai đoạn 0 và 1 trọn một khoá trước khi động vào giai đoạn 3.** Bạn sẽ biết chính xác cần gì, và tránh xây thứ không ai dùng.

Giai đoạn 4 chỉ đáng làm nếu bạn định đóng góp ngược lên dự án hoặc phục vụ nhiều tổ chức.

---

## 13.2. Spec · Lịch gửi tin nhóm trong ZCRM

### Bảng dữ liệu

Thêm vào [schema.prisma](../../backend/prisma/schema.prisma):

```prisma
// Lịch gửi tin định kỳ vào NHÓM Zalo. Khác AutomationBroadcast:
// broadcast = DM theo tệp contact; cái này = nhóm + chuỗi mốc thời gian tương đối.
model GroupSchedule {
  id            String   @id @default(uuid())
  orgId         String   @map("org_id")
  name          String
  groupIds      String[] @default([]) @map("group_ids")      // externalThreadId của nhóm
  zaloAccountId String   @map("zalo_account_id")
  fallbackNickId String? @map("fallback_nick_id")            // nick dự phòng khi nick chính rớt

  // Neo thời gian. anchorKind='weekly' → anchorDays + anchorTime.
  // Mốc gửi tính TƯƠNG ĐỐI so với neo (offsetMinutes ở bảng con).
  anchorKind    String   @default("weekly")  // 'once' | 'weekly' | 'course_session'
  anchorDays    Int[]    @default([]) @map("anchor_days")     // 0=CN … 6=T7
  anchorTime    String   @map("anchor_time")                  // "20:00" giờ VN
  anchorDate    DateTime? @map("anchor_date")                 // cho 'once'
  timezone      String   @default("Asia/Ho_Chi_Minh")

  jitterSeconds Int      @default(30) @map("jitter_seconds")
  maxLateMinutes Int     @default(5)  @map("max_late_minutes") // trễ hơn → BỎ QUA
  notifyOnError Boolean  @default(true) @map("notify_on_error")

  enabled       Boolean  @default(true)
  createdById   String   @map("created_by_id")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  org   Organization        @relation(fields: [orgId], references: [id], onDelete: Cascade)
  steps GroupScheduleStep[]
  runs  GroupScheduleRun[]

  @@index([orgId, enabled])
  @@map("group_schedules")
}

model GroupScheduleStep {
  id            String   @id @default(uuid())
  scheduleId    String   @map("schedule_id")
  stepOrder     Int      @map("step_order")
  offsetMinutes Int      @map("offset_minutes")   // -60 = T-60; +120 = T+120
  content       String   @db.Text
  attachments   Json     @default("[]")           // key media trong MinIO/S3
  enabled       Boolean  @default(true)

  schedule GroupSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@unique([scheduleId, stepOrder])
  @@map("group_schedule_steps")
}

// Sổ chống gửi trùng. UNIQUE là toàn bộ cơ chế idempotent — worker
// INSERT trước khi gửi; trùng khoá nghĩa là mốc này đã xử lý rồi.
model GroupScheduleRun {
  id          String   @id @default(uuid())
  scheduleId  String   @map("schedule_id")
  stepId      String   @map("step_id")
  groupId     String   @map("group_id")
  firedForUtc DateTime @map("fired_for_utc")   // thời điểm mốc ĐÁNG LẼ chạy
  status      String   @default("pending")     // pending|sent|failed|skipped
  errorText   String?  @map("error_text") @db.Text
  sentAt      DateTime? @map("sent_at")
  createdAt   DateTime @default(now()) @map("created_at")

  schedule GroupSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@unique([stepId, groupId, firedForUtc])     // ⭐ chống trùng nằm ở đây
  @@index([scheduleId, status])
  @@map("group_schedule_runs")
}
```

### Worker

File mới `backend/src/modules/group-schedule/group-schedule-cron.ts`, theo đúng mẫu của [engagement-cron.ts](../../backend/src/modules/engagement/engagement-cron.ts):

```typescript
import cron from 'node-cron';

export function startGroupScheduleCron(): void {
  cron.schedule('* * * * *', async () => {   // mỗi phút
    try { await tick(); }
    catch (err) { logger.error('[group-schedule] tick error', err); }
  });
}

async function tick() {
  const now = new Date();

  for (const sch of await layLichDangBat()) {
    for (const step of sch.steps) {
      for (const groupId of sch.groupIds) {
        const firedFor = tinhMocGanNhat(sch, step, now);   // theo giờ VN
        if (!firedFor) continue;

        const treP = (now.getTime() - firedFor.getTime()) / 60000;
        if (treP < 0 || treP > sch.maxLateMinutes) continue;

        // ⭐ Chốt chặn trùng: INSERT trước, gửi sau.
        // Trùng unique → mốc này đã có tiến trình khác lo, bỏ qua.
        let run;
        try {
          run = await prisma.groupScheduleRun.create({
            data: { scheduleId: sch.id, stepId: step.id, groupId, firedForUtc: firedFor },
          });
        } catch { continue; }

        await hangDoi.add({ runId: run.id }, {
          delay: Math.random() * sch.jitterSeconds * 1000,
        });
      }
    }
  }
}
```

Bộ xử lý hàng đợi:
```typescript
async function xuLy({ runId }) {
  const run = await layRun(runId);
  const nickId = await chonNick(run);           // chính → dự phòng nếu rớt

  if (!nickId) {
    await danhDau(run, 'failed', 'Mọi nick đều mất kết nối');
    await baoNhomNoiBo(run);
    return;
  }

  try {
    // threadType = 1 nghĩa là NHÓM
    await zaloOps.sendMessage(nickId, run.groupId, 1, { msg: noiDung });
    await danhDau(run, 'sent');
  } catch (err) {
    await danhDau(run, 'failed', String(err));
    if (run.schedule.notifyOnError) await baoNhomNoiBo(run);
  }
}
```

### Bốn cạm bẫy

| Cạm bẫy | Cách tránh |
|---|---|
| **Múi giờ** | Máy chủ thường chạy UTC. Mọi phép tính mốc phải quy về `Asia/Ho_Chi_Minh` rồi mới đổi sang UTC. Sai chỗ này là gửi lệch 7 tiếng — lỗi phổ biến nhất. |
| **Gửi trùng** | Dựa vào `@@unique([stepId, groupId, firedForUtc])`, đừng dựa vào cờ trong bộ nhớ. Nhiều tiến trình sẽ phá cờ trong bộ nhớ. |
| **Nick rớt** | Luôn có nick dự phòng + báo động sớm ([UC-14](12-usecase-mo-rong.md)). Đừng để worker im lặng thất bại. |
| **Trễ nhiều giờ** | `maxLateMinutes` là bắt buộc. Máy chủ sập lúc 19h, sống lại lúc 23h mà bắn "còn 1 tiếng nữa vào lớp" là tệ hơn không gửi. |

### Giao diện

Thêm mục vào [CommunityMarketingShell.vue](../../frontend/src/views/marketing/CommunityMarketingShell.vue):
```javascript
const navItems = [
  { to: '/marketing/group-scan',      label: 'Quét nhóm',      icon: 'mdi-account-group-outline' },
  { to: '/marketing/lists',           label: 'Tệp khách hàng', icon: 'mdi-format-list-bulleted' },
  { to: '/marketing/group-schedules', label: 'Lịch nhóm',      icon: 'mdi-calendar-clock' },  // MỚI
];
```
Đăng ký route trong nhánh `!isExtension` của [router/index.ts](../../frontend/src/router/index.ts), thêm nhãn vào `ROUTE_TITLES`.

Mô tả màn hình ở [Chương 4](04-lich-gui-tin-tu-dong.md) mục 4.8.

---

## 13.3. Spec · Service trung gian cho agent Hermes

Đây là dịch vụ **độc lập**, không nằm trong ZCRM.

```
zcrm-agent/
├─ index.mjs          # máy chủ HTTP nhận webhook
├─ hang-doi.mjs       # hàng đợi trong bộ nhớ hoặc Redis
├─ phanh.mjs          # 5 phanh an toàn — file quan trọng nhất
├─ hermes.mjs         # gọi Hermes
├─ zcrm.mjs           # gọi ngược ZCRM API
├─ cau-hinh.mjs       # bảng NHOM_TRUC, từ khoá vùng đỏ
└─ nhat-ky.mjs
```

### Điểm sống còn: trả 200 ngay lập tức

```javascript
// index.mjs
app.post('/webhook', async (req, res) => {
  res.status(200).send('ok');        // ⭐ TRẢ TRƯỚC, XỬ LÝ SAU
  hangDoi.day(req.body);             // không await
});
```

**Vì sao bắt buộc:** `emitWebhook()` trong [webhook-service.ts:54](../../backend/src/modules/api/webhook-service.ts) là bắn-và-quên — lỗi chỉ `.catch()` ghi cảnh báo, **không thử lại**. Nếu bạn để ZCRM chờ Hermes nghĩ 8 giây, request treo và tin có thể mất vĩnh viễn.

### Lưới an toàn cho webhook mất

Cron 5 phút:
```javascript
// Lưới vớt: hội thoại chưa được trả lời mà agent chưa từng thấy
const { conversations } = await zcrm.get('/api/public/conversations?limit=100');
const sot = conversations.filter(c =>
  c.threadType === 'group' && !c.isReplied && !daXuLy.has(c.id));
for (const c of sot) await hangDoi.day(taoSuKienGia(c));
```

### Năm phanh

```javascript
// phanh.mjs — thứ tự QUAN TRỌNG: chặn rẻ trước, gọi model sau

export const TU_KHOA_VUNG_DO = [
  'chuyển khoản', 'số tài khoản', 'stk', 'chuyển tiền', 'thanh toán vào',
  'đăng ký luôn', 'đóng tiền luôn', 'muốn học luôn',
  'giảm thêm', 'bớt', 'rẻ hơn được không',
  'lừa đảo', 'hoàn tiền', 'trả lại tiền', 'khiếu nại', 'báo công an',
];

export const TU_KHOA_VUNG_DEN = [
  'điểm danh', 'ok', 'oke', 'vâng', 'dạ', 'cảm ơn', 'thanks', 'ạ',
];

export function phanh1_vungDen(noiDung) {
  const s = noiDung.trim().toLowerCase();
  if (s.length < 4) return true;
  return TU_KHOA_VUNG_DEN.some(t => s === t || s === t + ' ạ');
}

export function phanh2_vungDo(noiDung) {
  const s = noiDung.toLowerCase();
  return TU_KHOA_VUNG_DO.some(t => s.includes(t));
}

export async function phanh3_hanMuc(groupId) {
  return (await demTrongGio(groupId)) >= 10 || (await demTrongNgay(groupId)) >= 40;
}

export function phanh4_khongChac(kq) {
  return kq.doTinCay < 0.7 || kq.canNguoiThat;
}

export function phanh5_dauRa(traLoi) {
  // Chặn agent lỡ đọc số tài khoản hoặc bịa giá
  if (/\d{8,}/.test(traLoi)) return 'Chứa dãy số dài — nghi số tài khoản';
  if (/\d+\s*(k|tr|triệu|nghìn|đồng|vnđ)/i.test(traLoi)) return 'Chứa số tiền';
  return null;
}
```

> ⚠️ **Phanh 2 chạy TRƯỚC khi gọi Hermes.** Vừa rẻ hơn, vừa không phụ thuộc vào việc model có ngoan hay không. Đừng tin vào prompt để chặn vùng đỏ — prompt là lớp phòng thủ thứ hai, không phải thứ nhất.

### Trả lời vào nhóm

```javascript
// zcrm.mjs
export async function guiVaoNhom({ nickId, groupId, noiDung }) {
  const res = await fetch(`${ZCRM}/api/public/messages/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Api-Key': KEY },
    body: JSON.stringify({
      zaloAccountId: nickId,
      threadId: groupId,
      threadType: 'group',      // ⭐ chuỗi 'group', không phải số 1
      content: noiDung,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}
```

> Public API nhận `threadType: "group"` (chuỗi) rồi tự đổi thành `1`. Còn `zaloOps.sendMessage` nội bộ thì nhận thẳng số `1`. Hai chỗ khác nhau — đây là nguồn nhầm lẫn hay gặp.

---

## 13.4. Spec · Điểm danh & theo dõi nộp bài *(UC-01, UC-04)*

Nằm luôn trong service trung gian, không cần sửa ZCRM:

```javascript
const MAU_DIEM_DANH = /^(ok|oke|okay|có mặt|em vào rồi|vào rồi|em có mặt|✋|🙋)/i;

async function xuLyDiemDanh(suKien, nhom) {
  if (!dangTrongKhungDiemDanh(nhom)) return;      // 19:50–20:30
  if (!MAU_DIEM_DANH.test(suKien.content.trim())) return;

  const contactId = await timContact(suKien.senderUid);
  await zcrm.put(`/api/public/contacts/${contactId}`, {
    status: 'Có mặt buổi học',
  });
  await ghiNhan(nhom.id, contactId, 'diem_danh', nhom.buoiSo);
}

async function xuLyNopBai(suKien, nhom) {
  if (nhom.tang !== 'lop') return;
  if (!['image', 'file'].includes(suKien.contentType)) return;
  await ghiNhan(nhom.id, await timContact(suKien.senderUid), 'nop_bai', nhom.buoiSo);
}
```

**Điểm vướng:** webhook chỉ có `senderUid` (UID Zalo), không có `contactId`. Cách nối: `GET /api/public/contacts` rồi so khớp, hoặc tự dựng bảng ánh xạ `senderUid → contactId` và bổ sung dần. Với nhóm vài trăm người thì bảng ánh xạ trong SQLite/Redis là đủ.

> 💡 Đây chính là chỗ đáng cải tiến ZCRM nhất: thêm `contactId` và `zaloAccountId` vào payload webhook. Xem 13.5.

---

## 13.5. Bốn bản vá nhỏ đáng làm nhất

Tổng cộng khoảng **nửa ngày**, xoá bỏ phần lớn chỗ vướng ở trên.

### Vá 1 · Bổ sung ngữ cảnh vào payload webhook ⭐ *đáng nhất*

[message-handler.ts:612](../../backend/src/modules/chat/message-handler.ts) hiện gửi:
```typescript
emitWebhook(account.orgId, msg.isSelf ? 'message.sent' : 'message.received', {
  messageId, conversationId, senderUid, content, contentType, sentAt,
});
```
Thêm bốn trường (đều đã có sẵn trong phạm vi hàm):
```typescript
  zaloAccountId: account.id,
  threadType:    conversation.threadType,      // 'user' | 'group'
  threadId:      conversation.externalThreadId,
  contactId,
```
**Lợi:** agent trả lời được ngay mà không cần tra ngược. Bỏ hẳn bảng ánh xạ ở 13.4. Thay đổi cộng thêm, không phá ai đang dùng.

### Vá 2 · Endpoint lấy một hội thoại

Public API hiện chỉ có danh sách. Thêm vào [public-api-routes.ts](../../backend/src/modules/api/public-api-routes.ts):
```typescript
app.get('/api/public/conversations/:id', async (request, reply) => {
  const orgId = (request as any).orgId as string;
  const { id } = request.params as { id: string };
  const conv = await prisma.conversation.findFirst({
    where: { id, orgId },
    select: {
      id: true, threadType: true, externalThreadId: true, zaloAccountId: true,
      lastMessageAt: true, isReplied: true,
      contact: { select: { id: true, fullName: true, phone: true } },
    },
  });
  if (!conv) return reply.status(404).send({ error: 'Conversation not found' });
  return { conversation: conv };
});
```
~20 dòng, giải quyết dứt điểm việc thiếu `zaloAccountId`.

### Vá 3 · Liệt kê nhóm qua Public API

```typescript
app.get('/api/public/groups', async (request, reply) => {
  const orgId = (request as any).orgId as string;
  const groups = await prisma.conversation.findMany({
    where: { orgId, threadType: 'group', deletedAt: null },
    select: { id: true, externalThreadId: true, groupName: true, zaloAccountId: true },
  });
  return { groups };
});
```
Bỏ được bước đăng nhập JWT thủ công ở [Chương 4](04-lich-gui-tin-tu-dong.md) mục 4.3. Bốn trường trên đều có sẵn trong model `Conversation`.

### Vá 4 · Cho phép khai tên nhà cung cấp AI riêng

[provider-registry.ts](../../backend/src/modules/ai/provider-registry.ts) khoá cứng:
```typescript
const PROVIDER_IDS = ['anthropic', 'gemini', 'openai', 'qwen', 'kimi'] as const;
```
Thêm `'hermes'` vào danh sách, thêm một dòng vào `buildCatalog()`, và một nhánh trong [ai-service.ts](../../backend/src/modules/ai/ai-service.ts):
```typescript
if (provider === 'hermes')
  return generateWithOpenaiCompat(`${baseUrl}/v1/chat/completions`,
    apiKey, model, system, prompt, maxTokens, 'max_tokens');
```
Cần thêm biến môi trường `HERMES_BASE_URL` / `HERMES_AUTH_TOKEN` trong `config`. Khoảng 30 phút, và giao diện hiện đúng chữ "Hermes" thay vì phải đội lốt `kimi`.

> Nhớ chọn đúng tham số token: `max_tokens` (chuẩn cũ) hay `max_completion_tokens` (OpenAI đời mới). Sai là lỗi 400 ngay tin đầu tiên.

---

## 13.6. Giai đoạn 4 · Kênh `zalo_group` cho automation

Chỉ làm nếu bạn định đóng góp ngược lên dự án hoặc phục vụ nhiều tổ chức. Phạm vi:

```
1. Thêm channel 'zalo_group' vào Block, AutomationSequence, AutomationBroadcast
2. segmentSpec phải hiểu kiểu {kind:'groups', groupIds:[...]} bên cạnh
   kiểu contact hiện tại — đây là phần khó nhất, vì toàn bộ engine
   hiện giả định "một task = một contact"
3. Worker gửi phải đổi threadType theo channel
4. Thống kê: đếm theo nhóm thay vì theo contact
5. Giao diện: bộ chọn nhóm trong trình tạo Broadcast
```

**Đánh giá thật lòng:** đây là 1–2 tuần và đụng vào phần lõi đang chạy ổn. Với một trung tâm đơn lẻ, spec 13.2 (bảng riêng) cho kết quả tương đương với 1/5 công sức và gần như không có rủi ro hồi quy. Chỉ chọn 13.6 nếu bạn thật sự cần tính tổng quát.

---

## 13.7. Kiểm thử — tối thiểu phải có

```
□ Múi giờ: đặt máy chủ về UTC, xác nhận mốc 20:00 VN chạy đúng 13:00 UTC
□ Chống trùng: chạy 3 tiến trình worker song song, phải chỉ 1 tin được gửi
□ Nick rớt: ngắt nick, xác nhận chuyển sang nick dự phòng và có báo động
□ Trễ: dừng worker 20 phút rồi bật lại, xác nhận mốc quá hạn bị BỎ QUA
□ Vùng đỏ: gửi "cho em xin số tài khoản" vào nhóm thử, agent phải IM
□ Phanh đầu ra: ép Hermes trả lời có số tiền, phanh 5 phải chặn
□ Hạn mức: giả lập 50 tin/giờ vào một nhóm, phanh 3 phải chặn
□ Webhook mất: tắt service 5 phút, xác nhận lưới vớt bắt được tin sót
□ Đa tổ chức: tạo 2 tổ chức, xác nhận lịch của tổ chức A không chạm nhóm của B
```

Ba dòng đầu là ba lỗi gây thiệt hại thật trong vận hành. Đừng bỏ.

---

## 13.8. Việc cần làm cuối chương

- [ ] Đọc qua 12 file trong bản đồ 13.0 để nắm địa hình
- [ ] Chạy giai đoạn 0 (cron + API) trọn một khoá thật
- [ ] Dựng service trung gian với đủ 5 phanh, chạy **chế độ câm 1 tuần**
- [ ] Làm 4 bản vá ở 13.5 — nửa ngày, lợi nhất trên mỗi giờ bỏ ra
- [ ] Chỉ sau đó mới quyết định có làm 13.2 không
- [ ] Viết kiểm thử cho 3 dòng đầu ở 13.7 trước khi đưa vào chạy thật

---

➡️ Tiếp theo: **[Chương 14 — Lỗi thường gặp & checklist](14-loi-thuong-gap-va-checklist.md)**
