import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NotebookText, Timer, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Hai trạng thái rỗng của màn Lịch sử, cả hai dựng trên `EmptyState` dùng chung.
 *
 * Trước đây tệp này giữ một khung riêng (`EmptyHistoryFrame`) vì `components/ui/empty-state.tsx`
 * chưa lên `main` lúc #247 làm. Nay nó đã lên (#405/PR #437) và khung riêng kia là **bản chép
 * thứ ba** của cùng công thức — đúng thứ `EmptyState` ra đời để dọn. Đã đo được ba giá trị trôi
 * khỏi nhau trước cả khi bản thứ ba nhập kho: tiêu đề `19px`/`20px`, `tracking` `-0.01`/`-0.02`,
 * thân `leading` `1.65`/`1.7`. Gộp lại là chọn một bộ, và bộ đúng là bộ của `EmptyState`.
 *
 * Khung thẻ (`bg-card border rounded-xl`) ở lại **nơi gọi**, không đi vào `EmptyState`: hai người
 * dùng cũ của nó (`AllRemovedState`, `EmptyQueueMessage`) không có khung, và nướng khung vào
 * component sẽ ép chúng ghi đè ngay từ ngày đầu — cùng lý do `className` đã được để lại cho nơi
 * gọi.
 */
function HistoryEmptyCard({
  icon,
  heading,
  body,
  action,
}: {
  icon: LucideIcon;
  heading: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="bg-card border-border rounded-xl border px-6 py-14">
      <EmptyState icon={icon} heading={heading} body={body} action={action} />
    </div>
  );
}

/**
 * AF1 — chưa có phiên kiểm tra nào.
 *
 * Khác trạng thái rỗng của danh sách kế hoạch: người dùng ĐÃ có kế hoạch, chỉ là chưa kiểm tra
 * lần nào. Nên chỗ trống nói thẳng cái giá phải trả — đồ thị khái niệm còn xám vì chưa có
 * `mastery_score` nào — rồi dẫn tới đúng hành động mở khoá nó, thay vì một câu động viên.
 */
export function NoSessionsYet({ filtered }: { filtered: boolean }) {
  return (
    <HistoryEmptyCard
      icon={NotebookText}
      heading={filtered ? 'Kế hoạch này chưa có phiên kiểm tra nào' : 'Chưa có phiên kiểm tra nào'}
      body={
        filtered
          ? 'Chọn "Tất cả kế hoạch" để xem các phiên thuộc kế hoạch khác, hoặc bắt đầu một phiên cho kế hoạch này.'
          : 'Các khái niệm trong kế hoạch của bạn vẫn đang ở mức chưa đo — đồ thị khái niệm còn xám vì hệ thống chưa biết cái nào vững, cái nào chưa, nên chưa xếp được lịch ôn theo ưu tiên. Một phiên khoảng 15 phút là đủ để đồ thị bắt đầu có màu.'
      }
      action={
        <Button asChild>
          <Link to="/interview">Bắt đầu phiên kiểm tra đầu tiên</Link>
        </Button>
      }
    />
  );
}

/**
 * DB-08 — chưa có phiên học nào. CTA trỏ sang FS-01, **không** phải AE-01.
 *
 * Câu chữ cố ý không hứa điểm số: phiên học không sinh `mastery_score`, nên hứa "đo được trình
 * độ" ở đây là dẫn người dùng vào đúng hiểu lầm mà cả tab này được dựng ra để tránh.
 */
export function NoFocusSessionsYet() {
  return (
    <HistoryEmptyCard
      icon={Timer}
      heading="Chưa có phiên học nào"
      body="Phiên học là lúc bạn ngồi xuống đọc và ôn theo chu kỳ Pomodoro — nó không chấm điểm, nên chỗ này sẽ ghi lại thời gian và những khái niệm bạn đã đụng tới, nhóm theo từng ngày. Một phiên đầu tiên là đủ để trang này bắt đầu có nội dung."
      action={
        <Button asChild>
          <Link to="/focus">Bắt đầu phiên học đầu tiên</Link>
        </Button>
      }
    />
  );
}
