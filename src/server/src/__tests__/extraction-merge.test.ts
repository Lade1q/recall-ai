import {
  DocumentExtraction,
  buildTopicLinkMaterial,
  mapTopicEdgesToDocumentIds,
  mergeExtractions,
} from '../utils/extraction-merge';

function concept(name: string, extra: Record<string, unknown> = {}) {
  return { name, difficulty: 1, checkpoints: [], ...extra } as never;
}

function extraction(
  documentId: string | null,
  filename: string,
  order: number,
  names: string[],
  extra: Partial<{
    edges: { from: string; to: string }[];
    language: string;
    topicEdges: { from: string; to: string }[];
    excerptFor: string[];
  }> = {}
): DocumentExtraction {
  return {
    documentId,
    filename,
    order,
    result: {
      concepts: names.map((name) =>
        concept(name, extra.excerptFor?.includes(name) ? { source_excerpt: `${name} is X.` } : {})
      ),
      edges: extra.edges ?? [],
      language_detected: extra.language ?? 'en',
      topic_edges: extra.topicEdges ?? [],
    },
  };
}

describe('mergeExtractions', () => {
  it('unions the concepts of every document', () => {
    const merged = mergeExtractions([
      extraction('a', 'A.pdf', 0, ['Process', 'Waterfall']),
      extraction('b', 'B.pdf', 1, ['Testing']),
    ]);

    expect(merged.concepts.map((c) => c.name)).toEqual(['Process', 'Waterfall', 'Testing']);
  });

  it('files each concept under the document that produced it', () => {
    const merged = mergeExtractions([
      extraction('a', 'A.pdf', 0, ['Process']),
      extraction('b', 'B.pdf', 1, ['Testing']),
    ]);

    expect(merged.primaryDocumentIdByKey.get('process')).toBe('a');
    expect(merged.primaryDocumentIdByKey.get('testing')).toBe('b');
  });

  it('files a concept taught in two documents under the FIRST one', () => {
    const merged = mergeExtractions([
      extraction('a', 'A.pdf', 0, ['Testing']),
      extraction('b', 'B.pdf', 1, ['Testing']),
    ]);

    expect(merged.concepts).toHaveLength(1);
    expect(merged.primaryDocumentIdByKey.get('testing')).toBe('a');
  });

  it('keeps the copy that carries a verbatim excerpt, without moving the concept to that document', () => {
    const merged = mergeExtractions([
      extraction('a', 'A.pdf', 0, ['Testing']),
      extraction('b', 'B.pdf', 1, ['Testing'], { excerptFor: ['Testing'] }),
    ]);

    expect(merged.concepts[0]?.source_excerpt).toBe('Testing is X.');
    // The richer copy came from B, but the concept still belongs to A: an excerpt found later
    // must not silently relocate a concept the student first met in another file.
    expect(merged.primaryDocumentIdByKey.get('testing')).toBe('a');
  });

  it('is deterministic regardless of the order results come back in', () => {
    const a = extraction('a', 'A.pdf', 0, ['Testing']);
    const b = extraction('b', 'B.pdf', 1, ['Testing']);

    expect(mergeExtractions([b, a]).primaryDocumentIdByKey.get('testing')).toBe(
      mergeExtractions([a, b]).primaryDocumentIdByKey.get('testing')
    );
  });

  it('dedupes concept edges taught in more than one document', () => {
    const merged = mergeExtractions([
      extraction('a', 'A.pdf', 0, ['X', 'Y'], { edges: [{ from: 'X', to: 'Y' }] }),
      extraction('b', 'B.pdf', 1, ['X', 'Y'], { edges: [{ from: 'x', to: 'y' }] }),
    ]);

    expect(merged.edges).toHaveLength(1);
  });

  it('counts the topic edges phase 1 invented instead of passing them on', () => {
    const merged = mergeExtractions([
      extraction('a', 'A.pdf', 0, ['X'], { topicEdges: [{ from: 'A.pdf', to: 'B.pdf' }] }),
      extraction('b', 'B.pdf', 1, ['Y'], { topicEdges: [{ from: 'B.pdf', to: 'A.pdf' }] }),
    ]);

    expect(merged.droppedTopicEdgeCount).toBe(2);
    // There is no field on the result that could carry them onward — that is the point.
    expect(Object.keys(merged)).not.toContain('topicEdges');
  });

  it('takes the majority language, and the first document on a tie', () => {
    expect(
      mergeExtractions([
        extraction('a', 'A.pdf', 0, ['X'], { language: 'vi' }),
        extraction('b', 'B.pdf', 1, ['Y'], { language: 'en' }),
        extraction('c', 'C.pdf', 2, ['Z'], { language: 'en' }),
      ]).languageDetected
    ).toBe('en');

    expect(
      mergeExtractions([
        extraction('a', 'A.pdf', 0, ['X'], { language: 'vi' }),
        extraction('b', 'B.pdf', 1, ['Y'], { language: 'en' }),
      ]).languageDetected
    ).toBe('vi');
  });

  it('leaves a concept unfiled when its extraction has no document row', () => {
    const merged = mergeExtractions([extraction(null, 'orphan.txt', 0, ['X'])]);

    expect(merged.concepts).toHaveLength(1);
    expect(merged.primaryDocumentIdByKey.size).toBe(0);
  });
});

