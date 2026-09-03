import { describe, expect, it } from 'vitest';
import {
  UNASSIGNED_TOPIC_ID,
  mergeTopicEditIntoGraph,
  conceptsOfTopic,
  splitEdgesByTopic,
  summariseTopics,
  topicEdgesToGraphEdges,
  topicLabel,
} from './topicAggregate';
import { Concept, PlanDocument } from '../types/concept';

function concept(id: string, primaryDocumentId: string | null, mastery: number | null): Concept {
  return { id, name: id, mastery_score: mastery, primaryDocumentId };
}

const DOCS: PlanDocument[] = [
  { id: 'doc-a', filename: 'LN02 - Software Processes.pdf', pageCount: 55, kind: 'pdf' },
  { id: 'doc-b', filename: 'LN08 - Software Testing.pdf', pageCount: 44, kind: 'pdf' },
];

describe('topicLabel', () => {
  it.each([
    ['LN08 - Software Testing.pdf', 'Software Testing'],
    ['LN02 - Software Processes.pdf', 'Software Processes'],
    ['[CNPM] chap1.pdf', 'chap1'],
    ['Chapter 4: Requirements.pdf', 'Requirements'],
    ['Bài 3 - Kiểm thử.pdf', 'Kiểm thử'],
    ['01. Giới thiệu.pdf', 'Giới thiệu'],
    ['pasted-text.txt', 'pasted-text'],
    ['ngăn-xếp.txt', 'ngăn-xếp'],
  ])('%s -> %s', (filename, expected) => {
    expect(topicLabel(filename)).toBe(expected);
  });

  it('returns the name without its extension when nothing matches', () => {
    expect(topicLabel('slides.pdf')).toBe('slides');
  });

  // The failure mode that matters: an over-eager rule eats the whole name and the topic box
  // renders blank. Empty is never an acceptable answer, so it is asserted separately.
  it.each(['LN02.pdf', '[CNPM].pdf', '2024.pdf', '.pdf'])('never returns empty for %s', (name) => {
    expect(topicLabel(name).length).toBeGreaterThan(0);
  });
});

describe('summariseTopics', () => {
  it('gives one entry per document, in the order given', () => {
    const topics = summariseTopics(DOCS, [concept('c1', 'doc-a', null)]);

    expect(topics.map((t) => t.id)).toEqual(['doc-a', 'doc-b']);
    expect(topics[0]?.label).toBe('Software Processes');
  });

  it('keeps a document with no concepts as an empty topic rather than dropping it', () => {
    const topics = summariseTopics(DOCS, [concept('c1', 'doc-a', null)]);

    expect(topics[1]?.conceptCount).toBe(0);
  });

  it('averages only the concepts that have a score, and counts the weak ones', () => {
    const topics = summariseTopics(DOCS, [
      concept('c1', 'doc-a', 0.9),
      concept('c2', 'doc-a', 0.3),
      concept('c3', 'doc-a', null),
    ]);

    expect(topics[0]?.conceptCount).toBe(3);
    expect(topics[0]?.averageMastery).toBeCloseTo(0.6);
    expect(topics[0]?.weakCount).toBe(1);
  });

  it('reports null mastery — not 0 — when nothing has been graded', () => {
    const topics = summariseTopics(DOCS, [concept('c1', 'doc-a', null)]);

    expect(topics[0]?.averageMastery).toBeNull();
  });

  it('adds the unassigned bucket only when something actually falls into it', () => {
    expect(summariseTopics(DOCS, [concept('c1', 'doc-a', null)]).map((t) => t.id)).not.toContain(
      UNASSIGNED_TOPIC_ID
    );

    const withOrphan = summariseTopics(DOCS, [concept('c1', null, null)]);
    expect(withOrphan.map((t) => t.id)).toContain(UNASSIGNED_TOPIC_ID);
    expect(withOrphan[withOrphan.length - 1]?.conceptCount).toBe(1);
  });

  it('treats a pointer to a document the plan no longer holds as unassigned', () => {
    const topics = summariseTopics(DOCS, [concept('c1', 'doc-deleted', null)]);

    expect(topics.map((t) => t.id)).toEqual(['doc-a', 'doc-b', UNASSIGNED_TOPIC_ID]);
  });
});

