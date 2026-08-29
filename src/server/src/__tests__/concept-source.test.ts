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

const STACK_MATERIAL =
  '4.2 Ngăn xếp\n\nA stack follows LIFO order. Push and pop both happen at the top.';

describe('buildConceptSourceRows', () => {
  it('anchors a concept that has both page and excerpt, mapping page to from/to', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_excerpt: 'LIFO order.' },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

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

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pageFrom: null, pageTo: null, excerpt: 'LIFO order.' });
  });

  // #296 — sectionTitle/context ride along with the row whenever the AI gave them AND their
  // guard passes (verified against materialText / excerpt — see the "guard" describe blocks).
  it('carries sectionTitle and context through when the AI gave them and both verify', () => {
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

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

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

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]).toMatchObject({ sectionTitle: '4.2 Ngăn xếp', excerpt: null, context: null });
  });

  it('defaults sectionTitle and context to null when the AI did not give them', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_excerpt: 'LIFO order.' },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]).toMatchObject({ sectionTitle: null, context: null });
  });

  it('skips a concept with neither page nor excerpt', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: null, source_excerpt: null },
    ] as Concepts;

    expect(buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL)).toEqual([]);
  });

  it('skips a concept whose name did not resolve to a created id', () => {
    const concepts = [
      { name: 'Ghost', difficulty: 1, source_page: 1, source_excerpt: 'unused' },
    ] as Concepts;

    expect(buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL)).toEqual([]);
  });

  it('maps only the anchored subset across a mixed batch', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_excerpt: 'LIFO.' },
      { name: 'Queue', difficulty: 2, source_page: null, source_excerpt: null },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.conceptId).toBe('c-stack');
  });
});

/**
 * Review #425 (Quân, 29/08) measured live: the model slips its own commentary into
 * `source_section` 13/67 times (19%) — e.g. `"... (Giáo trình … - 4.4 … / trang 2, dòng 4 - 5)"`
 * — because the prompt's "copied **or lightly normalized**" clause is an escape hatch
 * `source_excerpt`'s "**verbatim**" wording does not have (measured 69/69 verbatim). The guard
 * discarded exactly the 13 polluted values and 0 good ones on that sample.
 */
describe('buildConceptSourceRows — sectionTitle guard (#425 review)', () => {
  it('keeps a section title that appears verbatim in the material', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_section: '4.2 Ngăn xếp' },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]?.sectionTitle).toBe('4.2 Ngăn xếp');
  });

  it('discards a section title carrying model commentary the material never says', () => {
    const concepts = [
      {
        name: 'Stack',
        difficulty: 2,
        source_page: 4,
        source_section: '4.2 Ngăn xếp (nhắc đến như nền tảng so sánh)',
      },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]?.sectionTitle).toBeNull();
  });

  it('tolerates re-flowed whitespace (wrapped lines, extra spaces) between title and material', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_section: '4.2   Ngăn   xếp' },
    ] as Concepts;
    const wrapped = '4.2\nNgăn\nxếp\n\nrest of the material...';

    const rows = buildConceptSourceRows(concepts, idByName, DOC, wrapped);

    expect(rows[0]?.sectionTitle).toBe('4.2   Ngăn   xếp');
  });

  // PDF/image material has no local text extraction anywhere in this codebase (only Gemini's
  // File API sees the bytes) — `materialText: null` is how that is represented, and "cannot
  // verify" must not be silently trusted (decision confirmed with the user 29/08: safe default).
  it('discards every section title when materialText is null (PDF/image — cannot verify)', () => {
    const concepts = [
      { name: 'Stack', difficulty: 2, source_page: 4, source_section: '4.2 Ngăn xếp' },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, null);

    expect(rows[0]?.sectionTitle).toBeNull();
  });
});

/**
 * Review #425 (Quân) — cheap insurance measured pass 21/21 on live data: `context` must actually
 * contain `excerpt` (whitespace-normalized), which also enforces the prompt's own unenforced rule
 * ("Null when source_excerpt is null") for free.
 */
describe('buildConceptSourceRows — context guard (#425 review)', () => {
  it('keeps a context that contains the excerpt verbatim', () => {
    const concepts = [
      {
        name: 'Stack',
        difficulty: 2,
        source_excerpt: 'LIFO order.',
        source_context: 'A stack follows LIFO order. Push and pop happen at the top.',
      },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]?.context).toBe('A stack follows LIFO order. Push and pop happen at the top.');
  });

  it('discards a context that does not actually contain the excerpt', () => {
    const concepts = [
      {
        name: 'Stack',
        difficulty: 2,
        source_excerpt: 'LIFO order.',
        source_context: 'Queues follow FIFO order instead.',
      },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]?.context).toBeNull();
  });

  it("discards a context when excerpt is null, enforcing the prompt's own unenforced rule", () => {
    const concepts = [
      {
        name: 'Stack',
        difficulty: 2,
        source_page: 4,
        source_excerpt: null,
        source_context: 'A stack follows LIFO order.',
      },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]?.context).toBeNull();
  });

  it('tolerates whitespace differences between context and excerpt', () => {
    const concepts = [
      {
        name: 'Stack',
        difficulty: 2,
        source_excerpt: 'LIFO   order.',
        source_context: 'A stack follows LIFO\norder. Push and pop happen at the top.',
      },
    ] as Concepts;

    const rows = buildConceptSourceRows(concepts, idByName, DOC, STACK_MATERIAL);

    expect(rows[0]?.context).toBe('A stack follows LIFO\norder. Push and pop happen at the top.');
  });
});
