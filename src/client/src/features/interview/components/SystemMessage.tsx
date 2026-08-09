import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SystemMessageProps {
  /** `warn` = `.sys--warn`: hệ thống đang chạy ở đường dự phòng, không phải lỗi chết. */
  variant?: 'default' | 'warn';
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
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span className="border-border bg-card text-muted-foreground mt-px shrink-0 rounded border px-[7px] py-px font-mono text-[11px]">
        Hệ thống
      </span>
      <span>{children}</span>
    </div>
  );
}
