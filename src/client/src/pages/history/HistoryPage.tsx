import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAsyncResource } from '@/features/dashboard/hooks/useAsyncResource';
import { planApi } from '@/features/study-planner/api/plan.api';
import { SessionList } from '@/features/history/components/SessionList';
import { SessionDetailPanel } from '@/features/history/components/SessionDetailPanel';
import { FocusSessionList } from '@/features/history/components/FocusSessionList';
import { CurrentFocusSession } from '@/features/history/components/CurrentFocusSession';
import { NoFocusSessionsYet, NoSessionsYet } from '@/features/history/components/NoSessionsYet';
import { useFocusSessionList } from '@/features/history/hooks/useFocusSessionList';
import { useSessionList } from '@/features/history/hooks/useSessionList';
import { selectInterviewSession } from '@/features/history/utils/select-session';
import {
  focusSessionApi,
  getFocusSessionErrorMessage,
  isTerminalFocusSessionError,
} from '@/features/focus/api/focus.api';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import { Heading } from '@/components/ui/heading';

/**
 * Trang "Lịch sử & Tiến độ" (DB-03 · #246).
 *
 * Nơi kiểm lại điểm số SAU khi phiên đã kết thúc — phần lịch sử không sinh điểm, chỉ trình bày
 * lại. Ngoại lệ duy nhất có mutation là khối phiên Focus đang chạy (#374): người dùng có thể hủy
 * một orphan không còn snapshot để thoát chốt `SESSION_ALREADY_RUNNING`.
 *
 * Khung hai tab dùng chung với DB-08 (lịch sử phiên Focus). Cả hai tab nay đã có nội dung thật:
 * tab "Phiên học" (#247) gọi `GET /focus-sessions`, và nó gọi **ngay khi mở màn** — không đợi
 * người dùng bấm sang — vì `forceMount` giữ cả hai panel sống để đổi tab không mất trạng thái
 * (#450). Đánh đổi đó được ghim bằng test, xem khối comment ở `<TabsContent>` bên dưới.
 *
 * Hệ quả của việc tải sớm: một tab CHƯA được mở vẫn có thể hỏng, nên nó không được phép nói ra
 * bằng toast — xem `active` ở `FocusHistoryTab`.
 */
