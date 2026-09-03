import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '@/lib/apiClient';
import { getPlanActionErrorMessage, getAddDocumentsErrorMessage, planApi } from './plan.api';

vi.mock('@/lib/apiClient', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

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

describe('planApi.addDocuments', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedPost.mockResolvedValue({ data: { success: true } });
  });

  /**
   * Every file goes on the SAME `files` key. Appending them under distinct names (`files[0]`…)
   * is the shape multer's `upload.fields` silently drops as unknown fields, and the request would
   * come back "File is required" with all the bytes already transferred.
   */
  it('posts every file under the repeated `files` field, plus the mode', async () => {
    const a = new File(['x'], 'LN09.pdf', { type: 'application/pdf' });
    const b = new File(['y'], 'LN10.pdf', { type: 'application/pdf' });

    await planApi.addDocuments('plan-1', [a, b], 'append');

    const [url, body] = mockedPost.mock.calls[0] as [string, FormData];
    expect(url).toBe('/api/v1/plans/plan-1/documents');
    expect(body.getAll('files')).toEqual([a, b]);
    expect(body.get('mode')).toBe('append');
  });

  it('never invents a default mode — the server requires the field', async () => {
    await planApi.addDocuments('plan-1', [new File(['x'], 'a.pdf')], 'full');

    const body = (mockedPost.mock.calls[0] as [string, FormData])[1];
    expect(body.get('mode')).toBe('full');
  });
});

describe('getAddDocumentsErrorMessage', () => {
  /**
   * ADD_DOCUMENTS_NOT_ALLOWED covers four different refusals and the server writes a different
   * Vietnamese sentence for each. Replacing them with one generic line is the `PLAN_NOT_ACTIVE`
   * (#350) failure again: the reason the user could act on gets swallowed.
   */
  it('passes the server’s own reason through for a refused add', () => {
    expect(
      getAddDocumentsErrorMessage(
        axiosErr(
          409,
          'ADD_DOCUMENTS_NOT_ALLOWED',
          'Kế hoạch này đang được phân tích. Hãy chờ quá trình hiện tại hoàn tất.'
        )
      )
    ).toBe('Kế hoạch này đang được phân tích. Hãy chờ quá trình hiện tại hoàn tất.');
  });

  it('falls back to a neutral line when that code arrives with no message', () => {
    expect(getAddDocumentsErrorMessage(axiosErr(409, 'ADD_DOCUMENTS_NOT_ALLOWED'))).toBe(
      'Không thể thêm tài liệu vào kế hoạch này lúc này. Vui lòng tải lại trang.'
    );
  });

  /** An encrypted PDF has to name the file; the generic toast would leave five files to guess from. */
  it('keeps the upload-validation message, which names the offending file', () => {
    expect(
      getAddDocumentsErrorMessage(
        axiosErr(400, 'ENCRYPTED_PDF', 'LN09.pdf: PDF này được đặt mật khẩu.')
      )
    ).toBe('LN09.pdf: PDF này được đặt mật khẩu.');
  });

  it('does not pretend to know an unrelated failure', () => {
    expect(getAddDocumentsErrorMessage(axiosErr(500, 'INTERNAL_ERROR'))).toBe(
      'Không thêm được tài liệu. Vui lòng thử lại.'
    );
  });
});
