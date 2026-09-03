import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SystemMessageProps {
  /**
   * `warn` = `.sys--warn`: hệ thống đang chạy ở đường dự phòng, không phải lỗi chết.
   * `remediate` = `.sys--remediate` (mockup `screen-interview.html:640`): hệ thống vừa xếp lại
   * hàng đợi theo đồ thị khái niệm. Đây là khoảnh khắc differentiator của sản phẩm nhìn thấy
   * được, nên nó có màu riêng — không dùng chung với `warn`, vì truy ngược không phải sự cố.
   */
  variant?: 'default' | 'warn' | 'remediate';
  /** Bật live-region cho đúng MỘT thông báo mới nhất, tránh trình đọc màn hình đọc lại lịch sử. */
  isLive?: boolean;
  children: ReactNode;
}

/**
 * Khối "Hệ thống" (`.sys` trong mockup) — nơi ràng buộc C4 nhìn thấy được: mọi quyết định
 * điều phối là logic tất định của phần mềm, KHÔNG phải AI. Chip mono ở đầu dòng là thứ tách
 * nó khỏi bong bóng hội thoại, nên dùng chung cho cả ghi chú điều phối lẫn băng cảnh báo
 * fallback — hai loại tin nhắn cùng một họ thì phải trông cùng một họ.
 */
export function SystemMessage({
  variant = 'default',
  isLive = false,
  children,
}: SystemMessageProps) {
  return (
    <div
      role={isLive ? 'status' : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[12.5px] leading-[1.55]',
        variant === 'warn'
          ? 'border-mastery-learning/34 bg-mastery-learning/9 text-foreground'
          : variant === 'remediate'
            ? 'border-remediate/32 bg-remediate/8 text-foreground'
            : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'mt-px shrink-0 rounded border px-[7px] py-px font-mono text-[11px]',
          variant === 'remediate'
            ? 'border-remediate/45 text-remediate bg-transparent'
            : 'border-border bg-card text-muted-foreground'
        )}
      >
        Hệ thống
      </span>
      <span>{children}</span>
    </div>
  );
}
