import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { sessionNoteApi } from '../api/notes.api';
import type { SessionNote } from '../types/focus.types';

/** Chờ ~800ms sau khi ngừng gõ mới lưu (AC FS-05: "tự lưu sau ~800ms ngừng gõ"). */
const AUTOSAVE_DEBOUNCE_MS = 800;

export type NoteSaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

/**
 * Bản nháp cục bộ giữ trong `localStorage` để mất mạng / đóng tab giữa chừng không mất chữ —
 * cùng cơ chế khôi phục phiên gián đoạn của #127 (`useFocusTimer` snapshot). Xóa ngay khi server
 * đã nhận, nên còn bản nháp lúc mở lại = còn nội dung CHƯA kịp lên server.
 */
interface PersistedDraft {
  conceptId: string;
  noteId: string | null;
  body: string;
}

function draftStorageKey(sessionId: string): string {
  return `recall.sessionNote.draft.${sessionId}`;
}

function readPersistedDraft(sessionId: string): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(sessionId));
    return raw ? (JSON.parse(raw) as PersistedDraft) : null;
  } catch {
    return null;
  }
}

function writePersistedDraft(sessionId: string, draft: PersistedDraft): void {
  try {
    localStorage.setItem(draftStorageKey(sessionId), JSON.stringify(draft));
  } catch {
    // Quota/chế độ riêng tư chặn ghi — vẫn tiếp tục, chỉ mất lưới an toàn ngoại tuyến.
  }
}

function clearPersistedDraft(sessionId: string): void {
  try {
    localStorage.removeItem(draftStorageKey(sessionId));
  } catch {
    // ignore
  }
}

/** Lỗi mất mạng (không có `response`) = tạm thời, giữ nháp + thử lại. 4xx/5xx = có phản hồi, không
 *  retry mù. Cùng cách phân loại `isTerminalFocusSessionError` của `focus.api.ts`. */
function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return isAxiosError(error) && !error.response;
}

interface UseAutosaveNoteArgs {
  sessionId: string;
  /** Khái niệm đang học — ghi chú neo vào đây (post-condition FS-05). */
  conceptId: string;
}

export interface UseAutosaveNoteReturn {
  /** Nội dung ô soạn hiện tại (ghi chú đang viết, CHƯA đưa vào danh sách). */
  draft: string;
  setDraft: (value: string) => void;
  status: NoteSaveStatus;
  /** Mốc lưu thành công gần nhất — cho nhãn "Đã lưu HH:mm". */
  savedAt: Date | null;
  /** Ghi chú TRƯỚC ĐÓ của phiên, mới nhất trước. */
  notes: SessionNote[];
  /** "Ghi chú mới": chốt ghi chú đang soạn vào danh sách rồi dọn ô soạn. */
  commitNote: () => void;
  /** Có gì để chốt không (ô soạn không rỗng). */
  canCommit: boolean;
}

/**
 * Máy tự-lưu cho ghi chú nhanh trong phiên (FS-05).
 *
 * Vòng đời một ghi chú (đọc từ mockup trạng thái "Ghi chú nhanh"): ô soạn là ghi chú ĐANG viết.
 * Lần lưu đầu POST tạo hàng, các lần sau PATCH đúng hàng đó (đường auto-save). Bấm "Ghi chú mới"
 * chốt nó xuống danh sách và bắt đầu ghi chú trắng — đây là quyết định NGOÀI AC: mockup vẽ nhiều
 * ghi chú cùng phiên nhưng không vẽ nút chốt, mà "danh sách ghi chú trước đó" thì cần cách sinh ra
 * ghi chú thứ hai. Sau khi tải lại trang, mọi ghi chú đã lưu (kể cả cái đang soạn) rơi về danh
 * sách và ô soạn trắng lại — không mất mát, chỉ là "đang soạn" là khái niệm phía client.
 */
