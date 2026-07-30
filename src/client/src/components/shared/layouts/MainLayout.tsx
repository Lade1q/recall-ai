import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Timer,
  MessageSquare,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  User,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Plans', href: '/plans', icon: BookOpen },
  { label: 'Focus Session', href: '/focus', icon: Timer },
  { label: 'Interview', href: '/interview', icon: MessageSquare },
] as const;

/**
 * Layout chính sau khi đăng nhập.
 * Bao gồm:
 * - Desktop Sidebar (sticky) sử dụng CSS variables sidebar của design system.
 * - Mobile Sidebar Drawer (toggle qua hamburger button).
 * - Top navbar với page title, dark mode toggle, nút Create Plan.
 * - Outlet để render nội dung trang con qua React Router nested routes.
 */
export function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () =>
      document.documentElement.classList.contains('dark') ||
      localStorage.getItem('theme') === 'dark'
  );

  const location = useLocation();

  // Đồng bộ trạng thái dark mode với DOM và localStorage
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const getPageTitle = (): string => {
    switch (location.pathname) {
      case '/dashboard':
        return 'Dashboard';
      case '/plans':
        return 'My Study Plans';
      case '/plan/new':
        return 'Create Plan';
      case '/focus':
        return 'Focus Session';
      case '/interview':
        return 'AI Examiner';
      default:
        return 'Recall AI';
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer',
      isActive
        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    ].join(' ');

  // Nút đổi dark mode được style như một hàng sidebar (full-width, canh trái) để
  // đứng cặp với link "Sign Out" ngay dưới — không phải icon-button. Dùng
  // <Button variant="ghost"> theo đúng idiom shadcn cho sidebar item.
  const sidebarRowClass =
    'h-auto w-full cursor-pointer justify-start gap-3 px-3.5 py-2.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

  return (
    <div className="bg-background text-foreground flex min-h-screen transition-colors duration-200">
      {/* ========== DESKTOP SIDEBAR ========== */}
      <aside className="border-sidebar-border bg-sidebar sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r lg:flex">
        {/* Logo */}
        <div className="border-sidebar-border flex h-16 items-center border-b px-6">
          <span className="text-sidebar-primary text-lg font-bold tracking-tight">Recall AI</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1.5 px-4 py-6">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <NavLink key={href} to={href} className={navLinkClass}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer: dark mode + sign out */}
        <div className="border-sidebar-border space-y-1.5 border-t p-4">
          <Button
            variant="ghost"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={sidebarRowClass}
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </Button>

          <Link
            to="/login"
            className="text-destructive hover:bg-destructive/10 flex cursor-pointer items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Link>
        </div>
      </aside>

      {/* ========== MOBILE SIDEBAR DRAWER ========== */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <aside
            className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 flex w-60 flex-col border-r"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-sidebar-border flex h-16 items-center justify-between border-b px-6">
              <span className="text-sidebar-primary text-lg font-bold tracking-tight">
                Recall AI
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <X className="size-5" />
              </Button>
            </div>

            <nav className="flex-1 space-y-1.5 px-4 py-6">
              {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
                <NavLink
                  key={href}
                  to={href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={navLinkClass}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="border-sidebar-border space-y-1.5 border-t p-4">
              <Button
                variant="ghost"
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={sidebarRowClass}
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </Button>
              <Link
                to="/login"
                className="text-destructive hover:bg-destructive/10 flex cursor-pointer items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* ========== MAIN CONTENT AREA ========== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top navbar */}
        <header className="border-border bg-card sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 md:px-8">
          <div className="flex items-center gap-4">
            {/* Hamburger cho mobile */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(true)}
              className="text-muted-foreground hover:bg-muted hover:text-foreground -ml-2 lg:hidden"
            >
              <Menu className="size-5" />
            </Button>
            <h2 className="text-foreground text-lg font-semibold tracking-tight">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Nút tạo kế hoạch nhanh — ẩn khi đang ở trang tạo kế hoạch */}
            {location.pathname !== '/plan/new' && (
              <Link
                to="/plan/new"
                className="bg-primary text-primary-foreground hover:bg-primary/90 hidden h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all active:scale-[0.98] md:inline-flex"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Plan
              </Link>
            )}

            {/* Avatar placeholder */}
            <div className="border-border bg-muted flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border">
              <User className="text-muted-foreground h-4 w-4" />
            </div>
          </div>
        </header>

        {/* Nội dung trang hiện tại */}
        <main className="mx-auto w-full max-w-7xl grow p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
