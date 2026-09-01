import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScheduleView } from '@/features/schedule/components/ScheduleView';
import { PlanCard } from '@/features/study-planner/components/PlanCard';
import { planApi } from '@/features/study-planner/api/plan.api';
import { PlanStatus, PlanSummary } from '@/features/study-planner/types/concept';

/**
 * SP-03 — Danh sách kế hoạch ôn tập.
 *
 * The home of the "Kế hoạch ôn tập" nav item, and deliberately not the dashboard: the
 * dashboard only summarises plans that are active, which leaves a plan still being analysed
 * — and every archived one — with nowhere to live. A student who walks away from the create
 * screen would otherwise lose track of their own background job.
 */

/**
 * The three tabs are the three values of `StudyPlanStatus`, not a list invented here.
 *
 * `draft` is labelled by what the student still owes it, not by the analysis: since #265 a
 * plan stays `draft` until its concept graph is confirmed, so this tab holds plans that are
 * being analysed, that failed, and — most often — that are done and waiting to be checked.
 */
const TABS = [
  { status: 'active', label: 'Đang hoạt động' },
  { status: 'draft', label: 'Chưa xác nhận' },
  { status: 'archived', label: 'Đã lưu trữ' },
] as const satisfies readonly { status: PlanStatus; label: string }[];

/**
 * Hai view của `/plans` (#400). Lịch đứng trước vì nó là view trả lời được câu "hôm nay học gì",
 * còn lưới thẻ chỉ trả lời "mình đã tạo được bao nhiêu kế hoạch".
 */
const VIEWS = [
  { value: 'schedule', label: 'Lịch' },
  { value: 'plans', label: 'Kế hoạch' },
] as const;

type ViewValue = (typeof VIEWS)[number]['value'];

/** Radix trả `string`; thu hẹp bằng chính `VIEWS` để không có nhánh dự phòng nào nuốt giá trị lạ. */
function isViewValue(value: string): value is ViewValue {
  return VIEWS.some((view) => view.value === value);
}

/**
 * Lịch là view mặc định — quyết định của epic #400, và tới #405 mới **an toàn** để bật.
 *
 * Hai lý do hoãn trước đây đều đã hết, theo thứ tự:
 * - #401 hoãn vì lưới còn rỗng ⇒ mở thẳng vào Lịch là màn trắng. #404 đổ nội dung vào lưới.
 * - #404 hoãn vì ca **tài khoản chỉ có kế hoạch `draft`**: `hasNoPlansAtAll` là `false` nên
 *   `<Tabs>` vẫn render, nhưng `review-schedule.service.ts` lọc `plan.status === 'active'` ⇒ kế
 *   hoạch `draft` góp 0 mục ⇒ lịch rỗng **theo định nghĩa**, còn badge `Chưa xác nhận 1` thì nằm
 *   trong `TabsContent value="plans"` nên không nhìn thấy. Bật cờ lúc đó là tái tạo đúng hồi quy
 *   đã đo ở PR #409: người dùng mất bằng chứng duy nhất trên màn rằng họ CÓ kế hoạch.
 *
 * #405 chữa đúng ca đó bằng banner "N kế hoạch chưa xác nhận đồ thị" — nó đếm `plans` (chứ không
 * đếm mục lịch, vốn bằng 0 ở đây) và `onShowDraftPlans` đưa thẳng sang tab "Chưa xác nhận". Nên
 * điều kiện để bật cờ không phải "lưới đã có nội dung" mà là "lịch rỗng vẫn nói được vì sao nó
 * rỗng và cho đi tiếp" — và đó là thứ ghim ở `PlansPage.test.tsx`, không phải ở dòng này.
 */
const DEFAULT_VIEW: ViewValue = 'schedule';

