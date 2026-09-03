import prisma from '../config/prisma';
import { findRelatedConcepts, findWeakPrerequisites } from '../services/concept-graph.service';
import { MASTERY_THRESHOLD } from '../services/traceback.service';

/**
 * `concept-graph.service.ts` shipped with no test file at all, which is how a guard that could
 * never be false survived in it and how the `depth === 1` filter — the mechanism the whole
 * "HOPS ≠ DEPTH" decision rests on, with five lines of doc-comment above it — was never measured.
 * Prisma is mocked; nothing here needs a database (SDP risk R05 keeps this provable offline).
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    concept: { findMany: jest.fn() },
    conceptEdge: { findMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  concept: { findMany: jest.Mock };
  conceptEdge: { findMany: jest.Mock };
};

const PLAN = 'plan-uuid';
const SEED = 'seed';

/** Every concept the plan has, keyed by id, with the mastery the graph rules read. */
function seedGraph(concepts: Record<string, number | null>, edges: { from: string; to: string }[]) {
  db.concept.findMany.mockImplementation(
    async ({ where }: { where: { id?: { in: string[] } } }) => {
      const wanted = where.id?.in ?? Object.keys(concepts);
      return wanted
        .filter((id) => id in concepts)
        .map((id) => ({ id, name: `name-${id}`, masteryScore: concepts[id] ?? null }));
    }
  );
  db.conceptEdge.findMany.mockImplementation(
    async ({ where }: { where: { OR?: { toConceptId?: string; fromConceptId?: string }[] } }) => {
      const rows = edges.map((e) => ({ fromConceptId: e.from, toConceptId: e.to }));
      if (!where.OR) return rows;
      // Mirror the narrowed query: only edges that touch the concept being asked about.
      const touching = where.OR.map((clause) => clause.toConceptId ?? clause.fromConceptId);
      return rows.filter(
        (row) => touching.includes(row.fromConceptId) || touching.includes(row.toConceptId)
      );
    }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findWeakPrerequisites', () => {
  it('🔴 returns the DIRECT weak prerequisites only — a grandparent is left for the next hop', () => {
    // base ─▶ middle ─▶ seed, everything weak, so the offline walk would return both depths.
    seedGraph({ [SEED]: 0.1, middle: 0.1, base: 0.1 }, [
      { from: 'middle', to: SEED },
      { from: 'base', to: 'middle' },
    ]);

    return findWeakPrerequisites(PLAN, SEED).then((result) => {
      // Named ids, not a count: a count of 1 would also pass if the wrong one came back.
      expect(result.map((r) => r.conceptId)).toEqual(['middle']);
      // The grandparent is reachable and weak — it is excluded by depth, not by absence. Stated
      // separately because those two reasons fail in different directions.
      expect(result.every((r) => r.depth === 1)).toBe(true);
    });
  });

  it('🔴 a mastered prerequisite is skipped, and so is everything behind it (AE-07 AF1)', async () => {
    seedGraph({ [SEED]: 0.1, middle: MASTERY_THRESHOLD, base: 0 }, [
      { from: 'middle', to: SEED },
      { from: 'base', to: 'middle' },
    ]);

    // Zero, said outright: pruning at a solid foundation is the reason a strong student pays
    // nothing for this feature, and "no results" is exactly what a broken query also returns.
    expect(await findWeakPrerequisites(PLAN, SEED)).toHaveLength(0);
  });

  it('🔴 a never-tested prerequisite counts as weak', async () => {
    seedGraph({ [SEED]: 0.1, base: null }, [{ from: 'base', to: SEED }]);

    const result = await findWeakPrerequisites(PLAN, SEED);
    expect(result.map((r) => r.conceptId)).toEqual(['base']);
  });

  it('returns nothing for a concept with no prerequisites, so the hint ladder takes over', async () => {
    seedGraph({ [SEED]: 0.1, other: 0.1 }, [{ from: SEED, to: 'other' }]);

    expect(await findWeakPrerequisites(PLAN, SEED)).toEqual([]);
  });
});

