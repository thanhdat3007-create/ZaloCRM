// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Dữ liệu giả cho bộ ảnh minh hoạ playbook BĐS.
 *
 * TOÀN BỘ là dữ liệu bịa — tên người, số điện thoại, tên dự án đều không có
 * thật. Không bao giờ trỏ script này vào backend thật rồi chụp: ảnh playbook
 * là tài liệu phát ra ngoài, dính data khách thật là lộ thông tin cá nhân.
 *
 * Shape của từng object bám theo interface TypeScript trong frontend/src
 * (use-chat.ts, use-contacts.ts, use-appointments.ts, api/media.ts…). Nếu app
 * đổi shape mà ảnh chụp ra trống, sửa ở đây chứ đừng sửa app.
 */

const TODAY = new Date();
TODAY.setHours(9, 12, 0, 0);

export function iso(dayOffset = 0, hour = 9, min = 0) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}
export function ymd(dayOffset = 0) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/**
 * Offset (tính bằng ngày, so với hôm nay) tới thứ `i` của TUẦN HIỆN TẠI,
 * với i=0 là Thứ 2 … i=6 là Chủ nhật.
 *
 * Cần cái này vì lưới "Tuần" chỉ vẽ 7 ngày của tuần đang xem: nếu hardcode
 * "ngày mai" mà hôm chụp rơi vào Chủ nhật thì lịch rơi sang tuần sau và lưới
 * trông trống trơn. Neo theo thứ thì ảnh luôn có lịch rải đều, chụp ngày nào
 * cũng vậy.
 */
export function wd(i) {
  const dowMon0 = (TODAY.getDay() + 6) % 7; // JS: CN=0 → đổi về Thứ2=0
  return i - dowMon0;
}

export function minsAgo(n) {
  return new Date(TODAY.getTime() - n * 60000).toISOString();
}
export function hoursAgo(n) {
  return new Date(TODAY.getTime() - n * 3600000).toISOString();
}

export const ORG = { id: 'org-demo', name: 'Sàn BĐS Ánh Dương', timezone: '+07:00' };

/** Tên hiển thị trên thanh brand. Để "ZaloCRM" cho đúng bản Community. */
export const BRAND = {
  name: 'ZaloCRM',
  logoUrl: null,
  slogan: 'CRM chạy trên Zalo cho đội sale',
  copyright: '© 2026 ZaloCRM',
  emailDomain: null,
};

export const ME = {
  id: 'user-me',
  email: 'linh.tran@anhduong.vn',
  phone: '0901234567',
  fullName: 'Trần Thuỳ Linh',
  role: 'owner',
  orgId: ORG.id,
  orgName: ORG.name,
  avatarUrl: null,
  passwordChangedAt: iso(-40),
  onboardingDismissedAt: iso(-40),
  grants: {},
  isFullAccess: true,
  deptRole: 'leader',
  departmentId: 'dept-sale-1',
  canViewAll: true,
  org: { id: ORG.id, name: ORG.name, timezone: ORG.timezone },
  permissionGroup: { id: 'pg-1', name: 'Trưởng nhóm sale' },
};

export const ZALO_ACCOUNTS = [
  {
    id: 'nick-1',
    displayName: 'Linh BĐS Ánh Dương',
    phone: '0901234567',
    status: 'connected',
    isPrivate: false,
    privacyMode: 'sub',
    ownerUserId: 'user-me',
    archivedAt: null,
    avatarUrl: null,
    zaloUid: '900000001',
    lastConnectedAt: minsAgo(3),
    messagesToday: 47,
    friendsToday: 6,
  },
  {
    id: 'nick-2',
    displayName: 'Linh Căn Hộ Quận 9',
    phone: '0912345678',
    status: 'connected',
    isPrivate: false,
    privacyMode: 'sub',
    ownerUserId: 'user-me',
    archivedAt: null,
    avatarUrl: null,
    zaloUid: '900000002',
    lastConnectedAt: minsAgo(11),
    messagesToday: 88,
    friendsToday: 12,
  },
];

