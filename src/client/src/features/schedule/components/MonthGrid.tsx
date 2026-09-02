import { memo, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ScheduleDay, ScheduleItem } from '../types/schedule.types';
import {
  buildMonthCells,
  formatDayLabel,
  formatMonthLabel,
  monthCursorFromDateKey,
  monthsBetween,
  type DeadlineMark,
  type MonthCell,
  type MonthCursor,
} from '../utils/schedule-date';
import { headingVariants } from '@/components/ui/heading';

export interface MonthGridProps {
  monthCursor: MonthCursor;
  todayDateKey: string;
  /** `null` khi chưa chọn ngày nào — panel bên cạnh lúc đó đóng. */
  selectedDateKey: string | null;
  /**
   * ĐÃ NHÓM SẴN (`groupByDateKey`) — lưới không tự nhóm, và mảng này là của TRỌN lịch, không bị
   * cắt theo `monthCursor`. Nhờ thế đổi lưới-tháng sang dải-ngày chỉ là đổi hàm render này.
   */
  days: ScheduleDay[];
  onSelectDay: (dateKey: string) => void;
  /**
   * Lùi/tiến `delta` tháng (‹ › của #404). Nhận **delta** chứ không nhận `MonthCursor` dựng sẵn:
   * phép cuộn năm khi đó nằm ở một chỗ duy nhất (`shiftMonthCursor`), và lưới không phải biết
   * con trỏ tháng được lưu ra sao.
   */
  onShiftMonth: (delta: number) => void;
  /**
   * Ngày nào là hạn chót của ≥1 kế hoạch ĐANG HIỆN (#439), tra theo `dateKey`. Dựng ở
   * `ScheduleView` bằng `buildDeadlineMarks` — lưới không tự lọc `status`/`hiddenPlanIds`.
   *
   * `Map` chứ không phải mảng: `DayCell` là `memo` trên 42 ô, nên nó phải nhận một **giá trị vô
   * hướng** cho riêng ngày của nó. Truyền cả map xuống con là biến memo thành no-op.
   */
  deadlines: ReadonlyMap<string, DeadlineMark>;
}

/** Đầu cột, tuần bắt đầu **thứ Hai** — phải khớp phép xoay trong `buildMonthCells`. */
const WEEKDAY_HEADS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

/** Tối đa 3 chip chữ trong một ô; phần dôi gộp thành "+n mục nữa". */
const MAX_CHIPS = 3;

/**
 * Tối đa 4 chấm mật độ ở bề ngang hẹp, rồi "+n" — nhưng **bớt xuống 2 khi có đuôi**, vì đuôi phải
 * có chỗ THẬT chứ không phải chỗ đi mượn.
 *
 * 🔴 Lý do là một hồi quy đo được của #404: `<i>` là flex item, `flex-shrink: 1` mặc định, nên khi
 * hàng chật Chrome **bóp chính các chấm** thay vì đẩy đuôi ra ngoài. Đo ở 320px: 5 mục ⇒ chấm còn
 * **1,44px**, 14 mục ⇒ chấm còn **0px, biến mất hẳn**. Tín hiệu mật độ khi đó chạy NGƯỢC nghĩa —
 * càng nhiều mục chấm càng nhỏ. Và vì hàng không bao giờ tràn, không phép đo tràn nào bắt được.
 *
 * ⛔ Bản vá KHÔNG phải là `shrink-0` một mình: đo được, `shrink-0` giữ chấm 5px nhưng làm hàng
 * **tràn 4–20px** — tức nó chỉ dời chỗ hỏng ra ngoài ô. Phải đi kèm cắt bớt số chấm.
 *
 * Ngân sách ở 320px (lòng ô 30px) — ĐO LẠI 02/09 sau khi đuôi `+N` lên `text-[11px]` theo sàn
 * #386. Geist Mono tiến 0.600em, nên mỗi glyph đuôi thành 6.6px thay vì 6.0px:
 *   KHÔNG đuôi: 4 chấm 5px + 3 khe 3px = 29px — không đổi, đuôi không tham gia phép tính này.
 *   đuôi một chữ số (`+3` = 2 glyph): 2 chấm + 2 khe + 13.2px = 29.2px (trước 28.0px) — vẫn lọt.
 *
 * Đuôi HAI chữ số (`+10` = 3 glyph) bắt đầu từ **n = 12** mục trong một ngày (đuôi = `n − 2`):
 * 10 + 6 + 19.8 = 35.8px ⇒ ở 320px tràn ~5.8px (trước ~4px) và bị `overflow-hidden` xén sâu hơn.
 * Bước 10px→11px làm ca này XẤU ĐI chứ không tạo ra nó. Giữ 11px vì sàn cỡ chữ là quyết định đã
 * chốt, còn chỗ tràn chỉ xuất hiện ở 320px — không phải bề rộng của buổi demo. ⚠️ KHÔNG viết "bất khả": fold `(planId, conceptId)` chỉ gộp
 * nhiều hàng của CÙNG một khái niệm, nó không chặn nhiều khái niệm KHÁC NHAU rơi cùng ngày — và
 * `concept-schedule.service.ts` ghi `scheduledFor: now` cho MỌI tiền đề truy ngược, nên một
 * phiên truy ngược 12 tiền đề đặt đúng 12 mục lên ô hôm nay. Phát biểu đúng là **"chưa dựng được
 * từ dữ liệu dev hôm nay (8 mục / 7 ngày)"**. "Bất khả" là loại chữ người sau dựa vào để bỏ qua
 * một ca.
 */
