# Hướng dẫn nối Rocket Agent làm bộ não cho AI chăm sóc khách hàng

Mặc định AI agent của CRM gọi model trên đám mây qua OpenRouter. Tài liệu này hướng dẫn
cách thay bộ não đó bằng **Rocket Agent** — agent chạy ngay trên máy đang chạy CRM.

Đọc [HUONG-DAN-CAU-HINH-AI-AGENT.md](./HUONG-DAN-CAU-HINH-AI-AGENT.md) trước: phần nạp tài
liệu, gán agent theo nick/nhóm, giới hạn số tin mỗi ngày đều giữ nguyên, không đổi gì.

## Chọn bộ não nào

| | OpenRouter | Rocket Agent |
|---|---|---|
| Chạy ở đâu | Đám mây | Cùng máy với CRM |
| Chi phí mỗi lượt | Trả theo token | 0 (trừ khi profile Rocket tự gọi model đám mây) |
| Tốc độ trả lời | 3-10 giây | 30-90 giây (agent chạy nhiều bước, dùng công cụ) |
| Năng lực | Chỉ sinh văn bản | Có kỹ năng, trí nhớ dài hạn, công cụ riêng của profile |
| Khi nó hỏng | Hiếm | Gateway tắt là im hoàn toàn → **phải cấu hình dự phòng** |

Rocket hợp khi bạn cần agent có nghiệp vụ riêng và trí nhớ dài hạn. Cần trả lời nhanh và
đơn giản thì OpenRouter vẫn tốt hơn.

---

## Hai cách CRM gọi Rocket

Đặt bằng `ROCKET_AGENT_TRANSPORT` trong `.env` của backend.

| | `http` (mặc định) | `cli` |
|---|---|---|
| Cách gọi | Cổng OpenAI-compatible của từng profile | `hermes -p <profile> -z "<prompt>"` |
| Phải chạy gateway | Có — gateway tắt là agent im hoàn toàn | Không |
| Phải khớp khoá API | Có, nhưng CRM tự đọc khoá từ `config.yaml` của profile | Không |
| Mỗi tin tốn | Tiến trình nóng sẵn | 1 tiến trình mới (~220MB, cộng vài giây khởi động agent) |
| Số token trong nhật ký | Có | Không có (`-z` chỉ in text) |
| Backend chạy trong Docker | Dùng được | **Không dùng được** — container không spawn được tiến trình của máy host |

Backend đóng gói Docker (mặc định của dự án này) thì bắt buộc `http`. Chỉ chọn `cli` khi
backend chạy TRỰC TIẾP trên máy có Rocket và ĐÚNG user OS sở hữu `~/.rocketagent/`.

> **Mỗi profile Rocket là một cổng riêng.** Rocket không có gateway đa profile định tuyến
> theo đường dẫn: `api_server` khai trong `config.yaml` của **từng profile**, mỗi cái chiếm
> một cổng (`tuvan-bds` → 8642, `ban-hang` → 8643…). Đường dẫn `/p/<tên>/v1/...` **không tồn
> tại** — Hermes chỉ dùng tiền tố `/p/<tên>/` cho webhook. CRM tự đọc cổng + khoá của từng
> profile nên bạn không phải khai tay từng cổng (mục 2.1).

**Dùng `cli` thì bỏ qua mục 1.1 và 1.4** — không cần cổng API, không cần gateway.

---

## 1. Cấu hình phía Rocket Agent

Rocket Agent quản bằng lệnh `hermes`.

### 1.1 Bật cổng API — *chỉ khi dùng `ROCKET_AGENT_TRANSPORT=http`*

Bật cho **từng profile** sẽ dùng làm bộ não, trong
`~/.rocketagent/profiles/<tên-profile>/config.yaml`:

```yaml
platforms:
  api_server:
    enabled: true
    extra:
      host: "127.0.0.1"         # KHÔNG đổi thành 0.0.0.0
      port: 8642                # MỖI PROFILE MỘT CỔNG KHÁC NHAU
      key: "<chuỗi ngẫu nhiên ≥16 ký tự>"
      model_name: "rocket-zalo" # alias model, CRM để trống là dùng cái này
```

Sinh khoá bằng `openssl rand -hex 32`.

⚠️ Profile thứ hai phải đổi `port` (8643, 8644…). Hai profile khai trùng cổng thì cái khởi
động sau không chiếm được cổng và im lặng không phục vụ.

⚠️ `hermes profile create <tên>` **không** kèm `api_server`. Profile mới tạo xong vẫn chưa
có cổng nào — thiếu bước này là chọn được profile trên CRM nhưng agent không bao giờ trả
lời. Danh sách profile trong CRM có đánh dấu "CHƯA bật cổng API" cho đúng trường hợp đó.

