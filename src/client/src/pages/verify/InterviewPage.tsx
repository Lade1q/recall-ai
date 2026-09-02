import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { cn } from '@/lib/utils';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { Concept, PlanSummary } from '@/features/study-planner/types/concept';
import {
  classifyInterviewStartFailure,
  getInterviewErrorMessage,
  interviewApi,
} from '@/features/interview/api/interview.api';
import type { InterviewStartFailure } from '@/features/interview/api/interview.api';
import type { StartInterviewResponse } from '@/features/interview/types/interview.types';
import { Heading } from '@/components/ui/heading';

/**
 * AE-01 — màn cấu hình phiên phỏng vấn AI Examiner.
 *
 * Chọn một kế hoạch đang hoạt động rồi tick các khái niệm muốn kiểm tra, hoặc bấm
 * "Dùng gợi ý hôm nay" để server tự chọn hàng đợi ôn (bỏ trống `conceptIds`). Nếu đã có
 * một phiên đang dở (server trả `created === false`, AE-03), hỏi lại trước khi rời trang.
 *
 * Theo quyết định 05/08 của issue #118: màn này không phải lối vào chính. Lối vào thật là
 * Dashboard "Gợi ý hôm nay" và panel đồ thị "Học lại khái niệm này" (DB-06), cả hai điều
 * hướng tới đây kèm `planId` + `conceptId`/`conceptIds` trên query string và mong phiên bắt
 * đầu ngay — không phải chọn lại từ đầu. Khi có `planId` trên URL, trang này bỏ qua bộ chọn
 * và tự gọi `startInterview`; bộ chọn thủ công chỉ còn là lối vào dev / lối thoát khi việc
 * tự động thất bại (planId sai, kế hoạch chưa có tài liệu, v.v.).
 */

/** Trần lượt/khái niệm mặc định của server (C6). Chỉ để hiển thị, không gửi kèm. */
const MAX_TURNS_PER_CONCEPT = 3;

/**
 * Kết quả một lần gọi `startInterview`. Ba nhánh lỗi phải tách nhau vì lối ra khác hẳn:
 * `ai-unavailable` và `system-error` giữ nguyên lựa chọn để thử lại, còn `rejected` (planId sai,
 * kế hoạch chưa có tài liệu, …) thì thử lại y hệt cũng vô ích và cần bộ chọn thủ công.
 *
 * `busy` là "chưa gọi gì cả" (đang có lệnh chạy dở, hoặc chưa chọn kế hoạch) — KHÔNG phải
 * server từ chối, nên người gọi bỏ qua thay vì hiện băng lỗi đổ tại lựa chọn của người dùng.
 */
type StartOutcome = 'started' | InterviewStartFailure | 'busy';

/**
 * Vì sao lối vào deep-link không tự mở được phiên — quyết định băng thông báo nào hiện ra.
 * Không có nhánh cho "Để sau": bấm nút đó ở lối deep-link đưa người dùng rời khỏi trang này
 * luôn (xem `onOpenChange` của dialog AE-03), không rớt xuống bộ chọn thủ công — URL deep-link
 * là bước chuyển, không phải điểm đến.
 */
type AutoStartFailure = InterviewStartFailure;

