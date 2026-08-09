import { ChevronRight } from 'lucide-react';
import type { ReviewQueueItem } from '../types/review-queue.types';
import { ReviewQueueItemRow } from './ReviewQueueItemRow';

interface RemovedGroupProps {
  items: ReviewQueueItem[];
  pendingConceptIds: Set<string>;
  onRestore: (item: ReviewQueueItem) => void;
  /** Mở sẵn — dùng ở `AllRemovedState`, nơi nhóm này là toàn bộ nội dung của màn. */
  open?: boolean;
}

/**
 * "Đã gỡ khỏi lịch (N)" — `<details>` native theo đúng mockup, không dựng Accordion riêng. Hàng
 * không bị xoá khỏi DB (`status = 'skipped'`), nên nhóm này không được giấu chúng đi.
 *
 * Trả `null` khi rỗng: không có gì để gỡ ra thì không có gì để hiện.
 */
export function RemovedGroup({ items, pendingConceptIds, onRestore, open }: RemovedGroupProps) {
  if (items.length === 0) return null;

  return (
    <details
      className="border-border bg-muted mt-6.5 group rounded-[calc(var(--radius)*0.9)] border"
      open={open}
    >
      <summary className="text-muted-foreground py-3.25 gap-2.25 flex cursor-pointer list-none items-center px-4 text-[13px] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3 flex-none transition-transform group-open:rotate-90"
        />
        <span>
          Đã gỡ khỏi lịch (<b className="text-foreground font-medium">{items.length}</b>)
        </span>
      </summary>
      <div className="px-4 pb-2">
        <p className="text-muted-foreground mb-1 max-w-[620px] text-pretty text-[12.5px]">
          Những khái niệm này không được đưa vào phiên học nào cho tới khi bạn đưa lại.
        </p>
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <ReviewQueueItemRow
              key={item.conceptId}
              item={item}
              variant="restore"
              isPending={pendingConceptIds.has(item.conceptId)}
              onRestore={onRestore}
            />
          ))}
        </ul>
      </div>
    </details>
  );
}
