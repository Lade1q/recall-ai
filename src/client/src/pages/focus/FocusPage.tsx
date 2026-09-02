import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/context/AuthContext';
import { planApi } from '@/features/study-planner/api/plan.api';
import {
  focusSessionApi,
  getFocusSessionErrorMessage,
  isTerminalFocusSessionError,
  pomodoroConfigApi,
} from '@/features/focus/api/focus.api';
import { PomodoroConfigPanel } from '@/features/focus/components/PomodoroConfigPanel';
import { ResumeSessionDialog } from '@/features/focus/components/ResumeSessionDialog';
import { RunningSession } from '@/features/focus/components/RunningSession';
import { SessionSummary } from '@/features/focus/components/SessionSummary';
import {
  clearFocusSessionSnapshot,
  readFocusSessionSnapshot,
} from '@/features/focus/hooks/useFocusTimer';
import type {
  CreateFocusSessionResponse,
  FocusSessionSnapshot,
  PomodoroConfig,
} from '@/features/focus/types/focus.types';
import { cyclesToWords, formatClock, formatMinutesPhrase } from '@/features/focus/utils/format';
import { sessionLockName } from '@/features/focus/utils/sessionLock';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import type { ReviewQueueItem } from '@/features/review-queue/types/review-queue.types';
import { Heading } from '@/components/ui/heading';

// Phải khớp NGUYÊN VĂN các hằng số ở `scheduling.service.ts` (server) — Definition of Done của
// #127 yêu cầu so đúng chuỗi này, và đây là cách DUY NHẤT để phân biệt các nhánh rỗng khi
// `/review-queue/today` không trả mã lý do riêng, chỉ trả một chuỗi `message`.
const COMPLETED_TODAY_MESSAGE = 'Bạn đã hoàn thành kế hoạch hôm nay 🎉';
const NO_PLAN_MESSAGE = 'Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn.';
const ALL_PLANS_ARCHIVED_MESSAGE =
  'Mọi kế hoạch của bạn đang được lưu trữ. Bỏ lưu trữ một kế hoạch để ôn tiếp.';
/** `buildNoActivePlanMessage()` ghép số đếm vào giữa câu — không so được bằng equality, chỉ
 *  match được phần khung câu cố định quanh con số động. */
const AWAITING_CONFIRMATION_PATTERN = /đang chờ xác nhận đồ thị/;

const DEFAULT_CONFIG: PomodoroConfig = {
  work: 25,
  short_break: 5,
  long_break: 15,
  cycles: 4,
  sound: true,
};

const STRICT_MODE_KEY = 'recall.focusStrictMode';

type EntryBranch =
  | { kind: 'has-item'; item: ReviewQueueItem }
  | { kind: 'empty-today'; message: string }
  /** 3a — chưa có kế hoạch nào. */
  | { kind: 'no-plan'; message: string }
  /** 3b — có kế hoạch `draft` chờ xác nhận đồ thị (#265: trạng thái sống lâu, không hiếm). */
  | { kind: 'awaiting-confirmation'; message: string }
  /** 3c — mọi kế hoạch đã lưu trữ. */
  | { kind: 'all-archived'; message: string }
  | { kind: 'no-history' };

interface SessionStats {
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  cycles: number;
}

async function fetchEntryBranch(): Promise<EntryBranch> {
  const queue = await reviewQueueApi.getToday(1);
  if (queue.items.length > 0) return { kind: 'has-item', item: queue.items[0] };
  if (queue.message === null) return { kind: 'no-history' };
  if (queue.message === COMPLETED_TODAY_MESSAGE)
    return { kind: 'empty-today', message: queue.message };
  if (queue.message === NO_PLAN_MESSAGE) return { kind: 'no-plan', message: queue.message };
  if (queue.message === ALL_PLANS_ARCHIVED_MESSAGE)
    return { kind: 'all-archived', message: queue.message };
  if (AWAITING_CONFIRMATION_PATTERN.test(queue.message))
    return { kind: 'awaiting-confirmation', message: queue.message };
  // Câu lạ chưa biết — coi như 3a, CTA "Tạo kế hoạch đầu tiên" là lối an toàn nhất trong bốn.
  return { kind: 'no-plan', message: queue.message };
}