export default function InterviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Lối vào deep-link (DB-06 / Dashboard "Gợi ý hôm nay"): `conceptId` số ít khi kiểm tra
  // MỘT khái niệm, `conceptIds` số nhiều (phẩy) khi kiểm tra nhiều khái niệm gốc cùng lúc.
  const deepLinkPlanId = searchParams.get('planId');
  const deepLinkConceptId = searchParams.get('conceptId');
  const deepLinkConceptIds = searchParams.get('conceptIds');

  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => deepLinkPlanId);
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());

  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  // Autostart deep-link không thành → thoát khỏi màn loading. Lỗi dữ liệu thì rơi về bộ chọn
  // thủ công; AI/mạng hoặc hệ thống hỏng thì giữ lựa chọn và thử lại chính liên kết đó.
  const [autoStartFailure, setAutoStartFailure] = useState<AutoStartFailure | null>(null);
  const autoStartTriggeredRef = useRef(false);
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

  /**
   * Gọi startInterview; nếu có phiên dở thì mở hộp thoại, ngược lại vào thẳng phiên.
   * Nhánh lỗi phân loại theo nguyên nhân để lối vào deep-link biết nên mời thử lại, báo lỗi hệ
   * thống mà vẫn giữ lựa chọn, hay trả về bộ chọn thủ công khi dữ liệu đầu vào bị từ chối.
   */
  const startSession = async (
    conceptIds?: string[],
    // Deep-link truyền thẳng planId của liên kết: nút "Thử lại" phải mở lại ĐÚNG liên kết
    // đó, kể cả khi người dùng đã bấm thử một kế hoạch khác trong bộ chọn thủ công.
    planId: string | null = selectedPlanId
  ): Promise<StartOutcome> => {
    if (!planId || isStarting) return 'busy';
    setIsStarting(true);
    try {
      const response = await interviewApi.startInterview({
        planId,
        ...(conceptIds && conceptIds.length > 0 ? { conceptIds } : {}),
      });
      if (!response.created) {
        setPending({ response, conceptIds });
        return 'started';
      }
      // BUG C: deep-link tự khởi động thì `/interview?planId=...` không còn ý nghĩa để quay
      // lại — thay lịch sử để nút Back của trình duyệt không đưa người dùng về đúng liên kết
      // vừa tự nhảy đi, rồi lại tự nhảy tiếp/hiện hộp thoại AE-03 cho phiên vừa rời. Bộ chọn
      // thủ công (không có deep-link) thì giữ nguyên push — quay lại để chọn lại là hợp lệ.
      navigate(`/interview/${response.session.id}`, deepLinkPlanId ? { replace: true } : undefined);
      return 'started';
    } catch (error) {
      toast.error(getInterviewErrorMessage(error));
      return classifyInterviewStartFailure(error);
    } finally {
      setIsStarting(false);
    }
  };

  /**
   * Lối vào deep-link (DB-06 / Dashboard): mở thẳng phiên đúng như liên kết yêu cầu.
   * Dùng lại được cho nút "Thử lại" — khi AI/mạng/hệ thống hỏng thì đúng liên kết đó vẫn là
   * thứ người dùng muốn chạy, giữ nguyên planId + conceptIds thay vì bắt chọn lại.
   */
  const startFromDeepLink = async (): Promise<void> => {
    const conceptIds = deepLinkConceptId
      ? [deepLinkConceptId]
      : deepLinkConceptIds
        ? deepLinkConceptIds.split(',').filter(Boolean)
        : undefined;
    // Cố ý KHÔNG xoá `autoStartFailure` trước khi gọi: giữ băng thông báo tại chỗ để nút
    // "Thử lại" hiện đúng trạng thái loading, thay vì nháy sang màn spinner toàn trang rồi
    // quay lại. Lần mount đầu vẫn vào đây với cờ đang là `null` như thường.
    const outcome = await startSession(conceptIds, deepLinkPlanId);
    if (outcome === 'busy') return;
    if (outcome === 'started') {
      // Thử lại thành công nhưng dừng ở hộp thoại AE-03 (phiên đang dở): hạ băng lỗi cũ đi.
      setAutoStartFailure(null);
      return;
    }
    if (outcome === 'rejected') {
      // Lỗi thuộc về dữ liệu đầu vào → bộ chọn thủ công phải hiện ra sạch, không dính theo
      // một planId đã lỗi.
      setSelectedPlanId(null);
    }
    setAutoStartFailure(outcome);
  };

  // Tự bắt đầu phiên ngay khi mount. Chỉ chạy đúng một lần (ref guard) — searchParams không
  // đổi trong vòng đời trang này; các lần chạy lại sau đó đến từ nút "Thử lại".
  useEffect(() => {
    if (!deepLinkPlanId || autoStartTriggeredRef.current) return;
    autoStartTriggeredRef.current = true;
    void startFromDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần lúc mount, tự canh bằng ref
  }, []);

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
      // `startSession` tự bắt lỗi và tự bật cờ loading của riêng nó, nhưng KHÔNG được nuốt
      // kết quả: ở lối vào deep-link, `pending === null` + `autoStartFailure === null` sẽ
      // đưa trang về spinner "Đang mở phiên kiểm tra…" vĩnh viễn nếu lần mở mới này hỏng.
      const outcome = await startSession(conceptIds);
      if (outcome !== 'started' && outcome !== 'busy' && deepLinkPlanId) {
        if (outcome === 'rejected') setSelectedPlanId(null);
        setAutoStartFailure(outcome);
      }
    } catch (error) {
      toast.error(getInterviewErrorMessage(error));
    } finally {
      setIsEnding(false);
    }
  };

  const selectedCount = selectedConceptIds.size;
  /** Khái niệm phiên cũ đang dừng ở — nêu đích danh thì hệ quả đọc cụ thể hơn hẳn. */
  const pendingConceptName = pending?.response.session.currentConcept?.name;
  /**
   * Tên (các) khái niệm của LƯỢT BẤM VỪA RỒI — khác hẳn `pendingConceptName` (khái niệm của
   * PHIÊN CŨ đang dở). "Kết thúc và chấm phần đã làm" mở phiên mới đúng cho nhóm này
   * (`endAndStartNew` truyền lại `pending.conceptIds`) — không nêu tên thì người bấm không
   * biết mình sắp được đưa vào kiểm tra khái niệm nào, dễ tưởng nhầm là chỉ dừng lại.
   */
  const pendingNewConceptNames = pending?.conceptIds
    ?.map((id) => concepts?.find((concept) => concept.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  // AE-03 — có phiên đang dở. Ba lối ra, xếp dọc theo mức độ ưu tiên: tiếp tục (không mất
  // gì), kết thúc và chấm phần đã làm, hoặc để sau. Xếp dọc vì nhãn của lựa chọn giữa dài
  // hơn nửa chiều ngang hộp thoại — nhét cả ba vào một hàng thì tràn.
  //
  // Tách thành biến riêng (thay vì để thẳng trong JSX cuối trang) vì dialog này phải render
  // được cả khi đến từ deep-link VÀ đang che màn picker (xem nhánh return ngay dưới) — dùng
  // chung một chỗ định nghĩa để không lặp code hay để hai bản lệch nhau.
  const pendingDialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (open || isEnding) return;
        setPending(null);
        // Đóng hộp thoại mà không chọn "Tiếp tục" hay "Kết thúc" (Để sau / Esc / bấm ra
        // ngoài). Không có gì hỏng cả — người dùng chủ động hoãn — nên không có băng lỗi
        // nào để hiện. Ở lối vào deep-link, URL `/interview?planId=...` chỉ là bước chuyển,
        // không phải điểm đến (cùng lý do BUG C): đưa người dùng rời khỏi đây luôn.
        //
        // M3/M6 (review PR #279, vòng 2): TRƯỚC đây dùng `navigate(-1)` — hỏng ở đúng lối
        // vào deep-link thật sự cần tới nhất. `navigate(-1)` chỉ hoạt động nếu có một trang
        // TRƯỚC ĐÓ trong tab để lùi về; deep-link mở ở tab mới / bookmark / dán URL thẳng thì
        // không có gì để lùi — kẹt vĩnh viễn ở màn "Đang mở phiên kiểm tra…" (M3). Còn khi
        // CÓ trang trước đó, `navigate(-1)` chỉ lùi con trỏ chứ không xoá entry deep-link —
        // bấm Forward sau đó bắn lại đúng luồng autostart + hộp thoại này (M6).
        //
        // Đích thay thế: `replace` thẳng về TRANG THẬT của kế hoạch (nơi cả hai lối vào
        // deep-link — ConceptDetailPanel lẫn ConceptGraph — đều sống) thay vì dựa vào lịch sử.
        // Luôn đúng bất kể có lịch sử hay không, và `replace` xoá hẳn entry deep-link nên
        // không còn gì để Forward quay lại được nữa.
        if (deepLinkPlanId) navigate(`/plan/${deepLinkPlanId}`, { replace: true });
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bạn có một phiên đang dở</DialogTitle>
          <DialogDescription>
            Kế hoạch này đã có một phiên kiểm tra chưa hoàn tất. Tiếp tục thì phiên chạy tiếp từ chỗ
            đang dừng và {pendingConceptName ?? 'khái niệm đang dở'} vẫn được chấm trên đủ ba lượt.
          </DialogDescription>
        </DialogHeader>

        {/* Hệ quả phải đọc được TRƯỚC khi bấm — screen-history.html:1559. */}
        <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
          Kết thúc sớm thì {pendingConceptName ?? 'khái niệm đang dở'} chỉ được chấm trên số lượt
          bạn đã trả lời — điểm sẽ kém tin cậy hơn và khái niệm dễ bị xếp lại vào lịch ôn.
        </p>

        {/* Không nói rõ vế này thì người bấm "Kết thúc..." tưởng chỉ đơn thuần dừng lại,
            trong khi thực tế một phiên MỚI mở ra ngay sau đó cho đúng lượt vừa bấm. */}
        <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
          Kết thúc xong, phiên kiểm tra mới cho{' '}
          <strong>
            {pendingNewConceptNames && pendingNewConceptNames.length > 0
              ? pendingNewConceptNames.join(', ')
              : 'lựa chọn vừa rồi'}
          </strong>{' '}
          sẽ mở ngay — không phải chỉ dừng lại.
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
              if (!pending) return;
              // Cùng lý do BUG C ở `startSession`: chỉ thay lịch sử khi đến từ deep-link.
              navigate(
                `/interview/${pending.response.session.id}`,
                deepLinkPlanId ? { replace: true } : undefined
              );
            }}
          >
            Tiếp tục phiên
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const retryableAutoStartFailure =
    autoStartFailure === 'ai-unavailable'
      ? {
          tone: 'border-mastery-learning/34 bg-mastery-learning/9',
          message:
            'Dịch vụ AI tạm thời không phản hồi nên chưa mở được phiên kiểm tra từ liên kết vừa rồi. Kế hoạch và khái niệm bạn chọn vẫn đúng — hãy thử lại sau giây lát.',
        }
      : autoStartFailure === 'system-error'
        ? {
            tone: 'border-destructive/35 bg-destructive/5',
            message:
              'Hệ thống đang gặp sự cố nên chưa mở được phiên kiểm tra từ liên kết vừa rồi. Kế hoạch và khái niệm bạn chọn vẫn được giữ nguyên — hãy thử lại sau giây lát.',
          }
        : null;

  // ---------- Lối vào deep-link đang tự khởi động phiên: không hiện bộ chọn ----------
  if (deepLinkPlanId && autoStartFailure === null && pending === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">Đang mở phiên kiểm tra…</p>
      </div>
    );
  }

  // ---------- Deep-link phát hiện phiên đang dở: chỉ hiện dialog AE-03, không hiện picker ----------
  // `pending !== null` nghĩa là startInterview đã trả lời "có phiên đang dở". Trước đây nhánh
  // này rớt thẳng xuống màn picker đầy đủ (tên kế hoạch, danh sách khái niệm...) làm nền mờ
  // cho dialog — sai với nguyên tắc "vào bằng deep-link không bao giờ thấy nội dung picker"
  // đã áp dụng cho cả lối thành công lẫn lối lỗi. Giữ một khung trống cùng cỡ màn spinner ở
  // trên để không có gì nhấp nháy khi dialog mở, thay vì để lộ cả bộ chọn thủ công phía sau.
  if (deepLinkPlanId && pending !== null) {
    return <div className="min-h-[50vh]">{pendingDialog}</div>;
  }

  // ---------- Deep-link gặp lỗi có thể retry: chỉ hiện băng, không hiện picker ----------
  // AI/mạng và lỗi hệ thống dùng chung hành vi giữ request; chỉ khác câu chữ và màu. Một 5xx
  // không thuộc AI không nói gì về planId/conceptIds, nên rơi xuống `rejected` sẽ xoá lựa chọn
  // đúng rồi vẫn gửi lại vào cùng hệ thống đang lỗi.
  if (deepLinkPlanId && retryableAutoStartFailure) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div
          className={cn(
            'text-foreground max-w-md rounded-md border px-4 py-3.5 text-[13px] leading-[1.6]',
            retryableAutoStartFailure.tone
          )}
        >
          <p>{retryableAutoStartFailure.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2.5"
            loading={isStarting}
            disabled={isStarting}
            onClick={() => void startFromDeepLink()}
          >
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

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
        <Heading as="h1" size="page" className="leading-[1.15]">
          Kiểm tra vấn đáp
        </Heading>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Chọn kế hoạch và các khái niệm bạn muốn AI Examiner kiểm tra, hoặc để hệ thống gợi ý những
          khái niệm cần ôn hôm nay.
        </p>
        {/* `ai-unavailable` và `system-error` có màn riêng ở các nhánh return phía trên (không
            hiện picker này) — chỉ còn `rejected` (dữ liệu sai: planId không tồn tại, kế hoạch
            chưa có tài liệu…) thật sự cần bộ chọn thủ công làm lối thoát, nên banner ở đây. */}
        {autoStartFailure === 'rejected' && (
          <p className="border-border bg-muted text-muted-foreground mt-3 rounded-md border px-3.5 py-2.5 text-[13px] leading-[1.6]">
            Không thể tự mở phiên kiểm tra từ liên kết vừa rồi. Hãy chọn lại kế hoạch và khái niệm
            bên dưới.
          </p>
        )}
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
                  className={cn(
                    'flex items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors',
                    selectedPlanId === plan.id
                      ? 'border-foreground bg-muted'
                      : 'border-border bg-card hover:border-muted-foreground'
                  )}
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
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-sm transition-colors',
                          checked
                            ? 'border-foreground bg-muted'
                            : 'border-border bg-card hover:border-muted-foreground'
                        )}
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

      {pendingDialog}
    </div>
  );
}
