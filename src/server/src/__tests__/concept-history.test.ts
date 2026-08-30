import {
  buildConceptHistory,
  type FocusSessionRow,
  type InterviewTurnRow,
} from '../utils/concept-history';

/**
 * Unit tests for the DB-06 learning-history fold (Issue #168). Pure function, no DB:
 * how turns collapse into sessions and how two unrelated sources get ordered is
 * deterministic software logic (C4), so it is provable on its own.
 */

const at = (iso: string) => new Date(iso);

function turn(overrides: Partial<InterviewTurnRow> = {}): InterviewTurnRow {
  return {
    sessionId: 's-1',
    turnIndex: 1,
    askedAt: at('2026-07-26T21:40:00.000Z'),
    score: 0.5,
    // Mặc định `null` = "không thuộc thang gợi ý" ⇒ lượt được TÍNH, giữ nguyên hành vi mọi ca
    // dưới đây đã khẳng định trước #392. Ca gợi ý phải nói ra bằng `mode: 'hint'`.
    mode: null,
    ...overrides,
  };
}

function focus(overrides: Partial<FocusSessionRow> = {}): FocusSessionRow {
  return {
    id: 'f-1',
    startedAt: at('2026-07-24T19:05:00.000Z'),
    durationMinutes: 25,
    ...overrides,
  };
}

describe('buildConceptHistory', () => {
  it('collapses the turns of one session into a single entry', () => {
    const history = buildConceptHistory(
      [
        turn({ turnIndex: 1, score: 0.2, askedAt: at('2026-07-26T21:40:00.000Z') }),
        turn({ turnIndex: 2, score: 0.4, askedAt: at('2026-07-26T21:43:00.000Z') }),
        turn({ turnIndex: 3, score: 0.5, askedAt: at('2026-07-26T21:47:00.000Z') }),
      ],
      []
    );

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: 'interview', id: 's-1', turnCount: 3 });
  });

  it('scores an entry with the same weighted average the session itself used', () => {
    // TURN_WEIGHTS = [0.2, 0.3, 0.5] -> 0.2*0.2 + 0.3*0.4 + 0.5*0.5 = 0.41
    const history = buildConceptHistory(
      [
        turn({ turnIndex: 1, score: 0.2 }),
        turn({ turnIndex: 2, score: 0.4 }),
        turn({ turnIndex: 3, score: 0.5 }),
      ],
      []
    );

    expect(history[0]?.score).toBe(0.41);
  });

  it('weights by turn order, not by the order rows came back from the database', () => {
    const shuffled = buildConceptHistory(
      [
        turn({ turnIndex: 3, score: 0.5 }),
        turn({ turnIndex: 1, score: 0.2 }),
        turn({ turnIndex: 2, score: 0.4 }),
      ],
      []
    );

    expect(shuffled[0]?.score).toBe(0.41);
  });

  it('timestamps an interview entry by its LAST turn, so it never precedes last_tested_at', () => {
    const history = buildConceptHistory(
      [
        turn({ turnIndex: 1, askedAt: at('2026-07-26T21:40:00.000Z') }),
        turn({ turnIndex: 2, askedAt: at('2026-07-26T21:47:00.000Z') }),
      ],
      []
    );

    expect(history[0]?.at.toISOString()).toBe('2026-07-26T21:47:00.000Z');
  });

  it('reports null score for a session whose turns were all ungraded, not 0', () => {
    const history = buildConceptHistory(
      [turn({ score: null }), turn({ turnIndex: 2, score: null })],
      []
    );

    expect(history[0]?.score).toBeNull();
    expect(history[0]?.turnCount).toBe(2);
  });

  it('falls back to a plain mean rather than throwing when a concept has more turns than C6 allows', () => {
    const history = buildConceptHistory(
      [
        turn({ turnIndex: 1, score: 0.2 }),
        turn({ turnIndex: 2, score: 0.4 }),
        turn({ turnIndex: 3, score: 0.6 }),
        turn({ turnIndex: 4, score: 0.8 }),
      ],
      []
    );

    expect(history[0]?.score).toBe(0.5);
  });

  it('carries duration on a focus entry and leaves score/turnCount null', () => {
    const history = buildConceptHistory([], [focus({ durationMinutes: 25 })]);

    expect(history[0]).toMatchObject({
      kind: 'focus',
      id: 'f-1',
      score: null,
      turnCount: null,
      durationMinutes: 25,
    });
  });

  it('interleaves both sources newest-first', () => {
    const history = buildConceptHistory(
      [
        turn({ sessionId: 's-old', askedAt: at('2026-07-21T20:15:00.000Z') }),
        turn({ sessionId: 's-new', askedAt: at('2026-07-26T21:40:00.000Z') }),
      ],
      [focus({ id: 'f-mid', startedAt: at('2026-07-24T19:05:00.000Z') })]
    );

    expect(history.map((entry) => entry.id)).toEqual(['s-new', 'f-mid', 's-old']);
  });

  it('puts the scored entry first when an interview and a focus session tie on time', () => {
    const sameInstant = at('2026-07-24T19:05:00.000Z');
    const history = buildConceptHistory(
      [turn({ sessionId: 's-tie', askedAt: sameInstant })],
      [focus({ id: 'f-tie', startedAt: sameInstant })]
    );

    expect(history.map((entry) => entry.id)).toEqual(['s-tie', 'f-tie']);
  });

  it('caps the list at the requested limit, keeping the newest entries', () => {
    const turns = [1, 2, 3, 4].map((n) =>
      turn({ sessionId: `s-${n}`, askedAt: at(`2026-07-2${n}T10:00:00.000Z`) })
    );

    const history = buildConceptHistory(turns, [], 2);

    expect(history.map((entry) => entry.id)).toEqual(['s-4', 's-3']);
  });

  it('returns an empty list for a concept nobody has studied yet', () => {
    expect(buildConceptHistory([], [])).toEqual([]);
  });
});
