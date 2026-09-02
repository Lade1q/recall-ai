import { Pause, TriangleAlert, WalletCards, Radio } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { InterviewSessionStatus } from '@/features/interview/types/interview.types';

/**
 * Dòng trạng thái của một phiên — hiện ở mục danh sách và ở đầu panel chi tiết.
 *
 * `interview_session_status` có bốn giá trị và cả bốn đều tới được màn này (ghi chú "Khoảng
 * trống tài liệu" cuối `screen-history.html`): danh sách phía server không lọc theo status.
 * `completed` là mặc định nên không có dòng nào — chỉ những gì KHÁC mặc định mới đáng một dòng.
 *
 * `fallbackMode` độc lập với `status`: một phiên vừa `completed` vừa tự chấm phải mang cả hai
 * nhãn (SPEC_DB-03 AF4 đòi nhãn ở **cả** danh sách lẫn đầu panel).
 */

const STATUS_STYLE: Record<
  Exclude<InterviewSessionStatus, 'completed'>,
  { icon: typeof Pause; label: string; className: string }
> = {
  paused: {
    icon: Pause,
    label: 'Đang tạm dừng — tiếp tục được',
    className: 'text-focus-session-text',
  },
  abandoned: {
    icon: TriangleAlert,
    label: 'Bỏ dở',
    className: 'text-mastery-weak',
  },
  active: {
    icon: Radio,
    label: 'Đang diễn ra',
    className: 'text-primary-text',
  },
};

export function SessionStatusLine({
  status,
  fallbackMode,
  className,
}: {
  status: InterviewSessionStatus;
  fallbackMode: boolean;
  className?: string;
}) {
  const style = status === 'completed' ? null : STATUS_STYLE[status];
  if (!style && !fallbackMode) return null;

  return (
    <div className={cn('mt-[7px] flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {style && (
        <span className={cn('inline-flex items-center gap-1.5 text-[11.5px]', style.className)}>
          <style.icon className="size-[13px] shrink-0" aria-hidden="true" />
          {style.label}
        </span>
      )}
      {fallbackMode && (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11.5px]">
          <WalletCards className="size-[13px] shrink-0" aria-hidden="true" />
          Flashcard tự chấm
        </span>
      )}
    </div>
  );
}
