#!/usr/bin/env bash
#
# pack-standalone.sh — Đóng gói bộ cài KHÔNG CẦN MÃ NGUỒN để gửi cho khách.
#
# Dùng khi repo còn private: khách không clone được, nên gửi thẳng một thư mục/zip
# nhỏ. Image vẫn kéo từ GHCR (package phải để public), nên gói này chỉ vài chục KB.
#
# Khách nhận được gì:
#   rocket-zalo-crm/
#     docker-compose.yml          # đã bỏ `build:` nên chạy một mình được
#     .env.example                # deploy.sh dựa vào đây để TỰ SINH .env
#     HUONG-DAN-CAI-DAT.md
#     scripts/zalocrm-deploy.sh   # tự sinh .env + secret, né port trùng, migrate, health
#
# Khách chỉ chạy 1 lệnh, không phải sửa file nào:
#   bash scripts/zalocrm-deploy.sh
#
# Dùng:
#   ./scripts/pack-standalone.sh            # tên gói theo ngày
#   ./scripts/pack-standalone.sh v3.4.1     # tên gói theo phiên bản
set -euo pipefail
cd "$(dirname "$0")/.."

c_blue=$'\033[1;36m'; c_grn=$'\033[1;32m'; c_red=$'\033[1;31m'; c_off=$'\033[0m'
log() { echo "${c_blue}▶${c_off} $*"; }
ok()  { echo "${c_grn}✓${c_off} $*"; }
die() { echo "${c_red}✗ $*${c_off}" >&2; exit 1; }

VERSION="${1:-$(date +%Y%m%d)}"
OUT_DIR="release/rocket-zalo-crm-${VERSION}"
PKG_ROOT="${OUT_DIR}/rocket-zalo-crm"

# Chỉ 4 file này — cố ý không kèm mã nguồn, .env thật hay backup database.
FILES=(
  docker-compose.yml
  .env.example
  HUONG-DAN-CAI-DAT.md
  scripts/zalocrm-deploy.sh
)

for f in "${FILES[@]}"; do [ -f "$f" ] || die "Thiếu $f"; done

# Chặn rò rỉ: .env thật (chứa secret production) tuyệt đối không được lọt vào gói.
grep -q '^\.env$' .gitignore || die ".gitignore không bỏ qua .env — dừng để tránh rò secret."

log "Dọn thư mục đích ${OUT_DIR}…"
rm -rf "$OUT_DIR"
mkdir -p "$PKG_ROOT/scripts"

log "Chép ${#FILES[@]} file vào gói…"
for f in "${FILES[@]}"; do cp "$f" "$PKG_ROOT/$f"; done

# docker-compose.yml khai `${ZCRM_TAG:-latest}`. Ghim tag khi đóng gói theo phiên bản
# để khách cài đúng bản đã kiểm thử, không vô tình nhảy lên latest mới hơn.
if [ "$VERSION" != "$(date +%Y%m%d)" ]; then
  printf 'ZCRM_TAG=%s\n' "${VERSION#v}" >> "$PKG_ROOT/.env.example"
  ok "Đã ghim ZCRM_TAG=${VERSION#v} trong .env.example."
fi

ZIP="release/rocket-zalo-crm-${VERSION}.zip"
rm -f "$ZIP"
if command -v zip >/dev/null 2>&1; then
  (cd "$OUT_DIR" && zip -qr "../../$ZIP" rocket-zalo-crm)
  ok "Đã tạo $ZIP ($(du -h "$ZIP" | cut -f1))."
else
  ok "Không có lệnh 'zip' — gửi thẳng thư mục $PKG_ROOT."
fi

cat <<EOF

${c_grn}Gói đã sẵn sàng.${c_off} Gửi cho khách kèm đúng 2 câu:

  1. Giải nén, mở terminal trong thư mục rocket-zalo-crm
  2. Chạy:  bash scripts/zalocrm-deploy.sh

Script tự sinh .env + secret ngẫu nhiên, tự né port trùng, kéo image, migrate DB
rồi in ra link truy cập. Khách không phải mở hay sửa file cấu hình nào.

Lưu ý: image ghcr.io/rocket-ai-global/rocket-zalo-crm PHẢI ở chế độ public,
nếu không khách sẽ bị lỗi denied khi kéo image.
EOF
