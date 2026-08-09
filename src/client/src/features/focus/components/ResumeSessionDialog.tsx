import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FocusSessionSnapshot } from '../types/focus.types';
import { formatMinutesPhrase, formatRelativeDayTime } from '../utils/format';

interface ResumeSessionDialogProps {
  snapshot: FocusSessionSnapshot;
  isSubmitting: boolean;
  onDiscard: () => void;
  onCommit: () => void;
}

/**
 * Trạng thái 10 (mockup `.modal`) — phiên bị gián đoạn, phát hiện qua `localStorage` (UC-03 E2).
 * Con số đề nghị là thời gian TẬP TRUNG đã đo, không phải wall-clock.
 */
export function ResumeSessionDialog({
  snapshot,
  isSubmitting,
  onDiscard,
  onCommit,
}: ResumeSessionDialogProps) {
  const focusedMinutesPhrase = formatMinutesPhrase(Math.floor(snapshot.focusedMs / 1000));

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="rounded-[calc(var(--radius)*1.1)]">
        <DialogHeader>
          <DialogTitle className="font-heading text-[17px] font-normal tracking-[-0.02em]">
            Phiên học chưa được ghi nhận
          </DialogTitle>
          <DialogDescription>
            Phiên <strong className="text-foreground">{snapshot.conceptName}</strong> bắt đầu lúc{' '}
            {formatRelativeDayTime(new Date(snapshot.startedAt))} và chưa kết thúc. Đo được{' '}
            <strong className="text-foreground">{focusedMinutesPhrase} tập trung</strong> trước khi
            tab bị đóng.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-row justify-end">
          <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onDiscard}>
            Bỏ qua
          </Button>
          <Button type="button" loading={isSubmitting} onClick={onCommit}>
            Ghi nhận {focusedMinutesPhrase}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
