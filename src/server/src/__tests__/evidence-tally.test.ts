import { tallyConceptEvidence, type StoredEvidence } from '../utils/evidence-tally';
import { coverageMasteryScore } from '../utils/mastery';

const RULER = ['cp-1', 'cp-2', 'cp-3', 'cp-4'];

const covered = (checkpointId: string): StoredEvidence => ({ checkpointId, status: 'covered' });
const contradicted = (checkpointId: string): StoredEvidence => ({
  checkpointId,
  status: 'contradicted',
});

/** The read half of the grain (#331): stored evidence + the committed ruler → the coverage counts. */
describe('tallyConceptEvidence', () => {
  it('counts how the student settled each checkpoint, and leaves the rest not_discussed', () => {
    const tally = tallyConceptEvidence(
      [covered('cp-1'), covered('cp-2'), contradicted('cp-3')],
      RULER
    );

    expect(tally).toEqual({
      committed: 4,
      evCovered: 2,
      evContradicted: 1,
      resolved: 3,
      notDiscussed: 1,
      orphanedCheckpointIds: [],
    });
  });

  it('not_discussed is the ABSENCE of a row — no evidence at all leaves every checkpoint open', () => {
    const tally = tallyConceptEvidence([], RULER);

    expect(tally.resolved).toBe(0);
    expect(tally.notDiscussed).toBe(4);
    // Nothing was resolved, so nothing can be judged — never a zero (INV-2: unanswered ≠ wrong).
    expect(coverageMasteryScore(tally.evCovered, tally.evContradicted, tally.committed)).toBeNull();
  });

  it('evidence against a checkpoint the concept no longer commits is not counted, and is reported', () => {
    // A re-analysis deleted cp-4 after the student had already answered it. The row survives on
    // purpose (`checkpointId` is not a foreign key) but it may not score against today's ruler.
    const tally = tallyConceptEvidence(
      [covered('cp-1'), covered('cp-2'), covered('cp-4-deleted')],
      ['cp-1', 'cp-2', 'cp-3']
    );

    expect(tally.evCovered).toBe(2);
    expect(tally.resolved).toBe(2);
    expect(tally.notDiscussed).toBe(1);
    expect(tally.orphanedCheckpointIds).toEqual(['cp-4-deleted']);
  });

  it('evidence recorded under the wrong concept, or against an id nobody committed, falls out too', () => {
    // INV-1 is a contract in a docstring, not a database constraint: a caller can write evidence
    // against another concept's checkpoint (the unique key makes that a second row, not a
    // collision) or against an id it invented outright. Both must stay out of the numerator.
    const tally = tallyConceptEvidence(
      [covered('cp-1'), covered('other-concept-cp'), contradicted('fabricated')],
      RULER
    );

    expect(tally.evCovered).toBe(1);
    expect(tally.evContradicted).toBe(0);
    expect(tally.orphanedCheckpointIds).toEqual(['other-concept-cp', 'fabricated']);
  });

  it('a concept with no ruler tallies to zero rather than throwing (§2.4 routes it to text)', () => {
    const tally = tallyConceptEvidence([covered('cp-1')], []);

    expect(tally).toMatchObject({ committed: 0, resolved: 0, notDiscussed: 0 });
    expect(tally.orphanedCheckpointIds).toEqual(['cp-1']);
    expect(coverageMasteryScore(tally.evCovered, tally.evContradicted, tally.committed)).toBeNull();
  });

  it('one checkpoint is one cell: a repeated row cannot resolve it twice', () => {
    // The unique key means the table cannot hand back two rows for one checkpoint. This proves
    // the arithmetic does not depend on that: the last read wins its cell either way.
    const tally = tallyConceptEvidence(
      [covered('cp-1'), covered('cp-1'), contradicted('cp-1')],
      RULER
    );

    expect(tally.resolved).toBe(1);
    expect(tally.evCovered).toBe(0);
    expect(tally.evContradicted).toBe(1);
  });

  it('resolved never exceeds committed, whatever the rows say', () => {
    // What makes the `resolved > committed` guard in coverageMasteryScore a backstop rather than
    // a live check: both counts are drawn from the committed set, each id once. Swept over every
    // shape a caller could produce, including duplicates and ids outside the ruler.
    const ids = ['cp-1', 'cp-2', 'cp-3'];
    const candidates = [...ids, 'stale', 'fabricated'];

    for (let mask = 0; mask < 1 << candidates.length; mask += 1) {
      const rows = candidates
        .filter((_, index) => (mask & (1 << index)) !== 0)
        .flatMap((id) => [covered(id), contradicted(id)]);
      const tally = tallyConceptEvidence(rows, ids);

      expect(tally.resolved).toBeLessThanOrEqual(tally.committed);
      expect(tally.notDiscussed).toBeGreaterThanOrEqual(0);
      expect(tally.evCovered + tally.evContradicted).toBe(tally.resolved);
    }
  });

  it('feeds §2.3: a stalled concept is null, a finished one scores the share it got right', () => {
    // Solved 2 of 4 and stalled — coverage 0.5, below the floor, so it returns to the queue
    // instead of reading as full mastery over half a concept.
    const stalled = tallyConceptEvidence([covered('cp-1'), covered('cp-2')], RULER);
    expect(stalled.notDiscussed).toBe(2);
    expect(
      coverageMasteryScore(stalled.evCovered, stalled.evContradicted, stalled.committed)
    ).toBeNull();

    // Settled 3 of 4, one of them wrong — coverage 0.75 passes, score is 2/3.
    const settled = tallyConceptEvidence(
      [covered('cp-1'), covered('cp-2'), contradicted('cp-3')],
      RULER
    );
    expect(coverageMasteryScore(settled.evCovered, settled.evContradicted, settled.committed)).toBe(
      0.67
    );
  });
});
