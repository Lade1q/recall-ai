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
import { groupByDateKey } from '../utils/schedule-date';

export interface ScheduleViewProps {
  /**
   * Danh sách kế hoạch của `GET /plans`, do `PlansPage` đã tải sẵn — truyền xuống chứ KHÔNG gọi
   * lại: #400 cấm nhân đôi metadata kế hoạch vào payload lịch, và gọi `/plans` lần thứ hai trên
   * cùng một trang chính là cùng một lỗi ở dạng khác.
   *
   * Hai người tiêu thụ đều thuộc #405: bộ lọc "hiện kế hoạch nào trên lịch" (phải liệt kê **cả
   * kế hoạch 0 mục** — chúng chưa có buổi ôn nào, không phải bị ẩn, nên không suy ra được từ
   * `items`) và banner đếm kế hoạch `draft`.
   */
  plans: readonly PlanSummary[];
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
export function ScheduleView({ plans, onShowDraftPlans }: ScheduleViewProps) {
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
function ScheduleBoard({ plans, onShowDraftPlans, todayDateKey, schedule }: ScheduleBoardProps) {
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

  const draftCount = plans.filter((plan) => plan.status === 'draft').length;
  const hasActivePlan = plans.some((plan) => plan.status === 'active');
  const debtItems = days.filter((day) => day.isOverdue).flatMap((day) => day.items);

  // `monthCursor.month` là 1–12; `dateKey` đệm 0 nên phải đệm cả ở đây, không thì tháng 1–9 khớp
  // hụt. (`schedule-date.ts` cố ý không giữ hàm này — nó là code chết ở đó, xem #405.)
  const monthPrefix = `${state.monthCursor.year}-${String(state.monthCursor.month).padStart(2, '0')}`;
  const isMonthEmpty = !days.some((day) => day.dateKey.startsWith(monthPrefix));

  const panel = resolvePanel(days, state.selectedDateKey, state.debtOpen);

  return (
    <>
      <ScheduleDraftBanner draftCount={draftCount} onShowDraftPlans={onShowDraftPlans} />

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

          <SchedulePlanFilter
            plans={plans}
            items={items}
            hiddenPlanIds={state.hiddenPlanIds}
            onTogglePlan={state.togglePlan}
            onSetHiddenPlans={state.setHiddenPlans}
          />

          <div
            className={`grid gap-4 ${panel !== null ? 'min-[1181px]:grid-cols-[minmax(0,1fr)_340px]' : ''}`}
          >
            {/* Thẻ "tháng này chưa có gì" phủ LÊN lưới (mockup `.emptymonth`), không chen xuống
                dưới: lưới vẫn phải đọc được như một cái lịch — nếu nó biến mất, người dùng mất
                luôn ô ngày để bấm và nút lùi tháng để tìm. `min-h` chỉ để thẻ có chỗ đứng khi lưới
                của #404 chưa render gì; lưới thật cao hơn nhiều nên nó tự vô hiệu. */}
            <div className={`relative ${isMonthEmpty ? 'min-h-[420px]' : ''}`}>
              <MonthGrid
                monthCursor={state.monthCursor}
                todayDateKey={todayDateKey}
                selectedDateKey={state.selectedDateKey}
                days={days}
                onSelectDay={state.selectDay}
                onShiftMonth={state.shiftMonth}
              />
              {isMonthEmpty && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
                  <div className="border-border bg-card px-5.5 py-4.5 max-w-[46ch] rounded-xl border text-center shadow-sm">
                    <p className="font-heading mb-1.25 text-[16px] font-semibold">
                      Tháng {state.monthCursor.month} chưa có buổi ôn nào
                    </p>
                    <p className="text-muted-foreground text-[12.5px] leading-[1.55]">
                      {debtItems.length > 0 ? (
                        <>
                          Engine chỉ xếp ngày sau mỗi phiên kiểm tra. Bạn còn{' '}
                          <b className="font-semibold">{debtItems.length} khái niệm quá hạn</b> ở
                          thanh phía trên — xong chúng thì lịch phía trước sẽ đầy lên.
                        </>
                      ) : (
                        'Engine chỉ xếp ngày ôn sau mỗi phiên kiểm tra. Làm một phiên để có lịch.'
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {panel !== null && (
              <DayPanel
                scope={panel.scope}
                todayDateKey={todayDateKey}
                items={panel.items}
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
