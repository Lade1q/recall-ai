import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/utils/test-utils';
import userEvent from '@testing-library/user-event';
import { PasswordTab } from './PasswordTab';
import { profileApi } from '../api/profile.api';

vi.mock('../api/profile.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/profile.api')>();
  return {
    ...actual,
    profileApi: {
      ...actual.profileApi,
      changePassword: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const fields = () => ({
  current: screen.getByLabelText(/Mật khẩu hiện tại/),
  next: screen.getByLabelText(/^Mật khẩu mới/),
  confirm: screen.getByLabelText(/Nhập lại mật khẩu mới/),
  submit: screen.getByRole('button', { name: 'Đổi mật khẩu' }),
});

/**
 * #166 / review #360. Kế thừa các assertion đáng giá của `PasswordSection.test.tsx` (đã xoá cùng
 * component chết) và gắn chúng vào `PasswordTab` — component `ProfilePage` thật sự dựng.
 */
describe('PasswordTab', () => {
  // ---------- Độ dài mật khẩu mới ----------

  it('shows the hint before the field is touched', () => {
    render(<PasswordTab />);

    expect(screen.getByText('Ít nhất 8 ký tự.')).toBeInTheDocument();
  });

  it('counts the missing characters', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().next, 'abc');

    expect(screen.getByText('Còn thiếu 5 ký tự.')).toBeInTheDocument();
  });

  /**
   * Biên đúng 7 ký tự. Một mutant đổi `<` thành `<=` hoặc lệch `MIN_PASSWORD_LENGTH` một đơn vị
   * vẫn qua được ca "3 ký tự" ở trên, nhưng chết ở đây — giữ nguyên ca này khi sửa quanh đó.
   */
  it('says exactly 1 missing character at 7 chars', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().next, '1234567');

    expect(screen.getByText('Còn thiếu 1 ký tự.')).toBeInTheDocument();
  });

  it('accepts the password at exactly 8 chars', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().next, '12345678');

    expect(screen.getByText('Đủ dài.')).toBeInTheDocument();
  });

  // ---------- Khớp xác nhận ----------

  it('reports a mismatch between the two new-password fields', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().next, 'abcdefgh');
    await user.type(fields().confirm, 'abcdefgX');

    expect(screen.getByText('Mật khẩu không khớp.')).toBeInTheDocument();
  });

  it('stays quiet while the confirm field is still empty', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().next, 'abcdefgh');

    expect(screen.queryByText('Mật khẩu không khớp.')).not.toBeInTheDocument();
  });

  // ---------- Cổng nút gửi ----------

  it('keeps submit disabled without the current password', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().next, 'abcdefgh');
    await user.type(fields().confirm, 'abcdefgh');

    expect(fields().submit).toBeDisabled();
  });

  it('keeps submit disabled while the new password is too short', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().current, 'old-password');
    await user.type(fields().next, 'abc');
    await user.type(fields().confirm, 'abc');

    expect(fields().submit).toBeDisabled();
  });

  it('keeps submit disabled while the two new passwords differ', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().current, 'old-password');
    await user.type(fields().next, 'abcdefgh');
    await user.type(fields().confirm, 'abcdefgX');

    expect(fields().submit).toBeDisabled();
  });

  it('enables submit once every field is valid', async () => {
    const user = userEvent.setup();
    render(<PasswordTab />);

    await user.type(fields().current, 'old-password');
    await user.type(fields().next, 'abcdefgh');
    await user.type(fields().confirm, 'abcdefgh');

    expect(fields().submit).toBeEnabled();
  });

  // ---------- Gửi ----------

  const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(fields().current, 'old-password');
    await user.type(fields().next, 'abcdefgh');
    await user.type(fields().confirm, 'abcdefgh');
  };

  it('sends the current and new password', async () => {
    const user = userEvent.setup();
    vi.mocked(profileApi.changePassword).mockResolvedValue(undefined);

    render(<PasswordTab />);
    await fillValid(user);
    await user.click(fields().submit);

    await waitFor(() => {
      expect(profileApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'abcdefgh',
      });
    });
  });

  it('clears every field and confirms on success', async () => {
    const user = userEvent.setup();
    vi.mocked(profileApi.changePassword).mockResolvedValue(undefined);

    render(<PasswordTab />);
    await fillValid(user);
    await user.click(fields().submit);

    await screen.findByText('Đổi mật khẩu thành công.');
    expect(fields().current).toHaveValue('');
    expect(fields().next).toHaveValue('');
    expect(fields().confirm).toHaveValue('');
  });

  /**
   * Câu này phải nói rõ mật khẩu **chưa** bị đổi. Người dùng gõ sai mật khẩu hiện tại không có
   * cách nào tự biết lần gửi đó đã làm gì với tài khoản của mình.
   */
  it('names the wrong current password and says nothing changed', async () => {
    const user = userEvent.setup();
    vi.mocked(profileApi.changePassword).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: { code: 'WRONG_PASSWORD' } } },
    });

    render(<PasswordTab />);
    await fillValid(user);
    await user.click(fields().submit);

    await screen.findByText('Mật khẩu hiện tại không đúng. Mật khẩu của bạn chưa bị thay đổi.');
  });

  it('falls back to the generic message for any other server error', async () => {
    const user = userEvent.setup();
    vi.mocked(profileApi.changePassword).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: { code: 'INTERNAL_ERROR' } } },
    });

    render(<PasswordTab />);
    await fillValid(user);
    await user.click(fields().submit);

    await screen.findByText('Đã xảy ra lỗi, vui lòng thử lại.');
  });

  it('clears the server error as soon as the current password is retyped', async () => {
    const user = userEvent.setup();
    vi.mocked(profileApi.changePassword).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: { code: 'WRONG_PASSWORD' } } },
    });

    render(<PasswordTab />);
    await fillValid(user);
    await user.click(fields().submit);
    await screen.findByText('Mật khẩu hiện tại không đúng. Mật khẩu của bạn chưa bị thay đổi.');

    await user.type(fields().current, 'x');

    expect(
      screen.queryByText('Mật khẩu hiện tại không đúng. Mật khẩu của bạn chưa bị thay đổi.')
    ).not.toBeInTheDocument();
  });
});
