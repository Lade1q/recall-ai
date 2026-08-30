import { Loader2 } from 'lucide-react';

import { BlockError } from '@/features/dashboard/components/BlockError';
import type { FocusSessionListItem } from '@/features/focus/types/focus.types';
import { FocusSessionRow } from './FocusSessionRow';
import { formatDuration, groupFocusSessionsByDay } from '../utils/group-focus-by-day';

/**
 * Lịch sử phiên học, nhóm theo NGÀY kèm tổng thời lượng của ngày (DB-08 · UC-10).
 *
 * Không có cột điểm — và đó là quyết định, không phải thiếu sót: phiên học không sinh
 * `mastery_score`, nên *"giữ một cột điểm rỗng sẽ ngầm khẳng định ngồi học 25 phút là một kết
 * quả đo được"* (mockup `screen-history.html`).
 *
 * Danh sách chiếm trọn bề ngang thay vì hai cột như tab Phiên kiểm tra: không có panel chi tiết
 * để đặt bên cạnh (#247 ghi rõ ngoài phạm vi), nên một cột 312px là chừa chỗ cho thứ không tồn
 * tại.
 */
export function FocusSessionList({
  sessions,
  planNameById,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  onRetry,
}: {
  sessions: FocusSessionListItem[];
  planNameById: ReadonlyMap<string, string>;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (loading) return <FocusSessionListSkeleton />;

  if (error) {
    return (
      <div className="bg-card border-border rounded-xl border p-4">
        <BlockError message="Không tải được lịch sử phiên học." onRetry={onRetry} />
      </div>
    );
  }

  // `now` chốt một lần cho cả lượt render: nhóm theo từng phần tử sẽ cho hai hàng cạnh nhau rơi
  // vào hai nhóm khác nhau nếu render vắt qua nửa đêm.
  const groups = groupFocusSessionsByDay(sessions, new Date(), hasMore);

  return (
    <section
      className="bg-card border-border overflow-hidden rounded-xl border py-1.5"
      aria-label="Danh sách phiên học"
    >
      {groups.map((group, index) => (
        // Khoá theo vị trí kèm mốc ngày: `dayStart` là `NaN` cho hàng ngày hỏng, và `NaN` không
        // dùng làm khoá duy nhất được khi có nhiều hàng như vậy.
        <div key={`${group.dayStart}-${index}`}>
          {/* Bỏ HẲN tổng khi nó mới là tổng một phần, thay vì in kèm dấu hiệu: `0 phút` ở nhóm
              cuối đọc thành "hôm ấy bạn không học gì" — một câu SAI, tệ hơn hẳn việc chưa nói
              gì. Bấm "Xem thêm" là ngày đó đóng lại và tổng hiện ra. */}
          <h3 className="text-muted-foreground px-[18px] pb-1.5 pt-3 text-[11px] uppercase tracking-[0.06em]">
            {group.label}
            {!group.totalIsPartial && ` — ${formatDuration(group.totalMinutes)}`}
          </h3>
          {group.sessions.map((session) => (
            <FocusSessionRow
              key={session.id}
              session={session}
              planLabel={resolvePlanLabel(session, planNameById)}
            />
          ))}
        </div>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="border-border text-muted-foreground hover:text-foreground mt-1.5 flex w-full cursor-pointer items-center justify-center gap-2 border-t p-3 text-[13px] transition-colors disabled:cursor-default"
        >
          {loadingMore && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {loadingMore ? 'Đang tải…' : 'Xem thêm phiên cũ hơn'}
        </button>
      )}
    </section>
  );
}

/**
 * Nhãn kế hoạch của một hàng — **ba** ca, không phải hai.
 *
 * `payload /focus-sessions` chỉ mang `planId`, tên phải tra từ `/plans`. Gộp "không có kế hoạch"
 * với "chưa tra được tên" là một lỗi thật, không phải chuyện chữ nghĩa: `/plans` hỏng hoặc còn
 * đang tải thì `plans = []` ⇒ MỌI hàng sẽ khai "Phiên tự do", trong khi chúng đều thuộc một kế
 * hoạch. Đổi một lỗi tải thành một lời nói dối — đúng lớp hồi quy #435 đã tách issue riêng.
 *
 * ⚠️ Ca "có `planId` mà không tra được tên" **không** tới được bằng đường xoá kế hoạch:
 * `FocusSession.plan` khai `onDelete: Cascade`, nên xoá plan là phiên đi theo. Nó tới được đúng
 * bằng đường `/plans` chưa về hoặc hỏng — và im lặng ở đó đúng hơn là đoán.
 */
function resolvePlanLabel(
  session: FocusSessionListItem,
  planNameById: ReadonlyMap<string, string>
): string | null {
  // Phiên tự do: `createFocusSession` cho phép `planId` rỗng. Mockup không vẽ ca này.
  if (session.planId === null) return 'Phiên tự do';
  return planNameById.get(session.planId) ?? null;
}

/** Cùng nhịp hàng với danh sách thật để khung không giật khi dữ liệu về. */
function FocusSessionListSkeleton() {
  return (
    <div
      className="bg-card border-border overflow-hidden rounded-xl border py-1.5"
      aria-busy="true"
      aria-label="Đang tải lịch sử phiên học"
    >
      <div className="bg-muted mx-[18px] my-3 h-2.5 w-32 animate-pulse rounded" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="px-[18px] pb-[13px] pt-[11px]">
          <div className="flex items-baseline justify-between gap-2.5">
            <div className="bg-muted h-3 w-28 animate-pulse rounded" />
            <div className="bg-muted h-3 w-14 animate-pulse rounded" />
          </div>
          <div className="bg-muted mt-2 h-3 w-48 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
