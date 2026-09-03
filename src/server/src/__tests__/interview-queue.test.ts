import {
  MAX_CONCEPTS_IN_QUEUE,
  MAX_LIVE_TRACEBACK_INSERTS,
  MAX_TRACEBACK_HOPS,
  hasTracedBackFrom,
  planTracebackInsert,
  readConceptQueue,
  writeConceptQueue,
  type QueueEntry,
} from '../utils/interview-queue';
import { MAX_TRACEBACK_DEPTH } from '../services/traceback.service';
import { MAX_CONCEPTS_PER_SESSION, MAX_TURNS_PER_CONCEPT } from '../utils/interview-state';

/**
 * Pure-function tests for the live-traceback queue rules. No Prisma, no Gemini, no clock —
 * these must pass with `DATABASE_URL` and `GEMINI_API_KEY` stripped (SDP risk R05).
 */

const root = (conceptId: string): QueueEntry => ({
  conceptId,
  hop: 0,
  viaConceptId: null,
  added: false,
});
/** An entry live traceback ADDED: it lengthened the queue, so it charges the session budget. */
const traced = (conceptId: string, hop: number, via: string): QueueEntry => ({
  conceptId,
  hop,
  viaConceptId: via,
  added: true,
});
/** An entry live traceback MOVED: it carries a hop but was already in the queue. */
const moved = (conceptId: string, hop: number, via: string): QueueEntry => ({
  conceptId,
  hop,
  viaConceptId: via,
  added: false,
});

describe('readConceptQueue', () => {
  it('reads the legacy string[] shape as hop 0, so sessions written before this change keep working', () => {
    expect(readConceptQueue(['a', 'b'])).toEqual([root('a'), root('b')]);
  });

  it('reads the object shape, keeping hop and the concept that pulled the entry in', () => {
    expect(readConceptQueue([{ conceptId: 'p', hop: 1, viaConceptId: 'c' }])).toEqual([
      traced('p', 1, 'c'),
    ]);
  });

  it('reads a mixed array — a session written before the change and grown after it', () => {
    expect(readConceptQueue(['a', { conceptId: 'p', hop: 1, viaConceptId: 'a' }])).toEqual([
      root('a'),
      traced('p', 1, 'a'),
    ]);
  });

  it('drops entries with no usable concept id rather than throwing', () => {
    expect(
      readConceptQueue(['', null, 42, {}, { conceptId: '' }, ['a'], { conceptId: 'ok' }])
    ).toEqual([root('ok')]);
  });

  it('reads a corrupt hop as 0 — a bad row must never EXTEND the chain', () => {
    const entries = readConceptQueue([
      { conceptId: 'a', hop: -3, viaConceptId: 'x' },
      { conceptId: 'b', hop: 1.5, viaConceptId: 'x' },
      { conceptId: 'c', viaConceptId: 'x' },
    ]);
    expect(entries.map((entry) => entry.hop)).toEqual([0, 0, 0]);
  });

  it('returns [] for anything that is not an array (a JSON column is not trusted)', () => {
    expect(readConceptQueue(null)).toEqual([]);
    expect(readConceptQueue('a')).toEqual([]);
    expect(readConceptQueue({ conceptId: 'a' })).toEqual([]);
  });

  it('round-trips through writeConceptQueue', () => {
    const entries = [root('a'), traced('p', 2, 'a')];
    expect(readConceptQueue(writeConceptQueue(entries))).toEqual(entries);
  });
});

