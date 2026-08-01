/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

/**
 * Nút theo `.btn` trong claude-design/components.html (Design System v3).
 *
 * Bốn biến thể tài liệu hoá — default · secondary · outline · ghost — cộng
 * destructive/link giữ lại từ shadcn cho các chỗ đã dùng. Khác bản shadcn gốc
 * ở bốn điểm, đều là điều components.html nói rõ:
 *   · bo góc 0.8×radius (`rounded-md`), không phải 1×
 *   · nhấn = `scale(0.98)`, không phải dịch xuống 1px
 *   · focus = viền ngoài 2px cách 1px, không phải ring 3px mờ
 *   · hover đổi độ sáng của chính token, không phải hạ opacity — nút mờ đi khi
 *     rê chuột trông như đang bị vô hiệu hoá
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,transform] duration-(--duration-fast) ease-(--ease-standard) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-[oklch(from_var(--primary)_calc(l_-_0.04)_c_h)]',
        outline:
          'border-border bg-card hover:bg-muted aria-expanded:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'border-border bg-secondary text-secondary-foreground hover:bg-muted aria-expanded:bg-muted',
        ghost: 'hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-destructive',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        // Padding 10px/18px của `.btn` — cao 40px khi render.
        default: 'h-10 px-[18px]',
        xs: "h-7 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 px-6',
        icon: 'size-10',
        'icon-xs': "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /**
     * Trạng thái "Đang tạo…" trong components.html: nút tự vô hiệu hoá và mọc
     * spinner ở đầu nhãn. Nhãn vẫn hiện — nút chỉ còn vòng xoay thì mất luôn
     * thông tin nó vừa làm gì.
     */
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      disabled={disabled ?? (asChild ? undefined : loading)}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {/* `Slot.Root` (radix) chỉ chấp nhận đúng MỘT con — `Children.only` bên
          trong nó sẽ ném lỗi (render trắng cả cây, vì không có error boundary
          nào bắt) nếu con thứ hai lọt vào, kể cả khi con đó là `false`. Vì
          vậy khi asChild, Comp chỉ được nhận đúng `children`, không thêm gì. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
