import type { ScheduleItem } from '../types/schedule.types';
import { cn } from '@/lib/utils';
import { headingVariants } from '@/components/ui/heading';

interface ScheduleDebtBarProps {
  /** Mọi mục quá hạn, đã lọc theo bộ lọc kế hoạch — gộp từ MỌI ngày, không phải của tháng đang xem. */
  debtItems: readonly ScheduleItem[];
  /** Lịch có mục nào không (sau bộ lọc). Quyết định có hiện dải "Không nợ gì" hay im lặng. */
  hasAnyItem: boolean;
  onOpenDebt: () => void;
}

/**
 * Thanh "Còn nợ" — **nằm trên lưới và độc lập tháng** (#400).
 *
 * Nợ là thuộc tính của KHÁI NIỆM, không của ngày: một mục quá hạn 3 tuần nằm ở ô của tháng trước,
 * tức người dùng phải lùi tháng mới thấy thứ đang cấp nhất. Thanh này gom chúng lại một chỗ mà
 * con trỏ tháng không với tới được, nên nó phải ở ngoài lưới chứ không phải một ô đặc biệt.
 *
 * Tint `/7` chứ không `/10` hay `/14`: dòng phụ bên phải là `--muted-foreground` 12px, và trên
 * tint `/10` nó chỉ đạt 4,31 ở light mode (< 4.5 của WCAG AA). Số đo đầy đủ ở `#400` và trong bản
 * đồ component. Cùng ràng buộc đó áp cho ô ngày quá hạn của lưới (#404).
 *
 * 🔴 Dải "Không nợ gì" chỉ hiện khi lịch **có mục** (`hasAnyItem`). Với người dùng chưa vấn đáp bao
 * giờ, "0 khái niệm quá hạn" là một lời chúc mừng cho việc họ chưa làm — đúng kiểu hỏng mà #345 đã
 * đi diệt một lần ở màn hàng đợi ôn. Lúc đó trạng thái rỗng của màn mới là thứ được nói.
 */
export function ScheduleDebtBar({ debtItems, hasAnyItem, onOpenDebt }: ScheduleDebtBarProps) {
  if (debtItems.length === 0) {
    if (!hasAnyItem) return null;
    return (
      <div className="border-mastery-strong/30 bg-mastery-strong/9 mb-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-lg border px-4 py-3">
        <span
          /* TODO(#387): giu nguyen 15px cho Quan quyet; snap se la 18px (card) */ className={cn(
            headingVariants({ size: 'card' }),
            'text-[15px] font-semibold'
          )}
        >
          Không nợ gì
        </span>
        <span className="text-mastery-strong font-mono text-[13px] font-semibold">
          0 khái niệm quá hạn
        </span>
      </div>
    );
  }

  const totalMinutes = debtItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  // Đếm theo KHÁI NIỆM, không theo số dòng: nhãn nói "khái niệm", nên con số phải là số khái
  // niệm. Hôm nay hai phép đếm cho cùng kết quả — nhưng chỉ vì `getReviewSchedule` đã fold mỗi
  // cụm `(planId, conceptId)` về một mục. Đó là **bất biến của server**, và `debtItems.length` là
  // client âm thầm mượn nó: ngày nào server ngừng fold (hoặc một đường đọc khác cấp dữ liệu vào
  // đây), thanh này bắt đầu đếm mỗi khái niệm nhiều lần mà không có gì đỏ. Tự đếm thì không mượn.
  const conceptCount = new Set(debtItems.map((item) => item.conceptId)).size;

  return (
    <button
      type="button"
      onClick={onOpenDebt}
      className="border-mastery-weak/35 bg-mastery-weak/7 hover:bg-mastery-weak/11 mb-3.5 flex w-full flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-lg border px-4 py-3 text-left"
    >
      <span
        /* TODO(#387): giu nguyen 15px cho Quan quyet; snap se la 18px (card) */ className={cn(
          headingVariants({ size: 'card' }),
          'text-[15px] font-semibold'
        )}
      >
        Còn nợ
      </span>
      <span className="text-mastery-weak font-mono text-[13px] font-semibold">
        {conceptCount} khái niệm · ≈ {totalMinutes} phút
      </span>
      <span className="text-muted-foreground ml-auto text-[12px] max-[680px]:w-full max-[680px]:text-[11px]">
        quá hạn — không thuộc tháng nào · bấm để xem
      </span>
    </button>
  );
}
