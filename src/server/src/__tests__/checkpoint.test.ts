import {
  MAX_CHECKPOINTS_PER_CONCEPT,
  checkpointKey,
  normalizeCheckpointText,
  normalizeCheckpoints,
  planCheckpointMerge,
  readExtractedCheckpoints,
} from '../utils/checkpoint';

/**
 * The ruler Interview v2 grades against (#329, INV-1). Pure logic, no DB and no API key: the
 * checkpoint list is deterministic software logic (C4 at the micro scale) and has to be provable
 * on its own (SDP risk R05).
 */

describe('normalizeCheckpointText', () => {
  it('trims and collapses the whitespace a model wraps its lines on', () => {
    expect(normalizeCheckpointText('  Nêu   được\n  định nghĩa\tsubnet mask ')).toBe(
      'Nêu được định nghĩa subnet mask'
    );
  });

  it('is empty for a blank entry, which is how a dropped checkpoint is signalled', () => {
    expect(normalizeCheckpointText('   \n\t ')).toBe('');
  });
});

describe('checkpointKey', () => {
  it('folds case and formatting, so a re-cased checkpoint keeps its identity', () => {
    expect(checkpointKey('Nêu  được ĐỊNH nghĩa')).toBe(checkpointKey('nêu được định nghĩa'));
  });

  it('keeps genuinely different checkpoints apart', () => {
    expect(checkpointKey('Nêu định nghĩa')).not.toBe(checkpointKey('Nêu ví dụ'));
  });
});

describe('normalizeCheckpoints', () => {
  it('normalises and keeps extraction order', () => {
    expect(normalizeCheckpoints([' Điểm  A ', 'Điểm B'])).toEqual(['Điểm A', 'Điểm B']);
  });

  it('drops the empties `conceptExtractSchema` produces for an unusable entry', () => {
    // An over-long or non-string checkpoint is caught to '' by the AI schema: it costs that one
    // entry, never the concept's whole list.
    expect(normalizeCheckpoints(['Điểm A', '', '   ', 'Điểm B'])).toEqual(['Điểm A', 'Điểm B']);
  });

  it('collapses duplicates, which would otherwise inflate C and put full coverage out of reach', () => {
    expect(normalizeCheckpoints(['Điểm A', 'điểm   a', 'Điểm B'])).toEqual(['Điểm A', 'Điểm B']);
  });

  it('caps a runaway extraction at MAX_CHECKPOINTS_PER_CONCEPT, keeping the first ones', () => {
    const many = Array.from({ length: MAX_CHECKPOINTS_PER_CONCEPT + 5 }, (_, i) => `Điểm ${i}`);

    const kept = normalizeCheckpoints(many);

    expect(kept).toHaveLength(MAX_CHECKPOINTS_PER_CONCEPT);
    expect(kept[0]).toBe('Điểm 0');
    expect(kept[MAX_CHECKPOINTS_PER_CONCEPT - 1]).toBe(`Điểm ${MAX_CHECKPOINTS_PER_CONCEPT - 1}`);
  });

  it('returns an empty list for an empty extraction — C = 0 is a valid outcome, not an error', () => {
    expect(normalizeCheckpoints([])).toEqual([]);
  });
});

describe('readExtractedCheckpoints', () => {
  it('treats a real list as an answer to act on', () => {
    expect(readExtractedCheckpoints(['Điểm A', ' điểm  b '])).toEqual({
      status: 'committed',
      texts: ['Điểm A', 'điểm b'],
    });
  });

  it('treats a deliberate empty list as an answer too — C = 0 is a decision, not a failure', () => {
    expect(readExtractedCheckpoints([])).toEqual({ status: 'committed', texts: [] });
  });

  it('treats null as NO answer, so nothing may be concluded from it', () => {
    // `conceptExtractSchema` produces null for a field that was absent, null, or not an array.
    expect(readExtractedCheckpoints(null)).toEqual({ status: 'degraded' });
  });

  it('treats a non-empty list whose entries all died as degraded, not as empty', () => {
    // The failure mode that is easy to miss: entry-level `.catch('')` empties the CONTENT while
    // leaving the array non-empty, so length is what tells "all malformed" from "none given".
    expect(readExtractedCheckpoints(['', '', '   '])).toEqual({ status: 'degraded' });
  });

  it('still commits the survivors when only SOME entries died', () => {
    expect(readExtractedCheckpoints(['', 'Điểm A', ''])).toEqual({
      status: 'committed',
      texts: ['Điểm A'],
    });
  });

  it('never reports degraded for input that carries at least one usable checkpoint', () => {
    // The property that matters at the call site: `degraded` must mean "nothing to act on", so a
    // caller skipping it can never be dropping real checkpoints on the floor.
    const inputs: (readonly string[] | null)[] = [
      null,
      [],
      [''],
      ['Điểm A'],
      ['', 'Điểm A'],
      ['Điểm A', 'điểm a'],
    ];

    for (const raw of inputs) {
      const commitment = readExtractedCheckpoints(raw);
      if (commitment.status === 'degraded') {
        expect(normalizeCheckpoints(raw ?? [])).toEqual([]);
      }
    }
  });
});

