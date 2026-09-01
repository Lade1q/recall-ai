import { describe, expect, it } from 'vitest';
import { getInterviewErrorMessage, isAiOrNetworkFailure } from './interview.api';

// axios `isAxiosError` only checks `payload.isAxiosError === true`, so plain
// objects shaped like an axios error are enough here.
const axiosErr = (status: number, code?: string, message?: string) => ({
  isAxiosError: true,
  response: { status, data: code ? { error: { code, message } } : undefined },
});

describe('getInterviewErrorMessage', () => {
  it('maps NO_MATERIAL to its own message', () => {
    expect(getInterviewErrorMessage(axiosErr(409, 'NO_MATERIAL'))).toBe(
      'Kế hoạch này chưa có tài liệu để tạo câu hỏi. Hãy tải tài liệu lên trước khi bắt đầu kiểm tra.'
    );
  });

  it('maps DOCUMENT_FILE_MISSING to an actionable document-replacement message', () => {
    expect(getInterviewErrorMessage(axiosErr(404, 'DOCUMENT_FILE_MISSING'))).toBe(
      'Tệp tài liệu của kế hoạch không còn khả dụng. Hãy mở kế hoạch, đổi tài liệu khác rồi thử kiểm tra lại.'
    );
  });

  // PLAN_NOT_ACTIVE covers two different plan states (archived / draft) with two different
  // action sentences, so it's the one code rendered straight from the server message instead
  // of a client-side constant — see the matching case in focus.api.ts (review #350).
  it('maps PLAN_NOT_ACTIVE to the server-provided message verbatim, archived variant', () => {
    const err = axiosErr(
      409,
      'PLAN_NOT_ACTIVE',
      'Kế hoạch này đã được lưu trữ. Bỏ lưu trữ để ôn tiếp.'
    );
    expect(getInterviewErrorMessage(err)).toBe(
      'Kế hoạch này đã được lưu trữ. Bỏ lưu trữ để ôn tiếp.'
    );
  });

  it('maps PLAN_NOT_ACTIVE to the server-provided message verbatim, draft variant', () => {
    const err = axiosErr(
      409,
      'PLAN_NOT_ACTIVE',
      'Kế hoạch này đang chờ bạn xác nhận đồ thị khái niệm. Kiểm chứng xong, hàng đợi ôn sẽ bắt đầu chạy.'
    );
    expect(getInterviewErrorMessage(err)).toBe(
      'Kế hoạch này đang chờ bạn xác nhận đồ thị khái niệm. Kiểm chứng xong, hàng đợi ôn sẽ bắt đầu chạy.'
    );
  });

  // Same exception, and the last code that needs it: NO_CONCEPTS_TO_REVIEW is the only other
  // place the server sends Vietnamese copy (`queue.message ?? NO_CONCEPTS_MESSAGE`). Three
  // sentences are reachable through it and each names a different next step — empty graph (add
  // concepts or re-analyse), plan fully reviewed, and nothing left on the schedule. A single
  // client-side constant would have to drop two of the three.
  //
  // Note the draft/archived sentences are *not* among them: startInterview checks plan status
  // first and throws PLAN_NOT_ACTIVE before the queue is ever consulted.
  it('maps NO_CONCEPTS_TO_REVIEW to the server-provided message verbatim, empty-graph variant', () => {
    const err = axiosErr(
      409,
      'NO_CONCEPTS_TO_REVIEW',
      'Kế hoạch này hiện không có khái niệm nào, nên chưa có gì để ôn. Thêm khái niệm vào đồ thị hoặc phân tích lại tài liệu để bắt đầu.'
    );
    expect(getInterviewErrorMessage(err)).toBe(
      'Kế hoạch này hiện không có khái niệm nào, nên chưa có gì để ôn. Thêm khái niệm vào đồ thị hoặc phân tích lại tài liệu để bắt đầu.'
    );
  });

  // The server always sets a message on this code, so the fallback only fires if that ever stops
  // being true. It mirrors the server's own NO_CONCEPTS_MESSAGE rather than the sentence the old
  // `NO_ACTIVE_CONCEPTS` ghost case carried ("Hãy chọn khái niệm khác"), which promised a choice
  // the "Dùng gợi ý hôm nay" entry point does not offer.
  it('falls back to a neutral sentence when NO_CONCEPTS_TO_REVIEW carries no message', () => {
    expect(getInterviewErrorMessage(axiosErr(409, 'NO_CONCEPTS_TO_REVIEW'))).toBe(
      'Không có khái niệm nào cần ôn tập trong kế hoạch này.'
    );
  });

  // Was `SESSION_NOT_ACTIVE` — a code the server never emitted, so this sentence was unreachable.
  // The server's actual code for an already-finished session is SESSION_ENDED (4 throw sites).
  it('maps SESSION_ENDED, the code the server actually emits for a finished session', () => {
    expect(getInterviewErrorMessage(axiosErr(409, 'SESSION_ENDED'))).toBe(
      'Phiên này không còn ở trạng thái đang diễn ra. Vui lòng tải lại trang.'
    );
  });

  it('falls back to the generic message for an unknown code', () => {
    expect(getInterviewErrorMessage(axiosErr(400, 'SOMETHING_ELSE'))).toBe(
      'Đã xảy ra lỗi, vui lòng thử lại.'
    );
  });
});

