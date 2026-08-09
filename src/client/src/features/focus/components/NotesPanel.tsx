import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAutosaveNote, type NoteSaveStatus } from '../hooks/useAutosaveNote';
import { formatClockTime } from '../utils/format';

/** Nhãn trạng thái tự-lưu (mockup `.notes__saved`): nói rõ đã lưu lúc nào / đang lưu / ngoại tuyến. */
function saveStatusLabel(status: NoteSaveStatus, savedAt: Date | null): string {
  switch (status) {
    case 'saving':
      return 'Đang lưu…';
    case 'saved':
      return savedAt ? `Đã lưu ${formatClockTime(savedAt)}` : 'Đã lưu';
    case 'offline':
      return 'Ngoại tuyến · sẽ lưu lại';
    case 'error':
      return 'Lưu lỗi · thử lại';
    default:
      return 'Tự lưu khi bạn gõ';
  }
}

interface NotesPanelProps {
  sessionId: string;
  /** Khái niệm đang học — ghi chú neo vào đây. */
  conceptId: string;
  /** Tên khái niệm, cho tiêu đề `Ghi chú · <tên>`. */
  conceptName: string;
  /** Lớp định vị do nơi gọi cấp — panel được dùng như rail NỔI bên phải (`absolute`). */
  className?: string;
}

/**
 * Rail ghi chú nhanh (FS-05 · #228): tiêu đề neo khái niệm, nhãn tự-lưu, ô soạn tự lưu, và danh
 * sách ghi chú trước đó trong cùng phiên (mới nhất trên).
 *
 * NỔI bên phải như overlay, KHÔNG reflow màn đang chạy — vòng Pomodoro + khái niệm + đồng hồ vẫn
 * canh giữa viewport phía sau, không bị đẩy lệch (quyết định UX 2026-08-09: panel nhỏ không đáng
 * để xê dịch bộ đếm giờ). Hiện/ẩn TỨC THÌ: khung `.focus-session-active` tắt animation/transition
 * (§0), nên không thêm hiệu ứng trượt.
 */
export function NotesPanel({ sessionId, conceptId, conceptName, className }: NotesPanelProps) {
  const { draft, setDraft, status, savedAt, notes, commitNote, canCommit } = useAutosaveNote({
    sessionId,
    conceptId,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mở panel là đưa tiêu điểm thẳng vào ô soạn, con trỏ ở cuối nội dung sẵn có.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  return (
    <aside
      aria-label={`Ghi chú nhanh cho khái niệm ${conceptName}`}
      className={cn(
        'bg-card flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-[18px]',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="truncate text-[13px] font-semibold">Ghi chú · {conceptName}</span>
        <span
          className="text-muted-foreground shrink-0 font-mono text-[11px]"
          role="status"
          aria-live="polite"
        >
          {saveStatusLabel(status, savedAt)}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`Ghi chú cho khái niệm ${conceptName}`}
        placeholder="Ghi lại điều đáng nhớ về khái niệm này…"
        maxLength={5000}
        className="border-border bg-background text-foreground focus-visible:outline-ring min-h-24 w-full resize-y rounded-[calc(var(--radius)*0.7)] border px-3 py-2.5 text-[13px] leading-[1.6] outline-none focus-visible:outline-2 focus-visible:-outline-offset-1"
      />

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="xs" disabled={!canCommit} onClick={commitNote}>
          Ghi chú mới
        </Button>
      </div>

      {notes.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {notes.map((note) => (
            <li
              key={note.id}
              className="border-border text-muted-foreground border-l-2 pl-2.5 text-[12px] leading-[1.55]"
            >
              <span className="text-muted-foreground block font-mono text-[10px]">
                {formatClockTime(new Date(note.createdAt))}
              </span>
              {note.body}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
