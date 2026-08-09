import { PackageOpen } from 'lucide-react';
import type { ReviewQueueItem } from '../types/review-queue.types';
import { RemovedGroup } from './RemovedGroup';

interface AllRemovedStateProps {
  skippedItems: ReviewQueueItem[];
  pendingConceptIds: Set<string>;
  onRestore: (item: ReviewQueueItem) => void;
}

/**
 * `items.length === 0 && skippedItems.length > 0` (mockup §3) — người dùng đã gỡ HẾT, KHÔNG phải
 * đã ôn xong. Cố ý BỎ QUA `message` của server: backend vẫn trả câu "đã ôn hết kế hoạch này" ở ca
 * này, sai ngữ cảnh (xem `docs/api/review-queue.md`, mục 1 — bẫy đã ghi rõ trong AC #225). Nhóm
 * đã gỡ mở sẵn vì lúc này nó là toàn bộ nội dung của màn.
 */
export function AllRemovedState({
  skippedItems,
  pendingConceptIds,
  onRestore,
}: AllRemovedStateProps) {
  return (
    <div>
      <div className="max-w-130 mt-8.5 mx-auto mb-2 text-center">
        <div className="text-muted-foreground mb-4 flex justify-center opacity-55">
          <PackageOpen aria-hidden="true" className="size-10" strokeWidth={1.3} />
        </div>
        <h3 className="font-heading mb-2 text-[20px] tracking-[-0.02em]">
          Bạn đã gỡ tất cả khái niệm khỏi lịch
        </h3>
        <p className="text-muted-foreground text-pretty text-[13.5px] leading-[1.7]">
          Kế hoạch này sẽ không xuất hiện trong phiên học nào cho tới khi bạn đưa lại ít nhất một
          khái niệm. Không có gì bị xoá — cả {skippedItems.length} vẫn ở dưới đây.
        </p>
      </div>

      <RemovedGroup
        items={skippedItems}
        pendingConceptIds={pendingConceptIds}
        onRestore={onRestore}
        open
      />
    </div>
  );
}
