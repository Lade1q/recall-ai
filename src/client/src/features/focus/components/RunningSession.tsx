import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, FileText, Pause, Play, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useFocusOverlay } from '@/components/shared/layouts/focus-overlay-context';
import { focusSessionApi, getFocusSessionErrorMessage } from '../api/focus.api';
import { clearFocusSessionSnapshot, useFocusTimer } from '../hooks/useFocusTimer';
import { useSessionDocument } from '../hooks/useSessionDocument';
import type { CreateFocusSessionResponse, PomodoroConfig } from '../types/focus.types';
import type { ReviewQueueItem } from '@/features/review-queue/types/review-queue.types';
import { formatClock, formatClockTime, formatMinutesSecondsPhrase } from '../utils/format';
import { sessionLockName } from '../utils/sessionLock';
import { CancelSessionDialog } from './CancelSessionDialog';
import { NotesPanel } from './NotesPanel';
import { PomodoroClockRing } from './PomodoroClockRing';
import { PomodoroConfigPanel } from './PomodoroConfigPanel';
import { SessionDocumentPanel, SessionDocumentSegment } from './SessionDocument';

/**
 * Dòng tổng kết trong phiên (`.tally` của mockup) — chỉ dùng ở màn KHÔNG mở tài liệu (nằm ngang dưới
 * đồng hồ). Khi mở tài liệu, cột phải theo mockup chỉ giữ đồng hồ + ghi chú + nút, không lặp lại dòng
 * này. Tách thành component để dùng lại khối "Tập trung / Nghiêm ngặt / Rời tab" ở một chỗ.
 */
function SessionTally({
  focusedMs,
  strictMode,
  awayCount,
  awayTotalMs,
}: {
  focusedMs: number;
  strictMode: boolean;
  awayCount: number;
  awayTotalMs: number;
}) {
  return (
    // #301 · mockup `@media (max-width:560px)` dòng 1449: `.tally{flex-direction:column;gap:5px}`
    // + `.tally__item{padding:0}`. App tách các mục bằng `px-2.5` (20px giữa hai mục) chứ không
    // dùng dấu chấm `::before` như mockup, nên khi xếp dọc phải hạ về `px-0` — không thì mỗi dòng
    // bị thụt vào 10px vô cớ. Vì thế rule `.tally__item + .tally__item::before{display:none}`
    // (dòng 1455) là NO-OP với app: không có pseudo-element nào để ẩn ⇒ cố ý không port.
    // `gap-y-[5px]` là số ĐO NGUYÊN VĂN từ mockup dòng 1450 (`gap:5px`), không phải bước thang
    // Tailwind — giữ literal để đối chiếu được với mockup.
    // ⚠️ Ghi chú chung cho mọi mốc `min-[N]px:` trong file: Tailwind sinh `min-width:Npx`, lệch
    // 1px so với `max-width:Npx` của mockup — đúng tại N px app đã ở nhánh rộng, mockup vẫn ở
    // nhánh hẹp. Chênh 1px này chấp nhận được và áp cho cả 560px lẫn 900px bên dưới.
    <p className="text-muted-foreground -mt-1 flex flex-col flex-wrap items-center justify-center gap-x-0 gap-y-[5px] text-xs min-[560px]:flex-row min-[560px]:gap-y-1">
      <span className="px-0 min-[560px]:px-2.5">
        Tập trung{' '}
        <span className="text-foreground font-mono text-[13px] font-semibold tabular-nums">
          {formatClock(focusedMs)}
        </span>
      </span>
      {strictMode && (
        <span className="text-focus-session flex items-center gap-1.5 px-0 min-[560px]:px-2.5">
          <ShieldCheck className="size-3.5 shrink-0" />
          Nghiêm ngặt đang bật
        </span>
      )}
      {awayCount > 0 && (
        <span className="px-0 min-[560px]:px-2.5">
          Rời tab{' '}
          <span className="text-foreground font-mono text-[13px] tabular-nums">
            {awayCount} lần ({formatClock(awayTotalMs)})
          </span>
        </span>
      )}
    </p>
  );
}

interface RunningSessionProps {
  session: CreateFocusSessionResponse;
  item: ReviewQueueItem;
  /** Chủ của phiên — chỉ đi thẳng vào snapshot khôi phục (xem `FocusSessionSnapshot.userId`). */
  userId: string | null;
  initialConfig: PomodoroConfig;
  initialStrictMode: boolean;
  onCompleted: (stats: {
    focusedSeconds: number;
    awayCount: number;
    pomodorosCompleted: number;
    cycles: number;
  }) => void;
  onCancelled: () => void;
}

/**
 * Khung `.fs-shell` của phiên đang sống (lượt `work`, nghỉ giải lao, hộp thoại rời tab/hủy) —
 * mọi thứ từ lúc `POST /focus-sessions` thành công tới lúc kết thúc/hủy.
 */
