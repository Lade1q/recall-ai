import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchDocumentObjectUrl } from './documentFile';
import { planApi } from '../api/plan.api';

/**
 * Primitive dùng chung cho mọi cách *bày* một tài liệu đã lưu: #203 mở tab kèm `#page=N`, FS-04
 * nhúng `<iframe>` trong phiên học. Test khoá đúng phần chung — lấy bytes có mang token, đổi
 * thành object URL, và trả lại quyền thu hồi cho nơi gọi.
 */
describe('fetchDocumentObjectUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubUrl() {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    return { createObjectURL, revokeObjectURL };
  }

  it('tải qua planApi (mang Bearer token) rồi trả object URL của chính blob đó', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    vi.spyOn(planApi, 'getDocumentFile').mockResolvedValue(blob);
    const { createObjectURL } = stubUrl();

    const result = await fetchDocumentObjectUrl('plan-1', 'doc-1');

    expect(planApi.getDocumentFile).toHaveBeenCalledWith('plan-1', 'doc-1');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(result.url).toBe('blob:fake-url');
  });

  /**
   * Thời điểm thu hồi là của nơi gọi (tab mới phải hẹn giờ, `<iframe>` thu hồi lúc unmount) —
   * nên primitive KHÔNG được tự thu hồi, chỉ trao lại cái nút bấm.
   */
  it('không tự thu hồi; `revoke` thu hồi đúng URL đã cấp', async () => {
    vi.spyOn(planApi, 'getDocumentFile').mockResolvedValue(new Blob(['%PDF']));
    const { revokeObjectURL } = stubUrl();

    const { revoke } = await fetchDocumentObjectUrl('plan-1', 'doc-1');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    revoke();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('lỗi mạng vỡ ra ngoài, không tạo object URL mồ côi', async () => {
    vi.spyOn(planApi, 'getDocumentFile').mockRejectedValue(new Error('network'));
    const { createObjectURL } = stubUrl();

    await expect(fetchDocumentObjectUrl('plan-1', 'doc-1')).rejects.toThrow('network');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
