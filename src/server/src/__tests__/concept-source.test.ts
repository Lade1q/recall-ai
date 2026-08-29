import { buildConceptSourceRows } from '../utils/concept-source';
import type { AiExtractResponse } from '../schemas/ai-extract.schema';

/**
 * Unit tests for the concept -> document anchor mapping (concept_sources).
 * Pure function, no DB: the routing that decides which concepts get anchored is
 * deterministic software logic (C4), so it must be provable on its own.
 */
type Concepts = AiExtractResponse['concepts'];

const DOC = 'doc-1';
const idByName = new Map([
  ['Stack', 'c-stack'],
  ['Queue', 'c-queue'],
]);

describe('buildConceptSourceRows', () => {
  it('anchors a concept that has both page and excerpt, mapping page to from/to', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_excerpt: 'LIFO order.' },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC);

    expect(rows).toEqual([
      {
        conceptId: 'c-stack',
        documentId: DOC,
        pageFrom: 4,
        pageTo: 4,
        sectionTitle: null,
        excerpt: 'LIFO order.',
        context: null,
      },
    ]);
  });

  it('anchors on excerpt alone (no page — e.g. plain text / image input)', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: null, source_excerpt: 'LIFO order.' },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pageFrom: null, pageTo: null, excerpt: 'LIFO order.' });
  });

  // #296 — sectionTitle/context ride along with the row whenever the AI gave them.
  it('carries sectionTitle and context through when the AI gave them', () => {
    const concepts = [
      {
        name: 'Stack',
        difficulty: 2,
        source_page: 4,
        source_section: '4.2 Ngăn xếp',
        source_excerpt: 'LIFO order.',
        source_context: 'A stack follows LIFO order. Push and pop both happen at the top.',
      },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC);

    expect(rows[0]).toMatchObject({
      sectionTitle: '4.2 Ngăn xếp',
      context: 'A stack follows LIFO order. Push and pop both happen at the top.',
    });
  });

  // sectionTitle rides on the page/excerpt gate, but is independent of which of the two
  // actually anchored the row — a concept anchored on page alone can still have a section title.
  it('carries sectionTitle even when the concept anchored on page alone (no excerpt)', () => {
    const concepts = [
      {
        name: 'Stack',
        difficulty: 2,
        source_page: 4,
        source_section: '4.2 Ngăn xếp',
        source_excerpt: null,
      },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC);

    expect(rows[0]).toMatchObject({ sectionTitle: '4.2 Ngăn xếp', excerpt: null, context: null });
  });

  it('defaults sectionTitle and context to null when the AI did not give them', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_excerpt: 'LIFO order.' },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC);

    expect(rows[0]).toMatchObject({ sectionTitle: null, context: null });
  });

  it('skips a concept with neither page nor excerpt', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: null, source_excerpt: null },
    ] as Concepts;

    expect(buildConceptSourceRows(concepts, idByName, DOC)).toEqual([]);
  });

  it('skips a concept whose name did not resolve to a created id', () => {
    const concepts = [
      { name: 'Ghost', difficulty: 1, source_page: 1, source_excerpt: 'unused' },
    ] as Concepts;

    expect(buildConceptSourceRows(concepts, idByName, DOC)).toEqual([]);
  });

  it('maps only the anchored subset across a mixed batch', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_excerpt: 'LIFO.' },
      { name: 'Queue', difficulty: 2, source_page: null, source_excerpt: null },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.conceptId).toBe('c-stack');
  });
});
