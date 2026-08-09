import type { Prisma, SessionNote } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { getOwnedFocusSessionOrThrow } from './focus-session.service';
import { CreateSessionNoteInput, UpdateSessionNoteInput } from '../schemas/session-note.schema';
import { SessionNoteResponse } from '../types/session-note.types';

// ── Pure logic (R05) ──────────────────────────────────────────────────────────
// Tách khỏi tầng Prisma để test được khi tước `DATABASE_URL`/`GEMINI_API_KEY`: các hàm dưới chỉ
// nhận dữ liệu thuần và trả dữ liệu thuần / ném lỗi, không chạm client.

/** `focus_sessions.concept_ids` là `Json` (string[]) — lọc lấy đúng phần tử chuỗi, bỏ rác. */
export function parseConceptIds(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Ghi chú neo vào KHÁI NIỆM, và khái niệm phải thuộc chính phiên đang mở (post-condition FS-05).
 * `conceptId` lạ (không nằm trong `concept_ids` của phiên) → 400, không âm thầm tạo ghi chú mồ côi
 * ngữ nghĩa. Thuần: chỉ so mảng, không hỏi DB.
 */
export function assertConceptInSession(sessionConceptIds: string[], conceptId: string): void {
  if (!sessionConceptIds.includes(conceptId)) {
    throw new AppError(
      'conceptId must belong to this focus session',
      400,
      'CONCEPT_NOT_IN_SESSION'
    );
  }
}

/** DTO phẳng cho response — không rò quan hệ Prisma ra ngoài tầng service. */
export function toSessionNoteResponse(note: SessionNote): SessionNoteResponse {
  return {
    id: note.id,
    sessionId: note.sessionId,
    conceptId: note.conceptId,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

// ── DB-backed operations ───────────────────────────────────────────────────────
// Mọi endpoint đi qua `getOwnedFocusSessionOrThrow` TRƯỚC (404 gộp không-tồn-tại/không-thuộc-user)
// nên không endpoint nào lộ hay chạm ghi chú của phiên người khác.

/** Tìm ghi chú THUỘC phiên này; gộp not-found/not-owned về 404 như `getOwnedFocusSessionOrThrow`. */
async function getSessionNoteOrThrow(sessionId: string, noteId: string): Promise<SessionNote> {
  const note = await prisma.sessionNote.findFirst({ where: { id: noteId, sessionId } });
  if (!note) {
    throw new AppError('Note not found', 404, 'NOT_FOUND');
  }
  return note;
}

/** POST /focus-sessions/:id/notes (FS-05 basic flow bước 7-8, lần lưu đầu). */
export async function createSessionNote(
  userId: string,
  sessionId: string,
  input: CreateSessionNoteInput
): Promise<SessionNoteResponse> {
  const session = await getOwnedFocusSessionOrThrow(userId, sessionId);
  assertConceptInSession(parseConceptIds(session.conceptIds), input.conceptId);

  const note = await prisma.sessionNote.create({
    data: {
      sessionId,
      conceptId: input.conceptId,
      body: input.body,
    },
  });

  return toSessionNoteResponse(note);
}

/** PATCH /focus-sessions/:id/notes/:noteId — đường auto-save (các lần lưu sau lần đầu). */
export async function updateSessionNote(
  userId: string,
  sessionId: string,
  noteId: string,
  input: UpdateSessionNoteInput
): Promise<SessionNoteResponse> {
  await getOwnedFocusSessionOrThrow(userId, sessionId);
  await getSessionNoteOrThrow(sessionId, noteId);

  const note = await prisma.sessionNote.update({
    where: { id: noteId },
    data: { body: input.body },
  });

  return toSessionNoteResponse(note);
}

/** GET /focus-sessions/:id/notes — mọi ghi chú của phiên, MỚI NHẤT TRƯỚC. */
export async function listSessionNotes(
  userId: string,
  sessionId: string
): Promise<SessionNoteResponse[]> {
  await getOwnedFocusSessionOrThrow(userId, sessionId);

  const notes = await prisma.sessionNote.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  });

  return notes.map(toSessionNoteResponse);
}

/** DELETE /focus-sessions/:id/notes/:noteId. */
export async function deleteSessionNote(
  userId: string,
  sessionId: string,
  noteId: string
): Promise<void> {
  await getOwnedFocusSessionOrThrow(userId, sessionId);
  await getSessionNoteOrThrow(sessionId, noteId);

  await prisma.sessionNote.delete({ where: { id: noteId } });
}
