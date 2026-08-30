import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { masteryBand } from '@/components/ui/concept-node';
import {
  LINKISH_BUTTON_CLASS,
  MasteryCell,
  TracebackChip,
} from '@/features/review-queue/components/ReviewQueueItemRow';
import { focusHref, interviewHref } from '@/features/review-queue/utils/review-queue-links';
import type { ScheduleItem } from '../types/schedule.types';
import { ReschedulePicker } from './ReschedulePicker';

interface ScheduleItemRowProps {
  item: ScheduleItem;
  todayDateKey: string;
  isExpanded: boolean;
  isPending: boolean;
  onToggle: (id: string) => void;
  onReschedule: (item: ScheduleItem, dateKey: string) => void;
  onRemove: (item: ScheduleItem) => void;
}

/**
 * Server từ chối dời ngày **⟺ cụm có ít nhất một hàng `traceback` với `masteryScore < 0.6`**
 * (`isWeakTraceback`, #403).
 *
 * Suy được từ MỘT mục trên lịch vì `getReviewSchedule` đã fold cụm về đại diện, và luật đại diện
 * cho tier thắng tuyệt đối trước `createdAt`: cụm có hàng tier-0 thì đại diện LUÔN là hàng tier-0.
 * Cộng thêm việc cả cụm chung một `concept.masteryScore`, "đại diện là traceback yếu" tương đương
 * đúng với "cụm có hàng traceback yếu".
 *
 * ⚠️ Đừng suy điều này từ luật đại diện — nó chỉ tình cờ trùng. Guard phía server đọc
 * `isWeakTraceback` một mình; đổi `beats()` cũng không đổi guard.
 *
 * Ngưỡng lấy từ `masteryBand` (`concept-node.tsx`) chứ không gõ `0.6`: repo có ba hằng số ngưỡng ở
 * ba tệp, và bản đồ component của màn này cấm đặt thêm ngưỡng thứ tư. `null` (chưa kiểm tra) rơi
 * vào `untested`, và server cũng khoá nó (`masteryScore ?? 0`) — chưa kiểm tra không phải bằng
 * chứng đã vững.
 */
function isRescheduleLocked(item: ScheduleItem): boolean {
  if (item.reason !== 'traceback') return false;
  const band = masteryBand(item.masteryScore);
  return band === 'weak' || band === 'untested';
}

/**
 * Câu "vì sao" của mục, với **tên khái niệm nguồn bấm được**.
 *
 * Chuỗi là `reasonText` NGUYÊN VĂN từ server (`buildReasonText`) — không ghép lại ở client. Việc
 * duy nhất làm thêm: tìm đúng đoạn `'Tên khái niệm'` mà server đã nhúng và bọc nó thành link, để
 * người dùng **kiểm chứng được lời máy nói** thay vì phải tin suông. Không tìm thấy (lý do khác
 * traceback, hoặc `sourceConceptName` rỗng) thì render nguyên câu, không có link — chứ không dựng
 * một câu thay thế.
 *
 * Đích là đồ thị khái niệm của kế hoạch: payload chỉ mang `sourceConceptName`, không mang
 * `sourceConceptId`, nên không neo sâu hơn được. Đừng "sửa" bằng cách so tên ở client.
 */
function ReasonLine({ item }: { item: ScheduleItem }) {
  const isTraceback = item.reason === 'traceback';
  const needle = item.sourceConceptName ? `'${item.sourceConceptName}'` : null;
  const at = needle ? item.reasonText.indexOf(needle) : -1;

  return (
    <p
      className={`px-2.75 py-1.75 rounded-r-[5px] border-l-2 text-[12.5px] leading-[1.55] ${
        isTraceback ? 'border-l-remediate bg-remediate/7' : 'border-l-ai-accent bg-ai-accent/7'
      }`}
    >
      {needle !== null && at >= 0 ? (
        <>
          {item.reasonText.slice(0, at)}
          <Link
            to={`/plan/${item.planId}`}
            className="text-remediate font-semibold underline-offset-2 hover:underline"
            aria-label={`Mở đồ thị khái niệm để xem ${item.sourceConceptName}`}
          >
            {needle}
          </Link>
          {item.reasonText.slice(at + needle.length)}
        </>
      ) : (
        item.reasonText
      )}
    </p>
  );
}

