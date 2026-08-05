import {
  anchorMatchesCachedQuestion,
  buildTurnCitation,
  type CitedDocumentRow,
  type TurnCitationSnapshot,
} from '../utils/question-citation';

/**
 * Unit tests for the C5 source anchor an interview question is allowed to show (#239, #240).
 * Pure functions, no DB and no AI key: deciding when a citation must be withheld is
 * deterministic software logic, so it has to be provable on its own (R05).
 *
 * Every case here is a way of getting the *wrong* citation rather than a missing one — which is
 * why #240 moved the decision off read time and onto ask time.
 */
const ASKED_AT = new Date('2026-08-04T10:00:00Z');

const PDF: CitedDocumentRow = {
  id: 'doc-pdf',
  filename: 'giai-tich-1.pdf',
  kind: 'pdf',
  // Uploaded well before the question was asked and untouched since — the ordinary case.
  updatedAt: new Date('2026-08-01T09:00:00Z'),
};
const NOTES: CitedDocumentRow = {
  id: 'doc-notes',
  filename: 'ghi-chu.txt',
  kind: 'text',
  updatedAt: new Date('2026-08-01T09:00:00Z'),
};

const documents = new Map([
  [PDF.id, PDF],
  [NOTES.id, NOTES],
]);

function turn(overrides: Partial<TurnCitationSnapshot> = {}): TurnCitationSnapshot {
  return {
    sourceDocumentId: PDF.id,
    sourcePageFrom: 4,
    sourcePageTo: 4,
    askedAt: ASKED_AT,
    ...overrides,
  };
}

describe('anchorMatchesCachedQuestion', () => {
  const cacheGeneratedAt = new Date('2026-08-02T00:00:00Z');

  it('accepts an anchor that was already in place when the question was cached', () => {
    const anchoredEarlier = new Date('2026-08-01T00:00:00Z');

    expect(anchorMatchesCachedQuestion(anchoredEarlier, cacheGeneratedAt)).toBe(true);
  });

  it('rejects an anchor written after the question was cached', () => {
    // The re-analysis chain: cache generated at T2 from document v1, anchors deleted and
    // rewritten at T3, turn served at T4. The anchor now on the concept describes v2 — it is
    // not this question's anchor, and attaching it would produce a page number out of thin air.
    const anchoredAfterReanalysis = new Date('2026-08-03T00:00:00Z');

    expect(anchorMatchesCachedQuestion(anchoredAfterReanalysis, cacheGeneratedAt)).toBe(false);
  });

  it('accepts an anchor written in the same instant as the cache row', () => {
    // Pre-generation right after analysis writes both within one transaction's worth of time;
    // the boundary belongs to the "still matching" side or AE-06's own output cites nothing.
    expect(anchorMatchesCachedQuestion(cacheGeneratedAt, cacheGeneratedAt)).toBe(true);
  });
});

describe('buildTurnCitation', () => {
  it('names the document and page span the question recorded', () => {
    expect(buildTurnCitation(turn({ sourcePageFrom: 4, sourcePageTo: 6 }), documents)).toEqual({
      documentId: 'doc-pdf',
      filename: 'giai-tich-1.pdf',
      kind: 'pdf',
      pageFrom: 4,
      pageTo: 6,
    });
  });

  it('keeps a null page span for material that has no pages', () => {
    const snapshot = turn({ sourceDocumentId: NOTES.id, sourcePageFrom: null, sourcePageTo: null });

    expect(buildTurnCitation(snapshot, documents)).toMatchObject({
      filename: 'ghi-chu.txt',
      pageFrom: null,
      pageTo: null,
    });
  });

  it('cites a cached question exactly like an AI one — the snapshot is what matters', () => {
    // #239 hid every cache_fallback turn because a turn carried no evidence of its own origin.
    // It carries one now, so the source of the question no longer enters into this decision.
    expect(buildTurnCitation(turn(), documents)).toMatchObject({ documentId: 'doc-pdf' });
  });

  it('returns null for a concept the analysis never anchored', () => {
    // A concept added by hand (#172), or one extract_concepts gave neither page nor excerpt for.
    const snapshot = turn({ sourceDocumentId: null, sourcePageFrom: null, sourcePageTo: null });

    expect(buildTurnCitation(snapshot, documents)).toBeNull();
  });

  it('returns null for a turn asked before snapshotting existed', () => {
    // The three columns are nullable and were deliberately not backfilled (#240): a turn from
    // before the migration has no record of its source, and guessing one back is the fabrication.
    expect(buildTurnCitation(turn({ sourceDocumentId: null }), documents)).toBeNull();
  });

  it('returns null when the document has since been deleted', () => {
    // `sourceDocumentId` is a reference, not a foreign key — deleting a document must not delete
    // the interview history, so a dangling id is an expected state.
    expect(buildTurnCitation(turn({ sourceDocumentId: 'doc-deleted' }), documents)).toBeNull();
  });

  it('returns null when the file was replaced after the question was asked', () => {
    // SP-04 change-document updates the row in place: same id, different file. Without this
    // check the citation still resolves and still looks valid, pointing at the wrong document.
    const replaced = new Map([
      [
        PDF.id,
        { ...PDF, filename: 'dai-so-tuyen-tinh.pdf', updatedAt: new Date(+ASKED_AT + 1000) },
      ],
    ]);

    expect(buildTurnCitation(turn(), replaced)).toBeNull();
  });

  it('still cites a document edited before the question was asked', () => {
    // The rule is "replaced *after* the question", not "ever touched" — a plan whose document
    // was swapped and re-analysed goes on citing normally for every question asked since.
    const edited = new Map([[PDF.id, { ...PDF, updatedAt: new Date(+ASKED_AT - 1000) }]]);

    expect(buildTurnCitation(turn(), edited)).toMatchObject({ documentId: 'doc-pdf' });
  });
});
