import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMinutesPhrase } from '../utils/format';

interface CancelSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusedSeconds: number;
  conceptName: string;
  isSubmitting: boolean;
  onConfirm: () => void;
}

/**
 * Trạng thái 11 (mockup `.modal`) — hủy phiên (Alt flow 4, AC ⑦). Tiêu đề serif, hàng nút canh
 * phải: "Quay lại phiên" (ghost) rồi "Hủy phiên" (secondary) — hành động phá huỷ được giảm nhẹ,
 * không có nút primary.
 */
export function CancelSessionDialog({
  open,
  onOpenChange,
  focusedSeconds,
  conceptName,
  isSubmitting,
  onConfirm,
}: CancelSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent showCloseButton={false} className="rounded-[calc(var(--radius)*1.1)]">
        <DialogHeader>
          <DialogTitle className="font-heading text-[17px] font-normal tracking-[-0.02em]">
            Hủy phiên này?
          </DialogTitle>
          <DialogDescription>
            {formatMinutesPhrase(focusedSeconds)} tập trung sẽ không được ghi vào lịch sử học tập,
            và <strong className="text-foreground">{conceptName}</strong> vẫn nằm nguyên ở đầu hàng
            đợi hôm nay. Muốn giữ lại thời gian đã học thì chọn &quot;Kết thúc phiên học&quot; thay
            vì hủy.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-row justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Quay lại phiên
          </Button>
          <Button type="button" variant="secondary" loading={isSubmitting} onClick={onConfirm}>
            Hủy phiên
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
