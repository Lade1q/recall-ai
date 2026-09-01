import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DayPanel, type DayPanelScope } from './DayPanel';
import { MonthGrid } from './MonthGrid';
import { ScheduleDebtBar } from './ScheduleDebtBar';
import { ScheduleDraftBanner } from './ScheduleDraftBanner';
import { SchedulePlanFilter } from './SchedulePlanFilter';
import { useSchedule, type UseScheduleReturn } from '../hooks/useSchedule';
import { useScheduleViewState } from '../hooks/useScheduleViewState';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import type { ScheduleDay, ScheduleItem } from '../types/schedule.types';
import { buildDeadlineMarks, groupByDateKey } from '../utils/schedule-date';

export interface ScheduleViewProps {
  /**
   * Danh sách kế hoạch của `GET /plans`, do `PlansPage` đã tải sẵn — truyền xuống chứ KHÔNG gọi
   * lại: #400 cấm nhân đôi metadata kế hoạch vào payload lịch, và gọi `/plans` lần thứ hai trên
   * cùng một trang chính là cùng một lỗi ở dạng khác.
   *
   * `null` = request hỏng/chưa có dữ liệu; `[]` = server xác nhận tài khoản thật sự không có kế
   * hoạch. Không được đổi `null` thành `[]`: bốn người tiêu thụ (filter, banner draft, trạng thái
   * không có plan active, dấu deadline) đều sẽ biến "không biết" thành một khẳng định sai.
   */
  plans: readonly PlanSummary[] | null;
  /** Chỉ tải lại metadata plans; lịch đã tải vẫn đứng nguyên tại chỗ. */
  isPlansLoading?: boolean;
  onRetryPlans?: () => void;
  /** #405: banner "N kế hoạch chưa xác nhận đồ thị" → view Kế hoạch + tab Chưa xác nhận. */
  onShowDraftPlans?: () => void;
}

/**
 * View "Lịch" của `/plans` (#400) — **chủ sở hữu toàn bộ state của màn** (`useScheduleViewState`).
 *
 * `MonthGrid` và `DayPanel` không giữ state nào: lưới và panel phải kể cùng một câu chuyện (ô
 * ngày đang chọn ↔ panel đang mở ↔ mục đang mở rộng), mà hai cây state song song thì chỉ đồng bộ
 * đúng cho tới lần sửa thứ hai.
 *
 * Ngược lại, tệp này KHÔNG giữ câu chữ của panel: panel tự dựng microcopy của nó. Ranh giới đặt ở
 * đây để #404 (lưới) và #405 (panel) không phải quay lại sửa cùng một tệp.
 *
 * Tệp này tách làm hai: vỏ ngoài **tải dữ liệu**, phần trong **giữ state**. Lý do là một ràng
 * buộc thật chứ không phải cho gọn — `useScheduleViewState` gieo con trỏ tháng từ `todayDateKey`
 * **một lần lúc mount**, nên nếu phần state mount trước khi có dữ liệu thì lưới chốt vào một
 * tháng rác và không tự sửa khi dữ liệu về. Vỏ ngoài không mount phần trong cho tới khi
 * `todayDateKey` có thật.
 */
