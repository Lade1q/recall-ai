import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ConceptGraph } from '@/features/study-planner/components/ConceptGraph';
import { AnalysisProgressPanel } from '@/features/study-planner/components/AnalysisProgressPanel';
import {
  planApi,
  getRetryErrorMessage,
  getChangeDocumentErrorMessage,
} from '@/features/study-planner/api/plan.api';
import {
  PlanDetails,
  PlanStatus,
  PlanSummary,
  Concept,
  ConceptEdge,
} from '@/features/study-planner/types/concept';
import { formatDeadlineFull } from '@/features/study-planner/utils/planDates';

/** Dấu ">" ngăn cách các mốc breadcrumb — tách ra để không lặp 4 lần cùng một khối svg. */
function BreadcrumbSep() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 opacity-50"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Validate mode thực tế thay vì dùng `as` cast
  const rawMode = searchParams.get('mode');
  const mode: 'view' | 'edit' = rawMode === 'edit' ? 'edit' : 'view';

  const [plan, setPlan] = useState<PlanDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // DB-02 Alt flow 2 — lỗi tải đồ thị (khác với "phân tích thất bại", vốn là plan.analysisStatus
  // === 'failed' và vẫn có dữ liệu draft để sửa). Đây là request GET /plans/:id tự nó lỗi.
  const [hasLoadError, setHasLoadError] = useState(false);
  // Bộ chọn kế hoạch trên toolbar (DB-05) — đổi phạm vi tại chỗ, không quay về dashboard.
  const [planList, setPlanList] = useState<PlanSummary[] | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isChangingDocument, setIsChangingDocument] = useState(false);
  const changeDocumentInputRef = useRef<HTMLInputElement>(null);
  // Held true for a beat after the job finishes, so the progress panel's last phase gets to
  // show its checkmark instead of the graph replacing it in the same instant (analysisStatus
  // flipping to 'done' already makes analysisRunning false on the very next render).
  const [isCompletionPause, setIsCompletionPause] = useState(false);

  // Dùng ref để tránh vòng lặp vô hạn khi setSearchParams
  const hasAutoSwitchedToEdit = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isMountedRef = useRef(true);
  // Tracks the previous poll's status without the staleness a closed-over `plan` would have
  // across recursive fetchPlan calls — needed to tell "just finished" apart from "was already done".
  const prevAnalysisStatusRef = useRef<PlanDetails['analysisStatus']>(undefined);
  // StrictMode double-invokes the effect below in dev, which — because isMountedRef flips back
  // to true before the first pass's in-flight request resolves — used to leave TWO independent
  // polling chains racing on prevAnalysisStatusRef (whichever wrote 'done' last made the other
  // see wasRunning=false, skipping the completion pause entirely). Each effect run stamps a new
  // generation; a chain whose generation has gone stale stops silently instead of continuing.
  const pollGenerationRef = useRef(0);

  // Function declaration (không phải useCallback) để tự đệ quy khi polling và để
  // handleRetry gọi lại được, resume vòng poll sau khi POST /retry trả 202.
  async function fetchPlan(generation: number) {
    if (!id) return;
    try {
      const data = await planApi.getPlan(id);
      if (!isMountedRef.current || generation !== pollGenerationRef.current) return;

      setHasLoadError(false);
      const wasRunning =
        prevAnalysisStatusRef.current === 'pending' ||
        prevAnalysisStatusRef.current === 'processing';
      prevAnalysisStatusRef.current = data.analysisStatus;

      setPlan(data);

      // Auto-switch draft plan sang edit mode (chỉ 1 lần duy nhất)
      if (data.status === 'draft' && rawMode !== 'edit' && !hasAutoSwitchedToEdit.current) {
        hasAutoSwitchedToEdit.current = true;
        setSearchParams({ mode: 'edit' }, { replace: true });
      }

      if (data.analysisStatus === 'pending' || data.analysisStatus === 'processing') {
        timeoutRef.current = setTimeout(() => fetchPlan(generation), 2500);
      } else {
        if (data.analysisStatus === 'failed') {
          toast.error('Phân tích tài liệu thất bại (lỗi AI). Vui lòng thử lại.');
        }
        if (data.analysisStatus === 'done' && wasRunning) {
          setIsCompletionPause(true);
          setTimeout(() => {
            if (!isMountedRef.current || generation !== pollGenerationRef.current) return;
            setIsCompletionPause(false);
            setIsLoading(false);
          }, 800);
        } else {
          setIsLoading(false);
        }
      }
    } catch (error) {
      if (!isMountedRef.current || generation !== pollGenerationRef.current) return;
      console.error('Failed to load plan', error);
      toast.error('Không thể tải dữ liệu kế hoạch.');
      setHasLoadError(true);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const generation = ++pollGenerationRef.current;

    async function start() {
      setIsLoading(true);
      await fetchPlan(generation);
    }
    start();

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ re-fetch khi id thay đổi
  }, [id]);

  // Danh sách kế hoạch cho bộ chọn trên toolbar (DB-05) — lỗi ở đây không chặn màn hình
  // chính, chỉ khiến bộ chọn không có gì để hiện.
  useEffect(() => {
    let isMounted = true;
    planApi
      .listPlans()
      .then((data) => {
        if (isMounted) setPlanList(data);
      })
      .catch(() => {
        /* bộ chọn kế hoạch sẽ không hiện — không phải lỗi chặn màn hình chính */
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // DB-02 Alt flow 2's "Thử lại" — re-fetches the plan itself, distinct from `handleRetry`
  // below (which re-runs a failed AnalysisJob, a different failure the plan data already
  // describes).
  const handleReloadPlan = () => {
    if (!id) return;
    setIsLoading(true);
    fetchPlan(pollGenerationRef.current);
  };

  const handleRetry = async () => {
    if (!id || isRetrying) return;
    setIsRetrying(true);
    try {
      await planApi.retryPlan(id);
      setIsLoading(true);
      fetchPlan(pollGenerationRef.current);
    } catch (error) {
      console.error('Failed to retry plan analysis', error);
      toast.error(getRetryErrorMessage(error));
      // Đồng bộ lại trạng thái thật — tránh kẹt UI nếu plan đã đổi trạng thái ở nơi khác.
      fetchPlan(pollGenerationRef.current);
    } finally {
      setIsRetrying(false);
    }
  };

  // "Đổi tài liệu khác" (#187) — for when retry alone can't help because the original file
  // itself was the problem. Opens the native file picker; the actual request fires from
  // handleChangeDocumentFile once a file is chosen.
  const handleChangeDocumentClick = () => {
    if (isChangingDocument) return;
    changeDocumentInputRef.current?.click();
  };

  const handleChangeDocumentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // Same file picked twice in a row must still fire onChange.
    if (!id || !file) return;

    setIsChangingDocument(true);
    try {
      await planApi.changeDocument(id, file);
      setIsLoading(true);
      fetchPlan(pollGenerationRef.current);
    } catch (error) {
      console.error('Failed to change plan document', error);
      toast.error(getChangeDocumentErrorMessage(error));
      fetchPlan(pollGenerationRef.current);
    } finally {
      setIsChangingDocument(false);
    }
  };

  // Thêm try/catch cho handleConfirmGraph
  const handleConfirmGraph = async (concepts: Concept[], edges: ConceptEdge[]) => {
    if (!id) return;
    try {
      const result = await planApi.updatePlanGraph(id, concepts, edges);
      // After confirming, switch to view mode
      setSearchParams({ mode: 'view' });
      // Update local state to reflect changes
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: (result.data?.status as PlanStatus) || prev.status,
          graph: { concepts, edges },
        };
      });
    } catch (error) {
      console.error('Failed to update plan graph', error);
      toast.error('Không thể lưu đồ thị. Vui lòng thử lại.');
    }
  };

  const analysisStatus = plan?.analysisStatus;
  const analysisRunning = analysisStatus === 'pending' || analysisStatus === 'processing';
  const analysisFailed = analysisStatus === 'failed';
  const analysisDone = !analysisRunning && !analysisFailed;

  // Edit mode có hai ngữ cảnh khác hẳn nhau, phân biệt bằng status:
  //  - `draft`: bước cuối của luồng TẠO kế hoạch (SP-01 → kiểm chứng đồ thị AI đề xuất). Đây mới
  //    là chỗ "Kế hoạch ôn tập › Tạo mới", có stepper 3 bước, tiêu đề "Kiểm chứng".
  //  - đã `active`: người dùng bấm "Sửa đồ thị" từ chính đồ thị (mục nav "Đồ thị khái niệm",
  //    xem isNavItemActive trong MainLayout) — không phải tạo mới, không có bước phân tích nào,
  //    nên không mượn khung tạo mới.
  const isDraft = plan?.status === 'draft';

  // A separate, faster tick so the elapsed clock on the progress panel counts smoothly
  // between the 2.5s polls (same pattern as PlansPage's card clock).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!analysisRunning) return;
    const clockId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockId);
  }, [analysisRunning]);

  // ----------------- EDIT MODE LAYOUT -----------------
  if (mode === 'edit') {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-6">
        <nav className="text-muted-foreground mb-4 flex items-center gap-2 text-[13px]">
          {isDraft ? (
            <>
              {/* Luồng tạo kế hoạch — bắt nguồn từ "Kế hoạch ôn tập" */}
              <button
                onClick={() => navigate('/plans')}
                className="hover:text-foreground hover:border-border border-b border-transparent pb-px transition-colors"
              >
                Kế hoạch ôn tập
              </button>
              <BreadcrumbSep />
              <span className="truncate">Tạo mới · {plan?.name || 'Loading...'}</span>
            </>
          ) : (
            <>
              {/* Sửa đồ thị kế hoạch đã có — thuộc mục "Đồ thị khái niệm", quay lại được đúng
                  đồ thị đang xem thay vì về danh sách kế hoạch */}
              <button
                onClick={() => navigate('/graph')}
                className="hover:text-foreground hover:border-border border-b border-transparent pb-px transition-colors"
              >
                Đồ thị khái niệm
              </button>
              <BreadcrumbSep />
              <button
                onClick={() => setSearchParams({ mode: 'view' })}
                className="hover:text-foreground hover:border-border max-w-60 truncate border-b border-transparent pb-px transition-colors"
              >
                {plan?.name || 'Loading...'}
              </button>
              <BreadcrumbSep />
              <span>Chỉnh sửa</span>
            </>
          )}
        </nav>

        <h1 className="font-heading mb-2 text-[30px] leading-tight tracking-tight">
          {isDraft ? 'Kiểm chứng đồ thị khái niệm' : 'Chỉnh sửa đồ thị khái niệm'}
        </h1>
        <p className="text-muted-foreground max-w-160 mb-7 text-pretty text-[14px] leading-[1.7]">
          {isDraft
            ? 'AI đã đề xuất các khái niệm cùng quan hệ tiên quyết. Đối chiếu từng khái niệm với trích đoạn gốc bên phải rồi mới xác nhận — bước này bắt buộc, hệ thống không tự động tin kết quả AI.'
            : 'Thêm hoặc bỏ khái niệm, nối lại quan hệ tiên quyết cho đồ thị của kế hoạch này. Lưu thay đổi để cập nhật; nhấn tên kế hoạch ở trên để quay lại mà không lưu.'}
        </p>

        {/* Stepper chỉ có nghĩa trong luồng tạo mới — sửa kế hoạch đã có không đi qua các bước này */}
        {isDraft && (
          <ol className="bg-card border-border mb-6 flex overflow-hidden rounded-[calc(var(--radius)*0.9)] border">
            <li className="text-muted-foreground border-border flex min-w-0 flex-1 items-center gap-2.5 border-r px-4 py-3 text-[13px]">
              <span className="border-primary/40 bg-primary/10 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12.5l5.2 5.2L20 7" />
                </svg>
              </span>
              <span className="truncate">Nhập thông tin & tải tài liệu</span>
            </li>
            <li
              className={cn(
                'border-border flex min-w-0 flex-1 items-center gap-2.5 border-r px-4 py-3 text-[13px]',
                analysisDone ? 'text-muted-foreground' : 'text-foreground font-semibold'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  analysisFailed
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-primary/40 bg-primary/10 text-primary'
                )}
              >
                {analysisFailed ? (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : analysisRunning ? (
                  <Spinner className="size-2.5" />
                ) : (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12.5l5.2 5.2L20 7" />
                  </svg>
                )}
              </span>
              <span className="truncate">AI phân tích</span>
            </li>
            <li
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 text-[13px]',
                analysisDone ? 'bg-accent text-foreground font-semibold' : 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]',
                  analysisDone
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border'
                )}
              >
                3
              </span>
              <span className="truncate">Kiểm chứng & xác nhận</span>
            </li>
          </ol>
        )}

        <div className="h-150 flex flex-col gap-4">
          {plan?.dagAutoFixed && mode === 'edit' && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                Hệ thống đã tự động loại bỏ một số quan hệ gây vòng lặp để đảm bảo cấu trúc hợp lệ.
              </span>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {isLoading && (analysisRunning || isCompletionPause) ? (
              <div className="border-border bg-card flex h-full w-full items-center justify-center overflow-auto rounded-xl border p-6">
                <AnalysisProgressPanel
                  filename={plan?.document?.filename}
                  pageCount={plan?.document?.pageCount}
                  documentKind={plan?.document?.kind}
                  startedAt={plan?.analysisStartedAt}
                  now={now}
                  phase={plan?.analysisPhase ?? null}
                  complete={isCompletionPause}
                />
              </div>
            ) : isLoading ? (
              <div className="border-border bg-card flex h-full w-full items-center justify-center rounded-xl border">
                <div className="text-muted-foreground flex flex-col items-center gap-2">
                  <Spinner className="size-8" />
                  <span>Đang tải đồ thị...</span>
                </div>
              </div>
            ) : analysisFailed ? (
              <div className="border-border bg-card h-full w-full overflow-auto rounded-xl border p-6">
                <div className="max-w-160 mx-auto">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-destructive shrink-0" aria-hidden="true">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7.5v5.5" />
                        <path d="M12 16.5h.01" />
                      </svg>
                    </span>
                    <span className="text-[15px] font-semibold">Phân tích tài liệu thất bại</span>
                  </div>
                  <p className="text-muted-foreground mb-2 text-pretty text-[13px] leading-[1.65]">
                    Tài liệu và kế hoạch nháp vẫn còn nguyên — bạn có thể thử lại.
                  </p>
                  {plan?.analysisErrorMessage ? (
                    <pre className="text-muted-foreground bg-muted border-border mb-4 overflow-x-auto whitespace-pre-wrap rounded-[calc(var(--radius)*0.6)] border px-3 py-2.5 font-mono text-[11.5px] leading-[1.7]">
                      {plan.analysisErrorMessage}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground mb-4 text-pretty text-[13px] leading-[1.65]">
                      AI không trích xuất được khái niệm từ tài liệu đã tải lên.
                    </p>
                  )}
                  <div className="flex gap-2.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRetry}
                      disabled={isRetrying || isChangingDocument}
                    >
                      {isRetrying ? 'Đang thử lại...' : 'Thử lại'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleChangeDocumentClick}
                      disabled={isRetrying || isChangingDocument}
                    >
                      {isChangingDocument ? 'Đang tải lên...' : 'Đổi tài liệu khác'}
                    </Button>
                    <input
                      ref={changeDocumentInputRef}
                      type="file"
                      accept=".pdf,.txt,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={handleChangeDocumentFile}
                    />
                  </div>
                </div>
              </div>
            ) : plan ? (
              <ConceptGraph
                planId={plan.id}
                initialConcepts={plan.graph.concepts}
                initialEdges={plan.graph.edges}
                mode={mode}
                onConfirm={handleConfirmGraph}
                confirmLabel={isDraft ? 'Xác nhận & Bắt đầu' : 'Lưu thay đổi'}
              />
            ) : (
              <div className="border-border bg-card text-muted-foreground flex h-full w-full items-center justify-center rounded-xl border">
                Không tìm thấy dữ liệu đồ thị.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ----------------- VIEW MODE LAYOUT -----------------
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-6">
      <div className="mb-5 flex-none">
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[13px]">
          <button
            onClick={() => navigate('/plans')}
            className="hover:text-foreground hover:border-border border-b border-transparent pb-px transition-colors"
          >
            Kế hoạch ôn tập
          </button>
          <span className="opacity-50">/</span>
          <span className="truncate">{plan?.name || 'Chi tiết kế hoạch'}</span>
          <span className="opacity-50">/</span>
          <span>Đồ thị khái niệm</span>
        </div>

        <div className="flex items-end justify-between gap-6">
          <div>
            {/* Tiêu đề là "Đồ thị khái niệm" (khớp mockup) — tên kế hoạch đã nằm ở breadcrumb
                và ở bộ chọn bên phải, không cần lặp làm h1. */}
            <h1 className="font-heading text-[28px] leading-tight tracking-tight">
              Đồ thị khái niệm
            </h1>
            {plan?.deadline && (
              <p className="text-muted-foreground mt-1 text-[13px]">
                Deadline: {formatDeadlineFull(plan.deadline)}
              </p>
            )}
          </div>

          <div className="flex items-end gap-3">
            {/* DB-05: bộ chọn kế hoạch ngay trên toolbar — đổi phạm vi tại chỗ, không quay
                về dashboard (DB-02 áp cho nhiều kế hoạch). Luôn hiện khi đã tải được danh sách
                (khớp mockup) — kể cả lúc mới có 1 kế hoạch, để affordance "đổi kế hoạch ở đây"
                nhất quán, chứ không xuất hiện đột ngột khi kế hoạch thứ hai ra đời. */}
            {planList && planList.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="plan-switch"
                  className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.06em]"
                >
                  Kế hoạch
                </label>
                <select
                  id="plan-switch"
                  value={id ?? ''}
                  onChange={(e) => navigate(`/plan/${e.target.value}`)}
                  className="border-border bg-card text-foreground min-w-65 py-2.25 rounded-[calc(var(--radius)*0.7)] border px-3 text-[14px] font-medium"
                >
                  {/* Kế hoạch hiện tại không (còn) nằm trong danh sách — vd. lỗi tải, hoặc id
                      từ một liên kết cũ. Không để <select> âm thầm rơi về option đầu tiên,
                      trông như đang xem đúng kế hoạch đó. */}
                  {!planList.some((p) => p.id === id) && (
                    <option value={id ?? ''} disabled>
                      Kế hoạch này
                    </option>
                  )}
                  {planList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.conceptCount} khái niệm
                    </option>
                  ))}
                </select>
              </div>
            )}
            {plan?.status !== 'archived' && (
              <Button variant="outline" size="sm" onClick={() => setSearchParams({ mode: 'edit' })}>
                Sửa đồ thị
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="border-border bg-muted/20 flex h-full w-full items-center justify-center rounded-xl border">
            <div className="text-muted-foreground flex flex-col items-center gap-2">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
              <span>Đang tải đồ thị...</span>
            </div>
          </div>
        ) : hasLoadError || !plan ? (
          // DB-02 Alt flow 2 — request tải đồ thị tự nó lỗi (mạng/server), khác với "phân
          // tích thất bại" (plan.analysisStatus === 'failed'), vốn có sẵn dữ liệu draft để sửa.
          <div className="border-border bg-card flex h-full w-full flex-col overflow-hidden rounded-xl border">
            <div
              aria-hidden="true"
              className="border-border flex items-center gap-2 border-b px-4 py-2.5 opacity-45"
            >
              {['Tất cả', 'Vững', 'Yếu'].map((label) => (
                <span
                  key={label}
                  className="border-border rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[14px] font-semibold">Không thể tải đồ thị khái niệm</p>
              <p className="text-muted-foreground max-w-100 text-pretty text-[13px] leading-[1.65]">
                Yêu cầu tới máy chủ không thành công. Dữ liệu học tập của bạn không bị ảnh hưởng —
                chỉ phần hiển thị này chưa lấy được.
              </p>
              <div className="flex gap-2.5">
                <Button size="sm" onClick={handleReloadPlan}>
                  Thử lại
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/plans')}>
                  Chọn kế hoạch khác
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <ConceptGraph
            planId={plan.id}
            initialConcepts={plan.graph.concepts}
            initialEdges={plan.graph.edges}
            mode={mode}
            onConfirm={undefined}
          />
        )}
      </div>
    </div>
  );
}
