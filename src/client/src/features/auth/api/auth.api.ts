import { isAxiosError } from 'axios';
import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type { LoginFormData, RegisterFormData } from '../schemas/auth.schema';

/**
 * Chuyển lỗi Axios thành thông báo tiếng Việt dựa trên `error.code` do server
 * trả về, thay vì render thẳng `error.message` (server trả tiếng Anh — nếu render
 * thẳng thì ngôn ngữ giao diện do backend quyết định). Trả về cả `code` để form
 * tự quyết gắn lỗi vào trường nào (vd EMAIL_CONFLICT → ô email).
 */
export function getAuthErrorMessage(error: unknown): { code?: string; message: string } {
  if (!isAxiosError(error)) {
    return { message: 'Đã xảy ra lỗi, vui lòng thử lại.' };
  }
  // Không có response = mất mạng / server không phản hồi (AM-01 [E4], AM-02 [E3]).
  if (!error.response) {
    return { message: 'Không kết nối được tới máy chủ. Vui lòng thử lại.' };
  }
  const code: string | undefined = error.response.data?.error?.code;
  switch (code) {
    case 'EMAIL_CONFLICT':
      return { code, message: 'Email này đã được đăng ký.' };
    case 'UNAUTHORIZED':
      return { code, message: 'Email hoặc mật khẩu không đúng.' };
    case 'VALIDATION_ERROR':
      return { code, message: 'Thông tin nhập chưa hợp lệ.' };
    default:
      return { code, message: 'Đã xảy ra lỗi, vui lòng thử lại.' };
  }
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthResponse {
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
}

// 1. Call Login API
export const loginApi = async (data: LoginFormData): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>(ENDPOINTS.AUTH.LOGIN, data);
  return response.data;
};

// 2. Call SignUp API
export const registerApi = async (data: RegisterFormData): Promise<AuthResponse> => {
  // Loại bỏ confirmPassword khỏi payload trước khi gửi lên server
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { confirmPassword, ...payload } = data;
  const response = await apiClient.post<AuthResponse>(ENDPOINTS.AUTH.REGISTER, payload);
  return response.data;
};