export function ScheduleView({
  plans,
  isPlansLoading = false,
  onRetryPlans,
  onShowDraftPlans,
}: ScheduleViewProps) {
  const schedule = useSchedule();

  if (schedule.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  // `todayDateKey === null` sau khi hết loading nghĩa là tải hỏng — gộp hai ca vào một nhánh để
  // không có đường nào render lưới mà thiếu mốc hôm nay.
  if (schedule.hasError || schedule.todayDateKey === null) {
    // `reload` đã tự set `hasError` và tự log trước khi ném lại; `catch` ở đây chỉ để lời hứa
    // không thành unhandled rejection, nên nó KHÔNG nuốt mất thông tin nào.
    return <ScheduleLoadError onRetry={() => void schedule.reload().catch(() => undefined)} />;
  }

  return (
    <ScheduleBoard
      plans={plans}
      isPlansLoading={isPlansLoading}
      onRetryPlans={onRetryPlans}
      onShowDraftPlans={onShowDraftPlans}
      todayDateKey={schedule.todayDateKey}
      schedule={schedule}
    />
  );
}

/** Ca HỎNG của nguồn dữ liệu — không phải ca rỗng. Nút "Thử lại" nạp lại đúng `/schedule`, không
 *  bắt người dùng F5 cả trang (và không làm mất tab đang đứng). */
function ScheduleLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border-border bg-background rounded-xl border px-7 py-6 text-center">
      <p className="text-muted-foreground mb-4 text-[13.5px] leading-[1.7]">
        Không tải được lịch ôn tập. Kiểm tra kết nối rồi thử lại.
      </p>
      <Button variant="outline" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

interface ScheduleBoardProps extends ScheduleViewProps {
  todayDateKey: string;
  schedule: UseScheduleReturn;
}

/** Chủ sở hữu state — chỉ mount khi đã có `todayDateKey` thật. */
function ScheduleBoard({
  plans,
  isPlansLoading = false,
  onRetryPlans,
  onShowDraftPlans,
  todayDateKey,
  schedule,
}: ScheduleBoardProps) {
  const state = useScheduleViewState(todayDateKey);
  const { items } = schedule;

  const visibleItems = useMemo(
    () => items.filter((item) => !state.hiddenPlanIds.has(item.planId)),
    [items, state.hiddenPlanIds]
  );
  // Nhóm trên TRỌN mảng, không cắt theo `monthCursor` — xem `groupByDateKey`.
  const days = useMemo(
    () => groupByDateKey(visibleItems, todayDateKey),
    [visibleItems, todayDateKey]
  );

  // Hạn chót đi từ `plans` chứ KHÔNG từ payload lịch: #400 cấm nhân đôi metadata kế hoạch vào
  // `/schedule`, và `ScheduleView` đã có mảng plans trong tay. Lọc `active` + `hiddenPlanIds` nằm
  // trong `buildDeadlineMarks` để lưới và panel không thể nói hai tập khác nhau.
  const deadlines = useMemo(
    () =>
      plans === null ? new Map() : buildDeadlineMarks(plans, state.hiddenPlanIds, todayDateKey),
    [plans, state.hiddenPlanIds, todayDateKey]
  );

  const draftCount = plans?.filter((plan) => plan.status === 'draft').length ?? 0;
  // Khi metadata hỏng, lịch vẫn là nguồn dữ liệu độc lập và phải được vẽ. Chỉ một mảng plans đã
  // tải thành công mới có quyền kết luận rằng không có kế hoạch active.
  const hasActivePlan = plans === null || plans.some((plan) => plan.status === 'active');
  const debtItems = days.filter((day) => day.isOverdue).flatMap((day) => day.items);

  const panel = resolvePanel(days, state.selectedDateKey, state.debtOpen);

  return (
    <>
      {plans !== null && (
        <ScheduleDraftBanner draftCount={draftCount} onShowDraftPlans={onShowDraftPlans} />
      )}

      {/* Kế hoạch `draft`/`archived` không đóng góp mục nào vào `/schedule` (server lọc
          `plan.status = 'active'`), nên "không có kế hoạch nào đang hoạt động" là một trạng thái
          RỖNG có lý do riêng — nói "chưa có buổi ôn nào" ở đó là đổ lỗi cho engine vì một việc
          người dùng chưa làm. Ca "0 kế hoạch" tuyệt đối không tới được đây: `PlansPage` chặn
          trước bằng trạng thái rỗng của chính nó. */}
      {!hasActivePlan ? (
        <EmptyState
          className="my-10"
          icon={CalendarOff}
          heading="Chưa có kế hoạch nào đang hoạt động"
          body={
            draftCount > 0
              ? 'Lịch chỉ xếp buổi ôn cho kế hoạch đang hoạt động. Xác nhận đồ thị của kế hoạch ở trên là chúng bắt đầu có mặt ở đây.'
              : 'Lịch chỉ xếp buổi ôn cho kế hoạch đang hoạt động. Tạo một kế hoạch mới, hoặc bỏ lưu trữ một kế hoạch cũ ở view Kế hoạch.'
          }
          action={
            <Button variant="outline" asChild>
              <Link to="/plan/new">Tạo kế hoạch mới</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ScheduleDebtBar
            debtItems={debtItems}
            hasAnyItem={visibleItems.length > 0}
            onOpenDebt={state.openDebt}
          />

          {plans === null ? (
            <PlansUnavailableControls isLoading={isPlansLoading} onRetry={onRetryPlans} />
          ) : (
            <SchedulePlanFilter
              plans={plans}
              items={items}
              hiddenPlanIds={state.hiddenPlanIds}
              onTogglePlan={state.togglePlan}
              onSetHiddenPlans={state.setHiddenPlans}
            />
          )}

          {plans === null && (
            <p className="text-muted-foreground mb-2 text-[12px]" role="status">
              Chưa tải được thông tin hạn chót của kế hoạch.
            </p>
          )}

          <div
            className={`grid gap-4 ${panel !== null ? 'min-[1181px]:grid-cols-[minmax(0,1fr)_340px]' : ''}`}
          >
            <MonthGrid
              monthCursor={state.monthCursor}
              todayDateKey={todayDateKey}
              selectedDateKey={state.selectedDateKey}
              deadlines={deadlines}
              days={days}
              onSelectDay={state.selectDay}
              onShiftMonth={state.shiftMonth}
            />

            {panel !== null && (
              <DayPanel
                scope={panel.scope}
                todayDateKey={todayDateKey}
                items={panel.items}
                // Panel đọc CHÍNH cái map lưới đang dùng — cả danh sách kế hoạch lẫn cờ "đã qua".
                // Lọc lại ở đây là đẻ ra bản sao thứ hai của bộ vị từ, và bản sao lệch đi thì ô có
                // vạt mà panel im lặng. `debtOpen` và `selectedDateKey` loại trừ nhau, nên khoá
                // theo `selectedDateKey` đủ để panel "Còn nợ" không nhận hạn chót nào.
                deadline={
                  state.selectedDateKey === null ? undefined : deadlines.get(state.selectedDateKey)
                }
                expandedItemId={state.expandedItemId}
                pendingItemIds={schedule.pendingItemIds}
                onToggleItem={state.toggleItem}
                onClose={state.closePanel}
                onReschedule={schedule.reschedule}
                onRemove={schedule.removeFromSchedule}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Thay đúng vị trí bộ lọc khi metadata plans chưa có; không giả dựng một dropdown 0/0. */
function PlansUnavailableControls({
  isLoading,
  onRetry,
}: {
  isLoading: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <p className="text-muted-foreground min-w-0 flex-1 text-[12px]" role="status">
        Chưa tải được danh sách kế hoạch.
      </p>
      <Button variant="outline" size="sm" disabled>
        Kế hoạch
      </Button>
      {onRetry !== undefined && (
        <Button variant="ghost" size="sm" disabled={isLoading} onClick={onRetry}>
          {isLoading && <Loader2 className="animate-spin" />}
          Thử lại
        </Button>
      )}
    </div>
  );
}

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
    //
    // Sắp lại truy-ngược-trước là ĐÚNG chỗ này, không phải cài lại luật hai tầng của server: luật
    // đó sắp trong MỘT ngày, còn danh sách này cắt ngang nhiều ngày nên server chưa từng phát biểu
    // thứ tự cho nó. Nợ cũ nhất trước trong cùng một tầng.
    const items = days
      .filter((day) => day.isOverdue)
      .flatMap((day) => day.items)
      .sort((a, b) => {
        const tier = Number(b.reason === 'traceback') - Number(a.reason === 'traceback');
        return tier !== 0 ? tier : a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0;
      });
    return { scope: { kind: 'debt' }, items };
  }
  if (selectedDateKey === null) return null;

  return {
    scope: { kind: 'day', dateKey: selectedDateKey },
    // Ngày không có mục nào thì không có `ScheduleDay` nào — panel nhận mảng rỗng và tự nói câu
    // cho ngày trống.
    items: days.find((day) => day.dateKey === selectedDateKey)?.items ?? [],
  };
}
