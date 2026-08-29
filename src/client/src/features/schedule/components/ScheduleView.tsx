import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DayPanel, type DayPanelScope } from './DayPanel';
import { MonthGrid } from './MonthGrid';
import { useSchedule } from '../hooks/useSchedule';
import { useScheduleViewState } from '../hooks/useScheduleViewState';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import type { ScheduleDay, ScheduleItem } from '../types/schedule.types';
import { groupByDateKey } from '../utils/schedule-date';

export interface ScheduleViewProps {
  /**
   * Danh sách kế hoạch của `GET /plans`, do `PlansPage` đã tải sẵn — truyền xuống chứ KHÔNG gọi
   * lại: #400 cấm nhân đôi metadata kế hoạch vào payload lịch, và gọi `/plans` lần thứ hai trên
   * cùng một trang chính là cùng một lỗi ở dạng khác.
   *
   * Hai người tiêu thụ đều thuộc #405: bộ lọc "hiện kế hoạch nào trên lịch" (phải liệt kê **cả
   * kế hoạch 0 mục** — chúng chưa có buổi ôn nào, không phải bị ẩn, nên không suy ra được từ
   * `items`) và banner đếm kế hoạch `draft`. Giai đoạn 0 chưa dùng tới.
   */
  plans: readonly PlanSummary[];
  /**
   * #405: banner "N kế hoạch chưa xác nhận đồ thị" → view Kế hoạch + tab Chưa xác nhận.
   *
   * Optional vì #404 chỉ **nối dây**, chưa có người gọi: banner là của #405. Hai state đổi cùng
   * lúc (view tab và `activeTab`) và cả hai sống trong `PlansPage`, nên việc này không thể làm từ
   * dưới lên — chữ ký chốt sẵn ở đây để hai luồng không đẻ ra hai cái tên.
   */
  onShowDraftPlans?: () => void;
}

/**
 * View "Lịch" của `/plans` (#400) — **chủ sở hữu toàn bộ state của màn** (`useScheduleViewState`).
 *
 * `MonthGrid` và `DayPanel` không giữ state nào: lưới và panel phải kể cùng một câu chuyện (ô
 * ngày đang chọn ↔ panel đang mở ↔ mục đang mở rộng), mà hai cây state song song thì chỉ đồng bộ
 * đúng cho tới lần sửa thứ hai.
 *
 * Ngược lại, tệp này KHÔNG giữ câu chữ nào: panel tự dựng microcopy của nó. Ranh giới đặt ở đây
 * để #404 (lưới) và #405 (panel) không phải quay lại sửa cùng một tệp.
 *
 * Ở Giai đoạn 0 (#401) hai con còn rỗng — cả hai cắm vào đúng chữ ký đã có sẵn ở đây.
 *
 * Tệp này tách làm hai: vỏ ngoài **tải dữ liệu**, phần trong **giữ state**. Lý do là một ràng
 * buộc thật chứ không phải cho gọn — `useScheduleViewState` gieo con trỏ tháng từ `todayDateKey`
 * **một lần lúc mount**, nên nếu phần state mount trước khi có dữ liệu thì lưới chốt vào một
 * tháng rác và không tự sửa khi dữ liệu về. Vỏ ngoài không mount phần trong cho tới khi
 * `todayDateKey` có thật.
 */
export function ScheduleView({ plans, onShowDraftPlans }: ScheduleViewProps) {
  const { todayDateKey, items, isLoading, hasError, reload } = useSchedule();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  // `todayDateKey === null` sau khi hết loading nghĩa là tải hỏng — gộp hai ca vào một nhánh để
  // không có đường nào render lưới mà thiếu mốc hôm nay.
  if (hasError || todayDateKey === null) {
    // `reload` đã tự set `hasError` và tự log trước khi ném lại; `catch` ở đây chỉ để lời hứa
    // không thành unhandled rejection, nên nó KHÔNG nuốt mất thông tin nào.
    return <ScheduleLoadError onRetry={() => void reload().catch(() => undefined)} />;
  }

  return (
    <ScheduleBoard
      plans={plans}
      onShowDraftPlans={onShowDraftPlans}
      todayDateKey={todayDateKey}
      items={items}
    />
  );
}

/** Trạng thái lỗi tối thiểu. #405 sở hữu bộ trạng thái đầy đủ của màn này. */
function ScheduleLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border-border bg-background rounded-xl border px-7 py-6 text-center">
      <p className="text-muted-foreground mb-4 text-[13.5px] leading-[1.7]">
        Không tải được lịch ôn tập.
      </p>
      <Button variant="outline" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

interface ScheduleBoardProps extends ScheduleViewProps {
  todayDateKey: string;
  items: readonly ScheduleItem[];
}

/** Chủ sở hữu state — chỉ mount khi đã có `todayDateKey` thật. */
function ScheduleBoard({
  plans: _plans,
  onShowDraftPlans: _onShowDraftPlans,
  todayDateKey,
  items,
}: ScheduleBoardProps) {
  const state = useScheduleViewState(todayDateKey);

  const visibleItems = useMemo(
    () => items.filter((item) => !state.hiddenPlanIds.has(item.planId)),
    [items, state.hiddenPlanIds]
  );
  // Nhóm trên TRỌN mảng, không cắt theo `monthCursor` — xem `groupByDateKey`.
  const days = useMemo(
    () => groupByDateKey(visibleItems, todayDateKey),
    [visibleItems, todayDateKey]
  );

  const panel = resolvePanel(days, state.selectedDateKey, state.debtOpen);

  return (
    <>
      <MonthGrid
        monthCursor={state.monthCursor}
        todayDateKey={todayDateKey}
        selectedDateKey={state.selectedDateKey}
        days={days}
        onSelectDay={state.selectDay}
        onShiftMonth={state.shiftMonth}
      />
      {panel !== null && (
        <DayPanel
          scope={panel.scope}
          todayDateKey={todayDateKey}
          items={panel.items}
          expandedItemId={state.expandedItemId}
          onToggleItem={state.toggleItem}
          onClose={state.closePanel}
          onReschedule={noop}
          onRemove={noop}
        />
      )}
    </>
  );
}

/** "Dời sang ngày…" cần `PATCH scheduledFor` (#403); "Gỡ khỏi lịch" cần luồng gỡ của #405. */
function noop(): void {}

/**
 * Panel đang mở nói về cái gì, và với những mục nào. Chỉ chọn dữ liệu — câu chữ là của `DayPanel`.
 */
function resolvePanel(
  days: ScheduleDay[],
  selectedDateKey: string | null,
  debtOpen: boolean
): { scope: DayPanelScope; items: ScheduleItem[] } | null {
  if (debtOpen) {
    // "Còn nợ" gom mọi ngày quá hạn — đọc `isOverdue` mà `groupByDateKey` đã tính, để luật "quá
    // hạn" chỉ nằm ở một chỗ; lưới và panel không thể nói hai con số khác nhau.
    return {
      scope: { kind: 'debt' },
      items: days.filter((day) => day.isOverdue).flatMap((day) => day.items),
    };
  }
  if (selectedDateKey === null) return null;

  return {
    scope: { kind: 'day', dateKey: selectedDateKey },
    // Ngày không có mục nào thì không có `ScheduleDay` nào — panel nhận mảng rỗng và tự nói câu
    // cho ngày trống.
    items: days.find((day) => day.dateKey === selectedDateKey)?.items ?? [],
  };
}