describe('planTracebackInsert', () => {
  it('inserts the prerequisites immediately BEFORE the failing concept, leaving the cursor addressing the first one', () => {
    const entries = [root('A'), root('C'), root('D')];
    const result = planTracebackInsert({
      entries,
      cursor: 1,
      prerequisites: [{ conceptId: 'P1' }, { conceptId: 'P2' }],
    });

    expect(result.entries.map((entry) => entry.conceptId)).toEqual(['A', 'P1', 'P2', 'C', 'D']);
    expect(result.inserted).toEqual(['P1', 'P2']);
    // The cursor is NOT moved by this function; index 1 now addresses P1 and C has slid down
    // un-finalised. That identity is the whole reason for inserting before rather than after.
    expect(result.entries[1]?.conceptId).toBe('P1');
    expect(result.entries.map((entry) => entry.conceptId).indexOf('C')).toBe(3);
  });

  it('stamps the inserted entries with parent.hop + 1 and the concept that pulled them in', () => {
    const result = planTracebackInsert({
      entries: [traced('C', 1, 'root')],
      cursor: 0,
      prerequisites: [{ conceptId: 'P' }],
    });
    expect(result.entries[0]).toEqual(traced('P', 2, 'C'));
  });

  it('never re-opens a concept at or BEHIND the cursor — its turns are spent and its score written', () => {
    const entries = [root('done'), root('C')];
    const result = planTracebackInsert({
      entries,
      cursor: 1,
      prerequisites: [{ conceptId: 'done' }, { conceptId: 'fresh' }],
    });
    expect(result.inserted).toEqual(['fresh']);
    expect(result.entries.map((entry) => entry.conceptId)).toEqual(['done', 'fresh', 'C']);
  });

  it('MOVES a prerequisite that is queued but not yet asked, instead of leaving it downstream', () => {
    // The case a live run caught: a one-concept deep link is filled from the graph, so the
    // prerequisite is usually already in the queue — behind the concept it explains. Skipping it
    // as "already handled" means the base is reached eventually but never in front, which is a
    // running order, not a traceback.
    const entries = [root('C'), root('P'), root('D')];
    const result = planTracebackInsert({
      entries,
      cursor: 0,
      prerequisites: [{ conceptId: 'P' }],
    });

    expect(result.entries.map((entry) => entry.conceptId)).toEqual(['P', 'C', 'D']);
    expect(result.inserted).toEqual(['P']);
    // Moved, not duplicated, and now labelled as what pulled it forward.
    expect(result.entries.filter((entry) => entry.conceptId === 'P')).toHaveLength(1);
    expect(result.entries[0]).toEqual(moved('P', 1, 'C'));
  });

  it('a move does not SPEND the session budget: four moves still leave room to insert', () => {
    // The half the previous test could not see. Its fixture arrived with the budget already
    // spent, so it only proved "a move is allowed when there is no room left" — it would have
    // stayed green while a move quietly consumed a slot. Here nothing has been added yet, and
    // the moves must leave all four insert slots intact.
    const seeds = Array.from({ length: MAX_LIVE_TRACEBACK_INSERTS }, (_, i) => root(`P${i}`));
    const afterMoves = planTracebackInsert({
      entries: [root('C'), ...seeds],
      cursor: 0,
      prerequisites: seeds.map((entry) => ({ conceptId: entry.conceptId })),
    });

    expect(afterMoves.inserted).toHaveLength(MAX_LIVE_TRACEBACK_INSERTS);
    // Stated explicitly rather than left implied: the queue is the same length it started at.
    expect(afterMoves.entries).toHaveLength(MAX_LIVE_TRACEBACK_INSERTS + 1);
    expect(afterMoves.entries.filter((entry) => entry.added)).toEqual([]);

    // The concept the chain moved to now fails in turn, and its own prerequisite is new.
    const next = planTracebackInsert({
      entries: afterMoves.entries,
      cursor: 0,
      prerequisites: [{ conceptId: 'fresh' }],
    });
    expect(next.inserted).toEqual(['fresh']);
    expect(next.entries[0]?.added).toBe(true);

    // Control, in the same test so the two cannot drift apart: had those four been INSERTS
    // rather than moves, this second hop would have been refused.
    const spent = Array.from({ length: MAX_LIVE_TRACEBACK_INSERTS }, (_, i) =>
      traced(`added-${i}`, 1, 'C')
    );
    expect(
      planTracebackInsert({
        entries: [...spent, root('C')],
        cursor: spent.length,
        prerequisites: [{ conceptId: 'fresh' }],
      }).inserted
    ).toEqual([]);
  });

  it('a move costs nothing against the session budget — it lengthens nothing', () => {
    const spent: QueueEntry[] = Array.from({ length: MAX_LIVE_TRACEBACK_INSERTS }, (_, i) =>
      traced(`already-${i}`, 1, 'x')
    );
    const entries = [...spent, root('C'), root('P')];
    const result = planTracebackInsert({
      entries,
      cursor: spent.length,
      prerequisites: [{ conceptId: 'P' }],
    });

    expect(result.inserted).toEqual(['P']);
    expect(result.entries.map((entry) => entry.conceptId).slice(-2)).toEqual(['P', 'C']);
    // Control: a concept NOT already queued is still refused at the same budget.
    expect(
      planTracebackInsert({ entries, cursor: spent.length, prerequisites: [{ conceptId: 'new' }] })
        .inserted
    ).toEqual([]);
  });

  it('mixes a move and an insert in one hop, keeping the prerequisite order', () => {
    const entries = [root('C'), root('P2')];
    const result = planTracebackInsert({
      entries,
      cursor: 0,
      prerequisites: [{ conceptId: 'P1' }, { conceptId: 'P2' }],
    });
    expect(result.entries.map((entry) => entry.conceptId)).toEqual(['P1', 'P2', 'C']);
    expect(result.inserted).toEqual(['P1', 'P2']);
  });

  it('de-duplicates within one insert', () => {
    const result = planTracebackInsert({
      entries: [root('C')],
      cursor: 0,
      prerequisites: [{ conceptId: 'P' }, { conceptId: 'P' }],
    });
    expect(result.inserted).toEqual(['P']);
  });

  it('refuses to hop past MAX_TRACEBACK_HOPS', () => {
    const atLimit = planTracebackInsert({
      entries: [traced('C', MAX_TRACEBACK_HOPS, 'x')],
      cursor: 0,
      prerequisites: [{ conceptId: 'P' }],
    });
    expect(atLimit.inserted).toEqual([]);
    expect(atLimit.entries.map((entry) => entry.conceptId)).toEqual(['C']);

    // Positive control: one hop below the limit still inserts, so the assertion above is
    // measuring the cap and not something else that is broken.
    const belowLimit = planTracebackInsert({
      entries: [traced('C', MAX_TRACEBACK_HOPS - 1, 'x')],
      cursor: 0,
      prerequisites: [{ conceptId: 'P' }],
    });
    expect(belowLimit.inserted).toEqual(['P']);
  });

  it('stops at MAX_LIVE_TRACEBACK_INSERTS across the whole session, counting from the queue', () => {
    const spent: QueueEntry[] = Array.from({ length: MAX_LIVE_TRACEBACK_INSERTS }, (_, i) =>
      traced(`already-${i}`, 1, 'x')
    );
    const result = planTracebackInsert({
      entries: [...spent, root('C')],
      cursor: spent.length,
      prerequisites: [{ conceptId: 'P' }],
    });
    expect(result.inserted).toEqual([]);
  });

  it('inserts only up to the remaining session budget, not the whole prerequisite list', () => {
    const spent: QueueEntry[] = Array.from({ length: MAX_LIVE_TRACEBACK_INSERTS - 1 }, (_, i) =>
      traced(`already-${i}`, 1, 'x')
    );
    const result = planTracebackInsert({
      entries: [...spent, root('C')],
      cursor: spent.length,
      prerequisites: [{ conceptId: 'P1' }, { conceptId: 'P2' }, { conceptId: 'P3' }],
    });
    expect(result.inserted).toEqual(['P1']);
  });

  it('returns the queue unchanged when there is nothing to insert', () => {
    const entries = [root('C')];
    expect(planTracebackInsert({ entries, cursor: 0, prerequisites: [] })).toEqual({
      entries,
      inserted: [],
    });
  });

  it('returns the queue unchanged when the cursor is off the end', () => {
    const entries = [root('C')];
    const result = planTracebackInsert({
      entries,
      cursor: 5,
      prerequisites: [{ conceptId: 'P' }],
    });
    expect(result.inserted).toEqual([]);
    expect(result.entries).toEqual(entries);
  });

  it('terminates on a cyclic graph: from P, the concept C behind it can never be pulled back', () => {
    const first = planTracebackInsert({
      entries: [root('C')],
      cursor: 0,
      prerequisites: [{ conceptId: 'P' }],
    });
    expect(first.entries.map((entry) => entry.conceptId)).toEqual(['P', 'C']);

    // The cursor is on P (index 0); C sits AHEAD of it at index 1 and has not been asked, so
    // bucket 2 would move it — which is correct: C↔P is a cycle the DAG check let through, and
    // asking C before P is a legitimate ordering. What must not happen is an unbounded shuffle,
    // so the real termination proof is the step after: once P is answered and the cursor is on
    // C, P is BEHIND it and bucket 3 refuses.
    const afterDetour = planTracebackInsert({
      entries: first.entries,
      cursor: 1,
      prerequisites: [{ conceptId: 'P' }],
    });
    expect(afterDetour.inserted).toEqual([]);
    expect(afterDetour.entries.map((entry) => entry.conceptId)).toEqual(['P', 'C']);
  });
});

