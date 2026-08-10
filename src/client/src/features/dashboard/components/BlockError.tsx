import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Lỗi CỦA MỘT KHỐI, không phải trang lỗi toàn màn (#169: ba nguồn dữ liệu độc lập). Viền trái
 * `--mastery-weak` để đánh dấu đây là lỗi mà không tô đỏ cả khối, kèm nút thử lại chỉ nạp lại
 * đúng nguồn của khối đó.
 */
export function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border-border border-l-mastery-weak bg-muted flex items-start gap-3 rounded-lg border border-l-2 px-4 py-3.5">
      <AlertCircle className="text-mastery-weak mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="text-foreground text-[13px] leading-[1.6]">{message}</p>
        <Button variant="outline" size="sm" className="mt-2.5" onClick={onRetry}>
          <RotateCw />
          Thử lại
        </Button>
      </div>
    </div>
  );
}
