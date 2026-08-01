/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Nhãn trạng thái theo mục "Badges / Tags" trong claude-design/components.html
 * — "ngoại lệ duy nhất được phép pill-shape" trong Design System v3.
 *
 * Mỗi `tone` là một trong năm accent ngữ nghĩa của hệ thống, dùng đúng một
 * nghĩa: nền là tint 14% của token, chữ là chính token đó. Không có tone
 * "info"/"success"/"warning" chung chung — màu ở đây luôn nói về mastery, về
 * AI, hoặc về remediate, không nói về mức độ nghiêm trọng.
 *
 * Chữ trong badge phải tự đứng được: `strong` là "Vững", không phải chấm xanh.
 * (Ràng buộc C6 — màu không bao giờ là tín hiệu duy nhất.)
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-semibold tracking-[0.05em] uppercase whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        strong: 'bg-mastery-strong/14 text-mastery-strong',
        learning: 'bg-mastery-learning/14 text-mastery-learning',
        weak: 'bg-mastery-weak/14 text-mastery-weak',
        untested: 'bg-muted text-muted-foreground',
        remediate: 'bg-remediate/14 text-remediate',
        ai: 'bg-ai-accent/14 text-ai-accent',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  }
);

function Badge({
  className,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-tone={tone}
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
