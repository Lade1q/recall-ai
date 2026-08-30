import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { AuthContextValue } from '@/features/auth/context/AuthContext';

/**
 * `/` (RootRoute, issue #388) — route công khai đứng NGOÀI `<ProtectedRoute>` trong `App.tsx`
 * (xác nhận bằng đọc trực tiếp cây route: `<Route path="/" element={<RootRoute />} />` là anh em
 * của `<Route element={<ProtectedRoute />}>`, không lồng trong nó). Test này render `<App />`
 * THẬT — không tự dựng lại `RootRoute` cô lập — để chính lỗi lồng nhầm route (nếu có xảy ra
 * trong tương lai) tự phơi ra qua hành vi (unauthenticated redirect ngược về /login thay vì
 * thấy LandingPage) chứ không chỉ dựa vào đọc code bằng mắt.
 *
 * Không dùng `@/utils/test-utils` ở đây: `render` của nó tự bọc SẴN một `<BrowserRouter>`, mà
 * `<App />` tự dựng `<BrowserRouter>` riêng của nó — lồng hai `<Router>` là lỗi cứng của
 * react-router ("You cannot render a <Router> inside another <Router>"). Dùng thẳng `render` gốc
 * của RTL, và giả auth qua mock module thay vì Provider thật để không cần backend.
 *
 * `AuthProvider`/`useAuth` bị mock nguyên module: `RootRoute` VÀ `ProtectedRoute` đều đọc cùng
 * một `useAuth()`, nên mock chung phản ánh đúng việc cả app nhìn thấy MỘT trạng thái auth.
 * `DashboardPage` bị mock thành stub để test không kéo theo 3 lời gọi API thật
 * (`/review-queue/today`, `/dashboard/stats`, `/plans`) của trang đó — ngoài phạm vi của test
 * route `/`.
 */
vi.mock('@/features/auth/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/context/AuthContext')>(
    '@/features/auth/context/AuthContext'
  );
  return {
    ...actual,
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: vi.fn(),
  };
});

vi.mock('@/pages/dashboard/DashboardPage', () => ({
  default: () => <div>DASHBOARD-STUB</div>,
}));

function mockAuth(value: AuthContextValue) {
  vi.mocked(useAuth).mockReturnValue(value);
}

const AUTH_LOADING: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  updateUser: vi.fn(),
};

const AUTH_AUTHENTICATED: AuthContextValue = {
  user: { id: 'user-1', email: 'a@b.c', name: 'A', createdAt: '2026-01-01T00:00:00Z' },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  updateUser: vi.fn(),
};

const AUTH_UNAUTHENTICATED: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  updateUser: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // BrowserRouter đọc window.location lúc mount — phải set TRƯỚC render (cùng idiom đang dùng ở
  // FocusPage.test.tsx / PlanReviewQueuePage.test.tsx trong repo).
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('Route "/" (RootRoute, #388)', () => {
  it('isLoading=true → render đúng loading UI tái dùng từ ProtectedRoute, không render LandingPage lẫn không redirect', () => {
    mockAuth(AUTH_LOADING);
    const { container } = render(<App />);

    // Không thấy nội dung landing lẫn dashboard.
    expect(screen.queryByText(/Ôn tập thông minh, truy ngược tận gốc/)).not.toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD-STUB')).not.toBeInTheDocument();
    // Không bị điều hướng đi đâu cả trong lúc chờ xác định phiên.
    expect(window.location.pathname).toBe('/');

    // Đúng NGUYÊN VĂN pattern spinner của ProtectedRoute — lệch class ở đây là lệch UI, dù
    // spinner "trông giống" mắt thường cũng có thể fail test này nếu đổi cấu trúc.
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveClass(
      'border-primary',
      'h-8',
      'w-8',
      'animate-spin',
      'rounded-full',
      'border-4',
      'border-t-transparent'
    );
    expect(spinner?.parentElement).toHaveClass(
      'flex',
      'h-screen',
      'items-center',
      'justify-center'
    );
  });

  it('isAuthenticated=true, isLoading=false → redirect /dashboard, KHÔNG render nội dung LandingPage', async () => {
    mockAuth(AUTH_AUTHENTICATED);
    render(<App />);

    expect(await screen.findByText('DASHBOARD-STUB')).toBeInTheDocument();
    expect(screen.queryByText(/Ôn tập thông minh, truy ngược tận gốc/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bắt đầu miễn phí' })).not.toBeInTheDocument();
    // <Navigate replace> phải thật sự đổi URL trình duyệt, không chỉ đổi nội dung render.
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('isAuthenticated=false, isLoading=false → render LandingPage với CTA đúng đích, KHÔNG redirect /login', () => {
    mockAuth(AUTH_UNAUTHENTICATED);
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Ôn tập thông minh, truy ngược tận gốc kiến thức yếu',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bắt đầu miễn phí' })).toHaveAttribute(
      'href',
      '/register'
    );
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');

    // Bằng chứng hành vi (không chỉ đọc code) rằng "/" KHÔNG nằm trong <ProtectedRoute>: nếu lỡ
    // lồng nhầm, ProtectedRoute sẽ đọc đúng useAuth() mock này (isAuthenticated=false) và bắn
    // <Navigate to="/login" replace> — silent-fail thành landing không bao giờ render được cho
    // người chưa đăng nhập.
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByText('DASHBOARD-STUB')).not.toBeInTheDocument();
  });
});