const MAX_DOTS = 4;

/** Số chấm khi đã có đuôi "+n" — xem ngân sách px ở `MAX_DOTS`. */
const MAX_DOTS_WITH_TAIL = 2;

/**
 * 🔴 MỌI tên class trong tệp này phải là **literal viết thẳng**, không ghép từ biến.
 *
 * Tailwind quét **văn bản nguồn tĩnh**, nó không chạy code: một hằng `NARROW = 'max-[680px]:'` rồi
 * `` `${NARROW}hidden` `` sinh đúng class lúc chạy nhưng **rule CSS không bao giờ được tạo** — DOM
 * có class, không luật nào bám vào, và không gì đỏ. Bản đầu của tệp này viết đúng như thế và
 * **344 test vẫn xanh**; chỉ browser thật ở 320px mới lộ (chip vẫn hiện, chấm không bao giờ).
 *
 * Mốc 680px: dưới nó một ô rộng ~38–44px, **không cõng nổi một chữ nào**, nên chip chữ tắt hẳn và
 * ô chỉ còn số ngày + chấm mật độ. Viết đúng mốc mockup thay vì làm tròn về `sm`/`md` — repo có
 * tiền lệ mốc không tròn (`min-[721px]:` trong `ReviewQueueItemRow`).
 *
 * Cái giá phải nói thẳng: **ở mobile lưới không còn đọc được NỘI DUNG, chỉ đọc được MẬT ĐỘ.** Đó
 * là đánh đổi đã biết của hướng lưới tháng, và là lý do `aria-label` của ô phải tự đủ nghĩa —
 * `display:none` gỡ chip khỏi cả cây trợ năng, nên ở bề ngang hẹp nhãn đó là thứ DUY NHẤT trình
 * đọc màn hình còn đọc được.
 */

/**
 * Lưới tháng của màn Lịch (#404) — 42 ô + thanh điều hướng tháng.
 *
 * Chữ ký `MonthGridProps` là **giao kèo** giữa hai luồng frontend (#404 lưới · #405 panel), không
 * phải gợi ý. Đổi chữ ký thì báo trước khi sửa.
 *
 * Không giữ state nào — mọi state của màn Lịch nằm ở `ScheduleView`.
 *
 * ⚠️ Lưới **không lọc `days` theo `monthCursor`**. Con trỏ tháng chỉ quyết định 42 ô nào được vẽ;
 * ô tràn của tháng bên cạnh vẫn tra đúng `dateKey` của nó và vẫn hiện mục. Giữ tính chất này thì
 * đổi lưới-tháng sang một hình khác (dải ngày, danh sách tuần) chỉ phải sửa **hàm render này** —
 * đó là bảo hiểm lịch trình của epic, không phải sở thích kiến trúc.
 */
