import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import type { ScheduleItem } from '../types/schedule.types';

interface SchedulePlanFilterProps {
  /** TOÀN BỘ kế hoạch của `GET /plans`. Lọc `active` xảy ra ở đây — xem chú thích dưới. */
  plans: readonly PlanSummary[];
  /** Mục lịch **chưa lọc**: cột số đếm phải nói "kế hoạch này có bao nhiêu buổi ôn", không phải
   *  "bao nhiêu buổi ôn đang hiện" — con số thứ hai sẽ về 0 ngay khi người dùng tắt nó. */
  items: readonly ScheduleItem[];
  hiddenPlanIds: ReadonlySet<string>;
  onTogglePlan: (planId: string) => void;
  onSetHiddenPlans: (planIds: readonly string[]) => void;
}

/**
 * Bộ lọc "hiện kế hoạch nào trên lịch" — **dropdown + checkbox + danh sách dọc**.
 *
 * Hàng chip ngang đã bị loại bằng số đo: 7 chip chiếm 938px và tràn hai dòng ở viewport 1735px,
 * tức nó không co giãn nổi tới 11 kế hoạch (#400).
 *
 * ⛔ **Không dùng màu để phân biệt kế hoạch.** Ở Google Calendar màu là danh tính của lịch, và nó
 * chạy được *chỉ vì* chip trong ô ngày mang cùng màu đó. Ở đây màu đã chịu lực cho mastery và cho
 * truy ngược, nên tô màu kế hoạch là hứa một ánh xạ không tồn tại. Danh tính kế hoạch = nhãn chữ.
 *
 * Chỉ liệt kê kế hoạch `active`, khớp đúng `getReviewSchedule` (`plan: { status: 'active' }`):
 * một hàng `draft`/`archived` trong danh sách này sẽ vĩnh viễn đếm 0 và tắt nó không đổi gì trên
 * lịch — một công tắc không nối vào đâu cả. Ghi chú cuối menu nói ra chúng ở đâu.
 */
export function SchedulePlanFilter({
  plans,
  items,
  hiddenPlanIds,
  onTogglePlan,
  onSetHiddenPlans,
}: SchedulePlanFilterProps) {
  const activePlans = useMemo(() => plans.filter((plan) => plan.status === 'active'), [plans]);

  const countByPlanId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.planId, (counts.get(item.planId) ?? 0) + 1);
    return counts;
  }, [items]);

  if (activePlans.length === 0) return null;

  const hiddenCount = activePlans.filter((plan) => hiddenPlanIds.has(plan.id)).length;
  const visibleCount = activePlans.length - hiddenCount;
  const isFiltering = hiddenCount > 0;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* Kế hoạch bị ẩn mà lịch trống trơn trong im lặng là kiểu hỏng khó chịu nhất — màn phải tự
          khai ra là nó đang giấu bớt, và phải có một cú bấm để hoàn tác. */}
      {isFiltering && (
        <p className="text-muted-foreground min-w-0 flex-1 text-[12px]">
          Đang ẩn {hiddenCount}/{activePlans.length} kế hoạch — lịch dưới đây chưa đầy đủ.{' '}
          <button
            type="button"
            className="text-foreground underline underline-offset-2"
            onClick={() => onSetHiddenPlans([])}
          >
            Hiện tất cả
          </button>
        </p>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          className={`hover:bg-muted py-1.75 ml-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-[12.5px] ${
            isFiltering ? 'border-primary text-primary' : 'border-border text-foreground'
          }`}
        >
          Kế hoạch
          <span
            className={`font-mono text-[11.5px] tabular-nums ${isFiltering ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {visibleCount}/{activePlans.length}
          </span>
          <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="flex max-h-[min(360px,60vh)] w-72 flex-col p-0">
          <div className="border-border/55 flex flex-none items-center justify-between gap-2 border-b px-3.5 py-2">
            <span className="text-muted-foreground text-[10.5px] font-semibold uppercase tracking-[0.06em]">
              Hiện trên lịch
            </span>
            <DropdownMenuItem
              className="text-primary px-1 py-0.5 text-[11.5px]"
              onSelect={(event) => {
                event.preventDefault();
                onSetHiddenPlans(isFiltering ? [] : activePlans.map((plan) => plan.id));
              }}
            >
              {isFiltering ? 'Chọn tất cả' : 'Bỏ chọn tất cả'}
            </DropdownMenuItem>
          </div>

          {/* Chỉ DANH SÁCH cuộn: header và ghi chú đứng yên, nếu không thì với nhiều kế hoạch nút
              "Bỏ chọn tất cả" trôi mất khỏi tầm nhìn ngay khi cần nó nhất. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
            {activePlans.map((plan) => {
              const count = countByPlanId.get(plan.id) ?? 0;
              return (
                <DropdownMenuCheckboxItem
                  key={plan.id}
                  checked={!hiddenPlanIds.has(plan.id)}
                  onCheckedChange={() => onTogglePlan(plan.id)}
                  className={count === 0 ? 'opacity-60' : undefined}
                >
                  <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                  <span className="text-muted-foreground font-mono text-[11.5px] tabular-nums">
                    {count}
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </div>

          <div className="border-border/55 text-muted-foreground bg-popover flex-none border-t px-3.5 py-2.5 text-[11px] leading-[1.45]">
            Kế hoạch <b className="font-semibold">0 mục</b> vẫn hiện ở đây — chúng chưa có buổi ôn
            nào, không phải bị ẩn. Kế hoạch chưa xác nhận / đã lưu trữ nằm ở view{' '}
            <b className="font-semibold">Kế hoạch</b>.
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
