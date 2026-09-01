import { isAxiosError } from 'axios';

import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type { ApiEnvelope } from '@/types/api.types';
import type { User } from '@/features/auth/api/auth.api';
import type { UpdateNameInput, ChangePasswordInput } from '../types/profile.types';

export function getChangePasswordErrorMessage(error: unknown): string {
  if (isAxiosError(error) && error.response?.data?.error?.code === 'WRONG_PASSWORD') {
    return 'Mật khẩu hiện tại không đúng. Mật khẩu của bạn chưa bị thay đổi.';
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

export const profileApi = {
  updateName: async (input: UpdateNameInput): Promise<User> => {
    const response = await apiClient.patch<ApiEnvelope<User>>(ENDPOINTS.USERS.PROFILE, input);
    return response.data.data;
  },

  /**
   * Không trả gì: server đáp `{ changed: true }` và cố ý không vọng lại thứ gì của mật khẩu
   * (`user.controller.ts`). Khai `{ message: string }` như bản đầu là một hợp đồng sai — không
   * consumer nào đọc nó nên chưa hỏng, nhưng người sau đọc kiểu sẽ tưởng có câu để hiển thị.
   */
  changePassword: async (input: ChangePasswordInput): Promise<void> => {
    await apiClient.patch<ApiEnvelope<{ changed: boolean }>>(ENDPOINTS.USERS.PASSWORD, input);
  },
};