describe('isAiOrNetworkFailure', () => {
  it('treats a request without any server response as retryable', () => {
    expect(isAiOrNetworkFailure({ isAxiosError: true })).toBe(true);
  });

  it('treats a structured AI error as retryable', () => {
    expect(isAiOrNetworkFailure(axiosErr(502, 'AI_UPSTREAM_ERROR'))).toBe(true);
  });

  it('does not label an ordinary HTTP 500 as an AI failure', () => {
    expect(isAiOrNetworkFailure(axiosErr(500, 'INTERNAL_ERROR'))).toBe(false);
  });

  // Giữ ca này, nhưng đừng đọc nó thành lưới của #492: một 404 trả `false` ở CẢ hai bản — bản
  // trước (`code?.startsWith('AI_')` rồi `status >= 500`) lẫn bản sau (`?? false`) — nên nó không
  // phân biệt được thay đổi mang tên nó. Ca thật sự gánh lưới ấy là `ordinary HTTP 500` ở ngay
  // trên, chỗ kết quả lật từ `true` sang `false`. Hợp đồng ca này ghim vẫn đúng và vẫn đáng giữ.
  it('does not offer an AI retry loop when the document file is missing', () => {
    expect(isAiOrNetworkFailure(axiosErr(404, 'DOCUMENT_FILE_MISSING'))).toBe(false);
  });

  /**
   * `?? false` mang trọn quyết định "5xx KHÔNG kèm mã lỗi thì không tính là lỗi AI", và trước hai
   * ca dưới đây không assertion nào phân biệt được nó: đột biến `?? false` → `?? true` sống qua
   * cả 544/544 ở 241cb6f. Ca `HTTP 500` phía trên không cứu được, vì nó không bao giờ chạm tới
   * `??` — `'INTERNAL_ERROR'.startsWith('AI_')` trả `false`, không phải `undefined`.
   *
   * HAI ca chứ không một, vì chúng canh hai mắt xích KHÁC NHAU của `data?.error?.code`: thân rỗng
   * dừng ngay ở `data?.`, còn thân HTML đi qua được mắt đó rồi mới dừng ở `error?.`. Bỏ ca nào
   * cũng thả một đột biến về (số đo trong PR).
   */
  it('does not treat a 5xx with no body as an AI failure', () => {
    expect(isAiOrNetworkFailure(axiosErr(502))).toBe(false);
  });

  // Ca này đã quan sát được ở lane LIVE: một `502` do nginx sinh ra, thân là trang HTML chứ không
  // phải JSON theo hợp đồng của API. `data` khi ấy là một CHUỖI, nên `data?.error` mới là mắt
  // xích giữ cho biểu thức không ném — `axiosErr` không dựng được hình dạng này nên viết thẳng.
  it('does not treat a 5xx with a non-JSON body as an AI failure', () => {
    const nginxBadGateway = {
      isAxiosError: true,
      response: {
        status: 502,
        data: '<html><head><title>502 Bad Gateway</title></head><body></body></html>',
      },
    };

    expect(isAiOrNetworkFailure(nginxBadGateway)).toBe(false);
  });
});
