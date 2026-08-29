import { XCircle } from 'lucide-react';

import type { FocusSessionListItem } from '@/features/focus/types/focus.types';
import { formatTime } from '../utils/format';

/**
 * Một hàng của lịch sử phiên học (DB-08 · #247).
 *
 * ⚠️ **Không phải `<button>`, khác mockup.** Mockup vẽ mỗi hàng là một `<button>`, nhưng #247 ghi
 * rõ *"Chi tiết một phiên học — mockup không thiết kế panel chi tiết cho tab này. Mục danh sách
 * là điểm dừng."* Một `<button>` không dẫn đi đâu vẫn nhận focus bàn phím và vẫn được trình đọc
 * màn hình đọc là "nút", nên nó hứa một hành động không tồn tại. Khi nào có panel chi tiết thì
 * đổi thẻ ở đúng chỗ này.
 */
export function FocusSessionRow({
  session,
  planLabel,
}: {
  session: FocusSessionListItem;
  /**
   * Nhãn kế hoạch đã được quyết ở `FocusSessionList` — `null` nghĩa là **bỏ hẳn đoạn này**, chứ
   * không phải "phiên tự do". Hai ca đó khác nhau và không được gộp: xem `resolvePlanLabel`.
   */
  planLabel: string | null;
}) {
  const cancelled = session.status === 'cancelled';

  const conceptNames = session.concepts.map((concept) => concept.name).join(', ');
  const scope = [conceptNames, planLabel].filter(Boolean).join(' · ');

  return (
    <article className="px-[18px] pb-[13px] pt-[11px]">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="font-mono text-[12.5px] tabular-nums">
          {formatTime(session.startedAt)} · {formatSessionLength(session)}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-[12px] tabular-nums">
          {session.pomodorosCompleted > 0 ? `${session.pomodorosCompleted} chu kỳ` : '—'}
        </span>
      </div>

      <div className="text-muted-foreground mt-px truncate text-[12.5px]">{scope}</div>

      {cancelled && (
        <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-[12px]">
          <XCircle className="size-[13px] shrink-0 stroke-[1.7]" aria-hidden="true" />
          Đã hủy giữa chừng
        </div>
      )}
    </article>
  );
}

/**
 * Thời lượng in trên một hàng.
 *
 * 🔴 **Khác mockup, có chủ ý.** Mockup in `7 phút` cho hàng phiên hủy; ở đây in `—`. Ba lý do,
 * xếp theo sức nặng:
 *
 * 1. **`durationMinutes` của phiên hủy luôn là `0`** — có chủ ý, FS-01 Alt flow 4
 *    (`focus-session.service.ts`). In "0 phút" cho một phiên người ta thật sự có ngồi học thì
 *    trông như lỗi.
 * 2. **Không thay bằng `focusedSeconds` được.** Phiên bị lazy-reap sau 8 giờ (đóng tab rồi quên)
 *    đi qua raw SQL của `reapStaleSessions`, và câu đó **không ghi `focused_seconds`** — cột ấy
 *    chỉ được ghi ở `endFocusSession`, nên phiên reap giữ nguyên `@default(0)`. Dùng
 *    `focusedSeconds` thì hai hàng cùng nhãn "Đã hủy giữa chừng" sẽ in `7 phút` và `0 phút`,
 *    khác nhau vì một lý do người dùng không nhìn thấy được.
 * 3. **`—` là ký hiệu mockup đã tự đặt ra** cho ô không có số: chính hàng phiên hủy đó, cột chu
 *    kỳ Pomodoro của mockup là `—`.
 *
 * Hệ quả kèm theo: tổng phút của một ngày (xem `groupFocusSessionsByDay`) cũng không cộng phiên
 * hủy — nhờ vậy nó khớp với dải chỉ số FS-07 phía trên và với `weeklyStudyMinutes` của Dashboard,
 * vốn đều lọc `status: 'completed'`. Cộng vào sẽ tạo ra ba con số chạy hai luật trên một màn.
 */
function formatSessionLength(session: FocusSessionListItem): string {
  if (session.status === 'cancelled') return '—';
  return `${session.durationMinutes} phút`;
}