// [tên, sđt, nguồn (giữ NGẮN — cột nguồn hẹp, dài sẽ tràn đè cột trạng thái), điểm]
const PEOPLE = [
  ['Nguyễn Văn Hùng', '0903111222', 'Hội thảo', 82],
  ['Phạm Thị Mai', '0903222333', 'Facebook', 74],
  ['Lê Quốc Thắng', '0903333444', 'Giới thiệu', 91],
  ['Đỗ Thu Hà', '0903444555', 'Tờ rơi', 38],
  ['Vũ Minh Tuấn', '0903555666', 'Nhóm Zalo', 66],
  ['Bùi Ngọc Ánh', '0903666777', 'Facebook', 21],
  ['Hoàng Anh Dũng', '0903777888', 'Hội thảo', 57],
  ['Trịnh Thuý Nga', '0903888999', 'Giới thiệu', 88],
  ['Đặng Văn Khoa', '0903999000', 'Website', 45],
  ['Ngô Hải Yến', '0904111333', 'Nhóm Zalo', 70],
  ['Lý Trung Kiên', '0904222444', 'Tờ rơi', 12],
  ['Cao Thị Bích', '0904333555', 'Website', 63],
];

/**
 * 8 bậc mặc định — copy nguyên DEFAULT_STATUSES trong
 * backend/src/modules/contacts/status-migration.ts. Chương 05 của playbook
 * giảng đúng 8 bậc này, nên ảnh chụp phải dùng cùng tên và cùng màu.
 * Xếp theo thứ tự phễu để dữ liệu giả rải đều các bậc.
 */
export const STATUSES = [
  { id: 'st-3', name: 'Mới', color: '#9CA3AF', order: 3, isTerminal: false },
  { id: 'st-4', name: 'Tiếp cận', color: '#3B82F6', order: 4, isTerminal: false },
  { id: 'st-5', name: 'Hẹn gặp', color: '#06B6D4', order: 5, isTerminal: false },
  { id: 'st-6', name: 'Nóng', color: '#F97316', order: 6, isTerminal: false },
  { id: 'st-7', name: 'Tiềm năng', color: '#EAB308', order: 7, isTerminal: false },
  { id: 'st-8', name: 'Chốt', color: '#22C55E', order: 8, isTerminal: true },
  { id: 'st-2', name: 'Thất Bại', color: '#EF4444', order: 2, isTerminal: true },
  { id: 'st-1', name: 'Mất', color: '#71717A', order: 1, isTerminal: true },
];

const TAGS = [
  ['Căn 2PN', '#1786be'],
  ['Ngân sách 3-4 tỷ', '#12b76a'],
  ['Cần vay', '#f5a524'],
  ['Đầu tư cho thuê', '#8b5cf6'],
  ['Ở thực', '#0ea5e9'],
  ['View sông', '#06b6d4'],
];

export const CRM_TAGS = TAGS.map(([name, color], i) => ({
  id: `tag-${i + 1}`,
  name,
  slug: `tag-${i + 1}`,
  color,
  count: [24, 31, 12, 9, 40, 7][i],
}));

const PREVIEWS = [
  'Căn 2PN còn suất nào view sông không em?',
  'Bảng giá em gửi anh xem rồi, tầng cao chênh nhiều không?',
  'Cuối tuần này anh sắp xếp qua xem nhà mẫu được',
  'Để anh bàn với vợ đã em nhé',
  'Ngân hàng hỗ trợ vay bao nhiêu %?',
];

