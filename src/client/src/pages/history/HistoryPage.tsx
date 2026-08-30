import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAsyncResource } from '@/features/dashboard/hooks/useAsyncResource';
import { planApi } from '@/features/study-planner/api/plan.api';
import { SessionList } from '@/features/history/components/SessionList';
import { SessionDetailPanel } from '@/features/history/components/SessionDetailPanel';
import { FocusSessionList } from '@/features/history/components/FocusSessionList';
import { NoFocusSessionsYet, NoSessionsYet } from '@/features/history/components/NoSessionsYet';
import { useFocusSessionList } from '@/features/history/hooks/useFocusSessionList';
import { useSessionList } from '@/features/history/hooks/useSessionList';
import { selectInterviewSession } from '@/features/history/utils/select-session';
import type { PlanSummary } from '@/features/study-planner/types/concept';

/**
 * Trang "Lịch sử & Tiến độ" (DB-03 · #246).
 *
 * Nơi kiểm lại điểm số SAU khi phiên đã kết thúc — read-only, không sinh điểm, chỉ trình bày
 * lại. Giá trị của nó là cho sinh viên **kiểm chứng** cách từng điểm được tính ra, cùng tinh
 * thần với ràng buộc C5 ở màn phỏng vấn.
 *
 * Khung hai tab dùng chung với DB-08 (lịch sử phiên Focus). Tab "Phiên học" là issue riêng
 * (#247) nên ở đây chỉ có chỗ giữ chỗ và **không gọi API nào** — `focus.api.ts` hiện chưa có
 * hàm liệt kê, và dựng một nửa tab đó sẽ chồng lên phạm vi của #247.
 */