describe('conceptsOfTopic', () => {
  const concepts = [
    concept('c1', 'doc-a', null),
    concept('c2', 'doc-b', null),
    concept('c3', null, null),
    concept('c4', 'doc-deleted', null),
  ];

  it('returns only the concepts of that document', () => {
    expect(conceptsOfTopic(concepts, 'doc-a', DOCS).map((c) => c.id)).toEqual(['c1']);
  });

  it('collects both the unfiled and the dangling ones into the unassigned bucket', () => {
    expect(conceptsOfTopic(concepts, UNASSIGNED_TOPIC_ID, DOCS).map((c) => c.id)).toEqual([
      'c3',
      'c4',
    ]);
  });
});

describe('splitEdgesByTopic', () => {
  const edges = [
    { id: 'e1', source: 'c1', target: 'c2' },
    { id: 'e2', source: 'c2', target: 'c3' },
    { id: 'e3', source: 'c4', target: 'c5' },
  ];

  it('keeps an edge whose both ends are inside the topic', () => {
    const { intra, cross } = splitEdgesByTopic(edges, new Set(['c1', 'c2']));

    expect(intra.map((e) => e.id)).toEqual(['e1']);
    expect(cross.map((e) => e.id)).toEqual(['e2']);
  });

  it('ignores an edge with neither end in the topic — it belongs to some other topic', () => {
    const { intra, cross } = splitEdgesByTopic(edges, new Set(['c1', 'c2']));

    expect([...intra, ...cross].map((e) => e.id)).not.toContain('e3');
  });

  it('counts a cross edge in either direction', () => {
    expect(splitEdgesByTopic(edges, new Set(['c3'])).cross.map((e) => e.id)).toEqual(['e2']);
    expect(splitEdgesByTopic(edges, new Set(['c2'])).cross.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('reports no cross edges for the ordinary case, so the warning strip can stay hidden', () => {
    expect(splitEdgesByTopic([edges[0]!], new Set(['c1', 'c2'])).cross).toEqual([]);
  });
});

describe('topicEdgesToGraphEdges', () => {
  it('converts document edges into the shape the graph renderer already takes', () => {
    const converted = topicEdgesToGraphEdges(
      [{ id: 'de1', fromDocumentId: 'doc-a', toDocumentId: 'doc-b' }],
      new Set(['doc-a', 'doc-b'])
    );

    expect(converted).toEqual([{ id: 'de1', source: 'doc-a', target: 'doc-b' }]);
  });

  it('drops an edge pointing at a topic that is not on the canvas', () => {
    const converted = topicEdgesToGraphEdges(
      [{ id: 'de1', fromDocumentId: 'doc-a', toDocumentId: 'doc-gone' }],
      new Set(['doc-a', 'doc-b'])
    );

    expect(converted).toEqual([]);
  });
});

/**
 * `PUT /plans/:id/graph` là THAY-THẾ-TOÀN-BỘ và xoá cứng mọi khái niệm vắng mặt trong payload.
 * Đây là chỗ DUY NHẤT trong cả tính năng mà một lỗi làm mất dữ liệu không khôi phục được, nên nó
 * được đo ở đây, chỗ dựng được đủ mọi ca, chứ không chỉ qua thao tác trên màn hình.
 */
describe('mergeTopicEditIntoGraph', () => {
  const full: Concept[] = [
    concept('a1', 'doc-a', null),
    concept('a2', 'doc-a', null),
    concept('b1', 'doc-b', null),
    concept('c1', 'doc-c', null),
  ];
  const fullEdges = [
    { id: 'e-intra', source: 'a1', target: 'a2' }, // trong doc-a
    { id: 'e-cross', source: 'a2', target: 'b1' }, // doc-a -> doc-b
    { id: 'e-other', source: 'b1', target: 'c1' }, // doc-b -> doc-c
  ];
  const slice = [full[0]!, full[1]!]; // doc-a

  it('keeps the other topics untouched when one topic is edited', () => {
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: slice,
      editedEdges: [fullEdges[0]!],
      openTopicId: 'doc-a',
    });

    expect(merged.concepts.map((c) => c.id).sort()).toEqual(['a1', 'a2', 'b1', 'c1']);
    expect(merged.edges.map((e) => e.id).sort()).toEqual(['e-cross', 'e-intra', 'e-other']);
  });

  it('actually removes a concept the user deleted inside the topic', () => {
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: [full[0]!], // a2 removed
      editedEdges: [],
      openTopicId: 'doc-a',
    });

    expect(merged.concepts.map((c) => c.id)).not.toContain('a2');
    // ...and the other topics survive.
    expect(merged.concepts.map((c) => c.id)).toEqual(expect.arrayContaining(['b1', 'c1']));
  });

  it('drops an edge orphaned by that deletion instead of sending a dangling reference', () => {
    // a2 was the in-slice end of e-cross. Keeping e-cross would make the server answer
    // 400 INVALID_EDGE_REFERENCE and fail the entire confirmation.
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: [full[0]!],
      editedEdges: [],
      openTopicId: 'doc-a',
    });

    expect(merged.edges.map((e) => e.id)).not.toContain('e-cross');
    expect(merged.edges.map((e) => e.id)).toContain('e-other');
    const ids = new Set(merged.concepts.map((c) => c.id));
    for (const edge of merged.edges) {
      expect(ids.has(edge.source) && ids.has(edge.target)).toBe(true);
    }
  });

  it('keeps a cross-topic edge that the open topic never saw', () => {
    // e-cross is not in `editedEdges` — it was never handed down. It survives only because the
    // merge keeps every edge with an end outside the slice, and it is invisible on screen, so
    // nothing but this assertion would catch its loss.
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: slice,
      editedEdges: [fullEdges[0]!],
      openTopicId: 'doc-a',
    });

    expect(merged.edges.map((e) => e.id)).toContain('e-cross');
  });

  it('files a newly added concept under the topic it was added to', () => {
    const added = concept('tmp-1', null, null);
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: [...slice, added],
      editedEdges: [],
      openTopicId: 'doc-a',
    });

    expect(merged.concepts.find((c) => c.id === 'tmp-1')?.primaryDocumentId).toBe('doc-a');
  });

  it('leaves a concept added in the unassigned bucket unfiled', () => {
    const added = concept('tmp-1', null, null);
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: [...slice, added],
      editedEdges: [],
      openTopicId: null,
    });

    expect(merged.concepts.find((c) => c.id === 'tmp-1')?.primaryDocumentId).toBeNull();
  });

  it('does not re-file an EXISTING concept that happens to be edited here', () => {
    // b1 belongs to doc-b. Even if it somehow came back from a doc-a edit, its topic must not
    // move: re-sending the whole graph must never shuffle the topic layer.
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: [...slice, full[2]!],
      editedEdges: [],
      openTopicId: 'doc-a',
    });

    expect(merged.concepts.filter((c) => c.id === 'b1')).toHaveLength(1);
    expect(merged.concepts.find((c) => c.id === 'b1')?.primaryDocumentId).toBe('doc-b');
  });

  it('matches names the way the server does — case and padding do not create a duplicate', () => {
    const renamedCase: Concept = { ...full[0]!, id: 'tmp-2', name: '  A1  ' };
    const merged = mergeTopicEditIntoGraph({
      fullConcepts: full,
      fullEdges,
      slice,
      editedConcepts: [renamedCase, full[1]!],
      editedEdges: [],
      openTopicId: 'doc-a',
    });

    // The server addresses concepts by name, so "  A1  " and "a1" are one concept there. If the
    // client treated them as two, the payload would carry a duplicate name.
    const keys = merged.concepts.map((c) => c.name.trim().toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
