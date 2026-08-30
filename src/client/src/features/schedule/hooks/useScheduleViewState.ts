import { useCallback, useState } from 'react';
import { monthCursorFromDateKey, shiftMonthCursor, type MonthCursor } from '../utils/schedule-date';

export interface ScheduleViewState {
  /** Tháng lưới đang hiện. KHÔNG cắt dữ liệu — chỉ quyết định 42 ô nào được vẽ (#404). */
  monthCursor: MonthCursor;
  /**
   * Lùi/tiến `delta` tháng — cả ‹ › lẫn nút "Hôm nay" (`MonthGrid` có sẵn `monthCursor` và
   * `todayDateKey` nên tự tính được delta). Cuộn năm nằm trong `shiftMonthCursor`, không ở nơi
   * gọi: chữ ký nào để hai nơi cùng biết cách cộng tháng là chữ ký sẽ lệch.
   */
  shiftMonth: (delta: number) => void;
  /** Ngày đang chọn, `null` khi panel đóng. */
  selectedDateKey: string | null;
  /** Panel đang hiện nhóm "Còn nợ" thay cho một ngày. */
  debtOpen: boolean;
  /**
   * Kế hoạch bị TẮT trên lịch (#405). Lưu id bị **ẩn** chứ không phải id được hiện: kế hoạch mới
   * tạo phải tự có mặt trên lịch, không phải chờ ai đó tick nó vào. Chỉ ĐỌC — sửa bằng hai hàm
   * dưới đây.
   */
  hiddenPlanIds: ReadonlySet<string>;
  /** Bật/tắt một kế hoạch trên lịch. */
  togglePlan: (planId: string) => void;
  /** "Chọn tất cả" / "Bỏ chọn tất cả" — đặt lại trọn danh sách id bị ẩn. */
  setHiddenPlans: (planIds: readonly string[]) => void;
  /** `id` mục đang mở rộng tại chỗ trong panel, `null` khi không mục nào mở. */
  expandedItemId: string | null;
  selectDay: (dateKey: string) => void;
  openDebt: () => void;
  closePanel: () => void;
  toggleItem: (id: string) => void;
}

/**
 * Toàn bộ state của màn Lịch, gom một chỗ (#401).
 *
 * Tách khỏi `ScheduleView` chỉ để mô tả được **bề mặt state** thành một type: `MonthGrid` và
 * `DayPanel` không giữ state nào, nên mỗi khi #404/#405 cần nhớ thêm thứ gì thì chỗ thêm vào là
 * đây — không phải trong con.
 *
 * Bốn hàm cuối là các chuyển trạng thái mà **nhiều state đổi cùng lúc**; để nơi gọi tự gọi ba
 * setter theo đúng thứ tự là cách chắc chắn nhất để một trong ba bị quên. Cụ thể: chọn ngày phải
 * đóng "Còn nợ" (một panel, hai nội dung loại trừ nhau) và phải đóng mục đang mở rộng, nếu không
 * đổi ngày xong còn lại một mục mở lơ lửng của ngày cũ.
 *
 * Cả bốn đi qua `useCallback([])` — deps rỗng là thật, chúng chỉ gọi setter của `useState` và
 * `toggleItem` đã dùng functional update. Identity ổn định là điều kiện để `React.memo` trên 42 ô
 * lưới của #404 có tác dụng; callback đổi mỗi render sẽ biến memo đó thành no-op.
 *
 * ⚠️ `todayDateKey` chỉ được đọc **lúc mount** để gieo con trỏ tháng — xem cảnh báo ở `useSchedule`.
 */
export function useScheduleViewState(todayDateKey: string): ScheduleViewState {
  const [monthCursor, setMonthCursor] = useState<MonthCursor>(() =>
    monthCursorFromDateKey(todayDateKey)
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [debtOpen, setDebtOpen] = useState(false);
  const [hiddenPlanIds, setHiddenPlanIds] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const shiftMonth = useCallback((delta: number) => {
    setMonthCursor((prev) => shiftMonthCursor(prev, delta));
  }, []);

  // CỐ Ý không xuất `setHiddenPlanIds` ra ngoài. Một `Set` + setter thay-cả-cụm là cái bẫy dễ
  // dính nhất trong React: `prev.add(id); setHiddenPlanIds(prev)` giữ nguyên identity nên React
  // bail out, không re-render — bộ lọc bấm không ăn mà không có lỗi nào. Hai hàm dưới luôn dựng
  // `Set` MỚI, nên nơi gọi không có đường viết sai.
  const togglePlan = useCallback((planId: string) => {
    setHiddenPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }, []);

  const setHiddenPlans = useCallback((planIds: readonly string[]) => {
    setHiddenPlanIds(new Set(planIds));
  }, []);

  const selectDay = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
    setDebtOpen(false);
    setExpandedItemId(null);
  }, []);

  const openDebt = useCallback(() => {
    setDebtOpen(true);
    setSelectedDateKey(null);
    setExpandedItemId(null);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedDateKey(null);
    setDebtOpen(false);
    setExpandedItemId(null);
  }, []);

  const toggleItem = useCallback((id: string) => {
    setExpandedItemId((prev) => (prev === id ? null : id));
  }, []);

  return {
    monthCursor,
    shiftMonth,
    selectedDateKey,
    debtOpen,
    hiddenPlanIds,
    togglePlan,
    setHiddenPlans,
    expandedItemId,
    selectDay,
    openDebt,
    closePanel,
    toggleItem,
  };
}
