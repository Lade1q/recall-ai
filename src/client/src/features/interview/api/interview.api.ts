import { isAxiosError } from 'axios';
import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type {
  AbandonInterviewResponse,
  GetInterviewResponse,
  PauseInterviewResponse,
  ResumeInterviewResponse,
  SelfGrade,
  StartInterviewResponse,
  SubmitAnswerResponse,
  SessionSummaryResponse,
} from '../types/interview.types';

/** Backend bọc mọi response trong `{ success: true, data: {...} }`. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * Các lệnh gọi phải chờ AI (chấm điểm 10–20s, sinh câu hỏi) cần timeout dài hơn hẳn
 * global timeout 10s của `apiClient`. Ghi đè per-request thay vì sửa global để mọi
 * endpoint khác vẫn giữ 10s như cũ.
 */
const AI_WAIT_TIMEOUT_MS = 60000;

/**
 * Chuyển lỗi Axios thành thông báo tiếng Việt dựa trên `error.code` server trả về,
 * theo đúng phong cách `auth.api.ts` — không render thẳng `error.message` (server trả
 * tiếng Anh). Phần lớn lỗi phiên là "phiên đã đổi trạng thái, hãy tải lại", cộng một
 * nhánh riêng cho mất mạng để người dùng biết có thể thử lại.
 */
export function getInterviewErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
  // Không có response = mất mạng / server không phản hồi / AI quá giờ chờ.
  if (!error.response) {
    return 'Không kết nối được tới máy chủ. Vui lòng thử lại.';
  }
  const code: string | undefined = error.response.data?.error?.code;
  switch (code) {
    case 'NOT_FOUND':
      return 'Không tìm thấy phiên kiểm tra này.';
    // Server ném mã này ở 4 chỗ (`interview.service.ts`: answer/pause/resume/abandon) khi phiên
    // đã `completed`/`abandoned`. Nhãn cũ ở đây là `SESSION_NOT_ACTIVE` — một mã **không tồn tại
    // phía server**, nên câu tiếng Việt này chưa từng hiển thị được; xem test hợp đồng
    // `error-code-contract.test.ts`.
    case 'SESSION_ENDED':
      return 'Phiên này không còn ở trạng thái đang diễn ra. Vui lòng tải lại trang.';
    case 'SESSION_PAUSED':
      return 'Phiên đang tạm dừng — đang mở lại, vui lòng thử lại.';
    // Cùng ngoại lệ như `PLAN_NOT_ACTIVE` bên dưới. Đo trên cây hiện tại: **không** lời gọi
    // `new AppError` nào trong server mang chuỗi tiếng Việt viết thẳng; đúng hai mã lấy câu từ
    // biến, và cả hai đều là tiếng Việt — `PLAN_NOT_ACTIVE` (qua `buildInactivePlanMessage`) và
    // mã này (qua `queue.message ?? NO_CONCEPTS_MESSAGE`). ~40 mã còn lại mang chuỗi debug tiếng
    // Anh, nên **đừng tổng quát hoá lối render thẳng này ra cả switch**.
    //
    // Mã này gánh 3 câu tới được, mỗi câu một việc phải làm khác nhau: đồ thị rỗng (thêm khái
    // niệm / phân tích lại), đã ôn hết kế hoạch (COMPLETED_PLAN_MESSAGE), và câu mặc định khi
    // không còn gì trên lịch. Gộp về một hằng số phía client là nuốt mất hai trong ba.
    case 'NO_CONCEPTS_TO_REVIEW':
      return (
        error.response.data?.error?.message ??
        // Server luôn kèm message cho mã này, nên nhánh này chỉ chạy khi payload dị dạng. Khớp
        // `NO_CONCEPTS_MESSAGE` phía server (`interview.service.ts`) — trung tính, không hứa một
        // thao tác mà lối vào "Dùng gợi ý hôm nay" không có.
        'Không có khái niệm nào cần ôn tập trong kế hoạch này.'
      );
    case 'NO_MATERIAL':
      return 'Kế hoạch này chưa có tài liệu để tạo câu hỏi. Hãy tải tài liệu lên trước khi bắt đầu kiểm tra.';
    case 'DOCUMENT_FILE_MISSING':
      return 'Tệp tài liệu của kế hoạch không còn khả dụng. Hãy mở kế hoạch, đổi tài liệu khác rồi thử kiểm tra lại.';
    // Ngoại lệ của quy ước "không render thẳng error.message": PLAN_NOT_ACTIVE gộp hai trạng thái
    // (`archived`/`draft`) với hai câu hành động khác nhau — một hằng số phía client không phủ
    // được cả hai, nên dùng nguyên văn câu server đã dựng bằng buildInactivePlanMessage().
    case 'PLAN_NOT_ACTIVE':
      return error.response.data?.error?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại.';
    // AE-10 (#248). Cổng 409 của server cho lượt chưa chấm / tự chấm flashcard / lượt gợi ý.
    // Người dùng thường KHÔNG thấy câu này: form chỉ hiện trên lượt khiếu nại được, nên nó tới
    // được đúng khi client và server lệch nhau (tab mở lâu, sửa tay). Câu chữ vì thế nói về
    // trạng thái của lượt, không hứa một thao tác sửa nào — mockup không phủ ca này.
    case 'TURN_NOT_APPEALABLE':
      return 'Lượt này không gửi phản hồi điểm được: nó chưa được AI chấm, do bạn tự chấm, hoặc là lượt gợi ý.';
    case 'VALIDATION_ERROR':
      return 'Thông tin gửi lên chưa hợp lệ.';
    default:
      // Mọi lỗi Gemini nổi lên dưới dạng mã `AI_*` (`isAiFailure` phía server). Nói rõ là
      // dịch vụ AI để người dùng không tưởng mình vừa gửi sai thứ gì.
      if (code?.startsWith('AI_')) {
        return 'Dịch vụ AI đang bận hoặc tạm thời không phản hồi. Vui lòng thử lại sau ít phút.';
      }
      return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
}

