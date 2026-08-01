import { planConceptMerge, normalizeConceptKey } from '../utils/concept-merge';
import type { ExistingConcept } from '../utils/concept-merge';
import type { ConceptExtract } from '../schemas/ai-extract.schema';

/**
 * Unit tests for the SP-05 merge policy (#170). No DB, no API key — the whole point of
 * keeping the policy pure (SDP risk R05).
 */

function extract(name: string, difficulty = 1): ConceptExtract {
  return { name, difficulty, source_page: null, source_excerpt: null };
}

function stored(
  id: string,
  name: string,
  status: 'active' | 'deprecated' = 'active'
): ExistingConcept {
  return { id, name, status };
}

describe('normalizeConceptKey', () => {
  it('folds case and surrounding whitespace', () => {
    expect(normalizeConceptKey('  Cây nhị phân ')).toBe('cây nhị phân');
    expect(normalizeConceptKey('CÂY NHỊ PHÂN')).toBe(normalizeConceptKey('cây nhị phân'));
  });
});

describe('planConceptMerge', () => {
  it('treats a first analysis as pure inserts', () => {
    const extracted = [extract('Ngăn xếp'), extract('Hàng đợi')];

    const plan = planConceptMerge([], extracted);

    expect(plan.toCreate).toEqual(extracted);
    expect(plan.toKeep).toEqual([]);
    expect(plan.toDeprecate).toEqual([]);
  });

  it('keeps the existing row for a name that survives, so its mastery survives too', () => {
    const existing = [stored('id-stack', 'Ngăn xếp')];

    const plan = planConceptMerge(existing, [extract('Ngăn xếp', 3)]);

    expect(plan.toKeep).toEqual([{ id: 'id-stack', name: 'Ngăn xếp', difficulty: 3 }]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDeprecate).toEqual([]);
  });

  it('matches across a change of casing or padding rather than forking the concept', () => {
    const existing = [stored('id-tree', 'Cây nhị phân')];

    const plan = planConceptMerge(existing, [extract('  cây NHỊ phân  ')]);

    expect(plan.toCreate).toEqual([]);
    expect(plan.toDeprecate).toEqual([]);
    // The extracted spelling wins going forward, but it is the same row.
    expect(plan.toKeep).toEqual([{ id: 'id-tree', name: '  cây NHỊ phân  ', difficulty: 1 }]);
  });

  it('deprecates a dropped concept instead of deleting it', () => {
    const existing = [stored('id-stack', 'Ngăn xếp'), stored('id-gone', 'Bảng băm')];

    const plan = planConceptMerge(existing, [extract('Ngăn xếp')]);

    expect(plan.toDeprecate).toEqual(['id-gone']);
    expect(plan.toKeep).toHaveLength(1);
  });

  it('does not re-deprecate a row that is already deprecated', () => {
    const existing = [stored('id-old', 'Bảng băm', 'deprecated')];

    const plan = planConceptMerge(existing, [extract('Ngăn xếp')]);

    expect(plan.toDeprecate).toEqual([]);
    expect(plan.toCreate).toEqual([extract('Ngăn xếp')]);
  });

  it('revives a deprecated concept when the document mentions it again', () => {
    const existing = [stored('id-old', 'Bảng băm', 'deprecated')];

    const plan = planConceptMerge(existing, [extract('Bảng băm', 4)]);

    // Reusing the id is the point: the student's old score on this concept comes back.
    expect(plan.toKeep).toEqual([{ id: 'id-old', name: 'Bảng băm', difficulty: 4 }]);
    expect(plan.toCreate).toEqual([]);
  });

  it('prefers the active row when a key has both an active and a deprecated row', () => {
    const existing = [stored('id-dead', 'Bảng băm', 'deprecated'), stored('id-live', 'Bảng băm')];

    const plan = planConceptMerge(existing, [extract('Bảng băm')]);

    expect(plan.toKeep).toEqual([{ id: 'id-live', name: 'Bảng băm', difficulty: 1 }]);
    // The tombstone is not in the extraction's key set but is already deprecated.
    expect(plan.toDeprecate).toEqual([]);
  });

  it('collapses duplicate names inside one extraction to the first occurrence', () => {
    const plan = planConceptMerge([], [extract('Đệ quy', 2), extract('đệ quy', 5)]);

    expect(plan.toCreate).toEqual([extract('Đệ quy', 2)]);
  });

  it('handles a full replacement: everything new, everything old deprecated', () => {
    const existing = [stored('id-a', 'A'), stored('id-b', 'B')];

    const plan = planConceptMerge(existing, [extract('C')]);

    expect(plan.toCreate).toEqual([extract('C')]);
    expect(plan.toKeep).toEqual([]);
    expect(plan.toDeprecate).toEqual(['id-a', 'id-b']);
  });
});
