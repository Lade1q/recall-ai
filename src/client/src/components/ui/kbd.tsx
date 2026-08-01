import { cn } from '@/lib/utils';

/**
 * Mục "Metadata / Keystroke" trong claude-design/components.html: Geist Mono
 * cho số liệu và phím tắt.
 */

/** Một phím vật lý: `<kbd>Ctrl</kbd> + <kbd>K</kbd>`. Nền + viền đến từ quy tắc
 *  `kbd` trong global.css, ở đây chỉ chỉnh khoảng cách và canh dòng. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn('inline-flex items-center leading-normal', className)}
      {...props}
    />
  );
}

/**
 * Số liệu chạy giữa dòng văn: `mastery_score`, đồng hồ Pomodoro, "Lượt 2/3".
 *
 * `tabular-nums` là lý do component này tồn tại thay vì một className rời:
 * điểm mastery và đồng hồ đếm ngược đổi giá trị liên tục, chữ số không đều
 * chiều rộng thì cả dòng nhảy theo từng lần cập nhật.
 */
function MetaMono({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span data-slot="meta-mono" className={cn('font-mono tabular-nums', className)} {...props} />
  );
}

export { Kbd, MetaMono };