/**
 * Lỗi này là do hạ tầng/AI (thử lại có ích) hay do dữ liệu người dùng gửi lên (thử lại y hệt
 * thì vẫn hỏng)? Phân biệt được thì lối vào deep-link mới mời "Thử lại" đúng lúc thay vì bắt
 * chọn lại kế hoạch — chọn lại không sửa được việc Gemini đang chậm.
 *
 * Tính là lỗi hạ tầng/AI khi: không có response (mất mạng hoặc quá 60s chờ Gemini), hoặc server
 * trả mã `AI_*` (mọi lỗi Gemini đều nổi lên dưới dạng này — `isAiFailure` phía server). Mã lỗi
 * có cấu trúc là nguồn chân lý; một HTTP 5xx chung có thể đến từ dữ liệu hoặc lỗi ứng dụng mà
 * việc lặp lại chính request đó không thể sửa được.
 */
export function isAiOrNetworkFailure(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (!error.response) return true;
  const code: string | undefined = error.response.data?.error?.code;
  return code?.startsWith('AI_') ?? false;
}

export const interviewApi = {
  /** AE-01 — bắt đầu phiên. Bỏ `conceptIds` để server tự chọn hàng đợi ôn hôm nay. */
  startInterview: async (payload: {
    planId: string;
    conceptIds?: string[];
    maxTurnsPerConcept?: number;
  }): Promise<StartInterviewResponse> => {
    const response = await apiClient.post<ApiEnvelope<StartInterviewResponse>>(
      ENDPOINTS.INTERVIEWS.BASE,
      payload,
      { timeout: AI_WAIT_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /**
   * Khôi phục toàn bộ trạng thái phiên khi tải lại — server là nguồn chân lý. Gọi ở mọi lần
   * mount VÀ sau mỗi lần gửi câu trả lời (`fetchAuthoritativeState`/`finishSubmit` trong
   * `useInterviewSession`), có thể phải chờ Gemini sinh câu hỏi khi resume nên cần timeout
   * dài như các lệnh chờ AI khác, không phải timeout mặc định 10s.
   */
  getInterview: async (id: string): Promise<GetInterviewResponse> => {
    const response = await apiClient.get<ApiEnvelope<GetInterviewResponse>>(
      ENDPOINTS.INTERVIEWS.DETAIL(id),
      { timeout: AI_WAIT_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /** AE-02 — gửi câu trả lời gõ, chờ AI chấm rồi trả câu hỏi kế tiếp. */
  submitAnswer: async (id: string, answerText: string): Promise<SubmitAnswerResponse> => {
    const response = await apiClient.post<ApiEnvelope<SubmitAnswerResponse>>(
      ENDPOINTS.INTERVIEWS.ANSWERS(id),
      { answerText },
      { timeout: AI_WAIT_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /** AE-05 — chế độ flashcard fallback: sinh viên tự chấm thay vì AI. */
  submitSelfGrade: async (id: string, selfGrade: SelfGrade): Promise<SubmitAnswerResponse> => {
    const response = await apiClient.post<ApiEnvelope<SubmitAnswerResponse>>(
      ENDPOINTS.INTERVIEWS.ANSWERS(id),
      { selfGrade },
      { timeout: AI_WAIT_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /** AE-02 Alt 2 — lưu trạng thái rồi thoát; phiên có thể tiếp tục sau. */
  pauseInterview: async (id: string): Promise<PauseInterviewResponse> => {
    const response = await apiClient.post<ApiEnvelope<PauseInterviewResponse>>(
      ENDPOINTS.INTERVIEWS.PAUSE(id)
    );
    return response.data.data;
  },

  /** Tiếp tục một phiên đã tạm dừng — có thể phải sinh lại câu hỏi (chờ AI). */
  resumeInterview: async (id: string): Promise<ResumeInterviewResponse> => {
    const response = await apiClient.post<ApiEnvelope<ResumeInterviewResponse>>(
      ENDPOINTS.INTERVIEWS.RESUME(id),
      undefined,
      { timeout: AI_WAIT_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /**
   * SPEC_DB-03 AF2 — kết thúc phiên đang dở và chấm khái niệm dở dang trên số lượt đã trả lời.
   * Không gọi AI (phiên `abandoned` không có nhận xét tổng hợp) nên giữ timeout mặc định.
   */
  abandonInterview: async (id: string): Promise<AbandonInterviewResponse> => {
    const response = await apiClient.post<ApiEnvelope<AbandonInterviewResponse>>(
      ENDPOINTS.INTERVIEWS.ABANDON(id)
    );
    return response.data.data;
  },

  /**
   * GET /interviews/:id/summary (I6.5 / AE-09) — dữ liệu tổng hợp cuối phiên.
   *
   * Lần gọi đầu của một phiên chưa có cache phải chờ `summarize_session` (1 lượt + 1 lượt thử
   * lại, chưa có timeout phía server — xem #292), nên dùng timeout dài như các lệnh chờ AI
   * khác. Để mặc định 10s thì đúng lúc AI chậm hoặc hỏng — chính hoàn cảnh mà nhánh
   * `generatedByAi: false` sinh ra để phục vụ — client lại bỏ cuộc trước khi server kịp trả
   * bảng điểm, và người dùng mất luôn màn kết quả thay vì mất mỗi phần nhận xét.
   */
  getSummary: async (id: string): Promise<SessionSummaryResponse> => {
    const response = await apiClient.get<ApiEnvelope<SessionSummaryResponse>>(
      ENDPOINTS.INTERVIEWS.SUMMARY(id),
      { timeout: AI_WAIT_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /** PATCH /review-queue/:itemId — Bỏ khỏi lịch từ màn tổng kết */
  skipReviewItem: async (itemId: string): Promise<void> => {
    await apiClient.patch(ENDPOINTS.REVIEW_QUEUE.ITEM(itemId), { status: 'skipped' });
  },
};
