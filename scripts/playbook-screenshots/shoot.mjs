// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Chụp ảnh minh hoạ cho playbook BĐS từ CHÍNH app thật.
 *
 * Cách chạy:
 *   cd frontend && npm run dev        # terminal 1
 *   node scripts/playbook-screenshots/shoot.mjs   # terminal 2
 *
 * Nguyên lý: mở app thật bằng Chromium, chặn toàn bộ request `/api/v1/**`
 * và trả dữ liệu giả trong mock-data.mjs. Không cần backend, không cần Docker,
 * và không đụng vào một dòng code frontend nào — nên ảnh chụp ra đúng bằng
 * giao diện production, chỉ khác phần dữ liệu.
 *
 * Muốn chụp thêm màn hình: thêm một mục vào SCREENS ở cuối file.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as D from './mock-data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../../docs/playbook-bds/images');
const BASE = process.env.APP_URL || 'http://localhost:5173';

/** Ghi lại endpoint chưa có mock để còn bổ sung — in ra cuối lần chạy. */
const unmatched = new Set();

/**
 * Bảng mock: [regex khớp pathname sau /api/v1, hàm trả dữ liệu].
 * Xếp cụ thể trước, chung sau — lấy match đầu tiên.
 */
const ROUTES = [
  // ── Auth / hồ sơ / tổ chức ──────────────────────────────────────────
  [/^\/setup\/status$/, () => ({ needsSetup: false })],
  [/^\/profile$/, () => D.ME],
  [/^\/organization$/, () => D.ORG],
  [/^\/public\/org-branding$/, () => D.BRAND],
  [/^\/branding$/, () => D.BRAND],
  [/^\/privacy\/status$/, () => ({
    hasPin: false, lockedUntil: null, activeSessionCount: 0, activeSessions: [],
  })],
  [/^\/me\/preferences$/, () => ({})],
  [/^\/me\/onboarding$/, () => ({ dismissedAt: D.iso(-40), steps: [] })],
  [/^\/me\/internal-contact$/, () => ({ contactId: null })],
  [/^\/notifications$/, () => ({ items: [], total: 0, unread: 0 })],
  [/^\/users$/, () => [{ id: 'user-me', fullName: D.ME.fullName, email: D.ME.email, role: 'owner' }]],
  [/^\/teams$/, () => [{ id: 'team-1', name: 'Nhóm sale 1', memberCount: 6 }]],
  [/^\/departments$/, () => [{ id: 'dept-sale-1', name: 'Phòng kinh doanh 1' }]],

  // ── Nick Zalo ───────────────────────────────────────────────────────
  [/^\/zalo-accounts\/sdk-limits$/, () => ({ maxMessagesPerDay: 200, maxFriendsPerDay: 20 })],
  [/^\/zalo-accounts\/labels-overview$/, () => []],
  [/^\/zalo-accounts\/archived$/, () => []],
  [/^\/zalo-accounts$/, () => D.ZALO_ACCOUNTS],
  [/^\/account-folders$/, () => []],

  // ── Dashboard ───────────────────────────────────────────────────────
  [/^\/dashboard\/action-hub\/me$/, () => ({
    targetUserId: 'user-me',
    isViewingSelf: true,
    kpi: {
      unreplied: { public: 7, private: 0 },
      todayAppointments: { public: 2, private: 0 },
      dormantContacts: { public: 14, private: 0 },
      totalContacts: 312,
      closedThisMonth: 4,
      followSessions: 23,
    },
    sessions: { active: 23, replied: 18, paused: 3, closedThisMonth: 4 },
    urgent: D.CONVERSATIONS.filter((c) => c.unreadCount > 0).map((c) => ({
      conversationId: c.id,
      contactId: c.contact.id,
      contactName: c.contact.fullName,
      contactAvatar: null,
      unreadCount: c.unreadCount,
      lastMessageAt: c.lastMessageAt,
      nickName: c.zaloAccount.displayName,
      status: c.contact.statusRef?.name,
      messagePreview: c.messages[0]?.content,
      redacted: false,
      isPrivateNick: false,
    })),
    appointments: D.APPOINTMENTS.filter((a) => a.appointmentDate === D.ymd(0)).map((a) => ({
      id: a.id,
      title: a.title,
      appointmentDate: a.appointmentDate,
      appointmentTime: a.appointmentTime,
      location: a.location,
      contactId: a.contactId,
      contactName: a.contact.fullName,
    })),
    quotaNicks: D.ZALO_ACCOUNTS.map((n) => ({
      id: n.id,
      displayName: n.displayName,
      isPrivate: false,
      messagesToday: n.messagesToday,
      friendsToday: n.friendsToday,
    })),
    reminders: {
      overdue: [],
      today: D.APPOINTMENTS.filter((a) => a.appointmentDate === D.ymd(0)).map((a) => ({
        id: a.id, title: a.title, appointmentDate: a.appointmentDate,
        appointmentTime: a.appointmentTime, location: a.location,
        contactId: a.contactId, contactName: a.contact.fullName,
      })),
      tomorrow: D.APPOINTMENTS.filter((a) => a.appointmentDate === D.ymd(1)).map((a) => ({
        id: a.id, title: a.title, appointmentDate: a.appointmentDate,
        appointmentTime: a.appointmentTime, location: a.location,
        contactId: a.contactId, contactName: a.contact.fullName,
      })),
      birthdays: [{ id: 'contact-5', contactName: 'Vũ Minh Tuấn' }],
    },
    scores: { leadAvg: 58, engagementAvg: 61, priorityHigh: 9, leadHi: 9, leadMid: 21, engHi: 11, engMid: 19 },
    statusBreakdown: D.STATUSES.map((s, i) => ({ status: s.name, count: [64, 51, 43, 38, 22, 14, 9, 4][i] })),
    topTags: D.CRM_TAGS.map((t) => ({ tag: t.name, count: t.count })),
    interactionToday: { sent: 135, replied: 41, replyRate: 30, newFriends: 18, newLeads: 6 },
  })],
  // Tab "Quản lý team"/"Hệ thống" không lên ảnh nhưng vẫn được prefetch. Phải trả
  // đúng TeamResponse/SystemResponse (use-dashboard-action-hub.ts) — thiếu teamKpi
  // là văng lỗi console "reading 'unreplied'".
  [/^\/dashboard\/action-hub\/team$/, () => ({
    scope: { canViewAll: true, deptIds: ['dept-sale-1'], userCount: 1 },
    teamKpi: {
      unreplied: { public: 0, private: 0 },
      todayAppointments: { public: 0, private: 0 },
      totalContacts: 0,
      closedThisWeek: 0,
    },
    topUser: null,
    perUser: [],
  })],
  [/^\/dashboard\/action-hub\/system$/, () => ({
    orgKpi: {
      totalNicks: D.ZALO_ACCOUNTS.length,
      nickHealth: { healthy: 2, overlimit: 0, banned: 0, offline: 0, private: 0 },
      newLeadsThisMonth: 0,
      totalContacts: 0,
      auditCountToday: 0,
    },
    deptRanking: [],
  })],
  [/^\/dashboard\/action-hub\/picker\/(depts|users)$/, () => []],
  [/^\/dashboard\/kpi$/, () => ({ totalContacts: 312, newThisWeek: 23, appointments: 7, closed: 4 })],
  [/^\/dashboard\/pipeline$/, () => D.STATUSES.map((s, i) => ({ status: s.name, color: s.color, count: [64, 51, 43, 38, 22, 14, 9, 4][i] }))],
  [/^\/dashboard\/sources$/, () => [
    { source: 'Facebook Ads', count: 96 }, { source: 'Hội thảo dự án', count: 71 },
    { source: 'Khách cũ giới thiệu', count: 58 }, { source: 'Zalo nhóm cư dân', count: 44 },
    { source: 'Website sàn', count: 27 }, { source: 'Tờ rơi sàn', count: 16 },
  ]],
  [/^\/dashboard\/message-volume$/, () => Array.from({ length: 14 }, (_, i) => ({
    date: D.ymd(-13 + i), sent: 90 + ((i * 17) % 60), received: 30 + ((i * 11) % 25),
  }))],
  [/^\/dashboard\/appointments$/, () => D.APPOINTMENTS],

  // ── Hội thoại / chat ────────────────────────────────────────────────
  [/^\/conversations\/counts$/, () => ({ all: 8, unread: 3, unreplied: 7, mine: 8, groups: 0 })],
  [/^\/conversations\/event-counts$/, () => ({})],
  [/^\/conversations\/sidebar-tags$/, () => D.CRM_TAGS],
  [/^\/conversations\/[^/]+\/messages$/, () => ({ items: D.MESSAGES, messages: D.MESSAGES, total: D.MESSAGES.length, hasMore: false })],
  [/^\/conversations\/[^/]+$/, () => D.CONVERSATIONS[0]],
  [/^\/conversations$/, () => ({ items: D.CONVERSATIONS, conversations: D.CONVERSATIONS, total: D.CONVERSATIONS.length, hasMore: false })],
  [/^\/zalo-sticker-list$/, () => []],
  [/^\/automation\/care-sessions\/listening-pairs$/, () => ({ pairs: [] })],
  [/^\/conversations\/[^/]+\/(mark-read|touch-profile)$/, () => ({ ok: true })],
  [/^\/customers\/[^/]+\/timeline$/, () => ({ items: [], total: 0 })],
  [/^\/zalo-accounts\/[^/]+\/labels(\/touch)?$/, () => ({ labels: [] })],
  [/^\/zalo-accounts\/[^/]+\/profile\/last-online\/[^/]+$/, () => ({ lastOnline: null })],
  [/^\/zalo-accounts\/[^/]+\/friends\/requests\/[^/]+\/status$/, () => ({ status: 'friend' })],

  // ── Khách hàng ──────────────────────────────────────────────────────
  [/^\/contacts\/duplicates$/, () => ({ items: [], total: 0 })],
  // Phải đứng TRƯỚC /contacts/:id, không thì rơi vào regex đó và mọi ô thống kê về 0.
  [/^\/contacts\/stats$/, () => ({
    total: D.CONTACTS.length,
    withNick: 10,
    activeRecently: 8,
    newToday: 2,
    highScore: D.CONTACTS.filter((c) => c.leadScore >= 50).length,
    multiClaim: 0,
    noZalo: 0,
  })],
  [/^\/contacts\/[^/]+\/(notes|friendships|appointments|account-activity|engagement-timeline|profile)$/, () => []],
  [/^\/contacts\/[^/]+$/, () => D.CONTACTS[0]],
  [/^\/contacts$/, () => ({ items: D.CONTACTS, contacts: D.CONTACTS, total: D.CONTACTS.length, page: 1, pageSize: 50 })],
  [/^\/customer-lists$/, () => []],
  [/^\/crm-tags$/, () => D.CRM_TAGS],
  [/^\/tags$/, () => D.CRM_TAGS],
  [/^\/tags\/zalo-accounts$/, () => []],
  [/^\/settings\/statuses$/, () => D.STATUSES],
  [/^\/filter-presets$/, () => []],
  [/^\/leads\/stuck$/, () => ({ items: [], total: 0 })],

  // ── Bạn bè (friends) ────────────────────────────────────────────────
  [/^\/friends-db\/all-nicks$/, () => ({ items: D.FRIENDS, friends: D.FRIENDS, total: D.FRIENDS.length })],
  [/^\/zalo-accounts\/[^/]+\/friends-db$/, () => ({ items: D.FRIENDS, friends: D.FRIENDS, total: D.FRIENDS.length })],
  [/^\/zalo-accounts\/[^/]+\/friends\/(online|recommendations)$/, () => []],
  [/^\/zalo-accounts\/[^/]+\/friends\/requests\/sent$/, () => []],
  [/^\/zalo-accounts\/[^/]+\/friends$/, () => ({ items: D.FRIENDS, friends: D.FRIENDS, total: D.FRIENDS.length })],
  [/^\/friends\/[^/]+\/score-breakdown$/, () => D.FRIENDS[0].scoreBreakdown],

  // ── Lịch hẹn ────────────────────────────────────────────────────────
  [/^\/appointments\/settings$/, () => ({ reminderEnabled: true, reminderBeforeMin: 120, defaultDurationMin: 60 })],
  [/^\/appointments\/(today|upcoming)$/, () => D.APPOINTMENTS.filter((a) => a.appointmentDate >= D.ymd(0))],
  // Lịch tuần đọc mảng trần — bọc trong {items} là grid ra "0 lịch".
  [/^\/appointments$/, () => D.APPOINTMENTS],

  // ── Kho ảnh / tài liệu ──────────────────────────────────────────────
  [/^\/media\/folders$/, () => ({ folders: D.MEDIA_FOLDERS })],
  [/^\/media\/stats$/, () => ({ totalFiles: D.MEDIA_ITEMS.length, totalSize: 128 * 1024 * 1024, quota: 5 * 1024 * 1024 * 1024 })],
  [/^\/media\/(favorites|trash|suggest)$/, () => ({ items: [], total: 0 })],
  [/^\/media\/tags$/, () => ({ tags: [{ id: 'mt-1', name: 'Toà S1' }, { id: 'mt-2', name: 'Toà S2' }] })],
  [/^\/media\/uploaders$/, () => ({ uploaders: [{ id: 'user-me', fullName: D.ME.fullName }] })],
  [/^\/media$/, () => ({ items: D.MEDIA_ITEMS, total: D.MEDIA_ITEMS.length })],

  // ── Điểm số / scoring ───────────────────────────────────────────────
  [/^\/scoring\/config$/, () => ({
    orgId: D.ORG.id,
    // Đúng DEFAULT_SCORING_CONFIG của backend (constants.ts) — đừng đổi tuỳ hứng,
    // chương 06 của playbook trích nguyên bộ số này.
    weights: { engagement: 35, intent: 30, fit: 15, velocity: 20 },
    decay: { day3to7: -1, day7to14: -3, day14to30: -5, day30to60: -8 },
    autoPromote: true,
    stuckDetectionEnabled: true,
    explainabilityEnabled: true,
  })],
  // Từ khoá chấm điểm — cố tình viết theo giọng khách BĐS để chương 06 dùng làm ví dụ.
  [/^\/scoring\/rules$/, () => (
    [
      ['hoi-gia', 'intent', ['giá', 'bao nhiêu tiền', 'chênh'], 8, 'Khách hỏi giá'],
      ['xem-nha-mau', 'intent', ['xem nhà mẫu', 'qua xem', 'ghé dự án'], 15, 'Muốn đi xem thực tế'],
      ['hoi-vay', 'fit', ['vay', 'ngân hàng', 'trả góp', 'lãi suất'], 6, 'Có nhu cầu vay'],
      ['sap-coc', 'intent', ['cọc', 'giữ chỗ', 'ký hợp đồng'], 20, 'Tín hiệu sắp chốt'],
      ['ro-san-pham', 'fit', ['view sông', '2pn', '3pn', 'tầng cao'], 5, 'Rõ nhu cầu sản phẩm'],
      ['chan-chu', 'intent', ['để anh xem lại', 'bàn với vợ', 'tính sau'], -4, 'Tín hiệu chần chừ'],
    ].map(([signalKey, dimension, keywords, delta, label], i) => ({
      id: `sr-${i + 1}`,
      signalKey,
      dimension,
      ruleType: 'keyword',
      delta,
      capPerDay: null,
      capTotal: null,
      keywords,
      label,
      enabled: true,
      isActive: true,
    }))
  )],
  [/^\/scoring\/stage-transitions$/, () => []],
  [/^\/scoring\/stuck-thresholds$/, () => D.STATUSES.map((s) => ({ statusId: s.id, statusName: s.name, days: 7 }))],
  [/^\/scoring\/nba-templates$/, () => []],

  // ── Khác (đủ để layout không vỡ) ────────────────────────────────────
  [/^\/automation\/(rules|templates|template-folders)$/, () => []],
  [/^\/integrations$/, () => []],
  [/^\/permission-groups(\/meta)?$/, () => []],
  [/^\/rbac\/users$/, () => ({ items: [], total: 0 })],
  [/^\/search$/, () => ({ contacts: [], conversations: [], messages: [] })],
  [/^\/ai\/(config|providers|usage)$/, () => ({ enabled: false, providers: [] })],
  [/^\/system-notifications\/.*$/, () => ({ items: [], recipients: [], settings: {} })],
  [/^\/audit-logs$/, () => ({ items: [], total: 0 })],
];

