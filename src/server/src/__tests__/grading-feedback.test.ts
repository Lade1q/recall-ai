import type { TurnSource, TurnVerdict } from '@prisma/client';
import prisma from '../config/prisma';
import { gradingFeedbackSchema } from '../schemas/interview.schema';
import { submitGradingFeedback } from '../services/grading-feedback.service';
import { isTurnAppealable, toGradingFeedbackResponse } from '../utils/grading-feedback';
import type { QuestionMode } from '../schemas/ai-interview.schema';

/**
 * AE-10 (#248) — `POST /interviews/turns/:turnId/feedback`.
 *
 * Prisma is faked with a real in-memory table rather than a `jest.fn()` handing back a canned
 * row. That is load-bearing for the "một lượt một phản hồi" case: against a canned mock,
 * "re-submitting does not create a second row" would pass whatever the service did, because
 * nothing would be counting rows. Here the fake implements `upsert` on the composite key, so
 * the assertion is over the table's real length.
 *
 * No Prisma client is constructed, so this runs without DATABASE_URL/GEMINI_API_KEY (R05).
 */

const OWNER = 'user-owner';
const STRANGER = 'user-stranger';

interface FakeTurn {
  id: string;
  verdict: TurnVerdict | null;
  source: TurnSource;
  mode: QuestionMode | null;
  session: { userId: string };
}

interface FakeRow {
  id: string;
  turnId: string;
  userId: string;
  reasons: unknown;
  note: string | null;
}

const turns = new Map<string, FakeTurn>();
let rows: FakeRow[] = [];