export const CONTACTS = PEOPLE.map(([fullName, phone, source, leadScore], i) => {
  const st = STATUSES[i % STATUSES.length];
  return {
    id: `contact-${i + 1}`,
    fullName,
    crmName: fullName,
    phone,
    email: null,
    avatarUrl: null,
    source,
    sourceDate: iso(-30 + i),
    status: st.name,
    statusId: st.id,
    statusRef: st,
    displayStatus: st,
    zaloUid: `9100000${10 + i}`,
    leadScore,
    displayLeadScore: leadScore,
    displayHasZalo: true,
    hasZalo: true,
    // Chip "Nick chăm" đọc từ đây (aggregate Friend.relationshipKind per contact).
    nicksByKind: i % 5 === 4
      ? { friend: 1, pending_friend: 1, chatting_stranger: 0, ghost: 0 }
      : { friend: i % 3 === 0 ? 2 : 1, pending_friend: 0, chatting_stranger: 0, ghost: 0 },
    childrenCount: 0,
    totalInbound: 12 + i * 3,
    totalOutbound: 15 + i * 4,
    totalAppointments: i % 4 === 0 ? 1 : 0,
    nextAppointment: i % 4 === 0 ? iso(1 + (i % 3), 15, 0) : null,
    notes: null,
    tags: [TAGS[i % TAGS.length][0], TAGS[(i + 2) % TAGS.length][0]],
    assignedUserId: 'user-me',
    assignedUser: { id: 'user-me', fullName: ME.fullName },
    contactAccess: [],
    createdAt: iso(-30 + i),
    updatedAt: hoursAgo(i + 1),
    lastActivity: hoursAgo(i + 1),
    lastInteractionAt: hoursAgo(i + 1),
    lastInboundAt: hoursAgo(i + 2),
    lastInboundPreview: PREVIEWS[i % PREVIEWS.length],
    lastInboundType: 'text',
    lastOutboundAt: hoursAgo(i),
    lastOutboundPreview: 'Dạ em gửi anh/chị bảng giá mới nhất ạ',
    lastOutboundType: 'text',
    mergedInto: null,
    _count: { conversations: 1, appointments: i % 4 === 0 ? 1 : 0, children: 0 },
  };
});

/** Nội dung hội thoại mẫu của KH đầu tiên — dùng cho ảnh màn hình Tin nhắn. */
const THREAD_1 = [
  ['contact', 'Chào em, anh thấy tin căn 2PN toà S2 bên em đăng', 'text', 1450],
  ['self', 'Dạ em chào anh Hùng ạ. Toà S2 hiện còn 4 căn 2PN, trong đó 2 căn view sông ạ.', 'text', 1444],
  ['contact', 'Giá tầm bao nhiêu em?', 'text', 1380],
  ['self', 'Dạ căn 2PN 68m² view nội khu từ 3,1 tỷ; view sông từ 3,6 tỷ đã gồm VAT ạ.', 'text', 1376],
  ['self', 'Bảng giá toà S2 - T7.pdf', 'file', 1375],
  ['contact', 'Ok để anh xem', 'text', 1300],
  ['self', 'Dạ anh xem giúp em nhé. Anh quan tâm tầng thấp hay tầng cao ạ?', 'text', 1290],
  ['contact', 'Anh thích tầng cao, thoáng', 'text', 400],
  ['self', 'Dạ tầng cao view sông hiện còn căn S2-1204 và S2-1806 ạ. Em gửi anh mặt bằng nhé.', 'text', 395],
  ['self', 'Mặt bằng 2PN 68m2.jpg', 'image', 394],
  ['contact', 'Căn 2PN còn suất nào view sông không em?', 'text', 46],
  ['contact', 'Cuối tuần anh qua xem nhà mẫu được không?', 'text', 12],
  ['contact', 'Alo em ơi', 'text', 4],
];

export const MESSAGES = THREAD_1.map(([senderType, content, contentType, minsBack], i) => ({
  id: `msg-${i + 1}`,
  content,
  contentType,
  senderType,
  senderName: senderType === 'self' ? ME.fullName : PEOPLE[0][0],
  senderUid: senderType === 'self' ? '900000001' : '910000010',
  sentAt: minsAgo(minsBack),
  isDeleted: false,
  zaloMsgId: `zmsg-${i + 1}`,
  zaloMsgIdNum: String(1000000 + i),
  albumKey: null,
  albumIndex: null,
  albumTotal: null,
  reactions: [],
  reactionDetails: [],
  redacted: false,
  deliveredAt: senderType === 'self' ? minsAgo(minsBack) : null,
  seenAt: senderType === 'self' ? minsAgo(minsBack) : null,
  repliedByUserId: senderType === 'self' ? 'user-me' : null,
  repliedBy: senderType === 'self' ? { id: 'user-me', fullName: ME.fullName, email: ME.email } : null,
}));