export default function HistoryPage() {
  /**
   * `/plans` nạp MỘT lần ở cấp trang rồi truyền xuống cả hai tab: tab Phiên kiểm tra cần nó cho
   * bộ lọc phạm vi, tab Phiên học cần nó để tra tên kế hoạch (payload `/focus-sessions` chỉ
   * mang `planId`). Để mỗi tab tự nạp thì đổi qua đổi lại giữa hai tab là mỗi lần một request
   * cho cùng một danh sách — và #400 đã ghi thành luật: không nhân đôi metadata kế hoạch.
   */
  const plans = useAsyncResource(() => planApi.listPlans());

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <header className="mb-[18px]">
        <h1 className="font-heading m-0 text-[28px] tracking-[-0.02em]">Lịch sử &amp; Tiến độ</h1>
        <p className="text-muted-foreground mt-[7px] max-w-[62ch] text-[13.5px] leading-[1.6]">
          Nơi kiểm lại điểm số sau khi phiên đã kết thúc: điểm nào tính ra sao, khái niệm nào nhích
          lên, và hệ thống đã chèn gì vào lịch vì kết quả đó.
        </p>
      </header>

      <Tabs defaultValue="interview">
        <TabsList variant="line" className="mb-5">
          <TabsTrigger value="interview">Phiên kiểm tra</TabsTrigger>
          <TabsTrigger value="focus">Phiên học</TabsTrigger>
        </TabsList>

        <TabsContent value="interview">
          <InterviewHistoryTab plans={plans.data ?? []} />
        </TabsContent>

        <TabsContent value="focus">
          <FocusHistoryTab plans={plans.data ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InterviewHistoryTab({ plans }: { plans: readonly PlanSummary[] }) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useSessionList(planId);

  // AC #246: lỗi mạng báo bằng toast kèm đường "Thử lại" (nút nằm trong khối lỗi của danh
  // sách). Chỉ báo một lần cho mỗi lần hỏng — `notified` giữ nguyên qua các lần render lại nên
  // toast không bắn lại mỗi khi đổi phiên đang chọn.
  const notifiedError = useRef(false);
  useEffect(() => {
    if (list.error && !notifiedError.current) {
      notifiedError.current = true;
      toast.error('Không tải được danh sách phiên kiểm tra. Kiểm tra kết nối rồi thử lại.');
    }
    if (!list.error) notifiedError.current = false;
  }, [list.error]);

  /**
   * Phiên đang xem được SUY RA, không đồng bộ bằng effect: phiên đã chọn nếu nó còn trong danh
   * sách, ngược lại là phiên mới nhất. Nhờ vậy đổi bộ lọc kế hoạch tự nhảy sang phiên mới nhất
   * của kế hoạch đó mà không cần một lượt render trung gian nào chọn nhầm phiên của kế hoạch cũ.
   */
  const selected = selectInterviewSession(list.sessions, selectedId);

  const isEmpty = !list.loading && !list.error && list.sessions.length === 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <label htmlFor="history-scope" className="text-muted-foreground text-[13px]">
          Phạm vi
        </label>
        <select
          id="history-scope"
          value={planId ?? ''}
          onChange={(event) => setPlanId(event.target.value === '' ? null : event.target.value)}
          className="border-border bg-card text-foreground focus-visible:ring-ring/50 rounded-md border px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2"
        >
          <option value="">Tất cả kế hoạch</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </div>

      {isEmpty ? (
        <NoSessionsYet filtered={planId !== null} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[312px_minmax(0,1fr)]">
          {/* Tô đậm theo phiên ĐANG hiện ở panel, không theo `selectedId` thô: hai thứ khác nhau
              đúng lúc phiên đã chọn không còn trong danh sách. */}
          <SessionList
            sessions={list.sessions}
            selectedId={selected?.id ?? null}
            onSelect={(session) => setSelectedId(session.id)}
            loading={list.loading}
            loadingMore={list.loadingMore}
            error={list.error}
            hasMore={list.hasMore}
            onLoadMore={list.loadMore}
            onRetry={list.reload}
          />

          {selected ? (
            <SessionDetailPanel
              session={selected}
              // Kết thúc một phiên tạm dừng đổi `status` của chính hàng đang chọn, nên phải
              // nạp lại danh sách — không thì hàng bên trái vẫn ghi "Đang tạm dừng" trong khi
              // panel bên phải đã là phiên đã đóng.
              onSessionChanged={list.reload}
            />
          ) : (
            <NoSelection />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mockup không vẽ trạng thái này (danh sách của nó luôn có sẵn một mục đang chọn), nhưng nó
 * tới được thật: danh sách đang tải xong thì chưa có gì được chọn trong một nhịp render.
 */
function NoSelection() {
  return (
    <section className="bg-card border-border text-muted-foreground rounded-xl border px-[26px] py-14 text-center text-[13.5px]">
      Chọn một phiên bên trái để xem điểm từng khái niệm và bản ghi hỏi–đáp.
    </section>
  );
}

/**
 * Tab "Phiên học" (DB-08 · #247) — một khung nhìn khác hẳn tab bên cạnh: UC-10 nhóm theo ngày và
 * cộng thời gian, không chấm điểm.
 *
 * ⚠️ Nhãn tab **không mang số đếm**, khác mockup (nó vẽ `Phiên học 23`). `GET /focus-sessions`
 * không trả `total` — y hệt `/interviews` — nên con số duy nhất suy được là "số phiên ĐÃ TẢI",
 * và nó sẽ nhảy mỗi lần bấm "Xem thêm". Tab Phiên kiểm tra cạnh bên cũng đã ship không có số;
 * bật số cho riêng một tab còn tệ hơn là cả hai đều không có. Xem ghi chú trong PR.
 */
function FocusHistoryTab({ plans }: { plans: readonly PlanSummary[] }) {
  const list = useFocusSessionList();

  const planNameById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan.name])), [plans]);

  // Cùng quy ước với tab Phiên kiểm tra (AC #246): lỗi mạng báo bằng toast, nút "Thử lại" nằm
  // trong khối lỗi của danh sách. Chỉ báo một lần cho mỗi lần hỏng.
  const notifiedError = useRef(false);
  useEffect(() => {
    if (list.error && !notifiedError.current) {
      notifiedError.current = true;
      toast.error('Không tải được lịch sử phiên học. Kiểm tra kết nối rồi thử lại.');
    }
    if (!list.error) notifiedError.current = false;
  }, [list.error]);

  if (!list.loading && !list.error && list.sessions.length === 0) {
    return <NoFocusSessionsYet />;
  }

  return (
    <FocusSessionList
      sessions={list.sessions}
      planNameById={planNameById}
      loading={list.loading}
      loadingMore={list.loadingMore}
      error={list.error}
      hasMore={list.hasMore}
      onLoadMore={list.loadMore}
      onRetry={list.reload}
    />
  );
}
