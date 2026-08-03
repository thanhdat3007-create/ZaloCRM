/**
 * group-broadcast-send.test.ts — Gửi mẫu tin vào 1 nhóm Zalo.
 * Mock ở biên zaloOps + downloadMediaToTemp + prisma. Không import `_ee`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedAttachment } from '../src/modules/chat/message-template-service.js';

const zaloOpsMock = {
  sendMessage: vi.fn(),
  sendImage: vi.fn(),
  sendFile: vi.fn(),
};
const sendNativeVideoMock = vi.fn();
const recordSendMock = vi.fn();
const cleanupMock = vi.fn().mockResolvedValue(undefined);
const downloadMock = vi.fn();

vi.mock('../src/shared/zalo-operations.js', () => ({ zaloOps: zaloOpsMock }));
vi.mock('../src/shared/video-processor.js', () => ({
  sendNativeVideo: (...a: any[]) => sendNativeVideoMock(...a),
}));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({
  zaloRateLimiter: { recordSend: (...a: any[]) => recordSendMock(...a) },
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { getInstance: vi.fn(() => ({ api: {}, status: 'connected' })) },
}));
vi.mock('../src/modules/chat/chat-media-helpers.js', () => ({
  downloadMediaToTemp: (...a: any[]) => downloadMock(...a),
  extractZaloMsgId: (r: any) => String(r?.msgId ?? ''),
}));
vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    conversation: { upsert: vi.fn() },
    message: { create: vi.fn() },
  },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// Tên người phát chiến dịch — tra DB, mock ở biên để test này chỉ nói về việc gửi nhóm.
vi.mock('../src/modules/chat/chat-helpers.js', () => ({
  getUserFullName: vi.fn(async () => 'Chị Hiên'),
}));

const { sendToGroup, prepareMedia, classifySendError, GroupSendError } =
  await import('../src/modules/zalo/group-broadcast-send.js');
const { prisma } = await import('../src/shared/database/prisma-client.js');
const p = prisma as any;

function attachment(over: Partial<ResolvedAttachment>): ResolvedAttachment {
  return {
    mediaAssetId: 'a1', kind: 'image', name: 'anh.jpg', caption: '',
    blobUrl: 'http://minio/anh.jpg', missing: false, ...over,
  };
}

/** Media rỗng — dùng cho ca chỉ có chữ. */
const noMedia = () => ({ images: [], others: [], warnings: [], cleanup: cleanupMock });

function args(over: Record<string, unknown> = {}) {
  return {
    orgId: 'org-1', zaloAccountId: 'za-1', groupId: 'g-1', groupName: 'Nhóm A',
    text: '', media: noMedia(), broadcastName: 'CD 1', broadcastCreatedById: 'user-1', io: null,
    ...over,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTOMATION_STUB_MODE;
  // clearAllMocks giữ implementation cũ (mockRejectedValue rò sang test sau) → set lại.
  zaloOpsMock.sendMessage.mockResolvedValue({ msgId: '111' });
  zaloOpsMock.sendImage.mockResolvedValue({ msgId: '222' });
  zaloOpsMock.sendFile.mockResolvedValue({ msgId: '333' });
  sendNativeVideoMock.mockResolvedValue({ msgId: '444' });
  let n = 0;
  downloadMock.mockImplementation(async () => ({ path: `/tmp/f${++n}`, cleanup: cleanupMock }));
  p.conversation.upsert.mockResolvedValue({ id: 'conv-1', zaloAccount: { zaloUid: 'uid-1' } });
  p.message.create.mockResolvedValue({ id: 'msg-1' });
});

// ── prepareMedia ────────────────────────────────────────────────────────────
describe('prepareMedia', () => {
  it('tải mỗi đính kèm đúng 1 lần, tách ảnh / khác', async () => {
    const media = await prepareMedia([
      attachment({ mediaAssetId: 'a1' }),
      attachment({ mediaAssetId: 'a2' }),
      attachment({ mediaAssetId: 'f1', kind: 'file', name: 'bao-gia.pdf' }),
    ]);
    expect(downloadMock).toHaveBeenCalledTimes(3);
    expect(media.images.map((i) => i.path)).toEqual(['/tmp/f1', '/tmp/f2']);
    expect(media.others).toHaveLength(1);
  });

  it('đính kèm missing → bỏ qua kèm cảnh báo, không tải', async () => {
    const media = await prepareMedia([attachment({ missing: true, name: 'da-xoa.jpg' })]);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(media.images).toHaveLength(0);
    expect(media.warnings[0]).toContain('da-xoa.jpg');
  });

  it('tải hỏng 1 đính kèm → cảnh báo, đính kèm khác vẫn dùng được', async () => {
    downloadMock
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ path: '/tmp/ok', cleanup: cleanupMock });
    const media = await prepareMedia([
      attachment({ mediaAssetId: 'a1', name: 'hong.jpg' }),
      attachment({ mediaAssetId: 'a2' }),
    ]);
    expect(media.images).toHaveLength(1);
    expect(media.warnings[0]).toContain('hong.jpg');
  });

  it('quá 12 ảnh → chỉ giữ 12 ảnh đầu (trần album SDK)', async () => {
    const media = await prepareMedia(
      Array.from({ length: 14 }, (_, i) => attachment({ mediaAssetId: `a${i}` })),
    );
    expect(media.images).toHaveLength(12);
    expect(media.warnings).toHaveLength(2);
  });

  it('cleanup xoá mọi tmp đã tải', async () => {
    const media = await prepareMedia([attachment({ mediaAssetId: 'a1' }), attachment({ mediaAssetId: 'a2' })]);
    await media.cleanup();
    expect(cleanupMock).toHaveBeenCalledTimes(2);
  });
});

