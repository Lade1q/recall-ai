import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Thẻ theo mục "Card" trong claude-design/components.html: "định nghĩa bằng
 * viền 1px, không shadow — hover mới xuất hiện shadow cực nhạt".
 *
 * Đổi `ring-1 ring-foreground/10` của shadcn thành `border` thật vì hai lý do:
 * ring vẽ ngoài hộp nên không cộng vào chiều cao (thẻ lệch 2px so với mockup),
 * và nó không dùng token `--border` — thẻ ở dark mode do đó đậm hơn mọi đường
 * kẻ khác trên cùng màn hình.
 *
 * `CardTitle` vẫn là sans thường; `font-heading` áp tại chỗ dùng (xem
 * LoginForm) đúng như bản demo Card trong components.html.
 */
function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card border-border gap-(--card-spacing) bg-card py-(--card-spacing) text-card-foreground duration-(--duration-fast) ease-(--ease-standard) hover:shadow-(--shadow-soft) has-data-[slot=card-footer]:pb-0 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl flex flex-col overflow-hidden rounded-xl border text-sm transition-shadow [--card-spacing:--spacing(4)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)]',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing) grid auto-rows-min items-start gap-1 rounded-t-xl',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'text-base font-medium leading-snug group-data-[size=sm]/card:text-sm',
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('px-(--card-spacing)', className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'bg-muted/50 p-(--card-spacing) flex items-center rounded-b-xl border-t',
        className
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