export function RunningSession({
  session,
  item,
  userId,
  initialConfig,
  initialStrictMode,
  onCompleted,
  onCancelled,
}: RunningSessionProps) {
  const timer = useFocusTimer({
    sessionId: session.id,
    startedAt: session.startedAt,
    planId: session.planId,
    conceptIds: session.conceptIds,
    conceptName: item.name,
    userId,
    initialConfig,
    initialStrictMode,
  });

  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  // FS-05: panel ghi chú (#228). Loại trừ lẫn nhau với panel tài liệu (#227) — mở ghi chú ẩn tài
  // liệu qua `isStageTakenOver` bên dưới, nên hai bố cục hai-cột không bao giờ chồng nhau.
  const [notesOpen, setNotesOpen] = useState(false);

  const setChromeInert = useFocusOverlay();
  const contentRef = useRef<HTMLDivElement>(null);

  // §0: khung phiên tắt sạch animation/transition — Popover/Dialog dùng portal nên phải gắn
  // class ở `document.body` (tổ tiên chung), không chỉ ở cây `.fs-shell` cục bộ.
  // H2: đồng thời báo MainLayout `inert` phần khung (sidebar/header) — lớp phủ `fixed inset-0`
  // che chúng về THỊ GIÁC nhưng chúng vẫn nằm trong tab order + cây trợ năng nếu không khoá,
  // nên người dùng bàn phím có thể Tab tới link sidebar vô hình rồi Enter điều hướng đi, unmount
  // phiên KHÔNG xác nhận → để lại hàng `running` treo tới lượt reap 8h.
  useEffect(() => {
    document.body.classList.add('focus-session-active');
    setChromeInert(true);
    return () => {
      document.body.classList.remove('focus-session-active');
      setChromeInert(false);
    };
  }, [setChromeInert]);

  // M3 — GIỮ khoá liveness suốt vòng đời phiên để tab khác biết phiên này đang SỐNG (đừng mời
  // khôi phục nó). Callback trả một promise chỉ resolve lúc unmount (kết thúc/hủy) → nhả khoá;
  // tab crash/đóng thì trình duyệt tự nhả. FocusPage của tab khác thử chiếm khoá này để dò.
  useEffect(() => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.request(sessionLockName(session.id), () => held).catch(() => {});
    return () => release();
  }, [session.id]);

  // Space = tạm dừng/tiếp tục. M1: chỉ khi tiêu điểm KHÔNG nằm trên một control tương tác — nếu
  // không `preventDefault` sẽ nuốt luôn việc Space kích hoạt nút/switch (vd Space trên "Kết thúc
  // phiên học" lại đi tạm dừng thay vì bấm nút). Tiêu điểm mặc định ở vùng nội dung (div tabIndex
  // -1) nên Space vẫn hoạt động cho lối tắt toàn màn.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'button, a, input, textarea, select, [role="switch"], [role="button"], [data-slot="popover-content"], [data-slot="dialog-content"]'
        )
      )
        return;
      if (timer.phase !== 'work' || timer.runState === 'away') return;
      e.preventDefault();
      if (timer.runState === 'running') timer.pause();
      else timer.resume();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [timer]);

  const finalizeSession = async (status: 'completed' | 'cancelled') => {
    const stats = timer.getFinalStats();
    try {
      await focusSessionApi.end(session.id, { status, ...stats });
      clearFocusSessionSnapshot();
      if (status === 'completed') {
        onCompleted({ ...stats, cycles: timer.config.cycles });
      } else {
        onCancelled();
      }
    } catch (error) {
      toast.error(getFocusSessionErrorMessage(error));
      throw error;
    }
  };

  const handleEnd = async () => {
    setIsEnding(true);
    try {
      await finalizeSession('completed');
    } catch {
      setIsEnding(false);
    }
  };

  const handleConfirmCancel = async () => {
    setIsCancelling(true);
    try {
      await finalizeSession('cancelled');
    } catch {
      setIsCancelling(false);
    }
  };

  const isBreak = timer.phase !== 'work';
  // Rời tab (chế độ nghiêm ngặt) là một `.panel` INLINE thay cả sân khấu — mockup state 4 vẽ nó
  // có số đồng hồ đóng băng + tiêu đề serif, KHÔNG phải overlay dialog. Đọc `awayInfo` qua biến
  // này để TS thu hẹp về non-null trong nhánh.
  const awayInfo = timer.runState === 'away' ? timer.awayInfo : null;
  const breakLabel = timer.phase === 'long_break' ? 'Nghỉ dài' : 'Nghỉ ngắn';
  const chip =
    item.reason === 'traceback' && item.depth !== null ? `Truy ngược · tầng ${item.depth}` : null;

  // M5/H2: bốn màn con (chạy / nghỉ / rời-tab) thay nhau trong CÙNG khung. Mỗi lần đổi màn, nút
  // đang focus bị unmount → tiêu điểm rơi về `<body>`, người dùng bàn phím/đọc màn hình mất dấu.
  // Đưa tiêu điểm về vùng nội dung mới mỗi lần đổi màn (và cả lần mount đầu — kéo focus VÀO lớp
  // phủ thay vì để lại ở sidebar vừa bị `inert`).
  const screen = awayInfo ? 'away' : isBreak ? 'break' : 'running';

  // FS-04. Nghỉ giải lao và màn rời-tab đều CHIẾM sân khấu, nên tài liệu tự ẩn ở cả hai — "nghỉ mà
  // vẫn nhìn tài liệu thì không phải nghỉ" (mockup trạng thái 8), còn màn rời-tab thì vốn đã thay
  // toàn bộ nội dung. Mức đang chọn không bị quên: hết nghỉ là tài liệu trở lại đúng mức cũ.
  const documentPlanId = session.planId;
  const sessionDocument = useSessionDocument({
    planId: documentPlanId,
    conceptId: item.conceptId,
    // Panel ghi chú mở cũng CHIẾM sân khấu với tài liệu: `notesOpen` ẩn tài liệu + vô hiệu phím `D`
    // (useSessionDocument bỏ qua `D` khi `isStageTakenOver`), nên hai panel loại trừ nhau — không
    // bao giờ có bố cục ba cột chen chúc mà mockup không hề vẽ.
    isStageTakenOver: screen !== 'running' || notesOpen,
  });
  const isDocumentOpen = sessionDocument.level !== 'hidden';

  useEffect(() => {
    // LOW: đừng giật tiêu điểm nếu người dùng đang gõ trong popover cấu hình (đổi lượt trùng đúng
    // lúc panel mở). Popover portal ra `body` với `data-slot`; focus đang ở đó thì để yên.
    if (document.activeElement?.closest('[data-slot="popover-content"]')) return;
    contentRef.current?.focus();
  }, [screen]);

  // Đóng panel ghi chú → trả tiêu điểm về vùng nội dung (nút đang focus vừa bị unmount cùng panel).
  // Mở panel thì để yên: `NotesPanel` tự đưa tiêu điểm vào ô soạn.
  useEffect(() => {
    if (notesOpen) return;
    if (document.activeElement?.closest('[data-slot="popover-content"]')) return;
    contentRef.current?.focus();
  }, [notesOpen]);

  // FS-05 phím tắt: `N` mở/đóng ghi chú, `Esc` đóng. Input-guard giống phím `D` của #227 — gõ chữ
  // "n" trong ô soạn/ô nhập KHÔNG được lật panel. `Esc` thì cố ý hoạt động cả trong ô soạn (đó là
  // cách đóng nhanh khi con trỏ đang ở textarea), nhưng nhường lại cho Popover cấu hình / hộp thoại
  // hủy khi chúng đang mở để không đóng nhầm hai lớp cùng lúc.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isTyping = !!target?.closest('input, textarea, select, [contenteditable="true"]');

      if ((e.key === 'n' || e.key === 'N') && !isTyping && screen === 'running') {
        e.preventDefault();
        setNotesOpen((open) => !open);
        return;
      }

      if (e.key === 'Escape' && notesOpen && !showConfigPanel && !showCancelConfirm) {
        e.preventDefault();
        setNotesOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [screen, notesOpen, showConfigPanel, showCancelConfirm]);

  // Mockup vẽ màn phiên KHÔNG có sidebar (`.fs-shell` = `100dvh`, `overflow:hidden`). Route vẫn
  // nằm trong `MainLayout` — AC ⓪ cần sidebar cho hai lối vào ⓪/① — nên chính màn phiên tự phủ
  // viewport thay vì dời route ra ngoài (dời route là bẫy đã cắn PR #279: vỡ phép tính chiều cao
  // + mất padding của `<main>`). `fixed` thoát luôn `max-w-7xl` của `<main>`, thứ mà hack margin
  // âm trước đây không thoát được trên màn rộng.
  // `z-50`: sidebar là `z-auto`, header mobile `z-30` → bị che. Dialog/Popover portal ra
  // `document.body` nên cùng `z-50` vẫn thắng nhờ đứng sau trong DOM — đừng nâng quá 50.
  return (
    <div className="focus-page bg-background fixed inset-0 z-50 flex flex-col overflow-hidden">
      <a
        href="#dieu-khien"
        className="border-foreground bg-card text-foreground fixed left-3 top-[-60px] z-20 rounded-md border px-3.5 py-2 text-[13px] no-underline focus:top-3"
      >
        Tới cụm điều khiển phiên
      </a>

      {/* #301 · mockup `@media (max-width:560px)` dòng 1440: `.fs-top{grid-template-columns:minmax(0,1fr);
          row-gap:10px}`. Dưới 560px cụm phải (bộ chọn tài liệu + 2 nút) đã chiếm ~298px, track
          `1fr` của cụm trái co còn ~13px và nút "Hủy phiên" tràn đè lên bộ chọn — hai thứ bấm được
          nằm chồng nhau. Cho mỗi cụm một hàng riêng thì hết chồng, đổi lại thanh trên cao thêm một
          dòng. `gap-y-2.5` = 10px, đúng `row-gap:10px` của mockup; `min-[560px]:gap-y-5` trả
          computed style ≥560px về đúng `gap:20px` cũ. */}
      <header className="border-border bg-card grid shrink-0 grid-cols-[minmax(0,1fr)] items-center gap-x-5 gap-y-2.5 border-b px-5 py-3 min-[560px]:grid-cols-[1fr_auto] min-[560px]:gap-y-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            // L3: khoá khi ĐANG kết thúc/hủy — không thì bấm "Hủy phiên" lúc "Kết thúc" đang PATCH
            // sẽ mở hộp xác nhận rồi bắn PATCH thứ hai cho cùng một phiên.
            disabled={isEnding || isCancelling}
            className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium [outline-style:none] focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="size-4" />
            Hủy phiên
          </button>
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="whitespace-nowrap text-sm font-semibold">Phiên học</span>
            {/* #301 · mockup `@media (max-width:900px)` dòng 1419: `.fs-top__plan{display:none}`.
                Tên kế hoạch là ngữ cảnh phụ; dưới 900px nó tranh chỗ với nhãn "Phiên học" và nút
                "Hủy phiên" trong cùng một track. Mốc 900px trùng với `.split` bên dưới. Rule này
                nằm cùng block `@media` với `.split` nhưng bị sót khỏi checklist issue — port kèm.
                `sr-only` chứ không phải `hidden`: rule mockup là một quyết định THỊ GIÁC, và
                `sr-only` trả đúng chi phí thị giác = 0 (box 1×1px, `clip-path:inset(50%)`, absolute
                nên không chiếm chỗ). Nhưng `display:none` còn cắt luôn khỏi a11y tree, mà
                `RunningSession` là nơi DUY NHẤT tên KẾ HOẠCH xuất hiện trong màn phiên học
                (`item.name` ở cột phải là tên KHÁI NIỆM, không thay thế được) — người dùng screen
                reader sẽ mất hẳn thông tin đó dưới 900px. `sr-only` giữ nó trong cây và đúng thứ
                tự đọc, không thêm nội dung mới nên vẫn là thuần layout.
                ⚠️ Dùng variant NGHỊCH `not-min-[900px]:` (`@media not (width>=900px)`) chứ KHÔNG
                dùng cặp `sr-only` ở base + utility khôi phục ở `min-[900px]:`. Đã grep CSS build:
                `.truncate` sinh ở offset ~25.8k, còn utility khôi phục (`white-space:normal;
                overflow:visible`) rơi vào block `@media (width>=900px)` ở ~83.3k — mà `@media`
                KHÔNG cộng độ đặc hiệu, nên nó GHI ĐÈ `truncate` (`white-space:nowrap;
                overflow:hidden`) ở ≥900px: tên kế hoạch dài sẽ xuống dòng thay vì cắt bằng dấu ba
                chấm. Đó là hồi quy desktop. Với variant nghịch, từ 900px KHÔNG có khai báo nào áp
                thêm ⇒ computed style trùng khít bản `main`. Chọn `not-min-[900px]:` chứ không
                `max-[899px]:` vì nó là phần bù CHÍNH XÁC, không hở ở bề rộng lẻ (899.5px). */}
            <span className="text-muted-foreground not-min-[900px]:sr-only truncate text-[13px]">
              {item.planName}
            </span>
          </div>
        </div>
        {/* #301 · mockup dòng 1445: `.fs-top__right{justify-content:flex-start}` dưới 560px — khi
            cụm này đã có hàng riêng thì dồn phải làm nó trôi xa cụm trái, đọc như hai khối rời.
            `flex-wrap` chỉ sống ĐÚNG trong dải <560px, cùng dải mockup đụng tới: ở 320px cụm này
            (~298px) cộng padding 40px là tràn, nên phải cho xuống dòng. Từ 560px trả `flex-nowrap`
            ngay — cho wrap ở dải 560–899px sẽ hạ min-content width của track `auto` trong lưới
            `1fr auto`, khiến cụm phải tự rơi xuống 2 dòng (header cao thêm ~36px) ở đúng mốc 768px
            mà AC bắt đo LIVE, trong khi mockup không hề đổi gì cho `.fs-top__right` ở dải đó. */}
        <div className="flex flex-wrap items-center justify-start gap-2.5 min-[560px]:flex-nowrap min-[560px]:justify-end">
          {/* Chỉ có mặt ở màn ĐANG CHẠY: trong giờ nghỉ / lúc rời tab thì tài liệu đã tự ẩn, để lại
              một segment bấm được nhưng không đổi được gì trên màn hình là nói dối người dùng. Ẩn
              luôn khi panel ghi chú mở — lúc đó tài liệu bị `isStageTakenOver` khoá, segment sẽ bấm
              được mà không đổi gì (cùng lý do trên). */}
          {screen === 'running' && !notesOpen && (
            <SessionDocumentSegment document={sessionDocument} />
          )}
          {screen === 'running' && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Ghi chú nhanh"
              aria-pressed={notesOpen}
              onClick={() => setNotesOpen((open) => !open)}
            >
              <FileText />
            </Button>
          )}
          <PomodoroConfigPanel
            open={showConfigPanel}
            onOpenChange={setShowConfigPanel}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Cấu hình Pomodoro"
                aria-expanded={showConfigPanel}
              >
                <Settings2 />
              </Button>
            }
            config={timer.config}
            onApply={timer.updateConfig}
            session={{
              phase: timer.phase,
              phaseElapsedMs: timer.phaseElapsedMs,
              phaseTargetMs: timer.phaseTargetMs,
              pomodorosCompleted: timer.pomodorosCompleted,
            }}
            strictMode={timer.strictMode}
          />
        </div>
      </header>

      {/* `min-h-0 flex-1` là bắt buộc, không phải trang trí: thiếu nó thì item flex cao bằng nội
          dung và `overflow-y-auto` không bao giờ kích hoạt. Trước đây phần tràn vẫn đọc được nhờ
          BODY cuộn bù, nhưng phần tử `fixed` không đóng góp vào vùng cuộn của document — mất lưới
          an toàn đó thì nội dung tràn sẽ không cuộn tới được nữa (mockup giải bằng
          `grid-template-rows: auto minmax(0,1fr)`).
          Canh giữa bằng `my-auto` của flex chứ không phải `place-items-center` của grid: khi nội
          dung cao hơn khung, margin auto co về 0 (chỉ hấp thụ khoảng trống dương) nên nội dung
          bám mép trên và cuộn được; grid centering thì đẩy mép trên ra ngoài vùng cuộn. */}
      {/* Vùng nội dung + lớp ghi chú chung một khối định vị `relative`. Từ 900px trở lên: rail ghi
          chú NỔI tuyệt đối bên phải, KHÔNG chen vào luồng nên KHÔNG đẩy lệch màn đang chạy (quyết
          định UX 2026-08-09: panel nhỏ không đáng để xê dịch đồng hồ). Dưới 900px (mockup `.notes`
          @media): rail 320-340px sẽ CHE gần hết vòng, nên khối chuyển sang XẾP DỌC — stage trên,
          ghi chú thành khối tĩnh bên dưới (đồng hồ vẫn nhìn thấy). Khi ghi chú mở, `isStageTakenOver`
          đã ẩn tài liệu ⇒ nhánh dưới rơi về màn đang chạy NGUYÊN VẸN. */}
      <div className="relative flex min-h-0 flex-1 flex-col min-[900px]:flex-row">
        {documentPlanId !== null && isDocumentOpen ? (
          /* Bố cục hai cột của mockup (`.split`): tài liệu trái, cột phải giữ TÊN KHÁI NIỆM + ĐỒNG
           HỒ RÚT GỌN + nút đổi mức. Mockup vẽ cột phải chỉ có đồng hồ + ghi chú + một nút duy nhất;
           khối tên khái niệm là phần THÊM của #373 và là chỗ lệch mockup duy nhất ở đây — mở tài
           liệu ra mà không còn tên khái niệm thì người đọc mất luôn thứ mà mẩu trích đang minh hoạ.
           Cụm dừng/kết thúc vẫn thuộc màn không-tài-liệu; ở đây `Space` vẫn tạm dừng, và bấm "Ẩn"
           trên thanh trên là về màn đó. Mỗi cột tự cuộn (`min-h-0` + `overflow-y-auto`) để trang PDF
           cao đến đâu cũng không đẩy đồng hồ khỏi tầm mắt. */
          <div
            ref={contentRef}
            tabIndex={-1}
            // #301 · mockup `@media (max-width:900px)` dòng 1400: `.split{grid-template-columns:
            // minmax(0,1fr)}`. Grid này nằm trong `flex-1 min-h-0`; nếu chỉ hạ xuống 1 cột thì hai
            // hàng đều `auto` và hai con `overflow-y-auto` tranh nhau chiều cao ⇒ bị CẮT CỤT chứ
            // không cuộn. Vì vậy nhánh hẹp chỉ định `grid-rows` tường minh: hàng `auto` cho cột
            // phải (cao theo nội dung, luôn hiện đủ), hàng `minmax(0,1fr)` cho cột tài liệu để nó
            // nhận phần còn lại và tự cuộn. Từ 900px trả về 1 hàng `minmax(0,1fr)` như cũ.
            //
            // Sàn `64px` của hàng 2 là phần được ĐO chứ không phải phòng hờ. Track `auto` lấy
            // growth limit bằng max-content của `<aside>` (~370px ở bề rộng điện thoại: padding 44
            // + nhãn "Đang học"/tên khái niệm ~60 + đồng hồ ~63 + đoạn giải thích ~115 + nút 36 +
            // 3×`gap-4`), còn `1fr` CHỈ nhận free space còn lại và tụt được tới 0. Đo Chromium ở
            // 667×294 (điện thoại xoay ngang, vẫn <900px): `minmax(0,1fr)` cho rows `210px 0px` —
            // cột tài liệu biến mất hoàn toàn dù người dùng vừa bấm "Trích đoạn"/"Toàn văn", và
            // tổ tiên `overflow-hidden` nên không cuộn tới được. Sàn 64px ép hàng 2 luôn có mặt:
            // aside còn 146px (= 294 − thanh trên 84 − sàn 64), hẹp hơn 162px mà aside cần, nên
            // caption "Còn lại · Pomodoro n/N" bị cắt 16px và phải cuộn — nhưng DÃY SỐ GIỜ vẫn
            // nguyên vẹn, kết thúc ở 225px trong box aside 84–230 ⇒ ĐỒNG HỒ VẪN TRONG TẦM (nguyên
            // tắc epic), còn tài liệu tuy chỉ hở một dải nhưng thấy được đường kẻ và biết là cuộn
            // được. Quyết định đã chốt: hết chỗ thì đồng hồ thắng, tài liệu giữ sàn. Chọn 64 chứ
            // không phải 120 vì `minmax(120px,1fr)` đo được aside tụt còn 90px — cắt mất 51px của
            // chính dãy số giờ, vi phạm epic. Ở 500×731 (phone portrait) sàn không kích hoạt: rows
            // `368px 198px`, trùng khít bản `main`, không một pixel khoảng trắng chết.
            className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(64px,1fr)] outline-none min-[900px]:grid-cols-[minmax(0,1fr)_300px] min-[900px]:grid-rows-[minmax(0,1fr)]"
          >
            {/* #301 · LỆCH MOCKUP CÓ CHỦ ĐÍCH. Mockup giữ nguyên thứ tự DOM khi collapse (tài liệu
                trên, cột đồng hồ dưới) — ở 375px người dùng phải cuộn hết tài liệu mới thấy đồng
                hồ, vi phạm nguyên tắc epic Focus "đồng hồ không bao giờ biến mất". Theo tiền lệ
                #228 (stage trên, panel phụ dưới), dưới 900px cột `<aside>` lên TRÊN và tài liệu
                xuống DƯỚI. Đảo bằng `order` chứ không đổi thứ tự DOM: thứ tự đọc của screen reader
                và thứ tự Tab vẫn là "tài liệu → điều khiển", khớp với luồng ở desktop và tránh
                việc nút "Mở toàn văn" nhảy lên trước nội dung mà nó điều khiển.
                Hệ quả: đường kẻ ngăn hai khối phải là `border-t` TRÊN cột tài liệu (nó nằm dưới),
                không phải `border-bottom` như mockup dòng 1405 vốn giả định tài liệu nằm trên. */}
            <div className="border-border order-last flex min-h-0 flex-col overflow-y-auto border-t px-6 py-[22px] min-[900px]:order-none min-[900px]:border-r min-[900px]:border-t-0">
              <SessionDocumentPanel planId={documentPlanId} document={sessionDocument} />
            </div>

            {/* #301 · KHÔNG kẹp `max-h` ở đây, dù bản nháp từng làm vậy. `<aside>` là grid item,
                containing block của nó là grid area — mà grid area hàng 1 do CHÍNH track `auto`
                sinh ra ⇒ mọi percentage chiều dọc là cyclic. Theo CSS Sizing 3 §5.2.1, `max-height`
                cyclic bị coi như `none` khi tính contribution để size track, nên track vẫn 370px y
                hệt (đo được); percentage chỉ resolve SAU khi track đã chốt và track không co ngược.
                Hệ quả đo thật ở 500×731: track giữ 370px nhưng box aside bị kẹp còn 203.5px ⇒ 166px
                khoảng trắng chết trên `border-t`, và aside phải cuộn trong khi ngay dưới còn chỗ.
                Sàn 64px trên track hàng 2 (xem ghi chú ở `className` của grid) mới là chỗ sửa đúng:
                nó tác động vào chính thứ quyết định chiều cao, thay vì kẹp cái box đã bị quyết. */}
            <aside className="order-first flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-[22px] min-[900px]:order-none">
              {/* #373 ①: mở tài liệu ra thì tên khái niệm biến mất khỏi màn — người dùng còn lại
                  mỗi một mẩu chữ rời và không có gì nói nó đang minh hoạ cho cái gì.
                  ⚠️ Đặt ở CỘT PHẢI cạnh đồng hồ, KHÔNG phải đầu cột tài liệu: #227 đã cố ý gỡ nó
                  khỏi chỗ đó vì nằm đúng vị trí tiêu đề mục thì nó đọc ra như một mục có thật
                  trong tệp — một nhãn bịa (xem docstring `DocumentExcerpt`). Ở đây nó thuộc về
                  khối trạng thái phiên, cạnh đồng hồ, nên không giả vờ là nội dung tài liệu. */}
              <div className="text-center">
                <div className="text-muted-foreground text-[11px] uppercase tracking-[0.08em]">
                  Đang học
                </div>
                <h1 className="font-heading mt-1 text-balance text-[17px] leading-[1.25] tracking-[-0.02em]">
                  {item.name}
                </h1>
              </div>

              <div className="text-center">
                <div className="font-mono text-[34px] font-semibold tabular-nums tracking-[-0.03em]">
                  {formatClock(Math.max(0, timer.phaseTargetMs - timer.phaseElapsedMs))}
                </div>
                <div className="text-muted-foreground mt-1.5 text-[11px] uppercase tracking-[0.08em]">
                  Còn lại · Pomodoro {(timer.pomodorosCompleted % timer.config.cycles) + 1}/
                  {timer.config.cycles}
                </div>
              </div>

              {/* #373 ②: câu cũ — "Vùng tô sáng là đoạn khớp… Phần còn lại của tài liệu vẫn mở
                  được…" — dựng sai mô hình trong đầu người đọc. Nó gợi ra một trang tài liệu có
                  một vùng được tô, trong khi thứ trên màn là một mẩu trích 65–119 ký tự mà
                  **69–79% đã là vùng tô sáng**: không có "phần còn lại" nào quanh nó để mà đối
                  chiếu. Câu mới nói đúng thứ đang bày, và trỏ sang nút ngay dưới cho ngữ cảnh. */}
              <p className="text-muted-foreground m-0 text-xs leading-[1.6]">
                {sessionDocument.level === 'excerpt'
                  ? 'Đây là câu trích ngắn lấy nguyên văn từ tài liệu, không phải cả đoạn quanh nó. Mở toàn văn để đọc trong ngữ cảnh.'
                  : 'Đang mở toàn văn. Thời gian tập trung vẫn chạy vì bạn còn ở trong tab này.'}
              </p>

              <div id="dieu-khien" tabIndex={-1} className="outline-none">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() =>
                    sessionDocument.setLevel(
                      sessionDocument.level === 'excerpt' ? 'fulltext' : 'hidden'
                    )
                  }
                >
                  {sessionDocument.level === 'excerpt' ? 'Mở toàn văn' : 'Ẩn tài liệu'}
                </Button>
              </div>
            </aside>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-7">
            <div
              ref={contentRef}
              tabIndex={-1}
              className="max-w-130 mx-auto my-auto flex w-full flex-col items-center gap-6 outline-none"
            >
              {awayInfo ? (
                <div className="flex w-full flex-col items-center gap-[18px] px-8 py-[30px] text-center">
                  <div className="text-muted-foreground font-mono text-[44px] font-semibold tabular-nums tracking-[-0.03em]">
                    {formatClock(Math.max(0, timer.phaseTargetMs - timer.phaseElapsedMs))}
                  </div>
                  <h1 className="font-heading text-[19px] tracking-[-0.02em]">
                    Đồng hồ tập trung đã dừng
                  </h1>
                  <p className="text-muted-foreground max-w-[46ch] text-pretty text-[13px] leading-[1.7]">
                    Bạn rời tab lúc {formatClockTime(new Date(awayInfo.leftAt))} và quay lại sau{' '}
                    <strong className="text-foreground">
                      {formatMinutesSecondsPhrase(Math.round(awayInfo.durationMs / 1000))}
                    </strong>
                    . Khoảng đó không tính vào thời gian tập trung. Tổng trong phiên này:{' '}
                    {timer.awayCount} lần ·{' '}
                    {formatMinutesSecondsPhrase(Math.round(timer.awayTotalMs / 1000))}.
                  </p>
                  <div
                    id="dieu-khien"
                    tabIndex={-1}
                    className="flex items-center gap-2.5 outline-none"
                  >
                    <Button type="button" onClick={() => timer.acknowledgeAway(false)}>
                      Tiếp tục
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => timer.acknowledgeAway(true)}
                    >
                      Tắt chế độ nghiêm ngặt
                    </Button>
                  </div>
                </div>
              ) : isBreak ? (
                <div className="flex w-full flex-col items-center gap-[18px] px-8 py-[30px] text-center">
                  <div className="text-muted-foreground font-mono text-[44px] font-semibold tabular-nums tracking-[-0.03em]">
                    {formatClock(Math.max(0, timer.phaseTargetMs - timer.phaseElapsedMs))}
                  </div>
                  <h1 className="font-heading text-[19px] tracking-[-0.02em]">{breakLabel}</h1>
                  <p className="text-muted-foreground max-w-[46ch] text-pretty text-[13px] leading-[1.7]">
                    Hết giờ nghỉ, Pomodoro {(timer.pomodorosCompleted % timer.config.cycles) + 1}/
                    {timer.config.cycles} tự bắt đầu với cùng khái niệm{' '}
                    <strong className="text-foreground">{item.name}</strong>. Thời gian nghỉ không
                    tính vào thời gian tập trung.
                  </p>
                  <div
                    id="dieu-khien"
                    tabIndex={-1}
                    className="flex items-center gap-2.5 outline-none"
                  >
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isEnding || isCancelling}
                      onClick={timer.skipBreak}
                    >
                      Bỏ qua giờ nghỉ
                    </Button>
                    <Button
                      type="button"
                      loading={isEnding}
                      disabled={isCancelling}
                      onClick={() => void handleEnd()}
                    >
                      Kết thúc phiên học
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <section className="flex flex-col items-center gap-2.5 text-center">
                    {chip && <Badge tone="remediate">{chip}</Badge>}
                    <h1 className="font-heading text-balance text-[34px] leading-[1.15] tracking-[-0.025em]">
                      {item.name}
                    </h1>
                    <p className="text-muted-foreground max-w-[46ch] text-[13px] leading-[1.65]">
                      {item.reasonText}
                    </p>
                  </section>

                  <PomodoroClockRing
                    elapsedMs={timer.phaseElapsedMs}
                    targetMs={timer.phaseTargetMs}
                    pomodorosCompleted={timer.pomodorosCompleted}
                    config={timer.config}
                  />

                  <SessionTally
                    focusedMs={timer.focusedMs}
                    strictMode={timer.strictMode}
                    awayCount={timer.awayCount}
                    awayTotalMs={timer.awayTotalMs}
                  />

                  <div
                    id="dieu-khien"
                    tabIndex={-1}
                    className="flex items-center gap-2.5 outline-none"
                  >
                    <Button
                      type="button"
                      className="bg-focus-session/12 border-focus-session/45 text-focus-session hover:bg-focus-session/20 border font-semibold"
                      onClick={() =>
                        timer.runState === 'running' ? timer.pause() : timer.resume()
                      }
                    >
                      {timer.runState === 'running' ? <Pause /> : <Play />}
                      {timer.runState === 'running' ? 'Tạm dừng' : 'Tiếp tục'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={isEnding}
                      disabled={isCancelling}
                      onClick={() => void handleEnd()}
                    >
                      Kết thúc phiên học
                    </Button>
                  </div>

                  <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-3.5 text-[11.5px]">
                    <span className="inline-flex items-center gap-1.5">
                      <Kbd>Space</Kbd> tạm dừng
                    </span>
                    {/* Chỉ mời dùng `D` khi ít nhất một mức tài liệu mở được. Thiếu neo chỉ loại
                    "Trích đoạn" khỏi vòng xoay; tài liệu gốc vẫn cho `D` mở "Toàn văn" (#378). */}
                    {(sessionDocument.unavailableReasons.excerpt === null ||
                      sessionDocument.unavailableReasons.fulltext === null) && (
                      <span className="inline-flex items-center gap-1.5">
                        <Kbd>D</Kbd> tài liệu
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <Kbd>N</Kbd> ghi chú
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        {/* FS-05: rail ghi chú NỔI bên phải — overlay tuyệt đối, KHÔNG reflow màn đang chạy. Chỉ ở
            màn ĐANG CHẠY (giờ nghỉ / rời tab thì ghi chú tự ẩn như tài liệu #227). §0: hiện/ẩn tức
            thì, không trượt. `bg-card` đục + viền trái + bóng nhẹ tinted để nổi lên trên nội dung. */}
        {notesOpen && screen === 'running' && (
          <NotesPanel
            // <900px: khối tĩnh xếp dưới stage (đồng hồ ở trên vẫn thấy), cao tối đa 45vh tự cuộn.
            // ≥900px: rail nổi tuyệt đối bên phải, KHÔNG reflow đồng hồ. Khớp @media của mockup.
            className="border-border max-h-[45vh] w-full flex-none border-t min-[900px]:absolute min-[900px]:inset-y-0 min-[900px]:right-0 min-[900px]:z-10 min-[900px]:max-h-none min-[900px]:w-[min(340px,85vw)] min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:shadow-[-6px_0_20px_-14px_oklch(0_0_0_/_0.1)]"
            sessionId={session.id}
            conceptId={item.conceptId}
            conceptName={item.name}
          />
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {timer.announcement}
      </p>

      <CancelSessionDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        focusedSeconds={Math.floor(timer.focusedMs / 1000)}
        conceptName={item.name}
        isSubmitting={isCancelling}
        onConfirm={() => void handleConfirmCancel()}
      />
    </div>
  );
}