/** Conversation đúng shape use-chat.ts: contact + zaloAccount + messages[] preview. */
export const CONVERSATIONS = CONTACTS.slice(0, 8).map((c, i) => {
  const acc = ZALO_ACCOUNTS[i % 2];
  const lastAt = minsAgo(4 + i * 37);
  return {
    id: `conv-${i + 1}`,
    threadType: 'user',
    externalThreadId: c.zaloUid,
    contact: {
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      avatarUrl: null,
      zaloUid: c.zaloUid,
      zaloDisplayName: c.fullName,
      zaloAvatarUrl: null,
      hasConversation: true,
      becameFriendAt: iso(-20 + i),
      firstMessageAt: iso(-20 + i),
      updatedAt: lastAt,
      totalInbound: c.totalInbound,
      totalOutbound: c.totalOutbound,
      leadScore: c.leadScore,
      statusRef: c.statusRef,
      zaloLabels: [],
      crmTagsPerNick: c.tags,
      autoTags: [],
      aliasInNick: null,
    },
    zaloAccount: acc,
    friendship: { relationshipKind: 'friend', friendshipStatus: 'friend' },
    lastMessageAt: lastAt,
    unreadCount: i < 3 ? [3, 1, 2][i] : 0,
    isReplied: i >= 3,
    isPinned: i === 0,
    isVirtual: false,
    messages: [
      {
        content: c.lastInboundPreview,
        contentType: 'text',
        senderType: 'contact',
        sentAt: lastAt,
        isDeleted: false,
      },
    ],
  };
});

/**
 * status chỉ nhận: scheduled | overdue | completed | cancelled | no_show
 * type chỉ nhận:   call | message | meeting | follow_up
 * Sai giá trị → lịch bị filter mặc định lọc mất, lưới tuần hiện "0 lịch".
 * Lưới tuần mặc định chỉ bật 2 trạng thái scheduled + overdue.
 */
export const APPOINTMENTS = [
  // Rải khắp tuần (wd) để lưới Tuần trông đúng nhịp một tuần đi làm…
  ['Ký cọc căn S2-1204', 'contact-8', wd(0), '09:30', 'scheduled', 'meeting', 'Văn phòng sàn, Q1'],
  ['Tư vấn vay ngân hàng', 'contact-5', wd(1), '14:00', 'scheduled', 'call', 'Online - Zalo call'],
  ['Xem nhà mẫu (khách gia đình)', 'contact-10', wd(2), '10:00', 'scheduled', 'meeting', 'Nhà mẫu Ánh Dương, Q9'],
  ['Nhắn lại khách sau hội thảo', 'contact-9', wd(3), '16:30', 'scheduled', 'message', 'Zalo'],
  ['Gọi chốt phương án thanh toán', 'contact-6', wd(4), '11:00', 'scheduled', 'call', 'Gọi Zalo'],
  ['Xem nhà mẫu toà S3', 'contact-4', wd(5), '09:30', 'scheduled', 'meeting', 'Nhà mẫu Ánh Dương, Q9'],
  ['Hẹn cà phê chốt phương án', 'contact-7', wd(2), '08:00', 'overdue', 'meeting', 'Cafe góc Nguyễn Văn Tăng'],
  // …và 2 lịch neo vào ĐÚNG hôm nay, để card "Hẹn hôm nay" ở Dashboard có số.
  ['Xem nhà mẫu toà S2', 'contact-1', 0, '15:00', 'scheduled', 'meeting', 'Nhà mẫu Ánh Dương, Q9'],
  ['Xem nhà mẫu toà S1', 'contact-3', 0, '17:30', 'scheduled', 'meeting', 'Nhà mẫu Ánh Dương, Q9'],
].map(([title, contactId, dayOff, time, status, type, location], i) => {
  const c = CONTACTS.find((x) => x.id === contactId);
  return {
    id: `appt-${i + 1}`,
    contactId,
    contact: { id: c.id, fullName: c.fullName, phone: c.phone, avatarUrl: null, zaloUid: c.zaloUid },
    appointmentDate: ymd(dayOff),
    appointmentTime: time,
    title,
    durationMin: 60,
    location,
    type,
    status,
    notes: null,
    createdAt: iso(-3),
    source: i % 3 === 0 ? 'zalo' : 'manual',
    externalRef: null,
    zaloMessageId: null,
    emoji: null,
    conversationId: null,
    statusChangedAt: null,
    statusChangedBy: null,
    assignedUserId: 'user-me',
    assignedUser: { id: 'user-me', fullName: ME.fullName },
    assignedToId: 'user-me',
    assignedTo: { id: 'user-me', fullName: ME.fullName, email: ME.email },
  };
});