Rocket **từ chối khởi động** cổng API nếu thiếu `key`, kể cả khi chỉ mở trên máy nội bộ.
Đây là chủ ý của Rocket, không phải lỗi: cổng này điều phối được agent có quyền chạy lệnh,
khoá dễ đoán là mở cửa cho người khác chạy lệnh trên máy bạn. Đừng tìm cách lách.

### 1.2 Tạo profile cho từng agent

Mỗi AI agent trên CRM nên có một profile Rocket riêng — đó là chỗ chứa tính cách, kỹ năng
và trí nhớ của agent đó:

```bash
hermes profile create tuvan-bds --clone-from default
hermes profile create cskh-sau-ban --clone-from default
```

Profile được nhận diện tự động bằng cách quét `~/.hermes/profiles/` — không phải khai báo
thêm ở đâu cả.

### 1.3 Tắt công cụ chạy lệnh cho profile CSKH

Profile clone từ mặc định thường có sẵn công cụ chạy lệnh terminal. Với profile trả lời tin
từ người lạ trên Zalo, **hãy tắt đi**. Khách hoàn toàn có thể nhắn một đoạn văn bản được
dựng để lừa agent chạy lệnh — đó không phải giả thuyết xa vời mà là kiểu tấn công phổ biến
nhất với agent nối vào kênh chat công khai.

Giữ lại chỉ khi bạn thực sự cần agent tự tra dữ liệu, và khi đó phải rà kỹ prompt.

### 1.4 Chạy gateway — *chỉ khi dùng `ROCKET_AGENT_TRANSPORT=http`*

```bash
hermes gateway install
hermes gateway start
```

Gateway của **mỗi profile** phải chạy thì cổng của profile đó mới mở. Xem trạng thái:

```bash
hermes profile list      # cột Gateway: running / stopped
hermes gateway status
```

Sửa `config.yaml` xong phải `hermes gateway restart` — CRM đọc khoá từ file, nhưng gateway
đang chạy vẫn giữ khoá cũ trong bộ nhớ, không restart sẽ nhận 401.

### 1.5 Kiểm tra nhanh

Với `cli` — chạy đúng lệnh mà CRM sẽ chạy:

```bash
hermes profile list
hermes -p tuvan-bds -z "Trả lời đúng 2 từ: xin chào"
```

Lệnh thứ hai phải in ra đúng câu trả lời, không banner. Báo `Profile ... does not exist`
nghĩa là sai tên profile.

Với `http` — gọi thẳng cổng của profile đó (KHÔNG có `/p/<tên>` trong đường dẫn):

```bash
curl -s http://127.0.0.1:8642/health
curl -s http://127.0.0.1:8642/v1/models -H "Authorization: Bearer <khoá của profile>"
```

Lệnh thứ hai phải trả danh sách model, trong đó có `model_name` đã khai ở mục 1.1.
`401` = sai khoá hoặc gateway chưa restart sau khi đổi khoá. `404` = cổng này không phải
`api_server` của Rocket. Không kết nối được = gateway của profile chưa chạy.

---

## 2. Cấu hình phía CRM

### 2.1 Biến môi trường

Trong `.env` ở thư mục gốc (docker compose đọc file này):

```env
ROCKET_AGENT_TRANSPORT=http
# Thư mục profile Rocket trên MÁY HOST — compose mount read-only vào container.
ROCKET_PROFILES_HOST_DIR=/home/<user>/.rocketagent/profiles
# Trong container 127.0.0.1 là chính container → phải trỏ ra host.
ROCKET_AGENT_HOST=host.docker.internal
ROCKET_AGENT_TIMEOUT_MS=90000
```

CRM đọc `config.yaml` của từng profile trong thư mục đó để lấy **cổng + khoá riêng** của
profile, rồi ghép với `ROCKET_AGENT_HOST` thành địa chỉ gọi. Nhờ vậy thêm profile mới không
phải sửa `.env`, và ô chọn profile hiện luôn cổng + trạng thái gateway của từng cái.

Backend chạy **trực tiếp trên host** (không Docker) thì bỏ `ROCKET_PROFILES_HOST_DIR`, đặt
`ROCKET_AGENT_HOST=127.0.0.1`; CRM tự đọc `~/.rocketagent/profiles` của user đang chạy.

⚠️ Mount thư mục profile nghĩa là container đọc được khoá của **mọi** profile trong đó (kể
cả `.env` chứa khoá nhà cung cấp LLM). Chỉ làm khi Rocket và CRM cùng một chủ sở hữu.

