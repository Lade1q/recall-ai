import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '@/lib/apiClient';
import { getPlanActionErrorMessage, planApi } from './plan.api';

vi.mock('@/lib/apiClient', () => ({
  __esModule: true,
  default: { get: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const axiosErr = (status: number, code?: string, message?: string) => ({
  isAxiosError: true,
  response: { status, data: code ? { error: { code, message } } : undefined },
});

describe('getPlanActionErrorMessage', () => {
  it('maps a deleted plan to the stale-list recovery step', () => {
    expect(getPlanActionErrorMessage(axiosErr(404, 'NOT_FOUND'))).toBe(
      'Không tìm thấy kế hoạch này. Hãy tải lại danh sách để xem dữ liệu mới nhất.'
    );
  });

  it('keeps the server guidance for the missing-document re-analysis branch', () => {
    const message = getPlanActionErrorMessage(
      axiosErr(
        409,
        'REANALYZE_NOT_ALLOWED',
        'Kế hoạch này không còn tài liệu nguồn để phân tích lại. Hãy liên hệ hỗ trợ.'
      )
    );

    expect(message).toBe(
      'Kế hoạch này không còn tài liệu nguồn để phân tích lại. Hãy liên hệ hỗ trợ.'
    );
    expect(message).not.toContain('tải lại');
  });

  it('keeps the distinct server guidance when an analysis is already running', () => {
    expect(
      getPlanActionErrorMessage(
        axiosErr(
          409,
          'REANALYZE_NOT_ALLOWED',
          'Kế hoạch này đang được phân tích. Hãy chờ quá trình hiện tại hoàn tất.'
        )
      )
    ).toBe('Kế hoạch này đang được phân tích. Hãy chờ quá trình hiện tại hoàn tất.');
  });

  it('uses a neutral fallback when REANALYZE_NOT_ALLOWED has no message', () => {
    expect(getPlanActionErrorMessage(axiosErr(409, 'REANALYZE_NOT_ALLOWED'))).toBe(
      'Không thể phân tích lại kế hoạch này.'
    );
  });

  it('maps STATUS_TRANSITION_NOT_ALLOWED to the stale-status recovery step', () => {
    expect(getPlanActionErrorMessage(axiosErr(409, 'STATUS_TRANSITION_NOT_ALLOWED'))).toBe(
      'Không thể đổi trạng thái kế hoạch này. Hãy tải lại danh sách để xem trạng thái mới nhất.'
    );
  });
});

describe('planApi.listPlans — kiểm tra payload tại biên', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trả danh sách plans hợp lệ', async () => {
    const plans = [{ id: 'plan-1' }];
    mockedGet.mockResolvedValue({ data: { success: true, data: { plans } } });

    await expect(planApi.listPlans()).resolves.toBe(plans);
  });

  it('ném khi server trả data.plans không phải mảng', async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: { plans: undefined } } });

    await expect(planApi.listPlans()).rejects.toThrow(
      'Invalid /plans response: data.plans must be an array'
    );
  });
});

/**
 * Issue #203. XHR builds the response Blob from only the *essence* of Content-Type, so
 * `text/plain; charset=utf-8` arrives as `text/plain`. Nothing in the app notices until the
 * blob URL is opened as a top-level tab — no charset and no parent document to inherit one
 * from means the browser guesses, and Vietnamese material comes out as mojibake.
 *
 * An `<iframe>` inherits the host page's UTF-8 and hides this entirely, which is exactly how it
 * survived the first round of checking — so it needs a test, not a manual look.
 */
describe('planApi.getDocumentFile — giữ charset của server (#203)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function respondWith(blobType: string, headerContentType: string | undefined): Blob {
    const data = new Blob(['Ngăn xếp'], { type: blobType });
    mockedGet.mockResolvedValue({
      data,
      headers: headerContentType === undefined ? {} : { 'content-type': headerContentType },
    });
    return data;
  }

  it('dựng lại Blob theo Content-Type khi XHR đã tước charset', async () => {
    const original = respondWith('text/plain', 'text/plain; charset=utf-8');

    const blob = await planApi.getDocumentFile('plan-1', 'doc-1');

    expect(blob.type).toBe('text/plain; charset=utf-8');
    // Chỉ đổi nhãn, không đụng vào nội dung.
    expect(blob.size).toBe(original.size);
  });

  it('không dựng lại khi header và blob đã khớp (PDF không mất gì)', async () => {
    const original = respondWith('application/pdf', 'application/pdf');

    const blob = await planApi.getDocumentFile('plan-1', 'doc-1');

    expect(blob.type).toBe('application/pdf');
    expect(blob).toBe(original);
  });

  it('thiếu header Content-Type → trả nguyên blob, không đoán bừa', async () => {
    respondWith('application/octet-stream', undefined);

    const blob = await planApi.getDocumentFile('plan-1', 'doc-1');

    expect(blob.type).toBe('application/octet-stream');
  });

  it('gọi đúng endpoint dạng blob, kèm timeout nới cho tệp lớn', async () => {
    respondWith('application/pdf', 'application/pdf');

    await planApi.getDocumentFile('plan-1', 'doc-1');

    expect(mockedGet).toHaveBeenCalledWith(
      '/api/v1/plans/plan-1/documents/doc-1',
      expect.objectContaining({ responseType: 'blob', timeout: 60000 })
    );
  });
});
