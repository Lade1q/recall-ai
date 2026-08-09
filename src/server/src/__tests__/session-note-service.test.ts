import {
  assertConceptInSession,
  createSessionNote,
  deleteSessionNote,
  listSessionNotes,
  parseConceptIds,
  updateSessionNote,
} from '../services/session-note.service';
import { createSessionNoteSchema, updateSessionNoteSchema } from '../schemas/session-note.schema';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

// R05: prisma bị mock hoàn toàn → không mở kết nối DB, test chạy dù tước DATABASE_URL/GEMINI_API_KEY.
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    focusSession: { findUnique: jest.fn() },
    sessionNote: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  focusSession: { findUnique: jest.Mock };
  sessionNote: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER = '99999999-9999-9999-9999-999999999999';
const SESSION_ID = '44444444-4444-4444-4444-444444444444';
const CONCEPT_ID = '33333333-3333-3333-3333-333333333333';
const NOTE_ID = '55555555-5555-5555-5555-555555555555';

const ownedSession = {
  id: SESSION_ID,
  userId: USER_ID,
  conceptIds: [CONCEPT_ID],
};

const noteRow = {
  id: NOTE_ID,
  sessionId: SESSION_ID,
  conceptId: CONCEPT_ID,
  body: 'Ngăn xếp LIFO',
  createdAt: new Date('2026-08-09T13:47:00Z'),
  updatedAt: new Date('2026-08-09T13:47:00Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pure helpers (R05 — no DB)', () => {
  it('parseConceptIds keeps only strings', () => {
    expect(parseConceptIds([CONCEPT_ID, 1, null, 'x'] as never)).toEqual([CONCEPT_ID, 'x']);
    expect(parseConceptIds('not-an-array' as never)).toEqual([]);
    expect(parseConceptIds(null as never)).toEqual([]);
  });

  it('assertConceptInSession throws 400 for a concept outside the session', () => {
    expect(() => assertConceptInSession([CONCEPT_ID], CONCEPT_ID)).not.toThrow();

    let caught: unknown;
    try {
      assertConceptInSession([CONCEPT_ID], 'other');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({ statusCode: 400, code: 'CONCEPT_NOT_IN_SESSION' });
  });
});

describe('body schema (trim + length)', () => {
  it('rejects a body that is empty after trim', () => {
    const result = createSessionNoteSchema.safeParse({ conceptId: CONCEPT_ID, body: '   ' });
    expect(result.success).toBe(false);
  });

  it('trims surrounding whitespace before storing', () => {
    const result = updateSessionNoteSchema.safeParse({ body: '  giữ phần giữa  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body).toBe('giữ phần giữa');
  });

  it('rejects a body longer than 5000 characters', () => {
    const result = updateSessionNoteSchema.safeParse({ body: 'a'.repeat(5001) });
    expect(result.success).toBe(false);
  });
});

describe('createSessionNote', () => {
  it('throws 404 when the session is not owned by the user', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue({ ...ownedSession, userId: OTHER_USER });

    const error = await createSessionNote(USER_ID, SESSION_ID, {
      conceptId: CONCEPT_ID,
      body: 'x',
    }).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.sessionNote.create).not.toHaveBeenCalled();
  });

  it('throws 400 when conceptId is not part of the session', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(ownedSession);

    const error = await createSessionNote(USER_ID, SESSION_ID, {
      conceptId: 'outside-concept',
      body: 'x',
    }).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 400, code: 'CONCEPT_NOT_IN_SESSION' });
    expect(mockedPrisma.sessionNote.create).not.toHaveBeenCalled();
  });

  it('creates a note anchored to the concept and returns a flat DTO', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(ownedSession);
    mockedPrisma.sessionNote.create.mockResolvedValue(noteRow);

    const result = await createSessionNote(USER_ID, SESSION_ID, {
      conceptId: CONCEPT_ID,
      body: 'Ngăn xếp LIFO',
    });

    expect(mockedPrisma.sessionNote.create).toHaveBeenCalledWith({
      data: { sessionId: SESSION_ID, conceptId: CONCEPT_ID, body: 'Ngăn xếp LIFO' },
    });
    expect(result).toEqual({
      id: NOTE_ID,
      sessionId: SESSION_ID,
      conceptId: CONCEPT_ID,
      body: 'Ngăn xếp LIFO',
      createdAt: noteRow.createdAt,
      updatedAt: noteRow.updatedAt,
    });
  });
});

describe('updateSessionNote', () => {
  it('throws 404 when the session is not owned', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(null);

    const error = await updateSessionNote(USER_ID, SESSION_ID, NOTE_ID, { body: 'x' }).catch(
      (e) => e
    );

    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.sessionNote.update).not.toHaveBeenCalled();
  });

  it('throws 404 when the note does not belong to the session', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(ownedSession);
    mockedPrisma.sessionNote.findFirst.mockResolvedValue(null);

    const error = await updateSessionNote(USER_ID, SESSION_ID, NOTE_ID, { body: 'x' }).catch(
      (e) => e
    );

    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.sessionNote.findFirst).toHaveBeenCalledWith({
      where: { id: NOTE_ID, sessionId: SESSION_ID },
    });
    expect(mockedPrisma.sessionNote.update).not.toHaveBeenCalled();
  });

  it('updates only the body of a note it owns', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(ownedSession);
    mockedPrisma.sessionNote.findFirst.mockResolvedValue(noteRow);
    mockedPrisma.sessionNote.update.mockResolvedValue({ ...noteRow, body: 'sửa lại' });

    const result = await updateSessionNote(USER_ID, SESSION_ID, NOTE_ID, { body: 'sửa lại' });

    expect(mockedPrisma.sessionNote.update).toHaveBeenCalledWith({
      where: { id: NOTE_ID },
      data: { body: 'sửa lại' },
    });
    expect(result.body).toBe('sửa lại');
  });
});

describe('listSessionNotes', () => {
  it('throws 404 when the session is not owned', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(null);

    const error = await listSessionNotes(USER_ID, SESSION_ID).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.sessionNote.findMany).not.toHaveBeenCalled();
  });

  it('returns the session notes newest first', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(ownedSession);
    mockedPrisma.sessionNote.findMany.mockResolvedValue([noteRow]);

    const result = await listSessionNotes(USER_ID, SESSION_ID);

    expect(mockedPrisma.sessionNote.findMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(NOTE_ID);
  });
});

describe('deleteSessionNote', () => {
  it('throws 404 when the note is not in the owned session', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(ownedSession);
    mockedPrisma.sessionNote.findFirst.mockResolvedValue(null);

    const error = await deleteSessionNote(USER_ID, SESSION_ID, NOTE_ID).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.sessionNote.delete).not.toHaveBeenCalled();
  });

  it('deletes a note it owns', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(ownedSession);
    mockedPrisma.sessionNote.findFirst.mockResolvedValue(noteRow);
    mockedPrisma.sessionNote.delete.mockResolvedValue(noteRow);

    await deleteSessionNote(USER_ID, SESSION_ID, NOTE_ID);

    expect(mockedPrisma.sessionNote.delete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
  });
});
