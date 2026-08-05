import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
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
import { MetaMono } from '@/components/ui/kbd';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { Concept, PlanSummary } from '@/features/study-planner/types/concept';
import { getInterviewErrorMessage, interviewApi } from '@/features/interview/api/interview.api';
import type { StartInterviewResponse } from '@/features/interview/types/interview.types';

/**
 * AE-01 — màn cấu hình phiên phỏng vấn AI Examiner.
 *
 * Chọn một kế hoạch đang hoạt động rồi tick các khái niệm muốn kiểm tra, hoặc bấm
 * "Dùng gợi ý hôm nay" để server tự chọn hàng đợi ôn (bỏ trống `conceptIds`). Nếu đã có
 * một phiên đang dở (server trả `created === false`, AE-03), hỏi lại trước khi rời trang.
 */

/** Trần lượt/khái niệm mặc định của server (C6). Chỉ để hiển thị, không gửi kèm. */
const MAX_TURNS_PER_CONCEPT = 3;

export default function InterviewPage() {
  const navigate = useNavigate();

  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());

  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  // Phiên đang dở server trả về khi created === false — chờ người dùng xác nhận (AE-03).
  // Giữ kèm lựa chọn khái niệm của chính lần bấm đó: nếu người dùng chọn kết thúc phiên cũ,
  // phiên mới phải mở lại đúng yêu cầu ban đầu chứ không phải state hiện tại của form.
  const [pending, setPending] = useState<{
    response: StartInterviewResponse;
    conceptIds: string[] | undefined;
  } | null>(null);

  // Tải danh sách kế hoạch đang hoạt động.
  useEffect(() => {
    let isMounted = true;
    planApi
      .listPlans()
      .then((data) => {
        if (!isMounted) return;
        setPlans(data.filter((plan) => plan.status === 'active'));
        setLoadError(false);
      })
      .catch((error: unknown) => {
        console.error('Failed to load plans', error);
        if (isMounted) setLoadError(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Khi đổi kế hoạch, nạp lại danh sách khái niệm. Việc reset lựa chọn + bật cờ loading
  // nằm ở handler chọn kế hoạch (event), nên effect chỉ còn phần fetch bất đồng bộ.
  useEffect(() => {
    if (!selectedPlanId) return;
    let isMounted = true;
    planApi
      .getPlan(selectedPlanId)
      .then((detail) => {
        if (isMounted) setConcepts(detail.graph.concepts);
      })
      .catch((error: unknown) => {
        console.error('Failed to load concepts', error);
        if (isMounted) {
          setConcepts([]);
          toast.error('Không tải được danh sách khái niệm. Vui lòng thử lại.');
        }
      })
      .finally(() => {
        if (isMounted) setConceptsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedPlanId]);

  const handleSelectPlan = (planId: string): void => {
    if (planId === selectedPlanId) return;
    setSelectedPlanId(planId);
    setConcepts(null);
    setSelectedConceptIds(new Set());
    setConceptsLoading(true);
  };

  const toggleConcept = (conceptId: string): void => {
    setSelectedConceptIds((prev) => {
      const next = new Set(prev);
      if (next.has(conceptId)) {
        next.delete(conceptId);
      } else {
        next.add(conceptId);
      }
      return next;
    });
  };

  /** Gọi startInterview; nếu có phiên dở thì mở hộp thoại, ngược lại vào thẳng phiên. */
  const startSession = async (conceptIds?: string[]): Promise<void> => {
    if (!selectedPlanId || isStarting) return;
    setIsStarting(true);
    try {
      const response = await interviewApi.startInterview({
        planId: selectedPlanId,
        ...(conceptIds && conceptIds.length > 0 ? { conceptIds } : {}),
      });
      if (!response.created) {
        setPending({ response, conceptIds });
        return;
      }
      navigate(`/interview/${response.session.id}`);
    } catch (error) {
      toast.error(getInterviewErrorMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  /**
   * AE-03 — "Kết thúc và chấm phần đã làm" (SPEC_DB-03 AF2). Đóng phiên cũ bằng
   * `POST /abandon` (khái niệm đang dở vẫn được chấm trên số lượt đã trả lời) rồi mở phiên
   * mới. Hai lượt gọi là cố ý: endpoint kết thúc phiên còn dùng lại cho màn Lịch sử phiên,
   * nơi kết thúc phiên mà *không* mở phiên mới.
   */
  const endAndStartNew = async (): Promise<void> => {
    if (!pending || isEnding) return;
    const { response, conceptIds } = pending;
    setIsEnding(true);
    try {
      const { conceptCompleted } = await interviewApi.abandonInterview(response.session.id);
      if (conceptCompleted) {
        toast.success(`Đã chấm xong "${conceptCompleted.conceptName}" trên phần bạn đã trả lời.`);
      }
      setPending(null);
      // `startSession` tự bắt lỗi và tự bật cờ loading của riêng nó.
      await startSession(conceptIds);
    } catch (error) {
      toast.error(getInterviewErrorMessage(error));
    } finally {
      setIsEnding(false);
    }
  };

  const selectedCount = selectedConceptIds.size;
  /** Khái niệm phiên cũ đang dừng ở — nêu đích danh thì hệ quả đọc cụ thể hơn hẳn. */
  const pendingConceptName = pending?.response.session.currentConcept?.name;

  // ---------- Loading danh sách kế hoạch ----------
  if (plans === null && !loadError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6.5">
        <h1 className="font-heading text-[30px] leading-[1.15] tracking-[-0.02em]">
          Kiểm tra vấn đáp
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Chọn kế hoạch và các khái niệm bạn muốn AI Examiner kiểm tra, hoặc để hệ thống gợi ý những
          khái niệm cần ôn hôm nay.
        </p>
      </header>

      {loadError || plans === null ? (
        <div className="border-border bg-background rounded-xl border px-7 py-6 text-center">
          <p className="text-muted-foreground text-[13.5px] leading-[1.7]">
            Không tải được danh sách kế hoạch. Vui lòng tải lại trang.
          </p>
        </div>
      ) : plans.length === 0 ? (
        <div className="border-border bg-background rounded-xl border px-7 py-6 text-center">
          <p className="text-muted-foreground text-[13.5px] leading-[1.7]">
            Chưa có kế hoạch nào đang hoạt động để kiểm tra. Hãy tạo và phân tích một kế hoạch
            trước.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Bước 1: chọn kế hoạch */}
          <section>
            <h2 className="text-muted-foreground mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em]">
              Kế hoạch ôn tập
            </h2>
            <div className="flex flex-col gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`flex items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                    selectedPlanId === plan.id
                      ? 'border-foreground bg-muted'
                      : 'border-border bg-card hover:border-muted-foreground'
                  }`}
                >
                  <span className="font-medium">{plan.name}</span>
                  <MetaMono className="text-muted-foreground text-[11px]">
                    {plan.conceptCount} khái niệm
                  </MetaMono>
                </button>
              ))}
            </div>
          </section>

          {/* Bước 2: chọn khái niệm */}
          {selectedPlanId && (
            <section>
              <h2 className="text-muted-foreground mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em]">
                Khái niệm cần kiểm tra
              </h2>

              {conceptsLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Đang tải khái niệm…
                </div>
              ) : !concepts || concepts.length === 0 ? (
                <p className="text-muted-foreground py-2 text-sm">
                  Kế hoạch này chưa có khái niệm nào.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {concepts.map((concept) => {
                    const checked = selectedConceptIds.has(concept.id);
                    return (
                      <label
                        key={concept.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-sm transition-colors ${
                          checked
                            ? 'border-foreground bg-muted'
                            : 'border-border bg-card hover:border-muted-foreground'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleConcept(concept.id)}
                          className="accent-foreground size-4 shrink-0"
                        />
                        <span className="min-w-0 truncate">{concept.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Bước 3: bắt đầu */}
          {selectedPlanId && (
            <section className="border-border flex flex-col gap-3 border-t pt-5">
              {selectedCount > 0 && (
                <p className="text-muted-foreground text-[13px]">
                  Sẽ kiểm tra <strong className="text-foreground">{selectedCount} khái niệm</strong>{' '}
                  × tối đa {MAX_TURNS_PER_CONCEPT} lượt.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => void startSession([...selectedConceptIds])}
                  loading={isStarting}
                  disabled={isStarting || selectedCount === 0}
                >
                  Bắt đầu kiểm tra
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void startSession()}
                  disabled={isStarting}
                >
                  <Sparkles />
                  Dùng gợi ý hôm nay
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* AE-03 — có phiên đang dở. Ba lối ra, xếp dọc theo mức độ ưu tiên: tiếp tục (không
          mất gì), kết thúc và chấm phần đã làm, hoặc để sau. Xếp dọc vì nhãn của lựa chọn
          giữa dài hơn nửa chiều ngang hộp thoại — nhét cả ba vào một hàng thì tràn. */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => !open && !isEnding && setPending(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bạn có một phiên đang dở</DialogTitle>
            <DialogDescription>
              Kế hoạch này đã có một phiên kiểm tra chưa hoàn tất. Tiếp tục thì phiên chạy tiếp từ
              chỗ đang dừng và {pendingConceptName ?? 'khái niệm đang dở'} vẫn được chấm trên đủ ba
              lượt.
            </DialogDescription>
          </DialogHeader>

          {/* Hệ quả phải đọc được TRƯỚC khi bấm — screen-history.html:1559. */}
          <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
            Kết thúc sớm thì {pendingConceptName ?? 'khái niệm đang dở'} chỉ được chấm trên số lượt
            bạn đã trả lời — điểm sẽ kém tin cậy hơn và khái niệm dễ bị xếp lại vào lịch ôn.
          </p>

          <DialogFooter className="sm:flex-col-reverse">
            <DialogClose asChild>
              <Button variant="ghost" disabled={isEnding}>
                Để sau
              </Button>
            </DialogClose>
            <Button variant="outline" loading={isEnding} onClick={() => void endAndStartNew()}>
              Kết thúc và chấm phần đã làm
            </Button>
            <Button
              disabled={isEnding}
              onClick={() => {
                if (pending) navigate(`/interview/${pending.response.session.id}`);
              }}
            >
              Tiếp tục phiên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