const POLL_INTERVAL_MS = 2500;
const CLOCK_INTERVAL_MS = 1000;

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [activeTab, setActiveTab] = useState<PlanStatus>('active');
  const [view, setView] = useState<ViewValue>(DEFAULT_VIEW);
  const [isRetryingPlans, setIsRetryingPlans] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [planPendingDelete, setPlanPendingDelete] = useState<PlanSummary | null>(null);
  const [now, setNow] = useState(() => new Date());

  /** Refresh used by polling and by every mutation; the mount fetch below shares its shape. */
  const loadPlans = useCallback(async (): Promise<void> => {
    try {
      setPlans(await planApi.listPlans());
      setHasError(false);
    } catch (error) {
      console.error('Failed to load plans', error);
      setHasError(true);
    }
  }, []);

  /** Retry của nguồn `/plans` không được tháo màn Lịch đã tải xong hoặc reset state của nó. */
  const retryPlans = useCallback(async (): Promise<void> => {
    setIsRetryingPlans(true);
    try {
      await loadPlans();
    } finally {
      setIsRetryingPlans(false);
    }
  }, [loadPlans]);

  /**
   * Điểm vào của #405: banner trên lịch đưa người dùng sang đúng chỗ xác nhận đồ thị. Đổi HAI
   * state cùng lúc và cả hai sống ở đây, nên nó phải đi từ trên xuống — đó cũng là lý do `<Tabs>`
   * bên dưới là controlled chứ không còn `defaultValue`.
   */
  const showDraftPlans = useCallback(() => {
    setView('plans');
    setActiveTab('draft');
  }, []);

  useEffect(() => {
    let isMounted = true;
    planApi
      .listPlans()
      .then((data) => {
        if (!isMounted) return;
        setPlans(data);
        setHasError(false);
      })
      .catch((error: unknown) => {
        console.error('Failed to load plans', error);
        if (isMounted) setHasError(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const isAnyAnalysing = useMemo(
    () =>
      (plans ?? []).some(
        (p) => p.analysisStatus === 'pending' || p.analysisStatus === 'processing'
      ),
    [plans]
  );

  // Poll only while a job is actually running — SP-06's background analysis is the one thing
  // on this screen that changes without the user doing anything.
  useEffect(() => {
    if (!isAnyAnalysing) return;
    const id = setInterval(() => void loadPlans(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAnyAnalysing, loadPlans]);

  // A separate, faster tick so the elapsed clock counts smoothly between polls.
  useEffect(() => {
    if (!isAnyAnalysing) return;
    const id = setInterval(() => setNow(new Date()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAnyAnalysing]);

  const counts = useMemo(() => {
    const base: Record<PlanStatus, number> = { active: 0, draft: 0, archived: 0 };
    for (const plan of plans ?? []) base[plan.status] += 1;
    return base;
  }, [plans]);

  const visiblePlans = useMemo(
    () => (plans ?? []).filter((p) => p.status === activeTab),
    [plans, activeTab]
  );

  /** Every mutation is the same shape: lock the card, call, reload, report. */
  const runPlanAction = async (plan: PlanSummary, action: () => Promise<void>, success: string) => {
    setBusyPlanId(plan.id);
    try {
      await action();
      await loadPlans();
      toast.success(success);
    } catch (error) {
      console.error('Plan action failed', error);
      toast.error('Không thực hiện được. Kế hoạch có thể đã đổi trạng thái — hãy tải lại trang.');
    } finally {
      setBusyPlanId(null);
    }
  };

  const handleArchive = (plan: PlanSummary) =>
    runPlanAction(plan, () => planApi.setPlanStatus(plan.id, 'archived'), 'Đã lưu trữ kế hoạch.');

  const handleRestore = (plan: PlanSummary) =>
    runPlanAction(plan, () => planApi.setPlanStatus(plan.id, 'active'), 'Đã khôi phục kế hoạch.');

  const handleReanalyze = (plan: PlanSummary) =>
    runPlanAction(
      plan,
      () => planApi.reanalyzePlan(plan.id),
      'Đang phân tích lại — điểm thành thạo của các khái niệm cũ được giữ nguyên.'
    );

  const handleConfirmDelete = async () => {
    const plan = planPendingDelete;
    if (!plan) return;
    setPlanPendingDelete(null);
    await runPlanAction(plan, () => planApi.deletePlan(plan.id), 'Đã xóa kế hoạch.');
  };

  // ---------- Loading ----------
  // Only the very first fetch shows a bare spinner. A failed initial load is handled inside
  // the layout below (not with an early return) so the header — and with it "Tạo kế hoạch
  // mới" — stays reachable: a list that won't load is no reason to block making a new plan.
  if (plans === null && !hasError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  // A poll that fails after plans are already on screen keeps the stale-but-useful list
  // (`loadPlans` never nulls `plans`). Chỉ initial load hỏng mới đưa view Kế hoạch vào error;
  // view Lịch vẫn render vì nguồn `/schedule` độc lập.
  const showLoadError = hasError && plans === null;
  // `null` là "không biết" chứ không phải danh sách rỗng. Chỉ response `[]` thật mới được đưa
  // người dùng vào onboarding 0 kế hoạch; lỗi `/plans` vẫn phải để màn Lịch độc lập sống.
  const hasNoPlansAtAll = plans !== null && plans.length === 0;

  return (
    <div>
      {/* No subtitle: the mockup's paragraph here explains to a reviewer why this screen
          exists separately from the dashboard, which is not something a student needs told.
          The title and the three tabs already say what the page holds. */}
      <header className="mb-6.5 flex flex-wrap items-center justify-between gap-6">
        <h1 className="font-heading text-[30px] leading-[1.15] tracking-[-0.02em]">
          Kế hoạch ôn tập
        </h1>
        <Button asChild>
          <Link to="/plan/new">
            <Plus />
            Tạo kế hoạch mới
          </Link>
        </Button>
      </header>

      {hasNoPlansAtAll ? (
        <EmptyState />
      ) : (
        /* Bộ chuyển view — CỐ Ý nhìn khác dải tab trạng thái ngay bên dưới (pill trên nền
           `--muted` vs. gạch chân): hai control này lọc hai thứ khác nhau, và nếu chúng trông
           giống nhau thì `Lịch / Kế hoạch` sẽ bị đọc thành một bộ lọc trạng thái thứ hai. Dải tab
           trạng thái vẫn là `role="tablist"` viết tay như trước — nó đang chạy đúng, không thay. */
        <Tabs
          value={view}
          onValueChange={(value) => {
            if (isViewValue(value)) setView(value);
          }}
        >
          <TabsList aria-label="Chế độ xem" className="mb-2 rounded-full">
            {VIEWS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="px-4.5 rounded-full text-[12.5px] font-semibold"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* `forceMount` + ẩn bằng CSS thay vì để Radix unmount. Đo LIVE ở PR #412: mỗi lần
              bấm sang view Lịch là một `GET /review-queue/schedule` MỚI (đếm 1 → 2 → 3 qua ba
              vòng), và vì con bị unmount nên `monthCursor`, ngày đang chọn, panel đang mở đều
              reset. Giữ mount là cách duy nhất để hai thứ đó cùng sống. Giá phải trả: lịch tải
              ngay khi mở `/plans`, kể cả khi người dùng không bấm sang — một request thay vì N. */}
          <TabsContent value="schedule" forceMount className="data-[state=inactive]:hidden">
            <ScheduleView
              plans={plans}
              isPlansLoading={isRetryingPlans}
              onRetryPlans={() => void retryPlans()}
              onShowDraftPlans={showDraftPlans}
            />
          </TabsContent>

          <TabsContent value="plans">
            {showLoadError ? (
              <LoadErrorNotice isLoading={isRetryingPlans} onRetry={() => void retryPlans()} />
            ) : (
              <>
                <div
                  role="tablist"
                  aria-label="Lọc theo trạng thái"
                  className="border-border mb-5.5 flex items-center gap-1.5 border-b"
                >
                  {TABS.map(({ status, label }) => (
                    <button
                      key={status}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === status}
                      onClick={() => setActiveTab(status)}
                      className={`-mb-px cursor-pointer border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                        activeTab === status
                          ? 'border-foreground text-foreground'
                          : 'text-muted-foreground hover:text-foreground border-transparent'
                      }`}
                    >
                      {label}
                      <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                        {counts[status]}
                      </span>
                    </button>
                  ))}
                </div>

                {visiblePlans.length === 0 ? (
                  <p className="text-muted-foreground py-10 text-center text-sm">
                    {activeTab === 'active' && 'Chưa có kế hoạch nào đang hoạt động.'}
                    {activeTab === 'draft' && 'Không có kế hoạch nào đang chờ xác nhận.'}
                    {activeTab === 'archived' && 'Chưa lưu trữ kế hoạch nào.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-4">
                    {visiblePlans.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        now={now}
                        isBusy={busyPlanId === plan.id}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onReanalyze={handleReanalyze}
                        onDelete={setPlanPendingDelete}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Deleting cascades through interview history, focus sessions and the review queue,
          so it is spelled out rather than confirmed with a generic "Are you sure?". */}
      <Dialog
        open={planPendingDelete !== null}
        onOpenChange={(open) => !open && setPlanPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa &ldquo;{planPendingDelete?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Xóa vĩnh viễn cả đồ thị khái niệm, lịch sử vấn đáp, phiên Focus và hàng đợi ôn tập của
              kế hoạch này. Không thể hoàn tác. Nếu chỉ muốn cất đi, hãy dùng &ldquo;Lưu trữ&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void handleConfirmDelete()}>
              Xóa vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Hiện riêng trong view Kế hoạch khi initial list fetch hỏng. Header vẫn có "Tạo kế hoạch mới",
 * nên khối này chỉ giải thích lỗi và cho retry — không thay mặt cả trang hoặc màn Lịch.
 */
function LoadErrorNotice({ onRetry, isLoading }: { onRetry: () => void; isLoading: boolean }) {
  return (
    <div className="border-border bg-background rounded-xl border px-7 py-6">
      <div className="max-w-140 mx-auto my-6 text-center">
        <h2 className="font-heading mb-2 text-[21px] tracking-[-0.02em]">
          Không thể tải danh sách kế hoạch
        </h2>
        <p className="text-muted-foreground mb-5 text-pretty text-[13.5px] leading-[1.7]">
          Đã xảy ra lỗi khi tải danh sách. Bạn vẫn có thể tạo kế hoạch mới ở trên, hoặc thử tải lại.
        </p>
        <Button variant="outline" disabled={isLoading} onClick={onRetry}>
          {isLoading && <Loader2 className="animate-spin" />}
          Thử lại
        </Button>
      </div>
    </div>
  );
}

/**
 * The first screen a new user sees. No decorative illustration: it states the three things
 * the system will do with a document, because that is what makes uploading one worth it.
 */
function EmptyState() {
  return (
    <div className="border-border bg-background rounded-xl border px-7 py-6">
      <div className="max-w-140 mx-auto my-6 text-center">
        <div className="text-muted-foreground mb-4.5 flex justify-center opacity-55">
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="5.5" cy="12" r="2.4" />
            <circle cx="12" cy="5.6" r="2.4" />
            <circle cx="12" cy="18.4" r="2.4" />
            <circle cx="18.5" cy="12" r="2.4" />
            <path d="M7.6 10.6l2.4-2.6M7.6 13.4l2.4 2.6M14.2 7.6l2.5 2.6M14.2 16.4l2.5-2.6" />
          </svg>
        </div>
        <h2 className="font-heading mb-2 text-[21px] tracking-[-0.02em]">
          Chưa có kế hoạch ôn tập nào
        </h2>
        <p className="text-muted-foreground mb-5 text-pretty text-[13.5px] leading-[1.7]">
          Tải lên một chương bài giảng, hệ thống sẽ tách nó thành các khái niệm, tìm khái niệm nào
          là nền của khái niệm nào, rồi xếp lịch ôn theo đúng thứ tự đó.
        </p>
        <Button asChild>
          <Link to="/plan/new">Tạo kế hoạch đầu tiên</Link>
        </Button>
      </div>
    </div>
  );
}