export default function HistoryPage() {
  /**
   * `/plans` nạp MỘT lần ở cấp trang rồi truyền xuống cả hai tab: tab Phiên kiểm tra cần nó cho
   * bộ lọc phạm vi, tab Phiên học cần nó để tra tên kế hoạch (payload `/focus-sessions` chỉ
   * mang `planId`). Để mỗi tab tự nạp thì đổi qua đổi lại giữa hai tab là mỗi lần một request
   * cho cùng một danh sách — và #400 đã ghi thành luật: không nhân đôi metadata kế hoạch.
   */
  const plans = useAsyncResource(() => planApi.listPlans());

  /**
   * Tab đang mở phải là STATE, không để Radix tự giữ: `FocusHistoryTab` cần biết nó có đang
   * được nhìn hay không để quyết định có bật toast lỗi hay không (#450). `defaultValue` không
   * cho ai đọc giá trị đó.
   */
  const [tab, setTab] = useState('interview');

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <header className="mb-[18px]">
        <Heading as="h1" size="page" className="m-0">
          Lịch sử &amp; Tiến độ
        </Heading>
        <p className="text-muted-foreground mt-[7px] max-w-[62ch] text-[13.5px] leading-[1.6]">
          Nơi kiểm lại điểm số sau khi phiên đã kết thúc: điểm nào tính ra sao, khái niệm nào nhích
          lên, và hệ thống đã chèn gì vào lịch vì kết quả đó.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="mb-5">
          <TabsTrigger value="interview">Phiên kiểm tra</TabsTrigger>
          <TabsTrigger value="focus">Phiên học</TabsTrigger>
        </TabsList>

        {/* `forceMount` + ẩn bằng CSS thay vì để Radix unmount — cùng khuôn `PlansPage` đã dùng
            từ #436, và ở đây cần cho CẢ HAI tab chứ không chỉ tab phụ: Radix unmount tab không
            hoạt động, nên đi từ tab mặc định sang tab kia rồi quay về cũng mất trạng thái.

            Đo LIVE ở review PR #441: tải thêm lên 33 hàng → đổi tab → quay lại → còn 20 hàng
            cộng một `GET ?offset=0` nữa. Hai hook danh sách không có cache, nên mỗi lần quay lại
            là một trang đầu mới và người dùng mất đúng chỗ đang đọc. Giữ mount là cách duy nhất
            để các trang đã tải, phiên đang chọn và bộ lọc phạm vi cùng sống qua lần đổi tab.

            Giá phải trả, ghi thẳng ra: `GET /focus-sessions` bắn ngay khi mở màn kể cả khi người
            dùng không bấm sang tab Phiên học — MỘT request thay vì N request mỗi lần đổi tab.
            Cùng đánh đổi PlansPage đã chấp nhận cho `GET /review-queue/schedule`. */}
        <TabsContent value="interview" forceMount className="data-[state=inactive]:hidden">
          <InterviewHistoryTab plans={plans.data ?? []} active={tab === 'interview'} />
        </TabsContent>

        <TabsContent value="focus" forceMount className="data-[state=inactive]:hidden">
          <FocusHistoryTab plans={plans.data ?? []} active={tab === 'focus'} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InterviewHistoryTab({
  plans,
  active,
}: {
  plans: readonly PlanSummary[];
  /** Xem `active` ở `FocusHistoryTab` — cùng một lý do, cùng một hình dạng. */
  active: boolean;
}) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useSessionList(planId);

  // AC #246: lỗi mạng báo bằng toast kèm đường "Thử lại" (nút nằm trong khối lỗi của danh
  // sách). Chỉ báo một lần cho mỗi lần hỏng — `notified` giữ nguyên qua các lần render lại nên
  // toast không bắn lại mỗi khi đổi phiên đang chọn.
  //
  // `active` giống hệt tab kia. Cửa sổ hẹp hơn — tab này là tab mặc định nên thường đang hiện
  // lúc `/interviews` về — nhưng vẫn tới được: bấm sang tab Phiên học trong lúc request còn bay
  // rồi nó hỏng. Hẹp không phải lý do để chừa, và một bản vá đối xứng chỉ áp một nửa còn tệ hơn:
  // hai tab cạnh nhau trong cùng một tệp mang hai luật khác nhau mà không gì nói vì sao.
  const notifiedError = useRef(false);
  useEffect(() => {
    if (list.error && active && !notifiedError.current) {
      notifiedError.current = true;
      toast.error('Không tải được danh sách phiên kiểm tra. Kiểm tra kết nối rồi thử lại.');
    }
    if (!list.error) notifiedError.current = false;
  }, [active, list.error]);

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
function FocusHistoryTab({
  plans,
  active,
}: {
  plans: readonly PlanSummary[];
  /** Tab này có đang được nhìn không. Chỉ quyết định TOAST, không quyết định việc tải. */
  active: boolean;
}) {
  const list = useFocusSessionList();
  const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);

  const planNameById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan.name])), [plans]);
  const currentSession = list.sessions.find((session) => session.status === 'running') ?? null;
  const historySessions = list.sessions.filter((session) => session.status !== 'running');

  const cancelCurrentSession = async () => {
    if (!currentSession || cancellingSessionId) return;
    setCancellingSessionId(currentSession.id);
    try {
      // Không có snapshot/timer của thiết bị đã tạo phiên, nên không được suy diễn thời gian tập
      // trung từ wall-clock. `cancelled` + 0 giải phóng chốt mà không ghi nhận thời gian ảo.
      await focusSessionApi.end(currentSession.id, {
        status: 'cancelled',
        focusedSeconds: 0,
      });
      toast.success('Đã hủy phiên đang chạy. Bạn có thể bắt đầu phiên học mới.');
      list.reload();
    } catch (error) {
      toast.error(getFocusSessionErrorMessage(error));
      // 4xx nghĩa là trạng thái server đã đổi hoặc request không thể retry nguyên trạng (thường
      // là phiên đã được thiết bị khác kết thúc). Nạp lại để không giữ một card `running` cũ.
      if (isTerminalFocusSessionError(error)) list.reload();
    } finally {
      setCancellingSessionId(null);
    }
  };

  // Cùng quy ước với tab Phiên kiểm tra (AC #246): lỗi mạng báo bằng toast, nút "Thử lại" nằm
  // trong khối lỗi của danh sách. Chỉ báo một lần cho mỗi lần hỏng.
  //
  // `active` vì `forceMount` làm tab này tải ngay khi mở màn (#450): không có nó thì toast nổ về
  // một tab người dùng CHƯA bấm vào, và nút "Thử lại" mà nó bảo bấm thì đang nằm trong panel ẩn
  // — đo LIVE: `rect 0×0`, `checkVisibility()` false, không nhận được focus. Toast sống ≥3s rồi
  // tự tắt, để lại một lời khuyên không thi hành được.
  //
  // 🔴 Gate ĐÚNG nhánh toast, KHÔNG gate cả effect — nhưng lý do KHÔNG phải "cờ bị khoá".
  // `notifiedError.current = true` nằm TRONG nhánh toast, nên một early-return ở đầu bỏ qua cả
  // nhánh và cờ không hề được đặt. (Đo được: đột biến early-return sống 500/500; dựng đúng thế
  // giới mà cơ chế "khoá cờ" mô tả thì mới đỏ — tức cơ chế ấy không xảy ra được.)
  //
  // Thứ early-return THẬT SỰ làm mất là dòng reset chạy khi một lần tải **thành công** về lúc
  // tab đang ẩn. Hôm nay chuỗi phân biệt hai hình dạng không dựng nổi, và nó đóng nhờ một chi
  // tiết mỏng: `loadMore` cố ý KHÔNG set `error` ở cả hai hook, nên `error` chỉ đổi qua một lần
  // `reload` — mà `reload` chỉ bấm được từ panel đang hiện. Cho `loadMore` set `error` (một sửa
  // trông rất vô hại) là chuỗi ấy mở ra ngay. Giữ hình dạng hẹp vì nó không tốn gì, và vì cái
  // giữ nó đóng nằm ở tệp khác.
  //
  // 🔴 `active` PHẢI nằm trong deps. Thiếu nó thì lúc người dùng bấm sang đây, effect không chạy
  // lại và lỗi có thật không bao giờ được nói ra.
  const notifiedError = useRef(false);
  useEffect(() => {
    if (list.error && active && !notifiedError.current) {
      notifiedError.current = true;
      toast.error('Không tải được lịch sử phiên học. Kiểm tra kết nối rồi thử lại.');
    }
    if (!list.error) notifiedError.current = false;
  }, [active, list.error]);

  if (!list.loading && !list.error && list.sessions.length === 0) {
    return <NoFocusSessionsYet />;
  }

  return (
    <div className="space-y-4">
      {currentSession && (
        <CurrentFocusSession
          session={currentSession}
          planLabel={
            currentSession.planId === null
              ? 'Phiên tự do'
              : (planNameById.get(currentSession.planId) ?? null)
          }
          isCancelling={cancellingSessionId === currentSession.id}
          onCancel={() => void cancelCurrentSession()}
        />
      )}

      {(historySessions.length > 0 || list.loading || list.error) && (
        <FocusSessionList
          sessions={historySessions}
          planNameById={planNameById}
          loading={list.loading}
          loadingMore={list.loadingMore}
          error={list.error}
          hasMore={list.hasMore}
          onLoadMore={list.loadMore}
          onRetry={list.reload}
        />
      )}
    </div>
  );
}
