import { describe, expect, it } from 'vitest';
import { getReviewQueueErrorMessage } from './review-queue.api';

// axios `isAxiosError` chỉ kiểm `payload.isAxiosError === true`, nên một object phẳng đúng hình
// dạng là đủ — cùng khuôn với `focus.api.test.ts`.
const axiosErr = (status: number, code?: string, message?: string) => ({
  isAxiosError: true,
  response: { status, data: code ? { error: { code, message } } : undefined },
});

const GENERIC = 'Đã xảy ra lỗi, vui lòng thử lại.';

/** Nguyên văn câu server dựng ở `setReviewQueueItemScheduledFor` (#403). */
const SERVER_LOCKED_MESSAGE =
  "Không thể dời ngày: Nền tảng của 'Duyệt đồ thị DFS' mà bạn còn yếu, nên lịch của mục này do hệ thống giữ nguyên.";

describe('getReviewQueueErrorMessage', () => {
  it('trả câu chung cho lỗi không phải axios', () => {
    expect(getReviewQueueErrorMessage(new Error('x'), 'reschedule')).toBe(GENERIC);
  });

  it('trả câu mất mạng khi không có response', () => {
    expect(getReviewQueueErrorMessage({ isAxiosError: true, response: undefined }, 'remove')).toBe(
      'Không kết nối được tới máy chủ. Vui lòng thử lại.'
    );
  });

  it('NOT_FOUND chỉ đường tải lại, không bảo thử lại', () => {
    const message = getReviewQueueErrorMessage(axiosErr(404, 'NOT_FOUND'), 'reschedule');
    expect(message).toBe('Mục này không còn trong lịch ôn. Vui lòng tải lại trang.');
    expect(message).not.toBe(GENERIC);
  });

  it('VALIDATION_ERROR nói ra ĐÚNG ràng buộc khi đang dời ngày', () => {
    expect(getReviewQueueErrorMessage(axiosErr(400, 'VALIDATION_ERROR'), 'reschedule')).toBe(
      'Không dời được: ngày bạn chọn đã ở quá khứ.'
    );
  });

  it('VALIDATION_ERROR ở thao tác gỡ KHÔNG mượn câu của nhánh dời ngày', () => {
    // Cùng một mã, hai nghĩa: ở nhánh `{status}` nó là body sai hình dạng, không phải ngày quá
    // khứ. Nói "ngày bạn chọn đã ở quá khứ" khi người dùng vừa bấm "Gỡ khỏi lịch" là nói sai.
    const remove = getReviewQueueErrorMessage(axiosErr(400, 'VALIDATION_ERROR'), 'remove');
    expect(remove).toBe('Thông tin gửi lên chưa hợp lệ.');
    expect(remove).not.toBe(
      getReviewQueueErrorMessage(axiosErr(400, 'VALIDATION_ERROR'), 'reschedule')
    );
  });

  /**
   * 🔴 Bài test mang trọn giá trị của mapper này.
   *
   * `error-code-contract.test.ts` chỉ bắt được "thiếu `case`" — nó KHÔNG phân biệt được một `case`
   * render câu của server với một `case` trả về hằng số cứng của client. Đây là chỗ duy nhất bắt
   * được điều đó, và nó bắt bằng cách đòi **tên khái niệm** xuất hiện trong kết quả: chuỗi đó do
   * `buildReasonText` sinh ra từ dữ liệu, nên không hằng số client nào chứa nó.
   */
  it('TRACEBACK_REPRESENTATIVE_LOCKED render NGUYÊN VĂN câu của server', () => {
    const message = getReviewQueueErrorMessage(
      axiosErr(409, 'TRACEBACK_REPRESENTATIVE_LOCKED', SERVER_LOCKED_MESSAGE),
      'reschedule'
    );
    expect(message).toBe(SERVER_LOCKED_MESSAGE);
    expect(message).toContain('Duyệt đồ thị DFS');
    expect(message).not.toBe(GENERIC);
  });

  it('rẽ theo `code`, KHÔNG theo HTTP status', () => {
    // #426/PR #429 đổi mã này từ 400 sang 409. Mapper phải bình thản với cả hai, nếu không thì
    // ngày PR đó merge là ngày câu trên im lặng rơi về fallback.
    for (const status of [400, 409]) {
      expect(
        getReviewQueueErrorMessage(
          axiosErr(status, 'TRACEBACK_REPRESENTATIVE_LOCKED', SERVER_LOCKED_MESSAGE),
          'reschedule'
        )
      ).toBe(SERVER_LOCKED_MESSAGE);
    }
  });

  it('mã lạ rơi về câu chung thay vì hiện chữ tiếng Anh của server', () => {
    expect(getReviewQueueErrorMessage(axiosErr(500, 'INTERNAL_ERROR', 'boom'), 'remove')).toBe(
      GENERIC
    );
  });
});