Hai biến dưới đây là **đường lùi**, chỉ dùng khi agent không khai profile hoặc profile nằm
ngoài thư mục trên (ví dụ profile `default` của Rocket — nó nằm ở `~/.rocketagent/config.yaml`
chứ không nằm trong `profiles/`):

```env
ROCKET_AGENT_BASE_URL=http://127.0.0.1:8642
ROCKET_AGENT_API_KEY=<khoá của api_server đó>
```

Địa chỉ Rocket **bắt buộc nằm trên cùng máy** (`127.0.0.1`, `localhost`, `::1`, hoặc
`host.docker.internal`). CRM từ chối mọi địa chỉ khác — đây là chốt chặn chống cấu hình
nhầm khiến toàn bộ hội thoại khách bị gửi ra internet, và chống biến Rocket (có tool chạy
lệnh hệ thống) thành cửa hậu cho máy khác.

> **Trên Linux**: `host.docker.internal` cần dòng `extra_hosts: ["host.docker.internal:host-gateway"]`
> (đã có sẵn trong `docker-compose.yml`), **và** `api_server` của Rocket phải bind ra IP
> bridge docker chứ không chỉ `127.0.0.1` — khác với Docker Desktop trên macOS/Windows,
> nơi gọi thẳng vào `127.0.0.1` của host được.

Khởi động lại backend sau khi đổi.

`ROCKET_AGENT_TIMEOUT_MS` mặc định 90 giây vì agent Rocket chạy nhiều bước. Thấy khách phải
chờ quá lâu thì hạ xuống 45-60 giây, đổi lại là những lượt cần nhiều bước sẽ bị cắt giữa chừng.

`ROCKET_AGENT_CLI` chỉ dùng ở transport `cli`. Để trống là tìm `hermes` trong `PATH`; backend
chạy bằng systemd/pm2 thường có `PATH` tối giản → điền đường dẫn đầy đủ (`which hermes`).

### 2.2 Chọn bộ não cho agent

**Cài đặt → Trợ lý AI → chọn agent:**

1. **Bộ não** → chọn `Rocket Agent (máy này)`.
2. **Profile** → chọn trong danh sách xổ xuống (CRM đọc bằng `hermes profile list`), rồi
   bấm **Kiểm tra kết nối**. Mỗi dòng hiện kèm model mặc định và cảnh báo `gateway đang
   tắt` — chọn profile đang tắt thì agent sẽ im lặng hoàn toàn. Vừa tạo profile mới thì
   bấm **tải lại danh sách**. Danh sách trống (CRM không gọi được `hermes`) thì ô này
   thành ô gõ tay, gõ đúng tên vẫn chạy bình thường.
3. **Model** → để trống là được (Rocket dùng `model_name` mặc định). Chỉ điền khi muốn
   agent này chạy model khác với các agent còn lại.

Ô nhiệt độ và giới hạn token bị ẩn khi chọn Rocket — hai thứ đó do profile Rocket tự quản.

Prompt, tài liệu, từ khoá bàn giao, giới hạn số tin mỗi ngày vẫn nằm ở CRM và vẫn có hiệu lực.

### 2.3 Chia việc giữa CRM và Rocket

Viết tính cách bán hàng ở **CRM** (sửa nhanh trên giao diện, mỗi tổ chức một bản). Để
**Rocket** giữ phần năng lực: kỹ năng, công cụ, trí nhớ dài hạn.

Viết tính cách ở cả hai nơi sẽ dẫn tới hai bản mâu thuẫn nhau và rất khó lần ra vì sao agent
trả lời lạ.

---

## 3. Dự phòng khi Rocket hỏng

Rocket chạy trên đúng một máy. Máy đó hỏng, `hermes` lỗi, hoặc (với transport `http`)
gateway tắt là **mọi agent dùng Rocket im lặng hoàn toàn** — khách nhắn mà không ai trả lời.

Trong màn hình agent, phần **Dự phòng khi lỗi**: chọn `OpenRouter` và một model rẻ, nhanh.
Khi Rocket không phản hồi, CRM tự chuyển sang model dự phòng cho lượt đó.

- Dự phòng dùng **API key OpenRouter của tổ chức** đã nhập ở Cài đặt → Trợ lý AI. Chưa nhập
  key thì dự phòng không chạy.
- Dự phòng **mặc định tắt**. Bật là bắt đầu tốn tiền thật khi Rocket hỏng, nên đây phải là
  lựa chọn có ý thức.
- Độ trễ xấu nhất: chờ Rocket hết 90 giây rồi mới gọi dự phòng — khách có thể đợi gần 2 phút.

