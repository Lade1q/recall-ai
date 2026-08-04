import { Lock } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Dòng dữ liệu chỉ-đọc — `.locked` trong components.html, vd email dùng làm
 * định danh đăng nhập.
 *
 * Không phải `<Input disabled>`: theo ghi chú trong bản thiết kế, "một ô xám
 * vẫn mời click; hiển thị giá trị kèm ổ khóa thì không hứa hẹn gì". Vì vậy đây
 * là `<div>` chứ không phải input — không focus được, không nằm trong tab
 * order, và không gửi kèm khi submit form.
 *
 * Cùng chiều cao và bo góc với `Input` để xếp thẳng hàng trong cùng một form.
 */
function LockedValue({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="locked-value"
      className={cn(
        'border-border rounded-field bg-muted text-muted-foreground min-h-9.5 gap-2.25 py-2.25 flex w-full items-center border px-3 text-sm',
        className
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <Lock aria-hidden="true" strokeWidth={1.8} className="ml-auto size-3.5 flex-none" />
    </div>
  );
}

export { LockedValue };
