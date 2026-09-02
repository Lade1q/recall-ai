import { useState } from 'react';
import { Clock3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FocusSessionListItem } from '@/features/focus/types/focus.types';
import { formatTime } from '../utils/format';
import { Heading } from '@/components/ui/heading';

interface CurrentFocusSessionProps {
  session: FocusSessionListItem;
  planLabel: string | null;
  isCancelling: boolean;
  onCancel: () => void;
}

/**
 * Lối thoát cho phiên `running` không còn snapshot local (#374).
 *
 * Client này không biết người dùng đã thật sự tập trung bao lâu ở trình duyệt/thiết bị đã tạo
 * phiên, nên thao tác ở đây là HỦY (không ghi nhận thời gian), không giả làm đường "Kết thúc"
 * của bộ đếm đang sống.
 */
export function CurrentFocusSession({
  session,
  planLabel,
  isCancelling,
  onCancel,
}: CurrentFocusSessionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const conceptNames = session.concepts.map((concept) => concept.name).join(', ');

  return (
    <>
      <section
        className="border-focus-session/30 bg-focus-session/5 rounded-xl border px-[18px] py-4"
        aria-label="Phiên học đang chạy"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-focus-session-text flex items-center gap-1.5 text-[12px] font-semibold">
              <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
              Phiên đang chạy
            </div>
            <Heading as="h3" size="card" wrap="truncate" className="mt-1 tracking-[-0.015em]">
              {conceptNames || 'Phiên học tập trung'}
            </Heading>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Bắt đầu lúc {formatTime(session.startedAt)}
              {planLabel && ` · ${planLabel}`}
            </p>
            <p className="text-muted-foreground mt-2 max-w-[68ch] text-[12.5px] leading-[1.55]">
              Phiên này có thể đang mở ở một trình duyệt hoặc thiết bị khác. Nếu không còn học, hãy
              hủy phiên để bắt đầu phiên mới.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={isCancelling}
            onClick={() => setConfirmOpen(true)}
          >
            Hủy phiên đang chạy
          </Button>
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={(open) => !isCancelling && setConfirmOpen(open)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Hủy phiên đang chạy?</DialogTitle>
            <DialogDescription>
              Thời gian của phiên này sẽ không được ghi nhận vào lịch sử học tập. Nếu phiên vẫn đang
              mở ở thiết bị khác, đồng hồ tại đó cũng không thể kết thúc phiên này lần nữa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isCancelling}
              onClick={() => setConfirmOpen(false)}
            >
              Giữ phiên
            </Button>
            <Button type="button" variant="secondary" loading={isCancelling} onClick={onCancel}>
              Hủy phiên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