export function useAutosaveNote({
  sessionId,
  conceptId,
}: UseAutosaveNoteArgs): UseAutosaveNoteReturn {
  const [draft, setDraftState] = useState('');
  const [status, setStatus] = useState<NoteSaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState<SessionNote[]>([]);

  // Bookkeeping qua ref để handler/timeout không đóng băng giá trị cũ.
  const noteIdRef = useRef<string | null>(null);
  const latestBodyRef = useRef('');
  const savedBodyRef = useRef('');
  const lastSavedRef = useRef<SessionNote | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingOfflineRef = useRef(false);
  // `saveNow` cần hẹn lưu lại (khi người dùng gõ tiếp trong lúc request đang bay) nhưng KHÔNG được
  // tự tham chiếu chính nó — vòng lặp đó phá được memoization. Đi qua một ref trỏ tới `scheduleSave`
  // mới nhất: ref không phải phụ thuộc phản ứng nên cắt được vòng.
  const rescheduleRef = useRef<() => void>(() => {});

  const saveNow = useCallback(async (): Promise<SessionNote | null> => {
    const body = latestBodyRef.current.trim();
    if (!body) return null;
    // Một request đang bay: bỏ qua, hàm gọi sau khi nó xong sẽ tự lưu lại phần khác (xem cuối try).
    if (savingRef.current) return null;

    savingRef.current = true;
    setStatus('saving');
    try {
      const saved =
        noteIdRef.current === null
          ? await sessionNoteApi.create(sessionId, { conceptId, body })
          : await sessionNoteApi.update(sessionId, noteIdRef.current, body);

      noteIdRef.current = saved.id;
      savedBodyRef.current = body;
      lastSavedRef.current = saved;
      pendingOfflineRef.current = false;
      clearPersistedDraft(sessionId);
      setSavedAt(new Date(saved.updatedAt));
      setStatus('saved');
      return saved;
    } catch (error) {
      if (isOfflineError(error)) {
        pendingOfflineRef.current = true;
        writePersistedDraft(sessionId, {
          conceptId,
          noteId: noteIdRef.current,
          body: latestBodyRef.current,
        });
        setStatus('offline');
      } else {
        setStatus('error');
      }
      return null;
    } finally {
      savingRef.current = false;
      // Người dùng gõ tiếp trong lúc request bay → phần mới chưa được lưu, hẹn lưu lại (qua ref để
      // không tự tham chiếu `saveNow`).
      if (latestBodyRef.current.trim() && latestBodyRef.current.trim() !== savedBodyRef.current) {
        rescheduleRef.current();
      }
    }
  }, [sessionId, conceptId]);

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void saveNow(), AUTOSAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // Giữ `rescheduleRef` trỏ tới `scheduleSave` mới nhất để `saveNow` gọi lại mà không cần phụ thuộc.
  useEffect(() => {
    rescheduleRef.current = scheduleSave;
  }, [scheduleSave]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      latestBodyRef.current = value;
      if (value.trim()) {
        writePersistedDraft(sessionId, { conceptId, noteId: noteIdRef.current, body: value });
        scheduleSave();
      } else {
        // Ô rỗng: không gửi (server 400 cho body rỗng). Giữ noteId — nếu đã có ghi chú, PATCH rỗng
        // vô nghĩa; người dùng xóa hết chữ thì để nguyên bản đã lưu, không tự xóa hàng.
        if (debounceRef.current) clearTimeout(debounceRef.current);
        clearPersistedDraft(sessionId);
        setStatus(noteIdRef.current ? 'saved' : 'idle');
      }
    },
    [sessionId, conceptId, scheduleSave]
  );

  const commitNote = useCallback(() => {
    if (!latestBodyRef.current.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    void (async () => {
      // Chỉ chốt khi server đã nhận bản mới nhất; nếu chưa (hoặc còn sửa dở), lưu ngay.
      let saved = lastSavedRef.current;
      if (!saved || savedBodyRef.current !== latestBodyRef.current.trim()) {
        saved = await saveNow();
      }
      if (!saved) return; // offline/lỗi → giữ nguyên ở ô soạn, không mất chữ

      const committed = saved;
      setNotes((prev) => [committed, ...prev.filter((note) => note.id !== committed.id)]);
      noteIdRef.current = null;
      savedBodyRef.current = '';
      lastSavedRef.current = null;
      latestBodyRef.current = '';
      clearPersistedDraft(sessionId);
      setDraftState('');
      setSavedAt(null);
      setStatus('idle');
    })();
  }, [saveNow, sessionId]);

  // Nạp danh sách + khôi phục bản nháp ngoại tuyến (nếu có) một lần cho mỗi phiên/khái niệm.
  useEffect(() => {
    let mounted = true;
    sessionNoteApi
      .list(sessionId)
      .then((list) => {
        if (!mounted) return;
        const persisted = readPersistedDraft(sessionId);
        if (persisted && persisted.conceptId === conceptId && persisted.body.trim()) {
          noteIdRef.current = persisted.noteId;
          latestBodyRef.current = persisted.body;
          setDraftState(persisted.body);
          // Bản đang soạn không hiện trùng dưới danh sách (nếu nó từng được lưu một lần).
          setNotes(persisted.noteId ? list.filter((n) => n.id !== persisted.noteId) : list);
          pendingOfflineRef.current = true;
          setStatus('offline');
          void saveNow(); // thử gửi lại ngay nếu đang online
        } else {
          setNotes(list);
        }
      })
      .catch(() => {
        // Nạp danh sách lỗi không được chặn việc soạn ghi chú mới.
        if (mounted) setNotes([]);
      });
    return () => {
      mounted = false;
    };
  }, [sessionId, conceptId, saveNow]);

  // Có mạng lại → gửi phần còn kẹt (AC: "tự gửi lại khi có mạng").
  useEffect(() => {
    const onOnline = () => {
      if (pendingOfflineRef.current && latestBodyRef.current.trim()) {
        void saveNow();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [saveNow]);

  // Đóng panel / kết thúc phiên giữa lúc gõ: đẩy nốt lần lưu đang chờ (nháp đã ở localStorage nên
  // dù request này hỏng cũng không mất chữ).
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        if (latestBodyRef.current.trim() && latestBodyRef.current.trim() !== savedBodyRef.current) {
          void saveNow();
        }
      }
    };
  }, [saveNow]);

  return {
    draft,
    setDraft,
    status,
    savedAt,
    notes,
    commitNote,
    canCommit: draft.trim().length > 0,
  };
}