/** A normal AI-graded turn: appealable on all three counts. */
function gradedTurn(overrides: Partial<FakeTurn> = {}): FakeTurn {
  return {
    id: 'turn-1',
    verdict: 'shallow',
    source: 'ai',
    mode: 'initial',
    session: { userId: OWNER },
    ...overrides,
  };
}

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    interviewTurn: {
      findUnique: jest.fn(),
      // Every write path that could touch a score. Present so the "log only" guard below has
      // something to observe — an absent method would throw instead of recording a call.
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    concept: { update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
    gradingFeedback: { upsert: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  interviewTurn: {
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
  concept: { update: jest.Mock; updateMany: jest.Mock; upsert: jest.Mock };
  gradingFeedback: { upsert: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  turns.clear();
  rows = [];

  mocked.interviewTurn.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => turns.get(where.id) ?? null
  );

  mocked.gradingFeedback.upsert.mockImplementation(
    async ({
      where,
      create,
      update,
    }: {
      where: { turnId_userId: { turnId: string; userId: string } };
      create: { turnId: string; userId: string; reasons: unknown; note: string | null };
      update: { reasons: unknown; note: string | null };
    }) => {
      const { turnId, userId } = where.turnId_userId;
      const existing = rows.find((r) => r.turnId === turnId && r.userId === userId);
      if (existing) {
        existing.reasons = update.reasons;
        existing.note = update.note;
        return { reasons: existing.reasons, note: existing.note };
      }
      const row: FakeRow = { id: `gf-${rows.length + 1}`, ...create };
      rows.push(row);
      return { reasons: row.reasons, note: row.note };
    }
  );
});

describe('AE-10 · isTurnAppealable — the 409 gate', () => {
  it('accepts an AI-graded turn', () => {
    expect(isTurnAppealable({ verdict: 'shallow', source: 'ai', mode: 'initial' })).toBe(true);
  });

  it.each([
    ['ungraded', { verdict: null, source: 'ai' as TurnSource, mode: 'initial' as QuestionMode }],
    [
      // Carries a REAL verdict (written from `SELF_GRADE_VERDICT`), so this row is what pins
      // that `verdict !== null` alone cannot be the gate — `source` has to be checked too.
      'self-graded flashcard',
      { verdict: 'deep' as TurnVerdict, source: 'cache_fallback' as TurnSource, mode: null },
    ],
    [
      'hint rung',
      { verdict: 'deep' as TurnVerdict, source: 'ai' as TurnSource, mode: 'hint' as QuestionMode },
    ],
  ])('rejects a %s turn', (_label, turn) => {
    expect(isTurnAppealable(turn)).toBe(false);
  });
});

describe('AE-10 · body validation (400)', () => {
  it.each([
    ['completely empty', {}],
    ['empty reasons and empty note', { reasons: [], note: '' }],
    ['whitespace-only note, no reasons', { reasons: [], note: '   ' }],
  ])('rejects %s', (_label, body) => {
    expect(gradingFeedbackSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    ['only chips', { reasons: ['Chấm quá nặng'] }],
    ['only a note', { note: 'Tôi có nói tới ngăn xếp ở lượt 2.' }],
    ['both', { reasons: ['Câu hỏi không rõ'], note: 'thiếu ngữ cảnh' }],
  ])('accepts %s (UC-15: lý do là tùy chọn)', (_label, body) => {
    expect(gradingFeedbackSchema.safeParse(body).success).toBe(true);
  });

  it('rejects an unknown field rather than dropping it', () => {
    expect(gradingFeedbackSchema.safeParse({ note: 'x', score: 1 }).success).toBe(false);
  });
});

describe('AE-10 · submitGradingFeedback', () => {
  it('stores the appeal and returns its content', async () => {
    turns.set('turn-1', gradedTurn());

    const result = await submitGradingFeedback('turn-1', OWNER, {
      reasons: ['Chấm quá nặng'],
      note: 'thiếu ngữ cảnh',
    });

    expect(result).toEqual({ reasons: ['Chấm quá nặng'], note: 'thiếu ngữ cảnh' });
    expect(rows).toHaveLength(1);
  });

  it('re-submitting edits the same row instead of creating a second one', async () => {
    turns.set('turn-1', gradedTurn());

    await submitGradingFeedback('turn-1', OWNER, { reasons: ['Câu hỏi không rõ'] });
    expect(rows).toHaveLength(1);

    const second = await submitGradingFeedback('turn-1', OWNER, {
      reasons: ['Ngoài phạm vi tài liệu'],
      note: 'đổi ý',
    });

    // The count is the assertion that matters — "upsert" is only a means to it.
    expect(rows).toHaveLength(1);
    expect(second).toEqual({ reasons: ['Ngoài phạm vi tài liệu'], note: 'đổi ý' });
    expect(rows[0]?.id).toBe('gf-1');
  });

  /**
   * Runs the real seam rather than either half alone: Zod `.trim()`s a whitespace-only note into
   * `''`, and `''` is NOT nullish — that exact pair is what made `?? null` store an empty string.
   * This log is read by a PERSON tuning the rubric (UC-15), so it must have ONE spelling of
   * "no note"; otherwise `WHERE note IS NOT NULL` drags back blank rows.
   */
  it('stores a whitespace-only note as NULL, not an empty string', async () => {
    turns.set('turn-1', gradedTurn());

    const parsed = gradingFeedbackSchema.parse({ reasons: ['Chấm quá nặng'], note: '   ' });
    // The hazard itself, asserted so the test fails loudly if Zod ever stops trimming.
    expect(parsed.note).toBe('');

    const result = await submitGradingFeedback('turn-1', OWNER, parsed);

    expect(rows[0]?.note).toBeNull();
    expect(result.note).toBeNull();
  });

  it('reports a turn belonging to someone else as 404, not 403', async () => {
    turns.set('turn-1', gradedTurn({ session: { userId: STRANGER } }));

    await expect(
      submitGradingFeedback('turn-1', OWNER, { reasons: ['Chấm quá nặng'] })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    expect(rows).toHaveLength(0);
  });

  it('reports a turn that does not exist as 404 with the same message', async () => {
    await expect(
      submitGradingFeedback('turn-missing', OWNER, { reasons: ['Chấm quá nặng'] })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it.each([
    ['ungraded', { verdict: null }],
    ['self-graded flashcard', { source: 'cache_fallback' as TurnSource, mode: null }],
    ['hint rung', { mode: 'hint' as QuestionMode }],
  ])('refuses a %s turn with 409', async (_label, overrides) => {
    turns.set('turn-1', gradedTurn(overrides));

    await expect(
      submitGradingFeedback('turn-1', OWNER, { reasons: ['Chấm quá nặng'] })
    ).rejects.toMatchObject({ statusCode: 409, code: 'TURN_NOT_APPEALABLE' });

    expect(rows).toHaveLength(0);
  });

  /**
   * The constraint the issue calls out by name: *"Một AC về UI không đủ để bảo đảm ràng buộc dữ
   * liệu."* This is the unit-level half — no write method on `interview_turns` or `concepts` is
   * reachable from this endpoint. The other half is a live `pg_stat_user_tables` delta with a
   * positive control, recorded in the PR.
   */
  it('writes nothing to interview_turns or concepts', async () => {
    turns.set('turn-1', gradedTurn());

    await submitGradingFeedback('turn-1', OWNER, { reasons: ['Chấm quá nặng'], note: 'x' });

    for (const write of [
      mocked.interviewTurn.update,
      mocked.interviewTurn.updateMany,
      mocked.interviewTurn.upsert,
      mocked.concept.update,
      mocked.concept.updateMany,
      mocked.concept.upsert,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }

    // Positive control: the spies above are wired to the same client the service uses, so an
    // absent call is evidence and not just an unwired mock.
    expect(mocked.gradingFeedback.upsert).toHaveBeenCalledTimes(1);
    expect(mocked.interviewTurn.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('AE-10 · toGradingFeedbackResponse', () => {
  it('reads a stored chip list back as strings', () => {
    expect(toGradingFeedbackResponse({ reasons: ['a', 'b'], note: null })).toEqual({
      reasons: ['a', 'b'],
      note: null,
    });
  });

  it.each([
    ['a non-array Json value', { reasons: 'oops' as unknown as never, note: null }],
    ['null', { reasons: null, note: null }],
  ])('coerces %s to an empty list rather than putting it on the wire', (_label, row) => {
    expect(toGradingFeedbackResponse(row).reasons).toEqual([]);
  });

  it('drops non-string entries instead of typing them as strings', () => {
    expect(
      toGradingFeedbackResponse({ reasons: ['ok', 7, null] as unknown as never, note: null })
        .reasons
    ).toEqual(['ok']);
  });
});
