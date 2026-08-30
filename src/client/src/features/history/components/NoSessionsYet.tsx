import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NotebookText, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Khung trạng thái rỗng dùng chung cho cả hai tab của màn Lịch sử.
 *
 * Mockup nói thẳng: *"Trạng thái rỗng dùng lại đúng khuôn ở trên, chỉ đổi CTA — nên không vẽ
 * lại lần hai."* Khung nằm ở đây thay vì bị chép sang file thứ hai; hai hàm export bên dưới chỉ
 * khác nhau ở icon, chữ và CTA.
 *
 * 📌 Khi `components/ui/empty-state.tsx` của #405 (PR #437) vào `main`, khung này nên gộp vào
 * đó — nó đang là bản dọn dẹp cho chính lớp trùng lặp này. Không dựng bản thứ ba ở đây.
 */
function EmptyHistoryFrame({
  icon,
  title,
  body,
  cta,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  cta: ReactNode;
}) {
  return (
    <div className="bg-card border-border flex flex-col items-center rounded-xl border px-6 py-14 text-center">
      {icon}
      <h3 className="font-heading text-foreground text-[19px] tracking-[-0.01em]">{title}</h3>
      <p className="text-muted-foreground mt-2.5 max-w-[52ch] text-[13.5px] leading-[1.65]">
        {body}
      </p>
      <div className="mt-6">{cta}</div>
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
    <EmptyHistoryFrame
      icon={
        <NotebookText
          className="text-muted-foreground mb-4 size-10 stroke-[1.3]"
          aria-hidden="true"
        />
      }
      title={filtered ? 'Kế hoạch này chưa có phiên kiểm tra nào' : 'Chưa có phiên kiểm tra nào'}
      body={
        filtered
          ? 'Chọn "Tất cả kế hoạch" để xem các phiên thuộc kế hoạch khác, hoặc bắt đầu một phiên cho kế hoạch này.'
          : 'Các khái niệm trong kế hoạch của bạn vẫn đang ở mức chưa đo — đồ thị khái niệm còn xám vì hệ thống chưa biết cái nào vững, cái nào chưa, nên chưa xếp được lịch ôn theo ưu tiên. Một phiên khoảng 15 phút là đủ để đồ thị bắt đầu có màu.'
      }
      cta={
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
    <EmptyHistoryFrame
      icon={
        <Timer className="text-muted-foreground mb-4 size-10 stroke-[1.3]" aria-hidden="true" />
      }
      title="Chưa có phiên học nào"
      body="Phiên học là lúc bạn ngồi xuống đọc và ôn theo chu kỳ Pomodoro — nó không chấm điểm, nên chỗ này sẽ ghi lại thời gian và những khái niệm bạn đã đụng tới, nhóm theo từng ngày. Một phiên đầu tiên là đủ để trang này bắt đầu có nội dung."
      cta={
        <Button asChild>
          <Link to="/focus">Bắt đầu phiên học đầu tiên</Link>
        </Button>
      }
    />
  );
}