export const FRIENDS = CONTACTS.slice(0, 10).map((c, i) => ({
  id: `friend-${i + 1}`,
  contactId: c.id,
  zaloAccountId: i % 2 === 0 ? 'nick-1' : 'nick-2',
  zaloUidInNick: c.zaloUid,
  friendshipStatus: 'friend',
  hasConversation: i < 8,
  relationshipKind: i < 8 ? 'friend' : i === 8 ? 'pending_friend' : 'chatting_stranger',
  aliasInNick: null,
  zaloLabels: [],
  becameFriendAt: iso(-20 + i),
  removedAt: null,
  firstMessageAt: iso(-20 + i),
  lastInboundAt: hoursAgo(i + 2),
  lastOutboundAt: hoursAgo(i),
  lastInteractionAt: hoursAgo(i),
  totalInbound: c.totalInbound,
  totalOutbound: c.totalOutbound,
  statusId: c.statusId,
  statusRef: c.statusRef,
  leadScore: c.leadScore,
  crmTagsPerNick: c.tags,
  zaloDisplayName: c.fullName,
  zaloAvatarUrl: null,
  zaloGlobalId: null,
  zaloUsername: null,
  scoreBreakdown: {
    engagement: Math.round(c.leadScore * 0.9),
    intent: Math.round(c.leadScore * 1.05),
    fit: Math.round(c.leadScore * 0.8),
    velocity: Math.round(c.leadScore * 0.95),
    finalScore: c.leadScore,
  },
  scoreUpdatedAt: hoursAgo(1),
  stuckSince: i === 3 ? iso(-9) : null,
  autoTags: [],
  stageEnteredAt: iso(-5),
  contact: { id: c.id, fullName: c.fullName, phone: c.phone, avatarUrl: null },
  zaloAccount: ZALO_ACCOUNTS[i % 2],
}));

// ── Kho phương tiện ───────────────────────────────────────────────────
export const MEDIA_FOLDERS = [
  ['mf-1', 'Bảng giá'],
  ['mf-2', 'Mặt bằng căn hộ'],
  ['mf-3', 'Hình nhà mẫu'],
  ['mf-4', 'Tiến độ xây dựng'],
  ['mf-5', 'Chính sách bán hàng'],
].map(([id, name]) => ({ id, name, kind: 'image', visibility: 'public', ownerUserId: null }));

/** [tên file, loại, thư mục, kiểu ảnh giả để vẽ SVG thumbnail] */
const MEDIA_SRC = [
  ['Nhà mẫu 2PN - phòng khách.jpg', 'image', 'mf-3', 'room'],
  ['Nhà mẫu 2PN - bếp.jpg', 'image', 'mf-3', 'room'],
  ['Mặt bằng 2PN 68m2.jpg', 'image', 'mf-2', 'plan'],
  ['Mặt bằng 3PN 92m2.jpg', 'image', 'mf-2', 'plan'],
  ['Nhà mẫu 3PN - ban công.jpg', 'image', 'mf-3', 'room'],
  ['Tiến độ toà S2 - tuần 28.jpg', 'image', 'mf-4', 'tower'],
  ['Sơ đồ tổng thể dự án.jpg', 'image', 'mf-2', 'plan'],
  ['Tiện ích nội khu.jpg', 'image', 'mf-3', 'tower'],
  ['Tiến độ toà S1 - tuần 28.jpg', 'image', 'mf-4', 'tower'],
  ['Nhà mẫu 2PN - phòng ngủ.jpg', 'image', 'mf-3', 'room'],
  ['Bảng giá toà S2 - T7.pdf', 'file', 'mf-1', 'doc'],
  ['Chính sách chiết khấu T7.pdf', 'file', 'mf-5', 'doc'],
];

