import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Network,
  Timer,
  History,
  User,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { label: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Kế hoạch ôn tập', href: '/plans', icon: BookOpen },
  { label: 'Đồ thị khái niệm', href: '/graph', icon: Network },
  { label: 'Focus Session', href: '/focus', icon: Timer },
  { label: 'Lịch sử & Tiến độ', href: '/history', icon: History },
  { label: 'Hồ sơ', href: '/profile', icon: User },
] as const;

/**
 * Layout chính sau khi đăng nhập.
 * Bao gồm:
 * - Desktop Sidebar (sticky) sử dụng CSS variables sidebar của design system.
 * - Mobile Sidebar Drawer (toggle qua hamburger button).
 * - Outlet để render nội dung trang con qua React Router nested routes.
 *
 * Mockup (`claude-design/screen-*.html`) không có top navbar tách rời — thương
 * hiệu và điều hướng đều ở sidebar (Issue #173). Dải hamburger trên mobile vẫn
 * giữ lại vì mockup chỉ vẽ desktop và drawer cần một nút để mở.
 */
export function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () =>
      document.documentElement.classList.contains('dark') ||
      localStorage.getItem('theme') === 'dark'
  );

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

  const location = useLocation();

  // "Đồ thị khái niệm" trỏ /graph nhưng luôn redirect sang /plan/:id thật
  // (PlanDetailPage = ConceptGraph, xem GraphIndexPage) — coi /plan/:id (trừ
  // /plan/new, thuộc luồng tạo kế hoạch) là thuộc mục nav này để không mất
  // trạng thái active sau khi redirect.
  const isNavItemActive = (href: string): boolean => {
    if (href === '/graph') {
      return (
        location.pathname.startsWith('/graph') ||
        (location.pathname.startsWith('/plan/') && location.pathname !== '/plan/new')
      );
    }
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (isActive: boolean) =>
    [
      'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer',
      isActive
        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    ].join(' ');

  // Nút đổi dark mode được style như một hàng sidebar (full-width, canh trái),
  // không phải icon-button. Dùng <Button variant="ghost"> theo đúng idiom
  // shadcn cho sidebar item.
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
            <Link key={href} to={href} className={navLinkClass(isNavItemActive(href))}>
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Sidebar footer: dark mode toggle. Đăng xuất (AM-04) chuyển sang trang
            Hồ sơ theo mockup — chờ #166 dựng ProfilePage thật. */}
        <div className="border-sidebar-border space-y-1.5 border-t p-4">
          <Button
            variant="ghost"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={sidebarRowClass}
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{isDarkMode ? 'Chế độ sáng' : 'Chế độ tối'}</span>
          </Button>
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
                <Link
                  key={href}
                  to={href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={navLinkClass(isNavItemActive(href))}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>

            <div className="border-sidebar-border space-y-1.5 border-t p-4">
              <Button
                variant="ghost"
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={sidebarRowClass}
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{isDarkMode ? 'Chế độ sáng' : 'Chế độ tối'}</span>
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* ========== MAIN CONTENT AREA ========== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Dải mobile: chỉ có hamburger để mở drawer — mockup không vẽ top
            navbar, nên không còn page title / nút tạo kế hoạch / avatar ở đây.
            Từng trang tự đặt hành động của nó trong nội dung (vd. mockup
            screen-plans.html có nút "Tạo kế hoạch mới" riêng). */}
        <header className="border-border bg-card sticky top-0 z-30 flex h-16 items-center border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(true)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground -ml-2"
          >
            <Menu className="size-5" />
          </Button>
          <span className="text-foreground ml-2 text-base font-bold tracking-tight">Recall AI</span>
        </header>

        {/* Nội dung trang hiện tại */}
        <main className="mx-auto w-full max-w-7xl grow p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