describe('hasTracedBackFrom', () => {
  it('is true once a concept has pulled a prerequisite in — this is what stops it tracing back forever', () => {
    const entries = [root('C'), traced('P', 1, 'C')];
    expect(hasTracedBackFrom(entries, 'C')).toBe(true);
    expect(hasTracedBackFrom(entries, 'P')).toBe(false);
  });

  it('is false on a queue that never traced back', () => {
    expect(hasTracedBackFrom([root('A'), root('B')], 'A')).toBe(false);
  });
});

describe('the two depth limits are separate numbers with separate jobs', () => {
  it('MAX_TRACEBACK_HOPS (live chain) is not MAX_TRACEBACK_DEPTH (one offline BFS walk)', () => {
    expect(MAX_TRACEBACK_HOPS).toBe(3);
    expect(MAX_TRACEBACK_DEPTH).toBe(2);
    // Pinned as an inequality too: collapsing them would silently retune the review queue that
    // the offline path writes for the NEXT session.
    expect(MAX_TRACEBACK_HOPS).not.toBe(MAX_TRACEBACK_DEPTH);
  });
});

describe('the sitting ceiling', () => {
  /**
   * `MAX_CONCEPTS_PER_SESSION` is enforced by the Zod schema on the way in, and live traceback
   * then grew the queue past it with nothing in code comparing the two numbers. These pin the
   * total a student can be made to sit through, and the cost that follows from it, so that
   * raising either input has to come past a number written down here.
   */
  const fullSession = () =>
    Array.from({ length: MAX_CONCEPTS_PER_SESSION }, (_, i) => root(`seed-${i}`));

  it('🔴 a full session cannot be grown past MAX_CONCEPTS_IN_QUEUE, however few inserts are spent', () => {
    let entries: QueueEntry[] = fullSession();

    // Ask for far more than either budget allows, hop after hop, always from the cursor.
    for (let hop = 0; hop < MAX_TRACEBACK_HOPS; hop += 1) {
      entries = planTracebackInsert({
        entries,
        cursor: 0,
        prerequisites: Array.from({ length: 4 }, (_, i) => ({ conceptId: `p-${hop}-${i}` })),
      }).entries;
    }

    expect(entries.length).toBeLessThanOrEqual(MAX_CONCEPTS_IN_QUEUE);
    // Stated as the number, not just as an inequality: an inequality stays true if the ceiling
    // is later raised by accident, which is the whole failure being guarded.
    expect(MAX_CONCEPTS_IN_QUEUE).toBe(MAX_CONCEPTS_PER_SESSION + MAX_LIVE_TRACEBACK_INSERTS);

    // The cost that ceiling buys, spelled out: `generate_question` + `grade_answer` per turn.
    const worstCaseGeminiCalls = MAX_CONCEPTS_IN_QUEUE * MAX_TURNS_PER_CONCEPT * 2;
    expect(worstCaseGeminiCalls).toBe(54);
  });

  it('🔴 the ceiling binds before the insert budget when the session opened full', () => {
    // Nothing has been added yet, so the insert budget alone would allow four more.
    const result = planTracebackInsert({
      entries: fullSession(),
      cursor: 0,
      prerequisites: Array.from({ length: MAX_LIVE_TRACEBACK_INSERTS }, (_, i) => ({
        conceptId: `p-${i}`,
      })),
    });

    expect(result.inserted).toHaveLength(MAX_CONCEPTS_IN_QUEUE - MAX_CONCEPTS_PER_SESSION);

    // Control in the same test: a session that opened with room takes the full insert budget,
    // so the assertion above is measuring the ceiling and not some unrelated refusal.
    const roomy = planTracebackInsert({
      entries: [root('only')],
      cursor: 0,
      prerequisites: Array.from({ length: MAX_LIVE_TRACEBACK_INSERTS }, (_, i) => ({
        conceptId: `q-${i}`,
      })),
    });
    expect(roomy.inserted).toHaveLength(MAX_LIVE_TRACEBACK_INSERTS);
  });

  it('🔴 a queue that arrived over-long is not grown further, and does not throw', () => {
    // Reachable without a bug: lowering either constant leaves older rows above the new ceiling.
    const overlong = Array.from({ length: MAX_CONCEPTS_IN_QUEUE + 2 }, (_, i) => root(`old-${i}`));

    const result = planTracebackInsert({
      entries: overlong,
      cursor: 0,
      prerequisites: [{ conceptId: 'new' }],
    });

    expect(result.inserted).toEqual([]);
    expect(result.entries).toHaveLength(overlong.length);
  });
});