export const MEDIA_ITEMS = MEDIA_SRC.map(([name, kind, folderId, art], i) => ({
  id: `media-${i + 1}`,
  kind,
  name,
  art,
  folderId,
  visibility: 'public',
  ownerUserId: 'user-me',
  ownerName: ME.fullName,
  sourceNickName: null,
  source: 'upload',
  tagIds: i % 3 === 0 ? ['mt-2'] : ['mt-1'],
  usageCount: 46 - i * 3,
  url: `/api/v1/media/media-${i + 1}/raw`,
  thumbnailUrl: `/api/v1/media/media-${i + 1}/raw`,
  sizeBytes: 240000 + i * 51234,
  durationSec: null,
  width: 1600,
  height: 1200,
  favorited: i < 2,
  watermarkEnabled: false,
  sourceFromPrivateNick: false,
  createdAt: iso(-10 + i),
}));

/**
 * Thumbnail giả dạng SVG — không dùng ảnh chụp thật của dự án nào.
 * Vẽ 4 kiểu: mặt bằng, phòng nhà mẫu, toà nhà, tài liệu.
 */
export function mediaSvg(item) {
  const label = item.name.replace(/\.[a-z0-9]+$/i, '');
  const art = {
    plan: `<rect x="60" y="50" width="360" height="260" fill="#fff" stroke="#1786be" stroke-width="4"/>
      <line x1="240" y1="50" x2="240" y2="200" stroke="#1786be" stroke-width="4"/>
      <line x1="60" y1="200" x2="420" y2="200" stroke="#1786be" stroke-width="4"/>
      <line x1="330" y1="200" x2="330" y2="310" stroke="#1786be" stroke-width="4"/>
      <rect x="90" y="80" width="110" height="70" fill="#e4f1f8"/>
      <rect x="275" y="80" width="110" height="70" fill="#e4f1f8"/>
      <rect x="90" y="230" width="200" height="55" fill="#e4f1f8"/>
      <circle cx="380" cy="255" r="26" fill="#e4f1f8"/>`,
    room: `<rect x="40" y="200" width="400" height="120" fill="#e8d9c5"/>
      <rect x="70" y="120" width="150" height="90" rx="8" fill="#5bb8e5" opacity="0.35"/>
      <rect x="250" y="150" width="170" height="60" rx="10" fill="#0e445a" opacity="0.55"/>
      <rect x="270" y="90" width="130" height="55" rx="6" fill="#fff" opacity="0.7"/>
      <circle cx="120" cy="235" r="22" fill="#fff" opacity="0.75"/>`,
    tower: `<rect x="120" y="70" width="110" height="250" fill="#1786be" opacity="0.75"/>
      <rect x="250" y="130" width="90" height="190" fill="#0e445a" opacity="0.7"/>
      <rect x="350" y="180" width="70" height="140" fill="#5bb8e5" opacity="0.7"/>
      <rect x="40" y="300" width="400" height="20" fill="#12b76a" opacity="0.4"/>`,
    doc: `<rect x="140" y="60" width="200" height="250" rx="8" fill="#fff" stroke="#d0d7e2" stroke-width="3"/>
      <rect x="170" y="100" width="140" height="12" rx="6" fill="#f04438" opacity="0.8"/>
      <rect x="170" y="135" width="140" height="9" rx="4" fill="#cbd5e1"/>
      <rect x="170" y="160" width="110" height="9" rx="4" fill="#cbd5e1"/>
      <rect x="170" y="185" width="140" height="9" rx="4" fill="#cbd5e1"/>
      <rect x="170" y="210" width="90" height="9" rx="4" fill="#cbd5e1"/>`,
  }[item.art];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f1f6fb"/><stop offset="1" stop-color="#dfe9f3"/>
  </linearGradient></defs>
  <rect width="480" height="360" fill="url(#g)"/>
  ${art}
  <rect x="0" y="300" width="480" height="60" fill="#06222f" opacity="0.72"/>
  <text x="24" y="338" font-family="Inter, Arial, sans-serif" font-size="22" fill="#ffffff">${
    label.length > 34 ? `${label.slice(0, 33)}…` : label
  }</text>
</svg>`;
}
