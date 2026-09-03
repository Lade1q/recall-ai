import {
  MOCK_EXTRACT_BANK_COUNT,
  MOCK_EXTRACT_RESULT,
  mockExtractForFile,
  mockTopicEdgesForDocuments,
} from '../utils/mock-ai';

/**
 * The offline fallback (`USE_MOCK_AI=true`) has to be able to demo the two-level graph, which
 * means the documents of one plan must come back with DIFFERENT concepts. A single shared
 * constant cannot do that, and neither can hashing the file key: measured on the three CNPM
 * PDFs in the dev database (2026-09-03), their keys hash to banks 1, 1, 0 — so the positional
 * `index` argument is what actually holds the property, and that is what these cases pin.
 */
describe('mockExtractForFile', () => {
  it('gives consecutive documents distinct concept sets when the index is passed', () => {
    const names = Array.from({ length: MOCK_EXTRACT_BANK_COUNT }, (_, i) =>
      mockExtractForFile(`plans/doc-${i}`, i)
        .concepts.map((c) => c.name)
        .join('|')
    );

    expect(new Set(names).size).toBe(MOCK_EXTRACT_BANK_COUNT);
  });

  it('ignores the file key when an index is given, so two identical keys still differ', () => {
    const a = mockExtractForFile('same-key', 0);
    const b = mockExtractForFile('same-key', 1);

    expect(a.concepts[0]?.name).not.toBe(b.concepts[0]?.name);
  });

  it('wraps past the last bank instead of returning undefined', () => {
    expect(mockExtractForFile('k', MOCK_EXTRACT_BANK_COUNT)).toBe(mockExtractForFile('k', 0));
  });

  it('is deterministic for the same input', () => {
    expect(mockExtractForFile('plans/abc')).toBe(mockExtractForFile('plans/abc'));
    expect(mockExtractForFile('plans/abc', 2)).toBe(mockExtractForFile('plans/abc', 2));
  });

  it('carries topic_edges on every bank, empty — only the linking pass may fill it', () => {
    for (let i = 0; i < MOCK_EXTRACT_BANK_COUNT; i++) {
      expect(mockExtractForFile('k', i).topic_edges).toEqual([]);
    }
  });

  it('keeps MOCK_EXTRACT_RESULT as one of the banks, for the tests that assert on it', () => {
    const banks = Array.from({ length: MOCK_EXTRACT_BANK_COUNT }, (_, i) =>
      mockExtractForFile('k', i)
    );
    expect(banks).toContain(MOCK_EXTRACT_RESULT);
  });
});

/**
 * The offline fallback has to produce a topic ORDER too, or the two-level graph it exists to demo
 * shows N boxes and no arrows — which is what the offline path did until 03/09, because
 * `runPhaseTwo` called the real Gemini regardless of the flag and the failure was swallowed.
 */
describe('mockTopicEdgesForDocuments', () => {
  it('chains the documents in the order they were uploaded', () => {
    expect(mockTopicEdgesForDocuments(['a.pdf', 'b.pdf', 'c.pdf'])).toEqual([
      { from: 'a.pdf', to: 'b.pdf' },
      { from: 'b.pdf', to: 'c.pdf' },
    ]);
  });

  it('returns nothing for a single document — there is no order between one file', () => {
    expect(mockTopicEdgesForDocuments(['only.pdf'])).toEqual([]);
    expect(mockTopicEdgesForDocuments([])).toEqual([]);
  });

  it('never emits a self-loop when two documents share a filename', () => {
    const edges = mockTopicEdgesForDocuments(['dup.pdf', 'dup.pdf', 'z.pdf']);
    expect(edges.every((e) => e.from !== e.to)).toBe(true);
    expect(edges).toEqual([{ from: 'dup.pdf', to: 'z.pdf' }]);
  });
});