export function MonthGrid({
  monthCursor,
  todayDateKey,
  selectedDateKey,
  days,
  onSelectDay,
  onShiftMonth,
  deadlines,
}: MonthGridProps) {
  const cells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);
  const dayByDateKey = useMemo(() => new Map(days.map((day) => [day.dateKey, day])), [days]);

  // Hỏi "tháng này có gì không" bằng CHÍNH 42 ô đang vẽ, không dựng lại tiền tố `YYYY-MM` để lọc
  // `days`: một tiền tố tháng ở đây là lời mời cắt dữ liệu theo tháng, đúng thứ #401 đã gỡ đi.
  // Cách này còn không thể lệch khỏi thứ đang hiển thị, vì nó đọc đúng mảng đã render.
  const hasSessionThisMonth = cells.some((cell) => cell.inMonth && dayByDateKey.has(cell.dateKey));

  // "Còn nợ" độc lập tháng — đếm trên TRỌN mảng. Dùng `isOverdue` mà `groupByDateKey` đã tính để
  // luật "quá hạn" chỉ nằm một chỗ; lưới và thanh Còn nợ (#405) không thể nói hai con số khác nhau.
  const overdueItemCount = days.reduce(
    (sum, day) => (day.isOverdue ? sum + day.items.length : sum),
    0
  );

  const deltaToToday = monthsBetween(monthCursor, monthCursorFromDateKey(todayDateKey));

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          // Công thức duy nhất — số học tháng sống trong `shiftMonthCursor`/`monthsBetween`, không
          // ở đây. Tắt khi delta = 0 vì `onShiftMonth(0)` vẫn sinh một `MonthCursor` MỚI: lưới
          // render lại toàn bộ 42 ô cho một cú bấm không đi đâu cả.
          disabled={deltaToToday === 0}
          onClick={() => onShiftMonth(deltaToToday)}
        >
          Hôm nay
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Tháng trước"
          onClick={() => onShiftMonth(-1)}
        >
          <ChevronLeft />
        </Button>
        {/* `aria-live` để người dùng trình đọc màn hình nghe được tháng đã đổi: hai nút ‹ › giữ
            nguyên nhãn sau khi bấm, nên không có gì khác báo rằng có chuyện gì vừa xảy ra. */}
        <span
          aria-live="polite"
          /* #387: KHÔNG snap — 15px dưới 680px là NHƯỢNG BỘ responsive đã chốt (Quân
             02/09), không phải trôi thang: nền đã đúng bậc `card` (18px), chỉ tầng
             `max-width` hạ xuống vì dưới ngưỡng đó thẻ mất `min-w-[130px]` và phải co
             giữa hai nút ‹ ›. Hồ sơ ở `RESPONSIVE_CONCESSION` trong
             `heading-scale.test.ts`. */
          className={cn(
            headingVariants({ size: 'card' }),
            'min-w-[130px] max-[680px]:min-w-0 max-[680px]:flex-1 max-[680px]:text-[15px]'
          )}
        >
          {formatMonthLabel(monthCursor)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Tháng sau"
          onClick={() => onShiftMonth(1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="border-border bg-card flex min-w-0 flex-col overflow-hidden rounded-xl border">
        <div className="border-border grid grid-cols-7 border-b">
          {WEEKDAY_HEADS.map((head) => (
            <div
              key={head}
              className="border-border text-muted-foreground border-r px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] last:border-r-0 max-[680px]:px-1 max-[680px]:py-1.5"
            >
              {head}
            </div>
          ))}
        </div>

        <div className="relative grid flex-1 auto-rows-fr grid-cols-7">
          {cells.map((cell) => (
            <DayCell
              key={cell.dateKey}
              cell={cell}
              day={dayByDateKey.get(cell.dateKey)}
              isToday={cell.dateKey === todayDateKey}
              isSelected={cell.dateKey === selectedDateKey}
              deadline={deadlines.get(cell.dateKey)}
              onSelectDay={onSelectDay}
            />
          ))}
          {/* Ẩn thẻ khi ngày đang chọn NẰM TRONG tháng đang xem — không phải khi "có ngày nào
              đó đang được chọn".

              Lý do ẩn (#482) vẫn nguyên và chỉ đúng cho ngày TRONG tháng đang xem: `DayPanel`
              lúc đó đã tự nói "Ngày này trống", và viền chọn `z-[2]` của `DayCell` đè lên thẻ —
              hai UI chồng nhau, thẻ lúc ấy vừa thừa thông tin vừa bị vẽ đè.

              Nhưng `shiftMonth` chỉ đổi `monthCursor` và cố ý không đụng `selectedDateKey`
              (`useScheduleViewState.ts:62`), nên điều kiện cũ `selectedDateKey === null` ẩn thẻ
              ở MỌI tháng rỗng lật qua sau đó — đo LIVE ở T10: không ô nào `aria-pressed`, không
              ô nào có viền, mà thẻ vẫn biến mất.

              `c.inMonth` là CỐ Ý: ô TRÀN cũng mang viền chọn, nhưng nó luôn ở hàng đầu/hàng
              cuối còn thẻ thì `place-items-center` ⇒ giao 0px² (đo trên 5 cấu hình). Không có
              va chạm để tránh, nên thẻ vẫn phải hiện.

              Hỏi qua `cells` chứ KHÔNG dựng lại tiền tố `YYYY-MM` — xem ghi chú ở
              `hasSessionThisMonth`: so bằng chuỗi tháng là lời mời cắt dữ liệu theo tháng, thứ
              #401 đã gỡ; hỏi `cells` thì không thể lệch khỏi thứ đang hiển thị. */}
          {!hasSessionThisMonth &&
            !cells.some((c) => c.inMonth && c.dateKey === selectedDateKey) && (
              <EmptyMonthCard
                monthLabel={formatMonthLabel(monthCursor)}
                overdueItemCount={overdueItemCount}
              />
            )}
        </div>
      </div>
    </div>
  );
}

interface DayCellProps {
  cell: MonthCell;
  /** `undefined` = ngày không có mục nào. Không có `ScheduleDay` rỗng trong `days`. */
  day: ScheduleDay | undefined;
  isToday: boolean;
  isSelected: boolean;
  /** `undefined` = ngày này không phải hạn chót của kế hoạch nào đang hiện. */
  deadline: DeadlineMark | undefined;
  onSelectDay: (dateKey: string) => void;
}

/**
 * Một ô ngày. Nhận `onSelectDay` (identity ổn định từ `useScheduleViewState`) và tự đóng gói
 * `dateKey` khi gọi — truyền một closure `() => onSelect(dateKey)` từ trên xuống sẽ tạo hàm mới
 * mỗi render và biến `memo` này thành no-op trên cả 42 ô.
 */
const DayCell = memo(function DayCell({
  cell,
  day,
  isToday,
  isSelected,
  deadline,
  onSelectDay,
}: DayCellProps) {
  const items = day?.items ?? [];
  // `day` chỉ tồn tại khi ngày có mục, nên "quá hạn" ở đây luôn hàm ý "quá hạn VÀ còn việc" —
  // đúng thứ đáng tô nền. Một ngày trống đã trôi qua không nợ ai cái gì.
  const isOverdue = day?.isOverdue === true;
  const chips = items.slice(0, MAX_CHIPS);
  const hiddenChipCount = items.length - chips.length;
  const dotCount = items.length > MAX_DOTS ? MAX_DOTS_WITH_TAIL : MAX_DOTS;

  return (
    <button
      type="button"
      disabled={!cell.inMonth}
      onClick={() => onSelectDay(cell.dateKey)}
      aria-current={isToday ? 'date' : undefined}
      aria-pressed={cell.inMonth ? isSelected : undefined}
      aria-label={cellLabel(cell, items.length, isOverdue, deadline)}
      className={cn(
        // `overflow-hidden` để vạt hạn chót bị cắt thành tam giác góc. Đo trước khi thêm: hàng
        // chấm KHÔNG tràn (`scrollWidth === clientWidth` ở mọi bề ngang) nên nó không xén gì —
        // nhưng tính chất đó phụ thuộc `MAX_DOTS_WITH_TAIL`, đừng nới cái kia mà quên cái này.
        'border-border relative flex min-h-[104px] flex-col gap-[3px] overflow-hidden border-b border-r px-1.5 py-[5px] text-left [&:nth-child(7n)]:border-r-0',
        'max-[680px]:min-h-[58px] max-[680px]:p-1',
        cell.inMonth ? 'hover:bg-muted/55 cursor-pointer' : 'bg-muted/35 cursor-default',
        // Tint /7, KHÔNG phải /10 hay /14: chữ `--muted-foreground` 10–12px nằm ngay trên nền này,
        // và ở light mode /10 chỉ đạt 4,31 — dưới ngưỡng AA 4.5. Đặt sau nhánh `bg-muted/35` để
        // twMerge cho nó thắng, giống thứ tự CSS của mockup (ô tràn mà quá hạn vẫn tô đỏ).
        isOverdue && 'bg-mastery-weak/7',
        isSelected && 'outline-primary z-[2] outline-2 -outline-offset-2'
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'text-muted-foreground font-mono text-xs',
            isToday &&
              'bg-primary text-primary-foreground grid size-[21px] place-items-center rounded-full text-[11.5px] font-semibold',
            !cell.inMonth && 'opacity-30'
          )}
        >
          {String(cell.dayOfMonth).padStart(2, '0')}
        </span>
        {day !== undefined && (
          <span
            className="text-muted-foreground font-mono text-[11px] max-[680px]:hidden"
            // Số phút chỉ đáng tin ở mức "ngày này nặng hơn ngày kia" (`estimatedMinutes` đổi theo
            // phiên nguồn) — nên nó là một con số, không phải thanh mật độ hay phần trăm.
          >
            ≈{day.totalMinutes}ʹ
          </span>
        )}
      </span>

      {chips.map((item) => (
        <span
          key={item.id}
          className={cn(
            'bg-muted overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] border-l-2 px-[5px] py-[3px] text-[11px] leading-[1.35]',
            CHIP_ACCENT[accentOf(item, isOverdue)],
            'max-[680px]:hidden'
          )}
        >
          {item.name}
        </span>
      ))}

      {hiddenChipCount > 0 && (
        <span className="text-muted-foreground pl-[5px] text-[11px] max-[680px]:hidden">
          +{hiddenChipCount} mục nữa
        </span>
      )}

      {items.length > 0 && (
        <span aria-hidden="true" className="mt-0.5 hidden items-center gap-[3px] max-[680px]:flex">
          {items.slice(0, dotCount).map((item) => (
            <i
              key={item.id}
              // `shrink-0` là bắt buộc, không phải phòng xa: thiếu nó thì chấm bị bóp thành lát
              // mỏng thay vì hàng tràn ra (xem `MAX_DOTS`).
              className={cn(
                'block size-[5px] shrink-0 rounded-full',
                DOT_ACCENT[accentOf(item, isOverdue)]
              )}
            />
          ))}
          {items.length > dotCount && (
            <b className="text-muted-foreground ml-px font-mono text-[11px] font-semibold">
              +{items.length - dotCount}
            </b>
          )}
        </span>
      )}

      {deadline !== undefined && (
        <i
          aria-hidden="true"
          data-deadline={deadline.isPast ? 'past' : 'upcoming'}
          className={cn(
            // Hình vuông 18px xoay 45°, tâm đặt lệch vào trong 6px mỗi trục ⇒ phần còn lại sau khi
            // ô cắt là một tam giác ở góc dưới-phải. Lệch vào (không phải -9px, tức không đặt tâm
            // đúng góc) là để né cung bo của KHUNG lưới: `rounded-xl` có bán kính TUYỆT ĐỐI 13,5px
            // trong khi ô co theo màn, nên ở 360px cung đó ăn ~29% bề ngang ô cuối — chỉ ô 42 dính,
            // nhưng ở màn hẹp thì nó ngoạm hẳn cái mũi chứ không phải vài pixel.
            'pointer-events-none absolute bottom-[-6px] right-[-6px] size-[18px] rotate-45',
            // Mực, KHÔNG phải hue: ba dải mastery + truy ngược đã tiêu hết trục màu (C6). Đặc =
            // sắp tới (còn hành động được), chỉ còn nét = đã qua (dấu vết). Quá hạn đã được nói
            // bằng NỀN của ô, nên dồn thêm mực đặc vào quá khứ là nói hai lần một điều.
            deadline.isPast ? 'border-foreground border-[1.5px]' : 'bg-foreground',
            // KHÔNG tự thừa hưởng `opacity-30` của ô tràn tháng — nó là con tuyệt đối của
            // `<button>`, không nằm trong `<span>` số ngày. Thiếu dòng này thì ô mờ lại mang dấu
            // chói nhất lưới, ở đúng ô bấm không được. Đĩa HÔM NAY đã mờ theo ô, vạt cùng hạng
            // DẤU TRẠNG THÁI nên mờ theo; chip và chấm là NỘI DUNG nên không mờ.
            !cell.inMonth && 'opacity-30'
          )}
        />
      )}
    </button>
  );
});

/**
 * Ba sắc thái một mục có thể mang trên ô ngày. Luật ưu tiên ở `accentOf`, tên class ở hai bảng
 * dưới — **cố ý tách**: tên class phải là literal thì Tailwind mới quét thấy (xem ghi chú đầu
 * tệp). Một hàm `` `${prefix}-remediate` `` gọn hơn, và không sinh ra luật CSS nào.
 */
type Accent = 'traceback' | 'overdue' | 'normal';

const CHIP_ACCENT: Record<Accent, string> = {
  traceback: 'border-l-remediate',
  overdue: 'border-l-mastery-weak',
  normal: 'border-l-mastery-untested',
};

const DOT_ACCENT: Record<Accent, string> = {
  traceback: 'bg-remediate',
  overdue: 'bg-mastery-weak',
  normal: 'bg-mastery-untested',
};

/**
 * Thứ tự ưu tiên của mockup: **truy ngược thắng quá hạn**.
 *
 * Lý do theo hướng đó chứ không phải ngược lại: quá hạn đã được nói bằng nền của cả ô, còn "đây
 * là nền tảng đang vỡ" thì không có chỗ nào khác nói.
 */
function accentOf(item: ScheduleItem, isOverdue: boolean): Accent {
  if (item.reason === 'traceback') return 'traceback';
  return isOverdue ? 'overdue' : 'normal';
}

/**
 * Nhãn trợ năng của ô — ở bề ngang hẹp đây là thứ duy nhất còn đọc được (xem ghi chú 680px).
 *
 * 🔴 Ghép MẢNH, không return sớm. Bản trước thoát ngay ở `itemCount === 0`, mà **ô rỗng lại là ca
 * PHỔ BIẾN NHẤT của hạn chót** — hạn hiếm khi trùng đúng ngày engine xếp buổi ôn. Mọi mệnh đề nối
 * sau một return sớm là code chết cho đúng ca cần nó nhất, và ô đó sẽ đọc thành "không có gì được
 * xếp" khi thật ra có một hạn chót: **nói dối, không phải nói thiếu**.
 *
 * "quá hạn" ở lại đúng phạm vi MỤC ÔN. Hạn chót dùng từ riêng — dùng lại "quá hạn" thì ô có cả hai
 * đọc ra "…, quá hạn, quá hạn của 2 kế hoạch". Và vế hạn chót không mặc định là quá khứ: phần lớn
 * hạn nằm ở TƯƠNG LAI, đó là cả lý do hiện nó.
 */
function cellLabel(
  cell: MonthCell,
  itemCount: number,
  isOverdue: boolean,
  deadline: DeadlineMark | undefined
): string {
  const parts: string[] = [];
  if (itemCount > 0) parts.push(`${itemCount} khái niệm`);
  if (isOverdue) parts.push('quá hạn');
  if (deadline !== undefined) {
    const verb = deadline.isPast ? 'hạn chót đã qua của' : 'hạn chót của';
    parts.push(`${verb} ${deadline.plans.length} kế hoạch`);
  }
  // "không có gì được xếp" là FALLBACK khi ô thật sự trống, không phải mệnh đề mở đầu: ghép nó
  // trước một hạn chót cho ra câu tự cãi — "không có gì được xếp, hạn chót của 2 kế hoạch" — và ở
  // ≤679px nhãn này được ĐỌC THÀNH LỜI, nơi mâu thuẫn nghe rõ nhất.
  const body = parts.length > 0 ? parts.join(', ') : 'không có gì được xếp';
  return `${formatDayLabel(cell.dateKey)} — ${body}`;
}

/**
 * Thẻ phủ lên lưới khi tháng đang xem không có buổi ôn nào — **không phải một lưới câm**.
 *
 * Là ca **thường**, không phải ca biên: engine chỉ xếp ngày sau mỗi phiên kiểm tra, nên phần lớn
 * tháng tương lai rỗng 100%. `pointer-events-none` để các ô bên dưới vẫn bấm được.
 *
 * Cố ý KHÔNG dùng lại khung của `EmptyQueueMessage`: khung đó là trạng thái rỗng cấp-màn
 * (`max-w-130`, heading 20px) còn đây là thẻ phủ cấp-khối (heading 16px, body 12,5px). Ép chung
 * một khung sẽ buộc một trong hai đổi thang chữ.
 */
function EmptyMonthCard({
  monthLabel,
  overdueItemCount,
}: {
  monthLabel: string;
  overdueItemCount: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="border-border bg-card px-5.5 py-4.5 shadow-(--shadow-soft) max-w-[46ch] rounded-xl border text-center">
        <p className={cn(headingVariants({ size: 'card' }), 'mb-1.5')}>
          {monthLabel} chưa có buổi ôn nào
        </p>
        <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
          {overdueItemCount > 0 ? (
            <>
              Engine chỉ xếp ngày sau mỗi phiên kiểm tra. Bạn còn{' '}
              <b className="text-foreground font-medium">{overdueItemCount} khái niệm quá hạn</b> ở
              thanh phía trên — xong chúng thì lịch phía trước sẽ đầy lên.
            </>
          ) : (
            'Engine chỉ xếp ngày ôn sau mỗi phiên kiểm tra. Làm một phiên để có lịch.'
          )}
        </p>
      </div>
    </div>
  );
}
