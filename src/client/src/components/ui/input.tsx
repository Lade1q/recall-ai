import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Ô nhập theo mục "Form controls" trong claude-design/components.html:
 * cao 38px, bo 0.65×radius, padding 9px/12px, viền 1px, focus ring 2px cách 1px.
 *
 * Đây từng là `AUTH_INPUT_CLASS` chép tay trong LoginForm và SignupForm — bản
 * dùng chung khi đó còn là h-8/rounded-lg mặc định của shadcn. Giờ mặc định
 * chính là spec, hai form auth không cần override nữa.
 *
 * Hover đổi màu viền chứ không đổi nền: ô nhập sáng lên khi rê chuột trông như
 * nút bấm. Lỗi dùng `--mastery-weak` để trùng màu với FieldError ngay dưới nó.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-border rounded-field bg-card duration-(--duration-fast) ease-(--ease-standard) h-9.5 py-2.25 w-full min-w-0 border px-3 text-base outline-none transition-colors',
        'file:text-foreground placeholder:text-muted-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'hover:border-muted-foreground focus-visible:outline-ring focus-visible:border-transparent focus-visible:outline-2 focus-visible:outline-offset-1',
        'disabled:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-mastery-weak aria-invalid:hover:border-mastery-weak',
        'dark:bg-input/30 dark:disabled:bg-input/80 md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Input };