describe('findRelatedConcepts', () => {
  it('🔴 puts prerequisites before dependents, and the least-mastered first within each group', () => {
    seedGraph({ [SEED]: 0.5, 'pre-strong': 0.9, 'pre-weak': 0.1, 'dep-a': 0.2, 'dep-b': 0.8 }, [
      { from: 'pre-strong', to: SEED },
      { from: 'pre-weak', to: SEED },
      { from: SEED, to: 'dep-a' },
      { from: SEED, to: 'dep-b' },
    ]);

    return findRelatedConcepts(PLAN, SEED, 10).then((result) => {
      expect(result.map((c) => c.id)).toEqual(['pre-weak', 'pre-strong', 'dep-a', 'dep-b']);
      expect(result.map((c) => c.relation)).toEqual([
        'prerequisite',
        'prerequisite',
        'dependent',
        'dependent',
      ]);
    });
  });

  it('🔴 a never-tested concept is the most urgent, ahead of one scored 0', async () => {
    seedGraph({ [SEED]: 0.5, untested: null, zero: 0 }, [
      { from: 'untested', to: SEED },
      { from: 'zero', to: SEED },
    ]);

    const result = await findRelatedConcepts(PLAN, SEED, 10);
    expect(result.map((c) => c.id)).toEqual(['untested', 'zero']);
  });

  it('🔴 in a cycle the DAG check let through, "prerequisite" wins over "dependent"', async () => {
    // The guard this pins used to read `!relationById.has(edge.fromConceptId)`, which is always
    // true in that branch — the query only returns edges touching the seed, so `fromConceptId`
    // IS the seed there, and the seed is only ever a key of the map through a self-loop. The
    // 'dependent' write therefore overwrote the 'prerequisite' one and the ordering inverted.
    seedGraph({ [SEED]: 0.5, both: 0.1, plain: 0.9 }, [
      { from: 'both', to: SEED }, // both is a prerequisite of the seed…
      { from: SEED, to: 'both' }, // …and, in the cycle, also depends on it
      { from: SEED, to: 'plain' },
    ]);

    const result = await findRelatedConcepts(PLAN, SEED, 10);

    expect(result.find((c) => c.id === 'both')?.relation).toBe('prerequisite');
    // The consequence, not just the label: the interview fills the session base-first.
    expect(result.map((c) => c.id)).toEqual(['both', 'plain']);
  });

  it('🔴 the seed never offers itself, even through a self-loop', async () => {
    seedGraph({ [SEED]: 0.5, other: 0.1 }, [
      { from: SEED, to: SEED },
      { from: 'other', to: SEED },
    ]);

    const result = await findRelatedConcepts(PLAN, SEED, 10);
    expect(result.map((c) => c.id)).toEqual(['other']);
  });

  it('respects the limit, and asks for nothing when there is no room', async () => {
    seedGraph({ [SEED]: 0.5, a: 0.1, b: 0.2 }, [
      { from: 'a', to: SEED },
      { from: 'b', to: SEED },
    ]);

    expect((await findRelatedConcepts(PLAN, SEED, 1)).map((c) => c.id)).toEqual(['a']);

    expect(await findRelatedConcepts(PLAN, SEED, 0)).toEqual([]);
    // The zero-limit case must not even reach the database — it is called on every session start.
    expect(db.conceptEdge.findMany).toHaveBeenCalledTimes(1);
  });

  it('drops a concept whose row is gone or deprecated rather than reporting it nameless', async () => {
    // The edge names `ghost`, but `concept.findMany` is filtered to `status: 'active'` and does
    // not return it. Unlike the session queue — where a missing row must keep its slot so the
    // rail's indices hold — this list is being *built*, so an entry with no name is simply not
    // offered.
    seedGraph({ [SEED]: 0.5, alive: 0.1 }, [
      { from: 'ghost', to: SEED },
      { from: 'alive', to: SEED },
    ]);

    const result = await findRelatedConcepts(PLAN, SEED, 10);
    expect(result.map((c) => c.id)).toEqual(['alive']);
  });
});