**Theo dõi:** trong bảng nhật ký, lọc theo cờ **dự phòng**. Nếu thấy cờ này bật liên tục
nghĩa là Rocket đã chết mà không ai để ý, và hoá đơn OpenRouter đang chạy. Đây là cách duy
nhất phát hiện tình huống đó.

---

## 4. Khi có sự cố

Bấm **Kiểm tra kết nối** trong màn hình agent trước, rồi tra bảng dưới.

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| Ô chọn profile trống, báo "Không thấy thư mục profile Rocket" | Chưa mount thư mục profile vào container | Đặt `ROCKET_PROFILES_HOST_DIR` trong `.env` rồi `docker compose up -d app` |
| Profile hiện chữ **"CHƯA bật cổng API"** | Profile có thật nhưng `config.yaml` không khai `api_server` — `hermes profile create` không tự thêm | Thêm khối `api_server` (mục 1.1) với cổng riêng, rồi `hermes gateway restart` |
| Profile hiện **"gateway đang tắt"** | Gateway của profile đó chưa chạy | `hermes gateway start` |
| Profile hiện **"thiếu khoá"** | `api_server.extra.key` để trống — Rocket từ chối mở cổng thiếu khoá | Sinh khoá `openssl rand -hex 32`, điền vào `config.yaml`, restart gateway |
| "Không kết nối được tới http://host.docker.internal:\<cổng\>" | Gateway của profile chưa chạy, hoặc (Linux) Rocket chỉ bind `127.0.0.1` | `hermes gateway start`; trên Linux cho `api_server` bind ra IP bridge docker |
| "Gateway từ chối khoá của profile" (401) | Khoá trong `config.yaml` đổi sau khi gateway khởi động | `hermes gateway restart` |
| "Địa chỉ Rocket phải nằm trên cùng máy" | `ROCKET_AGENT_HOST` / `ROCKET_AGENT_BASE_URL` trỏ ra ngoài | Đặt `host.docker.internal` (trong Docker) hoặc `127.0.0.1` (chạy thẳng trên host) |
| "Không tìm thấy lệnh hermes" (transport `cli`) | Backend không thấy `hermes`, hoặc chạy dưới user OS khác | Điền `ROCKET_AGENT_CLI` bằng đường dẫn từ `which hermes`; backend trong Docker thì bắt buộc dùng `http` |
| Cột token trong nhật ký trống trơn | Đang dùng transport `cli` — `-z` không trả `usage` | Bình thường. Cần số token thì chuyển sang `http` |
| Nhật ký toàn `failed`, lỗi hết thời gian chờ | Lượt agent chạy lâu hơn 90 giây | Tăng `ROCKET_AGENT_TIMEOUT_MS`, hoặc giảm số công cụ của profile |
| Nhiều nick nhắn cùng lúc thì chậm hẳn / máy hết RAM | `cli`: mỗi tin là một tiến trình ~220MB. `http`: Rocket giới hạn 10 lượt song song | `cli`: giảm `AI_AGENT_WORKER_CONCURRENCY`. `http`: tăng `gateway.api_server.max_concurrent_runs` |
| Agent trả lời nhưng nội dung lạ | Tính cách viết ở cả CRM lẫn profile Rocket | Xem mục 2.3 |

Dùng khung **Chạy thử** trong màn hình agent để kiểm tra trước khi gán vào nick thật.

---

## 5. Khác biệt cần biết so với OpenRouter

- **Không có bước bàn giao tự động.** Với OpenRouter, model tự đặt cờ "cần nhân viên" khi
  không đủ thông tin. Rocket không có cơ chế đó — agent sẽ tự xoay theo prompt. Từ khoá bàn
  giao do bạn đặt trong cấu hình agent **vẫn chạy bình thường**, vì đó là luật của CRM chứ
  không phải quyết định của model.
- **Lượt hết thời gian chờ không được thử lại.** Agent Rocket có thể đã làm gì đó ở lượt bị
  cắt (ghi trí nhớ, gọi công cụ); chạy lại có thể lặp hành động. Dự phòng lo phần cứu tin.
- **Transport `cli` không có số token.** `hermes -z` chỉ in câu trả lời, không có khối
  `usage` như cổng OpenAI — cột token trong nhật ký sẽ trống. Các cột còn lại (thời gian,
  model/profile, nội dung, cờ dự phòng) vẫn đủ.
- **Câu trả lời vẫn do CRM gửi**, không phải Rocket. Nhờ vậy giới hạn số tin mỗi ngày, độ
  trễ ngẫu nhiên chống bị gắn cờ bot, nhật ký và cờ tắt chat của nick đều còn nguyên hiệu lực.
