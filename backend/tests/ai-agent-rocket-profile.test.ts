/**
 * ai-agent-rocket-profile.test.ts — lớp công khai của danh sách profile Rocket.
 *
 * Nguồn dữ liệu đã đổi từ `hermes profile list` sang đọc thẳng thư mục cấu hình của
 * Rocket (backend trong container không spawn được CLI của host) — phần đọc đĩa nằm ở
 * ai-agent-rocket-profile-store.test.ts. File này giữ hai bất biến của lớp trên nó:
 *
 *  1. KHOÁ api_server không bao giờ lọt ra ngoài backend — dropdown chỉ cần biết CÓ khoá
 *     hay không. Rò khoá qua REST là mất quyền điều khiển Rocket (agent có tool hệ thống).
 *  2. Nút "tải lại danh sách" phải bỏ cache — không thì admin vừa tạo profile bên Rocket,
 *     bấm tải lại vẫn thấy danh sách cũ tới 30 giây và tưởng hỏng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listRecordsMock = vi.fn();
const clearCacheMock = vi.fn();

vi.mock('../src/modules/ai-agent/rocket-profile-store.js', () => ({
  listRocketProfileRecords: () => listRecordsMock(),
  clearRocketProfileCache: () => clearCacheMock(),
}));

const { listRocketProfiles, isValidRocketProfileFormat } = await import(
  '../src/modules/ai-agent/rocket-profile.js'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listRocketProfiles', () => {
  it('trả cổng + trạng thái cho UI nhưng KHÔNG trả khoá api_server', async () => {
    listRecordsMock.mockResolvedValue({
      ok: true,
      message: 'Đọc được 1 profile',
      profiles: [
        {
          name: 'tony-fb-sp',
          apiServerEnabled: true,
          port: 8642,
          configuredHost: '127.0.0.1',
          defaultModel: 'hermes-cskh',
          hasKey: true,
          gatewayState: 'running',
          apiKey: 'khoa-that-khong-duoc-lo',
        },
      ],
    });

    const res = await listRocketProfiles();

    expect(res.profiles[0]).toEqual({
      name: 'tony-fb-sp',
      model: 'hermes-cskh',
      gateway: 'running',
      apiServerEnabled: true,
      port: 8642,
      hasKey: true,
    });
    expect(JSON.stringify(res)).not.toContain('khoa-that-khong-duoc-lo');
  });

  it('giữ nguyên lời chẩn đoán của store khi đọc hỏng, không ném lỗi', async () => {
    listRecordsMock.mockResolvedValue({
      ok: false,
      profiles: [],
      message: 'Không thấy thư mục profile Rocket "/rocket-profiles".',
    });

    const res = await listRocketProfiles();

    expect(res.ok).toBe(false);
    expect(res.message).toContain('/rocket-profiles');
  });

  it('chỉ bỏ cache khi được yêu cầu tải lại', async () => {
    listRecordsMock.mockResolvedValue({ ok: true, profiles: [], message: '' });

    await listRocketProfiles();
    expect(clearCacheMock).not.toHaveBeenCalled();

    await listRocketProfiles(true);
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe('isValidRocketProfileFormat', () => {
  it('chặn path-injection và ký tự lạ', () => {
    for (const bad of ['../etc', 'a/b', 'Hoa', 'có dấu', '-dau-gach', '', 'a'.repeat(65)]) {
      expect(isValidRocketProfileFormat(bad)).toBe(false);
    }
  });

  it('chấp nhận tên hợp lệ', () => {
    for (const good of ['tony-fb-sp', 'a', 'zalo_support', 'p1']) {
      expect(isValidRocketProfileFormat(good)).toBe(true);
    }
  });
});
