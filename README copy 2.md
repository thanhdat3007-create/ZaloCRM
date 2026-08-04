# AgentKit — Hướng Dẫn Sử Dụng (Tiếng Việt)

> Bộ kỹ năng (skills), agent và hook dùng chung cho **Claude Code** và **Codex**.
> Tài liệu đầy đủ: <https://agentkit.best/docs>

Phiên bản: **ak 2.2.1**

---

## 1. AgentKit là gì?

AgentKit là một "bộ đồ nghề" cài sẵn cho AI coding CLI. Sau khi có nó trong dự án, bạn
có thể gõ các lệnh dạng `/ak:<tên-skill>` (ví dụ `/ak:plan`, `/ak:cook`, `/ak:code-review`)
để AI tự chạy các quy trình chuẩn: lập kế hoạch → code → test → review → ship.

Bộ này gồm:

- **97 skills** (`/ak:...`) cho đủ mọi việc: frontend, backend, database, security,
  deploy, tài liệu, media, research...
- **16 subagent** chuyên biệt (planner, debugger, code-reviewer, tester...).
- **Hooks** tự động: nhắc quy tắc, chặn lộ secret, lưu trạng thái phiên, format kế hoạch...

---

## 2. Cài đặt: CHỈ CẦN COPY (không dùng lệnh cài nữa)

> ⚠️ **Không cần chạy lệnh cài `ak install` nữa.** Mọi thứ đã có sẵn trong thư mục này rồi.
> Việc của bạn chỉ là **copy các thư mục ẩn** vào dự án mà bạn muốn dùng.

### Bước 1 — Copy các thư mục sau vào thư mục gốc của dự án đích

| Thư mục | Dùng cho | Bắt buộc? |
|---|---|---|
| `.claude/` | Claude Code (skills, agents, hooks, rules, settings) | ✅ Bắt buộc nếu dùng Claude Code |
| `.codex/` | Codex (agents, hooks, config.toml) | ✅ Bắt buộc nếu dùng Codex |
| `.codex-plugin/` | Plugin cho Codex | ✅ nếu dùng Codex |
| `.agents/` | Skills & plugins dùng chung | ✅ Bắt buộc |
| `.agentkit/` | Metadata + scripts của bộ kit | ✅ Bắt buộc |

### Bước 2 — Lệnh copy mẫu

Đứng tại thư mục **AgentKit này**, copy sang dự án của bạn (thay `<duong-dan-du-an>`):

```bash
# macOS / Linux
cp -R .claude .codex .codex-plugin .agents .agentkit "<duong-dan-du-an>/"
```

```powershell
# Windows (PowerShell)
Copy-Item .claude, .codex, .codex-plugin, .agents, .agentkit "<duong-dan-du-an>\" -Recurse
```

> 💡 Vì đây là các thư mục **ẩn** (bắt đầu bằng dấu `.`), nếu dùng Finder/Explorer nhớ
> bật "hiện file ẩn" (macOS: `Cmd + Shift + .`).

### Bước 3 — Kiểm tra

Mở dự án đích bằng Claude Code rồi gõ:

```
/ak:help
```

Nếu hiện danh mục skill là đã chạy được.

---

## 3. Cấu trúc thư mục

```
du-an-cua-ban/
├── .claude/
│   ├── skills/      # 97 skill /ak:...
│   ├── agents/      # 16 subagent (planner, debugger, tester...)
│   ├── hooks/       # hook tự động (.cjs)
│   ├── rules/       # quy tắc dev, routing, orchestration
│   └── settings.json
├── .codex/          # cấu hình cho Codex CLI
├── .codex-plugin/
├── .agents/         # skills & plugins dùng chung
└── .agentkit/       # scripts + metadata của kit
```

---

## 4. Cách dùng skill

Gõ theo cú pháp `/ak:<tên>` trong phiên chat. Một số lệnh hay dùng:

| Lệnh | Việc nó làm |
|---|---|
| `/ak:help` | Mở danh mục toàn bộ skill |
| `/ak:plan` | Lập kế hoạch triển khai theo từng phase |
| `/ak:cook` | Thực thi kế hoạch / code tính năng |
| `/ak:cook --fast` | Code nhanh, bỏ bước nặng |
| `/ak:test` | Chạy test, kiểm tra coverage |
| `/ak:code-review` | Review code trước khi merge |
| `/ak:fix` | Sửa bug / lỗi CI (tự scout trước) |
| `/ak:scout` | Dò nhanh codebase, tìm file liên quan |
| `/ak:ship` | Chạy full pipeline: test → review → PR |
| `/ak:journal` | Ghi nhật ký quyết định & bài học |

---

## 5. Các quy trình chuẩn (workflow)

### Phát triển tính năng
```
/ak:plan → /ak:cook → /ak:test → /ak:code-review → /ak:ship → /ak:journal
```

### Sửa lỗi
```
/ak:scout → /ak:debug → /ak:fix → /ak:test → /ak:code-review
```

### Điều tra / tìm hiểu
```
/ak:scout → /ak:debug → /ak:brainstorm → /ak:plan
```

---

## 6. Chọn skill theo lĩnh vực (rút gọn)

| Bạn muốn... | Dùng skill |
|---|---|
| Dựng UI React/TS | `/ak:frontend-development` |
| Style Tailwind + shadcn/ui | `/ak:ui-styling` |
| Dựng API (NestJS/FastAPI/Django) | `/ak:backend-development` |
| Thêm đăng nhập/OAuth | `/ak:better-auth` |
| Tích hợp thanh toán (Stripe/SePay/Polar) | `/ak:payment-integration` |
| Thiết kế schema / query DB | `/ak:databases` |
| Deploy (Vercel/Netlify/Railway...) | `/ak:deploy` |
| Docker / K8s / CI-CD | `/ak:devops` |
| Audit bảo mật (STRIDE/OWASP) | `/ak:security` |
| Viết tài liệu dự án | `/ak:docs` |
| Không biết chọn gì | `/ak:find-skills` hoặc `/ak:help` |

> Xem đầy đủ cây quyết định trong `.claude/rules/skill-domain-routing.md`.

---

## 7. Hooks tự động (đã bật sẵn)

Sau khi copy `.claude/settings.json`, các hook sau chạy tự động — **không cần cấu hình thêm**:

- Nhắc quy tắc dev mỗi khi bạn gửi yêu cầu.
- Chặn vô tình lộ secret / API key ra output.
- Lưu trạng thái phiên để phiên sau nối tiếp được.
- Tự format file kế hoạch dạng kanban.

> Yêu cầu: máy có cài **Node.js** (hook viết bằng `.cjs`).

---

## 8. Lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Gõ `/ak:...` không thấy skill | Kiểm tra đã copy đủ `.claude/` và `.agents/` chưa |
| Hook báo lỗi `node: command not found` | Cài Node.js |
| Không thấy thư mục khi copy | Bật hiện file ẩn (`Cmd + Shift + .` trên macOS) |
| Skill cần API key (Gemini, FB Ads...) | Cấu hình biến môi trường tương ứng trong dự án |

---

## 9. Tài liệu & hỗ trợ

- 📚 Docs: <https://agentkit.best/docs>
- Trong phiên chat: `/ak:help` để xem danh mục, `/ak:find-skills` để tìm skill theo nhu cầu.