/**
 * Một dòng trong panel ngày / panel "Còn nợ" — **mở rộng tại chỗ**.
 *
 * 🔴 Cố ý KHÔNG cho bấm-là-vào-thẳng-phiên. Ném sinh viên vào câu hỏi về một khái niệm họ chưa
 * hiểu vì sao bị hỏi là đúng kiểu hỏng mà epic này sinh ra để chữa; lời giải thích phải **không
 * né được nhưng bỏ qua được bằng một cú bấm**. Vì thế bấm dòng = mở lời giải thích, còn hai CTA
 * học nằm bên trong.
 *
 * Cấu trúc `<button>` tiêu đề + `<div>` chi tiết là **anh em**, không lồng nhau: mockup vẽ cả khối
 * là một `<button>` chứa bốn `<button>` khác — HTML không hợp lệ, và trình đọc màn hình mất luôn
 * bốn nút đó. Đổi lại, không cần `stopPropagation` ở bất kỳ CTA nào.
 *
 * Ba mảnh trình bày (`TracebackChip`, `MasteryCell`, `LINKISH_BUTTON_CLASS`) lấy từ
 * `ReviewQueueItemRow` — cùng ngữ nghĩa, cùng hình thức, một nguồn.
 */
export function ScheduleItemRow({
  item,
  todayDateKey,
  isExpanded,
  isPending,
  onToggle,
  onReschedule,
  onRemove,
}: ScheduleItemRowProps) {
  const detailsId = useId();
  const isLocked = isRescheduleLocked(item);

  return (
    <li className="border-border/45 border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        onClick={() => onToggle(item.id)}
        className={`hover:bg-muted/50 gap-1.25 py-2.75 flex w-full flex-col px-4 text-left ${
          isExpanded ? 'bg-muted/60' : ''
        }`}
      >
        <span className="gap-x-1.75 flex flex-wrap items-center gap-y-1">
          <TracebackChip item={item} />
          <span className="text-[14px] font-medium">{item.name}</span>
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
          <MasteryCell score={item.masteryScore} />
          <span aria-hidden="true">·</span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]">
            {item.planName}
          </span>
          <span aria-hidden="true">·</span>
          <span>≈ {item.estimatedMinutes} phút</span>
        </span>
      </button>

      {isExpanded && (
        <div id={detailsId} className="flex flex-col gap-2 px-4 pb-3.5">
          <ReasonLine item={item} />

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" asChild>
              <Link to={interviewHref(item)}>Vào phiên kiểm tra</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={focusHref(item)}>Học lại</Link>
            </Button>
            {!isLocked && (
              <ReschedulePicker
                dateKey={item.dateKey}
                todayDateKey={todayDateKey}
                disabled={isPending}
                conceptName={item.name}
                onPick={(dateKey) => onReschedule(item, dateKey)}
              />
            )}
            <button
              type="button"
              className={`${LINKISH_BUTTON_CLASS} self-center`}
              disabled={isPending}
              aria-label={`Gỡ ${item.name} khỏi lịch`}
              onClick={() => onRemove(item)}
            >
              Gỡ khỏi lịch
            </button>
          </div>

          {/* ⛔ KHÔNG có chữ "vào hôm nay": hệ thống xếp lại theo kết quả phiên, không kéo mục về
              hôm nay. Nhầm lẫn đó đã gây chuyện ba lần (#400, mục Microcopy). */}
          {isLocked && (
            <p className="text-muted-foreground border-l-muted-foreground/40 pl-2.25 border-l-2 text-[11.5px] italic leading-[1.45]">
              Không dời được lịch: đây là nền tảng đang vỡ, hệ thống sẽ xếp lại sau mỗi phiên kiểm
              tra.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