// ── sendToGroup ─────────────────────────────────────────────────────────────
describe('sendToGroup', () => {
  it('mẫu chỉ chữ → gọi sendMessage đúng 1 lần với threadType=1', async () => {
    const res = await sendToGroup(args({ text: 'Xin chào' }));
    expect(zaloOpsMock.sendMessage).toHaveBeenCalledTimes(1);
    expect(zaloOpsMock.sendMessage.mock.calls[0].slice(0, 4)).toEqual([
      'za-1', 'g-1', 1, { msg: 'Xin chào' },
    ]);
    expect(zaloOpsMock.sendImage).not.toHaveBeenCalled();
    expect(res.zaloMsgIds).toEqual(['111']);
    expect(res.stepsDone).toBe(1);
  });

  it('mẫu 3 ảnh → gọi sendImage 1 lần với 3 path đúng thứ tự', async () => {
    const media = await prepareMedia([
      attachment({ mediaAssetId: 'a1' }), attachment({ mediaAssetId: 'a2' }), attachment({ mediaAssetId: 'a3' }),
    ]);
    await sendToGroup(args({ media }));
    expect(zaloOpsMock.sendImage).toHaveBeenCalledTimes(1);
    expect(zaloOpsMock.sendImage.mock.calls[0][3]).toEqual(['/tmp/f1', '/tmp/f2', '/tmp/f3']);
  });

  it('chữ + 2 ảnh + 1 file → sendMessage → sendImage → sendFile theo đúng thứ tự', async () => {
    const order: string[] = [];
    zaloOpsMock.sendMessage.mockImplementation(async () => { order.push('text'); return { msgId: '1' }; });
    zaloOpsMock.sendImage.mockImplementation(async () => { order.push('album'); return { msgId: '2' }; });
    zaloOpsMock.sendFile.mockImplementation(async () => { order.push('file'); return { msgId: '3' }; });

    const media = await prepareMedia([
      attachment({ mediaAssetId: 'a1' }),
      attachment({ mediaAssetId: 'a2' }),
      attachment({ mediaAssetId: 'f1', kind: 'file', name: 'bao-gia.pdf' }),
    ]);
    const res = await sendToGroup(args({ text: 'hi', media }));
    expect(order).toEqual(['text', 'album', 'file']);
    expect(res.stepsDone).toBe(3);
  });

  it('media KHÔNG tải lại theo từng nhóm — 3 nhóm dùng chung 1 lần tải', async () => {
    const media = await prepareMedia([attachment({ mediaAssetId: 'a1' })]);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    for (const groupId of ['g-1', 'g-2', 'g-3']) {
      await sendToGroup(args({ media, groupId }));
    }
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(zaloOpsMock.sendImage).toHaveBeenCalledTimes(3);
  });

  it('cảnh báo đính kèm mất được chuyển tiếp vào kết quả', async () => {
    const media = await prepareMedia([attachment({ missing: true, name: 'da-xoa.jpg' })]);
    const res = await sendToGroup(args({ text: 'hi', media }));
    expect(zaloOpsMock.sendImage).not.toHaveBeenCalled();
    expect(res.warnings[0]).toContain('da-xoa.jpg');
  });

  it('lỗi giữa chừng → GroupSendError mang theo số bước ĐÃ gửi', async () => {
    zaloOpsMock.sendImage.mockRejectedValue(new Error('boom'));
    const media = await prepareMedia([attachment({ mediaAssetId: 'a1' })]);
    await expect(sendToGroup(args({ text: 'hi', media })))
      .rejects.toMatchObject({ name: 'GroupSendError', stepsDone: 1 });
  });

  it('skipSteps bỏ qua đúng phần đã gửi — không gửi lại đoạn chữ', async () => {
    const media = await prepareMedia([attachment({ mediaAssetId: 'a1' })]);
    const res = await sendToGroup(args({ text: 'hi', media, skipSteps: 1 }));
    expect(zaloOpsMock.sendMessage).not.toHaveBeenCalled();
    expect(zaloOpsMock.sendImage).toHaveBeenCalledTimes(1);
    expect(res.stepsDone).toBe(2);
  });

  it('skipSteps ≥ số bước → không gửi gì cả', async () => {
    const res = await sendToGroup(args({ text: 'hi', skipSteps: 5 }));
    expect(zaloOpsMock.sendMessage).not.toHaveBeenCalled();
    expect(res.stepsDone).toBe(1);
  });

  it('nhóm chưa có Conversation → upsert tạo mới threadType=group', async () => {
    await sendToGroup(args({ text: 'hi' }));
    expect(p.conversation.upsert).toHaveBeenCalledTimes(1);
    const call = p.conversation.upsert.mock.calls[0][0];
    expect(call.where.zaloAccountId_externalThreadId).toEqual({
      zaloAccountId: 'za-1', externalThreadId: 'g-1',
    });
    expect(call.create.threadType).toBe('group');
    expect(call.create.groupName).toBe('Nhóm A');
  });

  it('ghi Message với nguồn = chiến dịch, KHÔNG giả làm tin sale gõ tay', async () => {
    await sendToGroup(args({ text: 'hi', broadcastName: 'Khuyến mãi T8' }));
    const data = p.message.create.mock.calls[0][0].data;

    expect(data.contentType).toBe('text');
    expect(data.metadata.sender.detail).toBe('Chiến dịch: Khuyến mãi T8');
    // Truy được người bấm phát…
    expect(data.sentByKind).toBe('campaign');
    expect(data.repliedByUserId).toBe('user-1');
    // …nhưng nhãn phải khác tin sale gõ tay, nếu không UI hiện y hệt nhau và quy sai
    // trách nhiệm cho người phát động như thể họ ngồi nhắn từng nhóm.
    expect(data.metadata.sender.kind).not.toBe('user_crm');
  });

  it('video gửi qua sendNativeVideo và TỰ ghi nhận vào rate limiter', async () => {
    const media = await prepareMedia([
      attachment({ mediaAssetId: 'v1', kind: 'video', name: 'clip.mp4' }),
    ]);
    await sendToGroup(args({ media }));
    expect(sendNativeVideoMock).toHaveBeenCalledTimes(1);
    // sendNativeVideo gọi thẳng api → exec không đếm hộ, phải tự recordSend.
    expect(recordSendMock).toHaveBeenCalledWith('za-1', 'message');
  });

  it('video lỗi → fallback sendFile, KHÔNG đếm 2 lần', async () => {
    sendNativeVideoMock.mockRejectedValue(new Error('ffmpeg missing'));
    const media = await prepareMedia([
      attachment({ mediaAssetId: 'v1', kind: 'video', name: 'clip.mp4' }),
    ]);
    await sendToGroup(args({ media }));
    expect(zaloOpsMock.sendFile).toHaveBeenCalledTimes(1);
    // Fallback đi qua zaloOps.exec (đã tự đếm) → không recordSend thủ công.
    expect(recordSendMock).not.toHaveBeenCalled();
  });

  it('AUTOMATION_STUB_MODE=true → không chạm Zalo', async () => {
    process.env.AUTOMATION_STUB_MODE = 'true';
    const media = await prepareMedia([attachment({ mediaAssetId: 'a1' })]);
    const res = await sendToGroup(args({ text: 'hi', media }));
    expect(zaloOpsMock.sendMessage).not.toHaveBeenCalled();
    expect(zaloOpsMock.sendImage).not.toHaveBeenCalled();
    expect(res.zaloMsgIds).toEqual([]);
  });
});