describe('planCheckpointMerge', () => {
  it('creates everything for a concept that has no checkpoints yet (first analysis)', () => {
    const plan = planCheckpointMerge([], ['Điểm A', 'Điểm B']);

    expect(plan.toCreate).toEqual([
      { text: 'Điểm A', orderIndex: 0 },
      { text: 'Điểm B', orderIndex: 1 },
    ]);
    expect(plan.toKeep).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('keeps the id of a checkpoint that survives a re-analysis — evidence points at it', () => {
    const stored = [
      { id: 'cp-1', text: 'Điểm A' },
      { id: 'cp-2', text: 'Điểm B' },
    ];

    const plan = planCheckpointMerge(stored, ['Điểm A', 'Điểm C', 'Điểm B']);

    expect(plan.toKeep).toEqual([
      { id: 'cp-1', text: 'Điểm A', orderIndex: 0 },
      { id: 'cp-2', text: 'Điểm B', orderIndex: 2 },
    ]);
    expect(plan.toCreate).toEqual([{ text: 'Điểm C', orderIndex: 1 }]);
    expect(plan.toDelete).toEqual([]);
  });

  it('matches on the normalised key, so a re-cased checkpoint is not forked into a new row', () => {
    const plan = planCheckpointMerge([{ id: 'cp-1', text: 'Điểm A' }], ['  điểm   A ']);

    // Same row, refreshed to the newest spelling — the id, and therefore its evidence, survives.
    expect(plan.toKeep).toEqual([{ id: 'cp-1', text: 'điểm A', orderIndex: 0 }]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('deletes a checkpoint the re-analysed document no longer supports', () => {
    const stored = [
      { id: 'cp-1', text: 'Điểm A' },
      { id: 'cp-gone', text: 'Điểm cũ' },
    ];

    const plan = planCheckpointMerge(stored, ['Điểm A']);

    expect(plan.toDelete).toEqual(['cp-gone']);
    expect(plan.toKeep).toEqual([{ id: 'cp-1', text: 'Điểm A', orderIndex: 0 }]);
  });

  it('clears the list when the extraction returns none — the concept falls back to C = 0', () => {
    const plan = planCheckpointMerge([{ id: 'cp-1', text: 'Điểm A' }], []);

    expect(plan.toDelete).toEqual(['cp-1']);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toKeep).toEqual([]);
  });

  it('collapses stored rows that share a key, cleaning up the duplicate on this analysis', () => {
    const stored = [
      { id: 'cp-1', text: 'Điểm A' },
      { id: 'cp-dup', text: 'ĐIỂM a' },
    ];

    const plan = planCheckpointMerge(stored, ['Điểm A']);

    expect(plan.toKeep).toEqual([{ id: 'cp-1', text: 'Điểm A', orderIndex: 0 }]);
    expect(plan.toDelete).toEqual(['cp-dup']);
    expect(plan.toCreate).toEqual([]);
  });

  it('partitions every stored row exactly once — nothing is both kept and deleted', () => {
    const stored = [
      { id: 'cp-1', text: 'Điểm A' },
      { id: 'cp-2', text: 'Điểm B' },
      { id: 'cp-3', text: 'Điểm C' },
    ];

    const plan = planCheckpointMerge(stored, ['Điểm C', 'Điểm D', 'điểm a']);

    const keptIds = plan.toKeep.map((c) => c.id);
    expect([...keptIds, ...plan.toDelete].sort()).toEqual(['cp-1', 'cp-2', 'cp-3']);
    expect(keptIds.filter((id) => plan.toDelete.includes(id))).toEqual([]);
  });

  it('applies the same normalisation as the extraction: dedup, empties and the cap', () => {
    const many = Array.from({ length: MAX_CHECKPOINTS_PER_CONCEPT + 3 }, (_, i) => `Điểm ${i}`);

    const plan = planCheckpointMerge([], ['Điểm A', '', 'điểm a', ...many]);

    expect(plan.toCreate).toHaveLength(MAX_CHECKPOINTS_PER_CONCEPT);
    expect(plan.toCreate[0]).toEqual({ text: 'Điểm A', orderIndex: 0 });
    // orderIndex is dense and 0-based over what survived, not the raw input position.
    expect(plan.toCreate.map((c) => c.orderIndex)).toEqual(
      Array.from({ length: MAX_CHECKPOINTS_PER_CONCEPT }, (_, i) => i)
    );
  });
});
