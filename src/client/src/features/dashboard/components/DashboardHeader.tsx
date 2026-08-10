import { useAuth } from '@/features/auth/context/AuthContext';
import { greetingForHour, formatFullDate } from '../utils/format';

/**
 * Header chào theo buổi + ngày (mockup: "Chào buổi tối, Minh Anh" / "Thứ hai, 27/07/2026").
 * Không gọi backend — tên lấy từ `AuthContext`, giờ/ngày từ máy client. `name` có thể `null`
 * (chưa đặt tên khi đăng ký) nên chỉ chèn dấu phẩy + tên khi thật sự có.
 */
export function DashboardHeader() {
  const { user } = useAuth();
  const now = new Date();
  const greeting = greetingForHour(now.getHours());
  const name = user?.name?.trim();

  return (
    <header className="mb-7 sm:mb-8">
      <h1 className="font-heading text-[26px] leading-[1.1] sm:text-[32px]">
        {greeting}
        {name ? `, ${name}` : ''}
      </h1>
      <p className="text-muted-foreground mt-1.5 font-mono text-[13px]">{formatFullDate(now)}</p>
    </header>
  );
}
