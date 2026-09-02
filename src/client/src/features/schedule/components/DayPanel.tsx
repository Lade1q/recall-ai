import { X } from 'lucide-react';
import type { ScheduleItem } from '../types/schedule.types';
import { formatDayLabel, type DeadlineMark } from '../utils/schedule-date';
import { ScheduleItemRow } from './ScheduleItemRow';
import { Heading } from '@/components/ui/heading';

/**
 * Panel đang nói về cái gì. Union có nhãn chứ không phải hai component: hai ca khác nhau đúng ở
 * tiêu đề và ở mảng `items` được truyền vào, tách đôi là nhân đôi cùng một danh sách.
 */
export type DayPanelScope = { kind: 'debt' } | { kind: 'day'; dateKey: string };

export interface DayPanelProps {
  scope: DayPanelScope;
  /** Hôm nay theo giờ VN — để panel tự biết "Hôm nay" và tự đếm số ngày quá hạn. */
  todayDateKey: string;
  items: ScheduleItem[];
  /**
   * Hạn chót rơi đúng ngày đang mở (#439) — lưới chỉ đánh dấu, panel mới nêu TÊN.
   * `undefined` ở panel "Còn nợ" và ở mọi ngày không phải hạn chót.
   *
   * Nhận nguyên `DeadlineMark` — cùng object lưới đang vẽ — chứ không nhận danh sách rồi tự suy
   * "đã qua hay chưa": `isPast` đã tính một lần trong `buildDeadlineMarks`, so lại `scope.dateKey`
   * với `todayDateKey` ở đây là bản sao thứ ba của cùng một vị từ.
   */
  deadline: DeadlineMark | undefined;
  /** `id` của mục đang mở rộng tại chỗ, `null` khi không mục nào mở. */
  expandedItemId: string | null;
  /** `id` các mục đang có PATCH chạy — khoá nút của đúng mục đó. */
  pendingItemIds: ReadonlySet<string>;
  onToggleItem: (id: string) => void;
  onClose: () => void;
  onReschedule: (item: ScheduleItem, dateKey: string) => void;
  onRemove: (item: ScheduleItem) => void;
}

/**
 * Số ngày từ `from` tới `to`, cả hai là `dateKey` **đã là ngày VN**.
 *
 * Dựng `Date` ở UTC từ hai chuỗi rồi trừ: cùng kỹ thuật `formatDayLabel` dùng, và vì cả hai đầu
 * đều ở UTC nên không có phép đổi múi giờ nào — đổi thêm một lần là lệch một ngày. `Date.UTC` cũng
 * miễn nhiễm với giờ mùa hè, thứ sẽ làm phép trừ mốc-địa-phương ra 23 hoặc 25 giờ.
 */
function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * Panel chi tiết — DÙNG CHUNG cho cả panel-theo-ngày lẫn panel-"Còn nợ", phân biệt bằng `scope`.
 *
 * Panel tự dựng LẤY câu chữ của mình — tiêu đề, "N khái niệm · ≈ M phút", "quá hạn N ngày", câu
 * cho ngày trống — từ `scope` + `items` + `todayDateKey`. Cố ý KHÔNG nhận `title`/`subtitle` dựng
 * sẵn: #405 sở hữu microcopy, nên microcopy phải nằm trong tệp #405 sở hữu, chứ không phải trong
 * `ScheduleView.tsx` mà #404 cũng đang sửa.
 *
 * Cũng vì vậy KHÔNG nhận props đếm sẵn: số mục và tổng phút suy từ `items`, một nguồn.
 *
 * Không giữ state nào — kể cả `expandedItemId`: nó sống ở `ScheduleView` để mở một mục rồi đổi
 * ngày không để lại một mục mở lơ lửng.
 */
export function DayPanel({
  scope,
  todayDateKey,
  items,
  deadline,
  expandedItemId,
  pendingItemIds,
  onToggleItem,
  onClose,
  onReschedule,
  onRemove,
}: DayPanelProps) {
  const totalMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const countLine = `${items.length} khái niệm · ≈ ${totalMinutes} phút`;
  const isDebt = scope.kind === 'debt';
  const overdueDays = isDebt ? 0 : daysBetween(scope.dateKey, todayDateKey);

  const heading = isDebt
    ? 'Còn nợ'
    : scope.dateKey === todayDateKey
      ? 'Hôm nay'
      : formatDayLabel(scope.dateKey);

  return (
    <aside
      aria-label={isDebt ? 'Các khái niệm còn nợ' : `Lịch ôn ${heading}`}
      className="border-border bg-card flex flex-col overflow-hidden rounded-xl border"
    >
      <div className="border-border flex items-start justify-between gap-2 border-b px-4 py-3.5">
        <div className="min-w-0">
          <Heading as="h3" size="card" className="leading-[1.2]">
            {heading}
          </Heading>
          <div className="text-muted-foreground mt-0.75 text-[12px]">
            {isDebt ? (
              <>
                <span className="text-mastery-weak font-semibold">{countLine}</span> · quá hạn,
                không thuộc tháng nào
              </>
            ) : (
              <>
                {items.length > 0 ? countLine : 'không có gì được xếp'}
                {overdueDays > 0 && (
                  <>
                    {' · '}
                    <span className="text-mastery-weak font-semibold">
                      quá hạn {overdueDays} ngày
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          {deadline !== undefined && (
            // Nêu TÊN, không nêu số — lưới đã nói "có hạn ở đây", câu duy nhất panel thêm được là
            // "của kế hoạch NÀO". Dùng `·` giữa các tên như mọi dòng meta khác của màn này.
            <div className="text-foreground mt-1.5 text-[12px]">
              <span className="font-semibold">
                {deadline.isPast ? 'Hạn chót đã qua' : 'Hạn chót'}
              </span>
              {': '}
              {deadline.plans.map((plan) => plan.name).join(' · ')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng chi tiết"
          className="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1 shrink-0 rounded-md p-1"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="min-h-0 flex-1 overflow-auto py-1.5">
          {items.map((item) => (
            <ScheduleItemRow
              key={item.id}
              item={item}
              todayDateKey={todayDateKey}
              isExpanded={expandedItemId === item.id}
              isPending={pendingItemIds.has(item.id)}
              onToggle={onToggleItem}
              onReschedule={onReschedule}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-4.5 py-6.5 text-center text-[12.5px] leading-[1.6]">
          {isDebt ? (
            'Không còn nợ gì.'
          ) : (
            <>
              Ngày này trống.
              <br />
              Engine chỉ xếp ngày ôn sau mỗi phiên kiểm tra.
            </>
          )}
        </p>
      )}
    </aside>
  );
}
