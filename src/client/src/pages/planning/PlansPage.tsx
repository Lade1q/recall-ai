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

/** The three tabs are the three values of `StudyPlanStatus`, not a list invented here. */
const TABS = [
  { status: 'active', label: 'Đang hoạt động' },
  { status: 'draft', label: 'Đang phân tích' },
  { status: 'archived', label: 'Đã lưu trữ' },
] as const satisfies readonly { status: PlanStatus; label: string }[];

const POLL_INTERVAL_MS = 2500;
const CLOCK_INTERVAL_MS = 1000;

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [activeTab, setActiveTab] = useState<PlanStatus>('active');
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

  // ---------- Loading / error ----------
  if (plans === null && !hasError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (hasError && plans === null) {
    return (
      <div className="bg-card border-border rounded-xl border p-6">
        <h1 className="font-heading mb-2 text-2xl tracking-tight">Kế hoạch ôn tập</h1>
        <p className="text-muted-foreground mb-4 text-sm">Không thể tải danh sách kế hoạch.</p>
        <Button variant="outline" onClick={() => void loadPlans()}>
          Thử lại
        </Button>
      </div>
    );
  }

  const hasNoPlansAtAll = (plans ?? []).length === 0;

  return (
    <div>
      {/* No subtitle: the mockup's paragraph here explains to a reviewer why this screen
          exists separately from the dashboard, which is not something a student needs told.
          The title and the three tabs already say what the page holds. */}
      <header className="mb-[26px] flex flex-wrap items-center justify-between gap-6">
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
        <>
          <div
            role="tablist"
            aria-label="Lọc theo trạng thái"
            className="border-border mb-[22px] flex items-center gap-1.5 border-b"
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
              {activeTab === 'draft' && 'Không có kế hoạch nào đang chờ phân tích.'}
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
 * The first screen a new user sees. No decorative illustration: it states the three things
 * the system will do with a document, because that is what makes uploading one worth it.
 */
function EmptyState() {
  return (
    <div className="border-border bg-background rounded-xl border px-7 py-6">
      <div className="mx-auto my-6 max-w-[560px] text-center">
        <div className="text-muted-foreground mb-[18px] flex justify-center opacity-55">
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
