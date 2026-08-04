# Tài liệu ZaloCRM

Cập nhật: 2026-08-04 · Phiên bản: v3.4.0 · Phạm vi: bản Community

## Tài liệu kỹ thuật

| Tài liệu | Dùng khi nào |
|---|---|
| [project-overview-pdr.md](./project-overview-pdr.md) | Hiểu sản phẩm: vấn đề, người dùng, phạm vi domain, mô hình open-core, ràng buộc license |
| [codebase-summary.md](./codebase-summary.md) | Onboard code: cây thư mục, 25 module backend, map frontend, đọc file nào trước |
| [system-architecture.md](./system-architecture.md) | Kiến trúc runtime: boot flow, multi-tenant, auth/refresh, realtime, async, storage, deploy |
| [code-standards.md](./code-standards.md) | Quy ước code hiện hành trước khi viết/PR |
| [design-guidelines.md](./design-guidelines.md) | Dựng màn hình UI đúng theme/token/component defaults |
| [project-roadmap.md](./project-roadmap.md) | Trạng thái phát hành, việc đang chạy, gap kỹ thuật đã xác minh |
| [architecture/README.md](./architecture/README.md) | Diagram cũ (2026-06-16) — số liệu đã lệch, chỉ tham khảo bố cục |

## Vận hành & tích hợp

| Tài liệu | Dùng khi nào |
|---|---|
| [HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md) | Runbook triển khai production (cài 1 lệnh, thủ công, domain/HTTPS, upgrade) |
| [HUONG-DAN-NANG-CAP-BAN-CU.md](./HUONG-DAN-NANG-CAP-BAN-CU.md) | Quy trình nâng cấp thủ công từng mốc phiên bản cũ (v2.1 → v3.4) |
| [HUONG-DAN-CAI-CLOUDFLARE-TUNNEL.md](./HUONG-DAN-CAI-CLOUDFLARE-TUNNEL.md) | Đưa CRM ra URL HTTPS công khai không cần IP tĩnh hay mở port |
| [HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md](./HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md) | Chuyển storage sang Cloudflare R2 / S3-compatible |
| [HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md](./HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md) | Cấu hình cầu nối Zalo ↔ Telegram |
| [HUONG-DAN-KET-NOI-ROCKET-AGENT.md](./HUONG-DAN-KET-NOI-ROCKET-AGENT.md) | Dùng Rocket Agent chạy trên cùng máy làm bộ não cho AI agent, kèm cấu hình dự phòng |
| [HUONG-DAN-AI-TAO-PROFILE-ROCKET-CSKH.md](./HUONG-DAN-AI-TAO-PROFILE-ROCKET-CSKH.md) | **Cho AI đọc và tự làm:** tạo profile Rocket Agent làm bot CSKH bằng `hermes` CLI — phỏng vấn người dùng, nạp folder tài liệu sản phẩm, viết SOUL.md, khoá công cụ, nghiệm thu |
| [zalocrm-api/api-documentation.md](./zalocrm-api/api-documentation.md) | Tham chiếu REST API (kèm bản `-vi.md`, PDF, Postman collection) |
| [HUONG-DAN-API-MCP-PHAN-TICH-HOI-THOAI.md](./HUONG-DAN-API-MCP-PHAN-TICH-HOI-THOAI.md) | Cắm Claude Code / trợ lý AI vào CRM để phân tích hội thoại (REST chỉ đọc + máy chủ MCP) |
| [HUONG-DAN-CAI-MCP-CHO-CLAUDE-VA-CHATGPT.md](./HUONG-DAN-CAI-MCP-CHO-CLAUDE-VA-CHATGPT.md) | Các bước cắm MCP vào từng ứng dụng: Claude Code, Claude Desktop, claude.ai, ChatGPT |

## Playbook người dùng cuối

| Tài liệu | Đối tượng |
|---|---|
| [playbook-bds/](./playbook-bds/) | Đội sale bất động sản |
| [playbook-dao-tao/](./playbook-dao-tao/) | Đội sale ngành đào tạo |

## Quy ước

- Tài liệu sản phẩm/kỹ thuật đặt trong `docs/`; kế hoạch triển khai đặt trong `plans/`.
- Khi hành vi người dùng, lệnh, kiến trúc hoặc public contract thay đổi → cập nhật tài liệu tương ứng trong cùng PR.
- Không đưa mã plan/phase/audit vào nội dung tài liệu; mô tả trực tiếp hành vi và invariant.