describe('classifySendError', () => {
  it('mã Zalo trong message → ZALO_<code>', () => {
    expect(classifySendError(new Error('sendMessage failed: x [zalo:112]')).errorCode).toBe('ZALO_112');
  });
  it('nick không còn trong nhóm → NOT_IN_GROUP', () => {
    expect(classifySendError(new Error('user was kicked from group')).errorCode).toBe('NOT_IN_GROUP');
  });
  it('lỗi mạng → NETWORK', () => {
    expect(classifySendError(new Error('fetch failed')).errorCode).toBe('NETWORK');
  });
  it('ZaloOpError code=RATE_LIMITED → RATE_LIMIT dù message tiếng Việt', () => {
    const err: any = new Error('Đã đạt giới hạn 200 message/ngày');
    err.code = 'RATE_LIMITED';
    expect(classifySendError(err).errorCode).toBe('RATE_LIMIT');
  });
  it('ZaloOpError code=NOT_CONNECTED → NICK_OFFLINE', () => {
    const err: any = new Error('Zalo account not connected (status: disconnected)');
    err.code = 'NOT_CONNECTED';
    expect(classifySendError(err).errorCode).toBe('NICK_OFFLINE');
  });
  it('bóc lỗi gốc bên trong GroupSendError', () => {
    const inner: any = new Error('boom [zalo:213]');
    expect(classifySendError(new GroupSendError(inner, [], 1)).errorCode).toBe('ZALO_213');
  });
  it('còn lại → UNKNOWN, cắt message còn 500 ký tự', () => {
    const got = classifySendError(new Error('x'.repeat(900)));
    expect(got.errorCode).toBe('UNKNOWN');
    expect(got.errorMessage).toHaveLength(500);
  });
});