/**
 * Số phút của một mục KHÔNG phải truy ngược, theo đúng `estimateReviewMinutes()` của server
 * (`scheduling.service.ts`): `maxTurns * MINUTES_PER_TURN` = `DEFAULT_MAX_TURNS_PER_CONCEPT` (3)
 * × `MINUTES_PER_TURN` (3). Phải là 9 chứ không phải một con số tự đặt: nó hiện nguyên văn trong
 * câu bàn giao ở `SessionSummary` — câu đó đã nói "vấn đáp 3 lượt", nên mọi giá trị khác 9 sẽ tự
 * mâu thuẫn với chính nó, và lệch với mục do server sinh cho cùng một khái niệm.
 */
const MANUAL_ESTIMATED_MINUTES = 9;

/**
 * Lối "học trước" của DB-06: panel chi tiết trên đồ thị điều hướng sang
 * `/focus?planId=…&conceptId=…` (`ConceptDetailPanel.tsx` — `conceptId` SỐ ÍT, khác hẳn
 * `conceptIds` số nhiều của payload `POST /focus-sessions`).
 *
 * Ở đây KHÔNG đụng `/review-queue/today`: khái niệm do người dùng tự chỉ định thì hàng đợi không
 * có tiếng nói. Đó cũng là ca gỡ kẹt cho người có kế hoạch active nhưng chưa vấn đáp lần nào —
 * hàng đợi của họ rỗng vĩnh viễn (#273), lối này là đường duy nhất vào được phiên học.
 *
 * Dựng một `ReviewQueueItem` tổng hợp thay vì đổi kiểu dữ liệu của `NotStartedPanel`/
 * `RunningSession`: hai màn đó chỉ cần đúng shape này, và `id: null` vốn đã là hợp lệ (gợi ý ảo
 * A3-fallback của server cũng không có hàng thật để PATCH).
 *
 * Trả `null` cho MỌI thất bại (plan không tồn tại, không thuộc user → 404, id sai định dạng →
 * 400 từ `planIdParamSchema`, khái niệm không nằm trong plan) để người gọi rơi về hàng đợi
 * thường — deep-link hỏng không được phép làm hỏng cả màn hình.
 */
async function resolveDeepLinkItem(
  planId: string,
  conceptId: string
): Promise<ReviewQueueItem | null> {
  try {
    const plan = await planApi.getPlan(planId);
    // Kế hoạch không còn `active` (đã lưu trữ / chưa xác nhận đồ thị) không được mở phiên —
    // rơi về `null` như mọi thất bại khác để `resolveEntry()` chuyển sang hàng đợi thường, nơi
    // đã có sẵn câu chữ đúng cho từng trạng thái (`fetchEntryBranch`).
    if (plan.status !== 'active') return null;
    const concept = plan.graph.concepts.find((c) => c.id === conceptId);
    if (!concept) return null;
    return {
      id: null,
      conceptId: concept.id,
      name: concept.name,
      planId: plan.id,
      planName: plan.name,
      priority: 0,
      // `manual` ⇒ chip "Truy ngược · tầng N" tự ẩn (chip chỉ hiện khi `reason === 'traceback'`).
      reason: 'manual',
      // FS-06 đòi một lý do hiện ngay cạnh tên khái niệm. Ở lối này KHÔNG có lý do hệ thống nào
      // để nêu — không phải truy ngược, không phải tới hạn ôn — nên nói thẳng cái đã xảy ra thay
      // vì bịa ra một suy luận. Nguyên tắc của mockup nhánh 1 là "một khái niệm hiện ra không
      // kèm lý do thì đúng là chọn bừa"; câu này giữ đúng tinh thần đó mà không nói dối.
      reasonText: 'Bạn chọn khái niệm này trên đồ thị để học.',
      sourceConceptName: null,
      depth: null,
      // `getPlan` ĐỔI TÊN trường khi map: server gửi `masteryScore`, client dùng `mastery_score`.
      masteryScore: concept.mastery_score,
      status: 'pending',
      estimatedMinutes: MANUAL_ESTIMATED_MINUTES,
      sourceSessionEndedAt: null,
    };
  } catch {
    return null;
  }
}

/**
 * FS-01 — Phiên học tập trung (Pomodoro). AC ⓪ mô tả 3 nhánh của `GET /review-queue/today`,
 * nhưng thực tế là 6 trạng thái đọc từ CÙNG một lời gọi (không phải 6 màn hình khác nhau):
 *   1. có mục đến hạn → vào phiên
 *   2. có hàng đợi, chưa gì tới hạn → `COMPLETED_TODAY_MESSAGE`
 *   3a/3b/3c. không có plan active → ba câu của `buildNoActivePlanMessage()` (#265: `draft`
 *      chờ xác nhận đồ thị là trạng thái sống lâu, không phải ca hiếm)
 *   4. có plan active nhưng chưa vấn đáp lần nào (#273) → `message: null`; nhánh DUY NHẤT trên
 *      toàn luồng mà client tự đặt chữ, và lối ra là đồ thị chứ không phải Dashboard.
 *
 * Trên tất cả còn một lối vào KHÔNG đi qua hàng đợi: deep-link `?planId=&conceptId=` từ panel
 * chi tiết của đồ thị (DB-06). Có deep-link hợp lệ thì `/review-queue/today` không được hỏi tới —
 * xem `resolveEntry()`.
 */
