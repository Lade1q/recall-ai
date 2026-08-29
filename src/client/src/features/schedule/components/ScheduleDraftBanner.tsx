import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';

interface ScheduleDraftBannerProps {
  draftCount: number;
  /**
   * Đổi sang view "Kế hoạch" + tab "Chưa xác nhận" (#404 cấp dây từ `PlansPage`).
   *
   * `undefined` khi chưa có ai nối — lúc đó banner rơi về một `<Link>` tới `/plans`, vẫn đi được
   * chứ không thành một câu thông báo cụt. Một banner khai ra vấn đề mà không có bước kế tiếp là
   * đúng thứ nó sinh ra để tránh.
   */
  onShowDraftPlans?: () => void;
}

const ACTION_LABEL = 'Xem & xác nhận →';
const ACTION_CLASS = 'text-ai-accent shrink-0 font-semibold underline-offset-2 hover:underline';

/**
 * "N kế hoạch chưa xác nhận đồ thị" (#400).
 *
 * Không có banner này thì kế hoạch `draft` **vô hình** với người chỉ ở view Lịch: `/schedule` lọc
 * `plan.status = 'active'`, nên theo định nghĩa chúng đóng góp 0 mục — lịch trống mà không ai nói
 * vì sao. Đây là ca hồi quy đã đo thật ở PR #409 (tài khoản chỉ có `draft` mất luôn bằng chứng
 * mình CÓ kế hoạch).
 *
 * Theo công thức viền-trái + tint của `BlockError` (#169) nhưng KHÔNG dùng lại tệp đó: nền ở kia
 * là `bg-muted` cho một khối *lỗi*, còn đây là tint `--ai-accent` cho một khối *việc cần làm*.
 * Gộp hai thứ vào một component sẽ là một `tone` đổi cả nền lẫn viền lẫn icon, tức hai component
 * mặc chung một cái vỏ.
 */
export function ScheduleDraftBanner({ draftCount, onShowDraftPlans }: ScheduleDraftBannerProps) {
  if (draftCount <= 0) return null;

  return (
    <div className="border-l-ai-accent bg-ai-accent/11 mb-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border-l-2 px-3.5 py-2.5 text-[12.5px]">
      <ClipboardCheck aria-hidden="true" className="text-ai-accent size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{draftCount} kế hoạch chưa xác nhận đồ thị</b> — chúng chưa có
        buổi ôn nào trên lịch.
      </span>
      {onShowDraftPlans ? (
        <button type="button" className={ACTION_CLASS} onClick={onShowDraftPlans}>
          {ACTION_LABEL}
        </button>
      ) : (
        <Link to="/plans" className={ACTION_CLASS}>
          {ACTION_LABEL}
        </Link>
      )}
    </div>
  );
}
