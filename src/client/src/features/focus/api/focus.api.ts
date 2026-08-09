import { isAxiosError } from 'axios';
import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type {
  CreateFocusSessionResponse,
  EndFocusSessionInput,
  EndFocusSessionResponse,
  PomodoroConfig,
} from '../types/focus.types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/** Cùng phong cách `interview.api.ts` — không render thẳng `error.message` (tiếng Anh).
 *  `context` để hiểu đúng `NOT_FOUND`: lúc TẠO phiên (`POST`) mã này nghĩa là KHÔNG tìm thấy KẾ
 *  HOẠCH (server: "Plan not found"), chưa có phiên nào để mà "không tìm thấy". */
export function getFocusSessionErrorMessage(
  error: unknown,
  context: 'create' | 'end' = 'end'
): string {
  if (!isAxiosError(error)) {
    return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
  if (!error.response) {
    return 'Không kết nối được tới máy chủ. Vui lòng thử lại.';
  }
  const code: string | undefined = error.response.data?.error?.code;
  switch (code) {
    case 'NOT_FOUND':
      return context === 'create'
        ? 'Không tìm thấy kế hoạch cho phiên học này. Vui lòng tải lại trang.'
        : 'Không tìm thấy phiên học này.';
    case 'ALREADY_ENDED':
      return 'Phiên này đã kết thúc trước đó. Vui lòng tải lại trang.';
    case 'FOCUSED_SECONDS_EXCEEDS_ELAPSED':
      return 'Thời gian tập trung ghi nhận không hợp lệ. Vui lòng tải lại trang.';
    case 'INVALID_CONCEPT_IDS':
      return 'Khái niệm không thuộc kế hoạch đã chọn.';
    case 'VALIDATION_ERROR':
      return 'Thông tin gửi lên chưa hợp lệ.';
    default:
      return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
}

/**
 * Lỗi kết thúc phiên có phải KHÔNG THỂ chữa bằng cách thử lại không (M4). 4xx = phiên đã kết
 * thúc / không còn ở server / số liệu không hợp lệ — PATCH lại vẫn hỏng, nên phải xoá snapshot
 * kẻo hộp khôi phục kẹt vòng lặp mỗi lần mở. Mất mạng (không `response`) hoặc 5xx = tạm thời,
 * giữ snapshot cho thử lại.
 */
export function isTerminalFocusSessionError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status !== undefined && status >= 400 && status < 500;
}

export const focusSessionApi = {
  create: async (payload: {
    planId?: string;
    conceptIds: string[];
    strictMode?: boolean;
  }): Promise<CreateFocusSessionResponse> => {
    const response = await apiClient.post<ApiEnvelope<CreateFocusSessionResponse>>(
      ENDPOINTS.FOCUS_SESSIONS.BASE,
      payload
    );
    return response.data.data;
  },

  end: async (id: string, input: EndFocusSessionInput): Promise<EndFocusSessionResponse> => {
    const response = await apiClient.patch<ApiEnvelope<EndFocusSessionResponse>>(
      ENDPOINTS.FOCUS_SESSIONS.DETAIL(id),
      input
    );
    return response.data.data;
  },
};

export const pomodoroConfigApi = {
  /** GET /users/me/pomodoro-config — mặc định cho phiên mới; panel tại chỗ KHÔNG ghi lại đây. */
  get: async (): Promise<PomodoroConfig> => {
    const response = await apiClient.get<ApiEnvelope<PomodoroConfig>>(
      ENDPOINTS.USERS.POMODORO_CONFIG
    );
    return response.data.data;
  },
};