function mockFor(pathname) {
  const p = pathname.replace(/^\/api\/v1/, '');
  for (const [re, fn] of ROUTES) {
    if (re.test(p)) return fn();
  }
  unmatched.add(p);
  return null;
}

const W = 1440;
const H = 900;

/**
 * Màn hình cần chụp.
 *   wait  = selector chờ render xong trước khi bấm máy
 *   width = ghi đè bề ngang cho màn có bảng rộng (mặc định 1440)
 */
const SCREENS = [
  { name: '01-dang-nhap', path: '/login', anonymous: true, wait: 'form, .v-card' },
  { name: '02-dashboard', path: '/', wait: '.v-main' },
  // Mở sẵn hội thoại conv-1: ảnh phải thấy được khung chat, không phải "Chọn cuộc trò chuyện".
  { name: '03-tin-nhan', path: '/chat/conv-1', wait: '.v-main' },
  // Hai bảng dưới có nhiều cột — 1440 thì chip trạng thái tràn đè cột điểm.
  { name: '04-ban-be', path: '/friends', wait: '.v-main', width: 1920 },
  { name: '05-khach-hang', path: '/contacts', wait: '.v-main', width: 1920 },
  { name: '06-lich-hen', path: '/appointments', wait: '.v-main' },
  { name: '07-kho-anh', path: '/media', wait: '.v-main' },
  // Viewport cao thay vì fullPage: nội dung trang Cài đặt nằm trong khung cuộn
  // riêng nên fullPage không kéo dài ảnh ra. Chương 06 cần thấy cả bảng từ khoá.
  { name: '08-diem-so', path: '/settings/crm/scoring', wait: '.v-main', height: 1560 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: screen.width || W, height: screen.height || H },
      deviceScaleFactor: 2,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      colorScheme: 'light',
    });

    // Token giả + tắt animation để ảnh không dính khung hình đang chuyển động.
    await context.addInitScript(
      ({ anonymous }) => {
        if (!anonymous) {
          localStorage.setItem('token', 'demo.playbook.token');
          localStorage.setItem('refreshToken', 'demo.playbook.refresh');
        } else {
          localStorage.clear();
        }
        const style = document.createElement('style');
        style.textContent =
          '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}';
        document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
      },
      { anonymous: !!screen.anonymous },
    );

    await context.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());

      // Thumbnail kho ảnh: trả SVG vẽ tay thay vì JSON, để lưới ảnh không rỗng.
      const raw = url.pathname.match(/\/media\/(media-\d+)\/raw$/);
      if (raw) {
        const item = D.MEDIA_ITEMS.find((m) => m.id === raw[1]);
        return route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: item ? D.mediaSvg(item) : '<svg xmlns="http://www.w3.org/2000/svg"/>',
        });
      }

      const body = mockFor(url.pathname);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body ?? []),
      });
    });
    // Chặn socket.io — không có backend, để nó retry sẽ làm bẩn console.
    await context.route('**/socket.io/**', (route) => route.abort());

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    });

    try {
      await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector(screen.wait, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const file = `${OUT_DIR}/${screen.name}.png`;
      await page.screenshot({ path: file, fullPage: !!screen.fullPage });
      report.push({ screen: screen.name, url: page.url(), errors: errors.slice(0, 6) });
      console.log(`✓ ${screen.name}  →  ${page.url()}${errors.length ? `  (${errors.length} lỗi console)` : ''}`);
    } catch (e) {
      report.push({ screen: screen.name, error: String(e.message).slice(0, 300), errors: errors.slice(0, 6) });
      console.log(`✗ ${screen.name}: ${e.message.slice(0, 120)}`);
    }
    await context.close();
  }

  await browser.close();
  await writeFile(`${OUT_DIR}/_report.json`, JSON.stringify({ report, unmatched: [...unmatched].sort() }, null, 2));
  console.log(`\nEndpoint chưa mock (${unmatched.size}):`);
  [...unmatched].sort().forEach((u) => console.log('  -', u));
}

main();
