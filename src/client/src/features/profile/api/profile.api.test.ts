import { describe, expect, it } from 'vitest';

import { getChangePasswordErrorMessage } from './profile.api';

const axiosError = (code?: string) => ({
  isAxiosError: true,
  response: { status: 400, data: code ? { error: { code } } : undefined },
});

describe('getChangePasswordErrorMessage', () => {
  it('maps WRONG_PASSWORD to the actionable form message', () => {
    expect(getChangePasswordErrorMessage(axiosError('WRONG_PASSWORD'))).toBe(
      'Mật khẩu hiện tại không đúng. Mật khẩu của bạn chưa bị thay đổi.'
    );
  });

  it('keeps the generic fallback for every other error', () => {
    expect(getChangePasswordErrorMessage(axiosError('INTERNAL_ERROR'))).toBe(
      'Đã xảy ra lỗi, vui lòng thử lại.'
    );
    expect(getChangePasswordErrorMessage(new Error('unexpected'))).toBe(
      'Đã xảy ra lỗi, vui lòng thử lại.'
    );
  });
});
