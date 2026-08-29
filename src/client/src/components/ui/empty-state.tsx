import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Bỏ trống khi khối đã nằm trong một thẻ có khung riêng — icon lúc đó chỉ là trang trí thừa. */
  icon?: LucideIcon;
  heading: string;
  /** Câu giải thích. Không render gì khi vắng — "không có câu" khác "câu rỗng". */
  body?: React.ReactNode;
  /** Bước kế tiếp. Trạng thái rỗng không có hành động là một ngõ cụt lịch sự. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Khung trình bày dùng chung cho mọi trạng thái RỖNG (icon + tiêu đề + câu + hành động).
 *
 * Tách ra từ `EmptyQueueMessage` (#225) khi màn Lịch (#405) cần đúng công thức đó lần thứ ba:
 * `AllRemovedState` đã là bản chép thứ hai, và ba bản chép của cùng một công thức là ba nơi để
 * `text-[13.5px]` trôi khỏi nhau. Cố ý KHÔNG nhận `planId`/`planStatus` như `EmptyQueueMessage`:
 * khung chỉ biết trình bày, còn "trạng thái nào thì nói câu gì" là quyết định của nơi gọi.
 *
 * Lề ngoài do nơi gọi truyền qua `className` — hai người dùng hiện tại đang đặt hai giá trị khác
 * nhau, nên nướng một giá trị vào đây là ép một trong hai phải ghi đè ngay từ ngày đầu.
 */
export function EmptyState({ icon: Icon, heading, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn('max-w-130 mx-auto text-center', className)}>
      {Icon && (
        <div className="text-muted-foreground mb-4 flex justify-center opacity-55">
          <Icon aria-hidden="true" className="size-10" strokeWidth={1.3} />
        </div>
      )}
      <h3 className="font-heading mb-2 text-[20px] tracking-[-0.02em]">{heading}</h3>
      {body && (
        <p
          className={cn(
            'text-muted-foreground text-pretty text-[13.5px] leading-[1.7]',
            action && 'mb-4.5'
          )}
        >
          {body}
        </p>
      )}
      {action}
    </div>
  );
}
