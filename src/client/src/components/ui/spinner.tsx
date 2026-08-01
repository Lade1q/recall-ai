import { cn } from '@/lib/utils';

/**
 * Vòng xoay chờ theo mục "Loading" trong claude-design/components.html: một
 * cung tròn hở 3/4, nét 2.2, quay 900ms tuyến tính.
 *
 * Là `<svg>` chứ không phải div bo tròn viền-một-cạnh (mẫu bị chép ở
 * PlanDetailPage): cung vẽ bằng path giữ được nét bo đầu và không đổi hình khi
 * đổi kích cỡ. Không tự thông báo gì cho trình đọc màn hình — chỗ gọi đặt
 * `aria-busy`/nhãn cạnh nó (Button đã làm sẵn).
 */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      data-slot="spinner"
      role="presentation"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      className={cn('size-4 animate-spin [animation-duration:900ms]', className)}
      {...props}
    >
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </svg>
  );
}

export { Spinner };
