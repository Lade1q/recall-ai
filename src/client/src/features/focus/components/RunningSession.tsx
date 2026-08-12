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
    <p className="text-muted-foreground -mt-1 flex flex-wrap items-center justify-center gap-x-0 gap-y-1 text-xs">
      <span className="px-2.5">
        Tập trung{' '}
        <span className="text-foreground font-mono text-[13px] font-semibold tabular-nums">
          {formatClock(focusedMs)}
        </span>
      </span>
      {strictMode && (
        <span className="text-focus-session flex items-center gap-1.5 px-2.5">
          <ShieldCheck className="size-3.5 shrink-0" />
          Nghiêm ngặt đang bật
        </span>
      )}
      {awayCount > 0 && (
        <span className="px-2.5">
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

      <header className="border-border bg-card grid shrink-0 grid-cols-[1fr_auto] items-center gap-5 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            // L3: khoá khi ĐANG kết thúc/hủy — không thì bấm "Hủy phiên" lúc "Kết thúc" đang PATCH
            // sẽ mở hộp xác nhận rồi bắn PATCH thứ hai cho cùng một phiên.
            disabled={isEnding || isCancelling}
            className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="size-4" />
            Hủy phiên
          </button>
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="whitespace-nowrap text-sm font-semibold">Phiên học</span>
            <span className="text-muted-foreground truncate text-[13px]">{item.planName}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5">
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
          /* Bố cục hai cột của mockup (`.split`): tài liệu trái, cột phải giữ ĐỒNG HỒ RÚT GỌN + nút
           đổi mức. Theo mockup, cột phải CHỈ có đồng hồ + ghi chú + một nút duy nhất — cụm dừng/kết
           thúc thuộc màn không-tài-liệu; ở đây `Space` vẫn tạm dừng, và bấm "Ẩn" trên thanh trên là
           về màn đó. Mỗi cột tự cuộn (`min-h-0` + `overflow-y-auto`) để trang PDF cao đến đâu cũng
           không đẩy đồng hồ khỏi tầm mắt. */
          <div
            ref={contentRef}
            tabIndex={-1}
            className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] outline-none"
          >
            <div className="border-border flex min-h-0 flex-col overflow-y-auto border-r px-6 py-[22px]">
              <SessionDocumentPanel planId={documentPlanId} document={sessionDocument} />
            </div>

            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-[22px]">
              <div className="text-center">
                <div className="font-mono text-[34px] font-semibold tabular-nums tracking-[-0.03em]">
                  {formatClock(Math.max(0, timer.phaseTargetMs - timer.phaseElapsedMs))}
                </div>
                <div className="text-muted-foreground mt-1.5 text-[10px] uppercase tracking-[0.08em]">
                  Còn lại · Pomodoro {(timer.pomodorosCompleted % timer.config.cycles) + 1}/
                  {timer.config.cycles}
                </div>
              </div>

              <p className="text-muted-foreground m-0 text-xs leading-[1.6]">
                {sessionDocument.level === 'excerpt'
                  ? 'Vùng tô sáng là đoạn khớp với khái niệm đang học. Phần còn lại của tài liệu vẫn mở được, nhưng không mặc định chiếm màn hình.'
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
                    {/* Chỉ mời dùng `D` khi nó THẬT SỰ làm được gì: khái niệm chưa neo vị trí thì phím
                    này không mở nổi mức nào, quảng cáo nó chỉ tạo một lối tắt bấm vào không phản
                    hồi — tệ hơn là không nhắc. Lý do khoá đã nằm ở tooltip của segment. */}
                    {sessionDocument.unavailableReason === null && (
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