export default function FocusPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Chốt tham số deep-link ĐÚNG MỘT LẦN lúc mount (lazy initializer, không phải effect): sau khi
  // đã vào phiên thì URL không còn là nguồn sự thật nữa, và `onCancelled` phải giải lại đúng
  // khái niệm cũ chứ không rơi về hàng đợi. Cần cả hai tham số — thiếu một cái thì không đủ để
  // gọi `GET /plans/:id` rồi tìm concept, nên coi như không có deep-link.
  const [deepLink] = useState(() => {
    const planId = searchParams.get('planId');
    const conceptId = searchParams.get('conceptId');
    return planId && conceptId ? { planId, conceptId } : null;
  });

  const [entry, setEntry] = useState<EntryBranch | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [strictMode, setStrictModeState] = useState<boolean>(() => {
    const stored = localStorage.getItem(STRICT_MODE_KEY);
    return stored === null ? true : stored === 'true';
  });

  const [session, setSession] = useState<CreateFocusSessionResponse | null>(null);
  const [summary, setSummary] = useState<SessionStats | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const [resumeSnapshot, setResumeSnapshot] = useState<FocusSessionSnapshot | null>(null);
  const [isResumeSubmitting, setIsResumeSubmitting] = useState(false);

  // Phát hiện phiên gián đoạn ở mount, và (#311) dọn hàng orphan của phiên quá ngắn để mời.
  // `setResumeSnapshot` chỉ SET, không bao giờ clear, nên `user` quay `null` giữa chừng
  // (auth:logout) làm effect chạy lại cũng KHÔNG vứt nhầm snapshot đang hiện (④). Chạy lại nhiều
  // lần vô hại: `cancelled` chặn setState, còn khoá `ifAvailable` chặn PATCH dọn trùng (chỉ một
  // lần chiếm được khoá). Đặt trong effect (không lazy initializer) vì liveness M3 là bất đồng bộ
  // — và mọi `setResumeSnapshot` ở đây đều trong callback async nên `react-hooks/set-state-in-effect`
  // không chặn.
  useEffect(() => {
    if (!user) return; // chưa biết chủ thì chưa quyết (thực tế luôn có user dưới ProtectedRoute)
    const snapshot = readFocusSessionSnapshot();
    if (!snapshot) return;
    // ④ — "BIẾT CHẮC chủ khác", không phải "id không khớp": snapshot ghi trước khi có `userId`
    // mang `null`, mà `null !== '<uuid>'` cũng đúng → so thẳng sẽ vứt sạch khôi phục cũ của chính
    // chủ. Không xoá localStorage, chỉ lờ đi: chủ kia đăng nhập lại vẫn còn phiên.
    if (snapshot.userId && snapshot.userId !== user.id) return;
    // L4 — snapshot ghi ngay t=0 lúc phiên bắt đầu; nếu tab đóng trong ~phút đầu thì thời gian tập
    // trung làm tròn ra 0 phút, mời "Ghi nhận 0 phút" là vô nghĩa. Dưới 1 phút thì KHÔNG mời.
    // `formatMinutesPhrase` của hộp thoại tính theo PHÚT nên đây là đúng ngưỡng nó bắt đầu hiển
    // thị được một con số khác 0. Đây CHỈ là ngưỡng của việc MỜI khôi phục — không còn là lối
    // thoát sớm của cả effect nữa (xem `discardOrphan`, #311).
    const isTooShortToOffer = Math.floor(snapshot.focusedMs / 1000) < 60;

    let cancelled = false;
    const offer = () => {
      if (!cancelled) setResumeSnapshot(snapshot);
    };

    /**
     * #311 — Phiên dưới 1 phút bị reload: UX vẫn là KHÔNG mời khôi phục (L4 ở trên), nhưng hàng
     * `focus_sessions` ở server thì vẫn `status=running, ended_at=null` cho tới lượt
     * `reapStaleSessions()` sau 8 GIỜ. Trước đây effect `return` ngay ở ngưỡng 60s nên không ai
     * đóng hàng đó — đúng lỗi QA TC-FS-024 đo được. Ở đây đóng luôn bằng `cancelled`: chính
     * `status === 'cancelled'` ép `durationMinutes = 0` ở server (Alt flow 4) BẤT KỂ số giây gửi
     * lên, nên KHÔNG ghi mastery hay lịch ôn — hủy phiên không có tác dụng phụ nào ngoài đóng hàng.
     *
     * Gửi `focusedSeconds` THẬT (không phải 0): server vẫn lưu nguyên trường này để giữ số liệu
     * thô, khớp cách đường hủy thủ công (`RunningSession.finalizeSession('cancelled')` qua
     * `getFinalStats()`) ghi trường đó. Chỉ RIÊNG `focusedSeconds` là khớp — lối này CỐ Ý không
     * gửi `awayCount`/`pomodorosCompleted` (server mặc định 0), nên `away_count` có thể lệch với
     * một phiên hủy tay từng rời tab; chấp nhận được vì phiên đã bị hủy, không tính vào lịch sử.
     * `focusedSeconds` luôn ≤ elapsed thật (thời gian tập trung không thể vượt wall-clock) nên qua
     * được validator `focusedSeconds ≤ elapsedSeconds` của server.
     *
     * Trả về promise để người gọi GIỮ được khoá liveness suốt lúc PATCH (xem chỗ gọi) — chống
     * gọi trùng nằm ở CHÍNH cái khoá đó, không phải ở một cờ riêng. Fire-and-forget với người
     * dùng: màn setup do effect entry phía dưới dựng độc lập, không ai phải đợi request dọn dẹp
     * này mới thấy màn hình.
     */
    // Chỉ xoá snapshot nếu nó VẪN là của phiên mình vừa dọn. PATCH dọn bay bất đồng bộ; nếu trong
    // lúc đó user bấm "Bắt đầu" một phiên MỚI, `localStorage` đã mang snapshot của phiên mới —
    // xoá vô điều kiện ở đây sẽ vứt manh mối khôi phục của nó, tái lập đúng orphan #311 cho phiên
    // mới nếu nó reload/crash trong ~10s trước lần ghi snapshot kế. So theo `sessionId` (không phải
    // sự tồn tại) vì phiên mới cũng ghi vào cùng một khoá `recall.focusSession`.
    const clearIfStillOurs = () => {
      if (readFocusSessionSnapshot()?.sessionId === snapshot.sessionId) clearFocusSessionSnapshot();
    };
    const discardOrphan = () =>
      focusSessionApi
        .end(snapshot.sessionId, {
          status: 'cancelled',
          focusedSeconds: Math.floor(snapshot.focusedMs / 1000),
        })
        .then(clearIfStillOurs)
        .catch((error: unknown) => {
          // Cùng lý lẽ M4 của `handleResumeCommit`: 4xx (`ALREADY_ENDED` do reap 8h đã chạy hoặc
          // tab khác vừa đóng phiên / phiên không còn) ⇒ chẳng còn gì để dọn, xoá snapshot. Lỗi
          // TẠM THỜI (mất mạng, 5xx) thì GIỮ snapshot để lần mở màn sau dọn lại — xoá ở đây là tự
          // bỏ mất manh mối duy nhất về hàng orphan, tức rơi lại về đúng cảnh chờ reap 8h.
          // Im lặng với người dùng: họ không yêu cầu việc dọn này và không có gì để họ quyết.
          if (isTerminalFocusSessionError(error)) clearIfStillOurs();
        });

    // M3 — liveness qua Web Locks: tab đang chạy phiên GIỮ khoá `sessionLockName(id)` suốt vòng
    // đời (RunningSession). Ở đây QUERY (chỉ đọc, không chiếm) danh sách khoá đang giữ toàn origin:
    // khoá của phiên này CÓ trong `held` ⇒ một tab đang sống với phiên ⇒ ĐỪNG mời (mời rồi "Ghi
    // nhận" sẽ giết phiên sống của tab kia); KHÔNG có ⇒ chủ đã đóng/crash ⇒ mời khôi phục. Web
    // Locks do TRÌNH DUYỆT giữ, không phụ thuộc JS chạy, nên đúng cả khi tab kia bị throttle (hơn
    // hẳn age-gate theo đồng hồ) và tự nhả khi tab crash/đóng — nên KHÔNG nuốt mất khôi phục sau
    // crash (đúng UC-03 E2).
    // Dùng `query()` thay vì thử-chiếm `ifAvailable`: hai lần chiếm-đồng-thời cùng tên khoá (React
    // StrictMode gọi effect đôi ở dev, hoặc remount nhanh) khiến lần sau thấy lần trước GIỮ tạm →
    // `null` → cả hai bỏ mời. `query()` chỉ đọc nên không có cuộc đua tự-gây đó.
    //
    // #311 — hai nhánh dùng HAI primitive khác nhau, chọn theo CHI PHÍ CỦA KẾT QUẢ SAI chứ không
    // theo "cái nào chuẩn hơn". Nhánh MỜI (ở đây) sai kiểu false-"có tab đang giữ" thì chỉ nuốt
    // mất lời mời khôi phục ⇒ `query()` chỉ-đọc là đủ và tránh được cuộc đua tự-gây. Nhánh DỌN
    // (dưới) sai kiểu false-"không ai giữ" thì GIẾT phiên đang sống của tab khác ⇒ phải nguyên tử,
    // xem chú thích ở đó. Mặc định an toàn của hai nhánh NGƯỢC nhau, nên KHÔNG hợp nhất chúng lại
    // thành một lời gọi rồi rẽ theo cùng một biến `held`.
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) {
      // Không hỗ trợ Web Locks → mặc định an toàn của MỜI là vẫn mời (thà hỏi thừa còn hơn nuốt
      // mất số liệu); còn DỌN thì mù liveness ⇒ không làm gì, để reap 8h dọn hộ.
      // Qua microtask để không setState đồng bộ trong thân effect.
      if (!isTooShortToOffer) queueMicrotask(offer);
    } else if (isTooShortToOffer) {
      // DỌN — `request({ ifAvailable: true })` chứ KHÔNG phải `query()`: chiếm được khoá là bằng
      // chứng NGUYÊN TỬ rằng không tab nào đang sống với phiên, và mình giữ khoá suốt lúc PATCH nên
      // không còn cửa sổ đua. `query()` thì có: khoá được TRÌNH DUYỆT cấp bất đồng bộ, nên ngay sau
      // khi tab khác bắt đầu một phiên (snapshot đã ghi ở t=0, khoá còn đang chờ cấp) một
      // `query()` xen vào đọc ra "không ai giữ" ⇒ hủy đúng phiên vừa sống. Chiếm không được thì
      // im lặng bỏ qua: chỉ là hoãn dọn tới lần mở màn sau (hoặc reap 8h), rẻ hơn hẳn.
      //
      // TUYỆT ĐỐI không kiểm `cancelled` trong callback: dưới StrictMode, twin1 chiếm được khoá rồi
      // cleanup bật `cancelled` — bỏ chạy ở đây thì twin2 đã bị `ifAvailable` từ chối, KHÔNG ai dọn,
      // và cả fix im lặng không chạy ở dev. `cancelled` chỉ để chặn setState.
      void locks
        .request(sessionLockName(snapshot.sessionId), { ifAvailable: true }, async (lock) => {
          if (!lock) return; // một tab đang sống với phiên này — không phải việc của mount này
          await discardOrphan();
        })
        .catch(() => {}); // API lỗi bất ngờ ⇒ mù liveness ⇒ không hủy mù, để reap 8h dọn
    } else {
      const lockName = sessionLockName(snapshot.sessionId);
      locks
        .query()
        .then((state) => {
          const held = state.held?.some((lock) => lock.name === lockName) ?? false;
          if (!held) offer();
        })
        .catch(() => offer()); // API lỗi bất ngờ → mặc định an toàn: vẫn mời
    }

    return () => {
      cancelled = true;
    };
  }, [user]);

  /**
   * Một chỗ duy nhất quyết định "màn này mở ra cái gì" — dùng cho cả lúc mount lẫn lúc hủy phiên.
   * Tách ra chính vì `onCancelled`: gọi thẳng `fetchEntryBranch()` ở đó sẽ nuốt mất deep-link,
   * khiến hủy một phiên vừa mở từ đồ thị lại nhảy sang khái niệm của hàng đợi.
   */
  const resolveEntry = useCallback(async (): Promise<EntryBranch> => {
    if (deepLink) {
      const item = await resolveDeepLinkItem(deepLink.planId, deepLink.conceptId);
      if (item) return { kind: 'has-item', item };
      // Deep-link hỏng → rơi về hàng đợi thường, không dựng màn lỗi riêng.
    }
    return fetchEntryBranch();
  }, [deepLink]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([resolveEntry(), pomodoroConfigApi.get().catch(() => null)])
      .then(([branch, pomodoroConfig]) => {
        if (!isMounted) return;
        if (pomodoroConfig) setConfig(pomodoroConfig);
        setEntry(branch);
      })
      .catch((error: unknown) => {
        console.error('Failed to load today queue', error);
        if (isMounted) setLoadError(true);
      });
    return () => {
      isMounted = false;
    };
  }, [resolveEntry]);

  const updateStrictMode = (value: boolean) => {
    setStrictModeState(value);
    localStorage.setItem(STRICT_MODE_KEY, String(value));
  };

  const handleStart = async () => {
    if (entry?.kind !== 'has-item' || isStarting) return;
    setIsStarting(true);
    try {
      const created = await focusSessionApi.create({
        planId: entry.item.planId,
        conceptIds: [entry.item.conceptId],
        strictMode,
      });
      setSession(created);
    } catch (error) {
      toast.error(getFocusSessionErrorMessage(error, 'create'));
    } finally {
      setIsStarting(false);
    }
  };

  const handleResumeDiscard = () => {
    clearFocusSessionSnapshot();
    setResumeSnapshot(null);
  };

  const handleResumeCommit = async () => {
    if (!resumeSnapshot) return;
    setIsResumeSubmitting(true);
    try {
      const focusedSeconds = Math.floor(resumeSnapshot.focusedMs / 1000);
      await focusSessionApi.end(resumeSnapshot.sessionId, {
        status: 'completed',
        focusedSeconds,
        awayCount: resumeSnapshot.awayCount,
        pomodorosCompleted: resumeSnapshot.pomodorosCompleted,
      });
      clearFocusSessionSnapshot();
      setResumeSnapshot(null);
      toast.success(`Đã ghi nhận ${formatMinutesPhrase(focusedSeconds)} tập trung.`);
    } catch (error) {
      toast.error(getFocusSessionErrorMessage(error));
      // M4 — lỗi 4xx (phiên đã kết thúc / không còn / số liệu quá 8h → không hợp lệ) thì PATCH lại
      // cũng hỏng: xoá snapshot để hộp khôi phục không kẹt vòng lặp 409 mỗi lần mở màn. Chỉ giữ
      // snapshot cho thử lại khi lỗi TẠM THỜI (mất mạng / 5xx).
      if (isTerminalFocusSessionError(error)) {
        clearFocusSessionSnapshot();
        setResumeSnapshot(null);
      }
    } finally {
      setIsResumeSubmitting(false);
    }
  };

  if (session && !summary) {
    // `key` ép mount lại toàn bộ (kể cả useFocusTimer) theo từng `session.id` — phiên mới
    // luôn có bộ đếm giờ riêng, không kế thừa state cũ.
    return (
      <RunningSession
        key={session.id}
        session={session}
        item={(entry as Extract<EntryBranch, { kind: 'has-item' }>).item}
        userId={user?.id ?? null}
        initialConfig={config}
        initialStrictMode={strictMode}
        onCompleted={(stats) => setSummary(stats)}
        onCancelled={() => {
          setSession(null);
          setEntry(null);
          setLoadError(false);
          // Hàng đợi có thể đã đổi trong lúc phiên chạy — tải lại từ đầu thay vì dùng entry cũ.
          // Qua `resolveEntry` (không phải `fetchEntryBranch`) để deep-link còn hiệu lực: hủy
          // phiên mở từ đồ thị phải quay về CHÍNH khái niệm đó, không nhảy sang mục hàng đợi.
          resolveEntry()
            .then(setEntry)
            .catch(() => setLoadError(true));
        }}
      />
    );
  }

  if (summary) {
    const item = (entry as Extract<EntryBranch, { kind: 'has-item' }>).item;
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <SessionSummary
          focusedSeconds={summary.focusedSeconds}
          pomodorosCompleted={summary.pomodorosCompleted}
          cycles={summary.cycles}
          awayCount={summary.awayCount}
          conceptName={item.name}
          estimatedMinutes={item.estimatedMinutes}
          interviewHref={`/interview?planId=${item.planId}&conceptIds=${item.conceptId}`}
        />
      </div>
    );
  }

  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      {resumeSnapshot && (
        <ResumeSessionDialog
          snapshot={resumeSnapshot}
          isSubmitting={isResumeSubmitting}
          onDiscard={handleResumeDiscard}
          onCommit={() => void handleResumeCommit()}
        />
      )}

      {loadError ? (
        <div className="border-border bg-card max-w-130 rounded-xl border p-6 text-center">
          <p className="text-muted-foreground text-[13.5px] leading-[1.65]">
            Không tải được hàng đợi ôn tập hôm nay. Vui lòng tải lại trang.
          </p>
        </div>
      ) : entry === null ? (
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      ) : entry.kind === 'has-item' ? (
        <NotStartedPanel
          item={entry.item}
          config={config}
          strictMode={strictMode}
          onStrictModeChange={updateStrictMode}
          isStarting={isStarting}
          onStart={() => void handleStart()}
          showConfigPanel={showConfigPanel}
          setShowConfigPanel={setShowConfigPanel}
          onApplyConfig={setConfig}
        />
      ) : entry.kind === 'empty-today' ? (
        <MessagePanel
          heading={entry.message}
          body="Không còn khái niệm nào đến hạn. Mỗi khái niệm có ngày ôn lại riêng, xa dần theo mức bạn nắm."
          primary={{ label: 'Về Dashboard', to: '/dashboard' }}
          secondary={{
            label: 'Vẫn muốn ôn thêm — chọn khái niệm trên đồ thị →',
            to: '/graph',
          }}
        />
      ) : entry.kind === 'no-plan' ? (
        // 3a — chưa có kế hoạch nào. Dùng đúng heading mockup (`.panel__t`), KHÔNG render nguyên
        // `NO_PLAN_MESSAGE` của server: câu server có thêm "Tạo một kế hoạch để bắt đầu ôn." —
        // vừa không có trong mockup, vừa lặp lại y nút "Tạo kế hoạch đầu tiên" ngay dưới.
        <MessagePanel
          heading="Bạn chưa có kế hoạch ôn tập nào đang hoạt động."
          body="Phiên tập trung cần một kế hoạch để biết nên ôn khái niệm nào."
          primary={{ label: 'Tạo kế hoạch đầu tiên', to: '/plan/new' }}
        />
      ) : entry.kind === 'awaiting-confirmation' ? (
        // 3b (#265) — đã có kế hoạch `draft`, chỉ còn thiếu bước xác nhận đồ thị. Mời "tạo kế
        // hoạch đầu tiên" ở đây là sai — họ đã có một cái đang nợ đúng một thao tác, không phải
        // thiếu kế hoạch. `/review-queue/today` không kèm planId của các draft này (chỉ đếm số
        // lượng trong câu chữ), nên không đủ dữ liệu để trỏ thẳng một `/plan/:id/verify` cụ thể
        // — cùng giới hạn dữ liệu mà Dashboard A1b gặp, nên cùng đích đến: danh sách kế hoạch,
        // nơi từng thẻ tự có link "Kiểm chứng đồ thị" riêng.
        <MessagePanel
          heading={entry.message}
          primary={{ label: 'Xem kế hoạch ôn tập', to: '/plans' }}
        />
      ) : entry.kind === 'all-archived' ? (
        // 3c — mọi kế hoạch đã bị lưu trữ chủ động. Thao tác "Bỏ lưu trữ" thật nằm ở menu của
        // từng thẻ trên /plans (không phải một nút gộp), nên CTA chỉ dẫn tới đó.
        <MessagePanel
          heading={entry.message}
          primary={{ label: 'Xem kế hoạch đã lưu trữ', to: '/plans' }}
        />
      ) : (
        // Nhánh 4 (#273): kế hoạch active nhưng chưa có hàng đợi nào — `message: null` từ server
        // là cố ý (chưa có phiên vấn đáp nào để dẫn xuất lịch ôn), không phải sót. Ca DUY NHẤT
        // trên toàn luồng review-queue mà client tự đặt chữ.
        // KHÔNG mượn giọng A2b của Dashboard nữa: A2b là câu của một trang-trung-tâm ("bắt đầu
        // phiên đầu tiên" = đi vấn đáp), còn Focus là điểm đến để HỌC — trả người dùng về
        // Dashboard ở đây là bật họ ra khỏi đúng màn họ vừa cố mở.
        // Lối ra là LIÊN KẾT SANG ĐỒ THỊ, đúng nguyên tắc mockup nhánh 2: "chỗ duyệt toàn bộ
        // khái niệm là màn đồ thị […] lối ra thứ hai vì thế là một liên kết chứ không phải một
        // danh sách mới" — Focus không dựng bộ chọn khái niệm. `/graph` tự giải quyết chuyện
        // nhiều kế hoạch (GraphIndexPage redirect sang plan `active` mới nhất), nên Focus không
        // cần planId — thứ mà response rỗng vốn không kèm.
        // Vòng khép kín: từ đồ thị, panel chi tiết có "Học lại khái niệm này" →
        // `/focus?planId=…&conceptId=…`, tức đúng deep-link mà `resolveEntry()` phía trên đọc.
        <MessagePanel
          heading="Kế hoạch của bạn chưa có lịch ôn tập."
          body="Lịch ôn được xếp từ kết quả các phiên kiểm tra, mà bạn thì chưa làm phiên nào."
          primary={{ label: 'Chọn khái niệm trên đồ thị', to: '/graph' }}
        />
      )}
    </div>
  );
}