describe('buildTopicLinkMaterial', () => {
  it('groups concepts under their document heading, in document order', () => {
    const material = buildTopicLinkMaterial([
      extraction('b', 'B.pdf', 1, ['Testing'], { excerptFor: ['Testing'] }),
      extraction('a', 'A.pdf', 0, ['Process']),
    ]);

    expect(material.indexOf('## A.pdf')).toBeLessThan(material.indexOf('## B.pdf'));
    expect(material).toContain('- Process');
    expect(material).toContain('"Testing is X."');
  });

  it('collapses newlines inside an excerpt so one concept stays one line', () => {
    const withNewlines = extraction('a', 'A.pdf', 0, ['X']);
    withNewlines.result.concepts[0]!.source_excerpt = 'first line\n\nsecond line';

    const lines = buildTopicLinkMaterial([withNewlines]).split('\n');
    expect(lines).toHaveLength(2); // heading + one concept
    expect(lines[1]).toContain('first line second line');
  });
});

describe('mapTopicEdgesToDocumentIds', () => {
  const documents = [
    { id: 'doc-a', filename: 'A.pdf' },
    { id: 'doc-b', filename: 'B.pdf' },
  ];

  it('resolves filenames to ids', () => {
    const mapped = mapTopicEdgesToDocumentIds([{ from: 'A.pdf', to: 'B.pdf' }], documents);

    expect(mapped.edges).toEqual([{ from: 'doc-a', to: 'doc-b' }]);
    expect(mapped.autoFixed).toBe(false);
  });

  it('drops an edge naming a file the plan does not hold, and says the graph was fixed', () => {
    const mapped = mapTopicEdgesToDocumentIds(
      [
        { from: 'A.pdf', to: 'B.pdf' },
        { from: 'A.pdf', to: 'Nope.pdf' },
      ],
      documents
    );

    expect(mapped.edges).toEqual([{ from: 'doc-a', to: 'doc-b' }]);
    expect(mapped.unresolved).toEqual([{ from: 'A.pdf', to: 'Nope.pdf' }]);
    expect(mapped.autoFixed).toBe(true);
  });

  it('drops a self-loop', () => {
    const mapped = mapTopicEdgesToDocumentIds([{ from: 'A.pdf', to: 'A.pdf' }], documents);

    expect(mapped.edges).toEqual([]);
    expect(mapped.autoFixed).toBe(true);
  });

  it('matches exactly — a filename differing only in case is not the same document', () => {
    const mapped = mapTopicEdgesToDocumentIds([{ from: 'a.pdf', to: 'B.pdf' }], documents);

    expect(mapped.edges).toEqual([]);
  });

  it('gives a duplicate filename to the first document rather than guessing', () => {
    const mapped = mapTopicEdgesToDocumentIds(
      [{ from: 'Dup.pdf', to: 'B.pdf' }],
      [
        { id: 'doc-1', filename: 'Dup.pdf' },
        { id: 'doc-2', filename: 'Dup.pdf' },
        { id: 'doc-b', filename: 'B.pdf' },
      ]
    );

    expect(mapped.edges).toEqual([{ from: 'doc-1', to: 'doc-b' }]);
  });
});
