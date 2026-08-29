import { PackageOpen } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
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
      <EmptyState
        className="mt-8.5 mb-2"
        icon={PackageOpen}
        heading="Bạn đã gỡ tất cả khái niệm khỏi lịch"
        body={
          <>
            Kế hoạch này sẽ không xuất hiện trong phiên học nào cho tới khi bạn đưa lại ít nhất một
            khái niệm. Không có gì bị xoá — cả {skippedItems.length} vẫn ở dưới đây.
          </>
        }
      />

      <RemovedGroup
        items={skippedItems}
        pendingConceptIds={pendingConceptIds}
        onRestore={onRestore}
        open
      />
    </div>
  );
}