interface NotStartedPanelProps {
  item: ReviewQueueItem;
  config: PomodoroConfig;
  strictMode: boolean;
  onStrictModeChange: (value: boolean) => void;
  isStarting: boolean;
  onStart: () => void;
  showConfigPanel: boolean;
  setShowConfigPanel: (open: boolean) => void;
  onApplyConfig: (config: PomodoroConfig) => void;
}

/** Trạng thái ① Chưa bắt đầu (mockup dòng 1850–1897). */
function NotStartedPanel({
  item,
  config,
  strictMode,
  onStrictModeChange,
  isStarting,
  onStart,
  showConfigPanel,
  setShowConfigPanel,
  onApplyConfig,
}: NotStartedPanelProps) {
  const chip =
    item.reason === 'traceback' && item.depth !== null ? `Truy ngược · tầng ${item.depth}` : null;

  return (
    <div className="focus-page max-w-130 mx-auto flex w-full flex-col items-center gap-[18px] text-center">
      {chip && <Badge tone="remediate">{chip}</Badge>}
      <Heading as="h1" size="page" className="leading-[1.15]">
        {item.name}
      </Heading>
      <p className="text-muted-foreground max-w-[46ch] text-pretty text-[13px] leading-[1.7]">
        {item.reasonText}
      </p>
      <div className="text-muted-foreground font-mono text-[44px] font-semibold tabular-nums tracking-[-0.03em]">
        {formatClock(config.work * 60000)}
      </div>
      <p className="text-muted-foreground max-w-[46ch] text-pretty text-[13px] leading-[1.7]">
        {cyclesToWords(config.cycles)} {config.work} phút, nghỉ {config.short_break} phút giữa các
        lượt. Đồng hồ chỉ chạy khi bạn bắt đầu.
      </p>

      <section className="border-border bg-card flex w-full items-center gap-[13px] rounded-md border px-[15px] py-[11px]">
        <ShieldCheck className="text-focus-session size-4 shrink-0" />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-sm font-medium">Chế độ nghiêm ngặt</div>
          <p className="text-muted-foreground text-xs leading-[1.5]">
            Rời khỏi tab thì đồng hồ tập trung dừng, và lần rời được ghi vào phiên.
          </p>
        </div>
        <Switch
          aria-label="Chế độ nghiêm ngặt"
          checked={strictMode}
          onCheckedChange={onStrictModeChange}
        />
      </section>

      <div className="flex items-center gap-2.5">
        <Button type="button" loading={isStarting} onClick={onStart}>
          Bắt đầu
        </Button>
        <PomodoroConfigPanel
          open={showConfigPanel}
          onOpenChange={setShowConfigPanel}
          trigger={
            <Button type="button" variant="secondary">
              Đổi độ dài lượt
            </Button>
          }
          config={config}
          onApply={onApplyConfig}
          session={null}
          strictMode={strictMode}
        />
      </div>

      <Link to="/dashboard" className="text-foreground border-border border-b text-[13px]">
        Chọn khái niệm khác →
      </Link>
    </div>
  );
}

interface MessagePanelProps {
  heading: string;
  body?: string;
  primary: { label: string; to: string };
  secondary?: { label: string; to: string };
}

/**
 * Nhánh 2/3 của AC ⓪ — mockup `.panel` (không viền, đứng trần giữa sân khấu): tiêu đề serif
 * `.panel__t`, thân `.panel__d`, `.actions` cho nút chính, và lối phụ là `.link--u` gạch chân.
 */
function MessagePanel({ heading, body, primary, secondary }: MessagePanelProps) {
  return (
    <div className="focus-page max-w-130 mx-auto flex w-full flex-col items-center gap-[18px] text-center">
      <Heading as="h1" size="section">
        {heading}
      </Heading>
      {body && (
        <p className="text-muted-foreground max-w-[46ch] text-pretty text-[13px] leading-[1.7]">
          {body}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <Button asChild>
          <Link to={primary.to}>{primary.label}</Link>
        </Button>
      </div>
      {secondary && (
        <Link
          to={secondary.to}
          className="text-foreground border-border hover:border-foreground border-b text-[13px]"
        >
          {secondary.label}
        </Link>
      )}
    </div>
  );
}
