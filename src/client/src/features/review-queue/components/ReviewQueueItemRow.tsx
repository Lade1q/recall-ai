import { Badge } from '@/components/ui/badge';
import { masteryBand, masteryLabel } from '@/components/ui/concept-node';
import type { ReviewQueueItem } from '../types/review-queue.types';

/** Nút hành động dạng "link-chữ" dùng chung cho mọi dòng trong màn này (mockup `.linkish`). */
const LINKISH_BUTTON_CLASS =
  'border-border text-muted-foreground hover:text-foreground hover:border-foreground shrink-0 cursor-pointer border-0 border-b bg-none p-0 font-sans text-[12.5px] whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Dưới 721px mockup đổ lại lưới: mọi ô của cột phải rơi xuống dưới tên khái niệm thay vì chen
 * nhau trên một hàng 5 cột (mockup `@media (max-width: 720px)`). Dùng `min-[721px]:` để mốc khớp
 * đúng mockup thay vì làm tròn về `sm`/`md` của Tailwind.
 */
const STACKED_CELL_CLASS =
  'col-start-2 justify-self-start min-[721px]:col-start-auto min-[721px]:justify-self-auto';

const MASTERY_DOT_CLASS: Record<ReturnType<typeof masteryBand>, string> = {
  strong: 'bg-mastery-strong',
  learning: 'bg-mastery-learning',
  weak: 'bg-mastery-weak',
  untested: 'bg-mastery-untested',
};

/** Chấm màu 8x8 + nhãn chữ thường + điểm 2 chữ số thập phân khi có (mockup `.mast`). Ba dải
 *  0.6/0.8 của `masteryBand()` là nguồn sự thật duy nhất — không tự đặt ngưỡng khác ở đây. */
function MasteryCell({ score, className }: { score: number | null; className?: string }) {
  const band = masteryBand(score);
  return (
    <span
      className={`text-muted-foreground inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] ${className ?? ''}`}
    >
      <i
        aria-hidden="true"
        className={`block size-2 flex-none rounded-[2px] ${MASTERY_DOT_CLASS[band]}`}
      />
      {score !== null && (
        <b className="text-foreground font-mono text-[12.5px] font-semibold tabular-nums">
          {score.toFixed(2)}
        </b>
      )}
      {masteryLabel(band).toLowerCase()}
    </span>
  );
}

interface ReviewQueueItemRowProps {
  item: ReviewQueueItem;
  /** `remove` = dòng thật trong hàng đợi (nút "Bỏ khỏi lịch"). `restore` = dòng trong nhóm
   *  "Đã gỡ khỏi lịch" (nút "Đưa lại vào lịch"). `gone` = marker "Vừa gỡ" + "Hoàn tác". */
  variant: 'remove' | 'restore' | 'gone';
  /** Số thứ tự hiển thị — chỉ dùng ở variant `remove`; trang tự đếm, bỏ qua mọi dòng `gone`
   *  (tương đương `counter-increment: none` của mockup). */
  index?: number;
  isPending: boolean;
  onRemove?: (item: ReviewQueueItem) => void;
  onRestore?: (item: ReviewQueueItem) => void;
  onUndo?: (item: ReviewQueueItem) => void;
}

export function ReviewQueueItemRow({
  item,
  variant,
  index,
  isPending,
  onRemove,
  onRestore,
  onUndo,
}: ReviewQueueItemRowProps) {
  // Truy ngược là loại mục duy nhất mang chip riêng — tái dùng đúng `<Badge tone="remediate">`
  // của #285 để nhất quán với màn tổng hợp cuối phiên, không tự vẽ chip mới.
  const chip =
    item.reason === 'traceback' && item.depth !== null ? `Truy ngược · tầng ${item.depth}` : null;

  if (variant === 'gone') {
    return (
      <li
        // Mockup cố ý không dùng toast: xác nhận nằm tại chỗ mắt vừa bấm. Đổi lại, người dùng đọc
        // màn hình không có gì để nghe — nên chính dòng này là vùng thông báo.
        role="status"
        className="bg-muted text-muted-foreground grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-md px-1 py-4 min-[721px]:grid-cols-[30px_minmax(0,1fr)_auto] min-[721px]:gap-x-4 min-[721px]:gap-y-0"
      >
        <span aria-hidden="true" className="font-mono text-[11.5px]">
          —
        </span>
        <span className="text-[13px]">
          Đã bỏ <b className="text-foreground font-medium">{item.name}</b> khỏi lịch
        </span>
        <button
          type="button"
          className={`${LINKISH_BUTTON_CLASS} ${STACKED_CELL_CLASS}`}
          aria-label={`Hoàn tác việc bỏ ${item.name} khỏi lịch`}
          onClick={() => onUndo?.(item)}
        >
          Hoàn tác
        </button>
      </li>
    );
  }

  if (variant === 'restore') {
    return (
      <li className="border-border py-3.25 grid grid-cols-1 items-baseline gap-y-1.5 border-b last:border-b-0 min-[721px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[721px]:gap-x-4 min-[721px]:gap-y-0">
        <div>
          <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[15px] leading-[1.35]">
            {chip && <Badge tone="remediate">{chip}</Badge>}
            {item.name}
          </div>
          <div className="text-muted-foreground mt-0.75 text-pretty text-[13px]">
            {item.reasonText}
          </div>
        </div>
        <MasteryCell score={item.masteryScore} className="justify-self-start" />
        <button
          type="button"
          className={`${LINKISH_BUTTON_CLASS} justify-self-start`}
          disabled={isPending}
          aria-label={`Đưa ${item.name} lại vào lịch`}
          onClick={() => onRestore?.(item)}
        >
          Đưa lại vào lịch
        </button>
      </li>
    );
  }

  // variant === 'remove'
  const numberLabel = index !== undefined ? String(index + 1).padStart(2, '0') : '';
  return (
    <li className="border-border grid grid-cols-[30px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 border-b px-1 py-4 min-[721px]:grid-cols-[30px_minmax(0,1fr)_auto_auto_auto] min-[721px]:gap-x-4 min-[721px]:gap-y-0">
      <span
        aria-hidden="true"
        className="text-muted-foreground font-mono text-[11.5px] tabular-nums"
      >
        {numberLabel}
      </span>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[15px] font-medium leading-[1.35]">
          {chip && <Badge tone="remediate">{chip}</Badge>}
          {item.name}
        </div>
        <div className="text-muted-foreground mt-0.75 text-pretty text-[13px]">
          {item.reasonText}
        </div>
      </div>
      <MasteryCell score={item.masteryScore} className={STACKED_CELL_CLASS} />
      <span
        className={`text-muted-foreground min-w-[62px] whitespace-nowrap font-mono text-xs tabular-nums ${STACKED_CELL_CLASS} text-left min-[721px]:text-right`}
      >
        ≈ {item.estimatedMinutes} phút
      </span>
      {/* Mục ảo A3 (id = null): không có hàng thật để PATCH — để trống chỗ của nút thay vì hiện
          nút rồi báo lỗi khi bấm. */}
      {item.id === null ? (
        <span aria-hidden="true" className={STACKED_CELL_CLASS} />
      ) : (
        <button
          type="button"
          className={`${LINKISH_BUTTON_CLASS} ${STACKED_CELL_CLASS}`}
          disabled={isPending}
          aria-label={`Bỏ ${item.name} khỏi lịch`}
          onClick={() => onRemove?.(item)}
        >
          Bỏ khỏi lịch
        </button>
      )}
    </li>
  );
}
