import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext';
import ProfilePage from './ProfilePage';
import type { User } from '@/features/auth/api/auth.api';

vi.mock('../../features/profile/api/profile.api', () => ({
  profileApi: {
    updateName: vi.fn(),
    changePassword: vi.fn(),
  },
}));

const mockLogout = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const BASE_USER: User = {
  id: 'u1',
  email: 'alice@example.com',
  name: 'Alice Nguyen',
  createdAt: '2026-01-15T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Dựng riêng thay vì dùng `@/utils/test-utils`: helper đó cấp `logout: () => {}` cứng, không spy
 * được, mà chính lời gọi `logout()` là thứ ca kiểm dưới đây khẳng định.
 */
function renderProfilePage() {
  const authValue: AuthContextValue = {
    user: BASE_USER,
    isAuthenticated: true,
    isLoading: false,
    login: async () => {},
    logout: mockLogout,
    register: async () => {},
    updateUser: () => {},
  };

  return rtlRender(
    <AuthContext.Provider value={authValue}>
      <BrowserRouter>
        <ProfilePage />
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

/**
 * #360 (F2). Hành vi "Đăng xuất → `/login`" từng được khẳng định ở `PasswordSection.test.tsx`,
 * nhưng `PasswordSection` **không ai render** và đã bị xoá cùng hai component chết khác.
 *
 * Nói cho đúng mức độ: **không phải mất coverage của code sống** — nút thật nằm ở `ProfilePage`
 * và chưa từng có test. Nhưng bộ test cũ là **chỗ duy nhất trên toàn repo** từng ghim hành vi
 * này, nên xoá nó xong là không còn gì nói `logout()` phải kèm điều hướng. Tệp này đóng đúng lỗ
 * đó, trên component thật.
 */
describe('ProfilePage', () => {
  it('logs out and sends the user to /login', async () => {
    const user = userEvent.setup();
    renderProfilePage();

    await user.click(screen.getByRole('button', { name: /Đăng xuất/ }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    // Hai vế phải đi cùng nhau: `logout()` mà không điều hướng thì người dùng ở lại một trang hồ
    // sơ của phiên vừa bị bỏ, còn điều hướng mà không `logout()` thì phiên vẫn sống.
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('offers both tabs and opens on the personal-info one', () => {
    renderProfilePage();

    expect(screen.getByRole('tab', { name: /Thông tin cá nhân/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Đổi mật khẩu/ })).toBeInTheDocument();
    // Radix chỉ mount panel đang mở, nên sự hiện diện của ô tên là bằng chứng tab mặc định đúng.
    expect(screen.getByDisplayValue('Alice Nguyen')).toBeInTheDocument();
  });

  it('switches to the password tab on click', async () => {
    const user = userEvent.setup();
    renderProfilePage();

    await user.click(screen.getByRole('tab', { name: /Đổi mật khẩu/ }));

    expect(screen.getByRole('button', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Alice Nguyen')).not.toBeInTheDocument();
  });
});
