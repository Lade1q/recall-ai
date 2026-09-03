import { AiExtractResponse, ConceptExtract, EdgeExtract } from '../schemas/ai-extract.schema';
import { normalizeConceptKey } from './concept-merge';

/**
 * One document's phase-1 result, tagged with the document it came from.
 *
 * The tag is not something the model was asked for: phase 1 sends exactly ONE file per call, so
 * which document produced a result is known from the call site. That is the whole reason
 * `primaryDocumentId` needs no AI involvement.
 */
export interface DocumentExtraction {
  /**
   * `null` only for the degraded path where the plan's `documents` row is gone but the job still
   * carries a `fileKey` — the concepts are still worth extracting, they just belong to no topic
   * and land in the UI's "Chưa xếp chủ đề" bucket.
   */
  documentId: string | null;
  filename: string;
  /** Position in `documents ORDER BY created_at ASC` — decides ties deterministically. */
  order: number;
  result: AiExtractResponse;
}

export interface MergedExtraction {
  concepts: ConceptExtract[];
  edges: EdgeExtract[];
  languageDetected: string;
  /** `normalizeConceptKey(name)` -> the document this concept is filed under as its topic. */
  primaryDocumentIdByKey: Map<string, string>;
  /**
   * How many `topic_edges` phase 1 returned and this function threw away. Phase 1 only ever sees
   * one file, so it cannot know an order between two of them; anything here is invented. Counted
   * rather than silently ignored so the caller can warn, and so a test can assert it stayed out
   * of the database.
   */
  droppedTopicEdgeCount: number;
}

/**
 * Folds N phase-1 results into the single graph the rest of the pipeline already expects.
 *
 * Deterministic, no AI. Every tie is broken by document order, so re-running the same upload
 * produces the same graph.
 *
 * What it does NOT do is merge topics. With one file = one topic, topics are born and die with
 * their document; there is nothing to reconcile. The only per-topic decision is which document a
 * concept is filed under, and that is just "the first document that taught it".
 */
export function mergeExtractions(extractions: readonly DocumentExtraction[]): MergedExtraction {
  const ordered = [...extractions].sort((a, b) => a.order - b.order);

  const conceptByKey = new Map<string, { concept: ConceptExtract; order: number }>();
  const primaryDocumentIdByKey = new Map<string, string>();
  const edges: EdgeExtract[] = [];
  const seenEdgeKeys = new Set<string>();
  const languageVotes = new Map<string, number>();
  let droppedTopicEdgeCount = 0;

  for (const extraction of ordered) {
    droppedTopicEdgeCount += extraction.result.topic_edges.length;

    for (const concept of extraction.result.concepts) {
      const key = normalizeConceptKey(concept.name);
      const held = conceptByKey.get(key);

      if (!held) {
        conceptByKey.set(key, { concept, order: extraction.order });
        // First document to teach it owns it. A concept taught in two files still gets a
        // `concept_sources` row for EACH (that table is N:M and both are true), but it sits
        // under exactly one topic, or the two-level graph would show it twice.
        if (extraction.documentId) primaryDocumentIdByKey.set(key, extraction.documentId);
        continue;
      }

      // Same concept from a later file: keep whichever copy carries a verbatim excerpt, since
      // that is what grounds the C5 citation. The ANCHOR does not move — `primaryDocumentIdByKey`
      // is untouched here on purpose, so a richer description from file 5 cannot silently
      // relocate a concept the student met in file 1.
      const heldHasExcerpt = Boolean(held.concept.source_excerpt);
      const candidateHasExcerpt = Boolean(concept.source_excerpt);
      if (!heldHasExcerpt && candidateHasExcerpt) {
        conceptByKey.set(key, { concept, order: held.order });
      }
    }

    for (const edge of extraction.result.edges) {
      // Concept edges never cross documents: phase 1 saw one file, so both endpoints are in it.
      // Dedup is still needed because two files can teach the same pair of concepts.
      const edgeKey = `${normalizeConceptKey(edge.from)}->${normalizeConceptKey(edge.to)}`;
      if (seenEdgeKeys.has(edgeKey)) continue;
      seenEdgeKeys.add(edgeKey);
      edges.push(edge);
    }

    const language = extraction.result.language_detected;
    languageVotes.set(language, (languageVotes.get(language) ?? 0) + 1);
  }

  // Majority language; ties go to the first document, which is the order `ordered` already has.
  let languageDetected = ordered[0]?.result.language_detected ?? 'en';
  let bestVotes = 0;
  for (const extraction of ordered) {
    const votes = languageVotes.get(extraction.result.language_detected) ?? 0;
    if (votes > bestVotes) {
      bestVotes = votes;
      languageDetected = extraction.result.language_detected;
    }
  }

  return {
    concepts: [...conceptByKey.values()].map((held) => held.concept),
    edges,
    languageDetected,
    primaryDocumentIdByKey,
    droppedTopicEdgeCount,
  };
}

/** Longest excerpt carried into the phase-2 prompt, per concept. Excerpts run ~81 chars at the
 *  median (measured on the dev database, 2026-09-03); this only clips the rare essay. */
const MATERIAL_EXCERPT_MAX = 240;

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Builds the text phase 2 reasons over: the documents, and under each one the concepts phase 1
 * found in it with the sentence that grounds them.
 *
 * This is DERIVED material, not the PDFs — phase 2 is strictly weaker evidence than phase 1, and
 * that is why every edge it produces is drawn dashed and put in front of the student to review.
 * What it is NOT is general knowledge: every line here is text the model itself pulled out of the
 * student's own upload, so ordering these documents stays a judgement about their material.
 */
export function buildTopicLinkMaterial(extractions: readonly DocumentExtraction[]): string {
  const ordered = [...extractions].sort((a, b) => a.order - b.order);

  const sections = ordered.map((extraction) => {
    const lines = extraction.result.concepts.map((concept) => {
      const excerpt = concept.source_excerpt
        ? ` — "${oneLine(concept.source_excerpt, MATERIAL_EXCERPT_MAX)}"`
        : '';
      const description = concept.description
        ? ` · ${oneLine(concept.description, MATERIAL_EXCERPT_MAX)}`
        : '';
      return `- ${concept.name}${excerpt}${description}`;
    });
    return `## ${extraction.filename}\n${lines.join('\n')}`;
  });

  return sections.join('\n\n');
}

export interface MappedTopicEdges {
  /** Edges with both endpoints resolved to document ids. */
  edges: { from: string; to: string }[];
  /** True when at least one returned edge had to be discarded, i.e. the graph was auto-fixed. */
  autoFixed: boolean;
  /** The `from`/`to` values that matched no document, for the warning log. */
  unresolved: EdgeExtract[];
}

/**
 * Turns phase 2's filename-keyed edges into document-id edges.
 *
 * THIS is where an edge naming a file that does not exist dies — not in `validateAndFixDag`,
 * which by then is looking at UUIDs and has no unfamiliar name left to reject. Matching is exact
 * on `Document.filename` with no fuzzy fallback, and that is safe precisely because both sides
 * of the comparison are strings this server printed into the prompt itself.
 *
 * A plan holding two documents with the same filename is possible (nothing forbids uploading the
 * same file twice). The first one wins, and the duplicate simply never receives an edge —
 * preferable to guessing, since the two are indistinguishable from the model's side.
 */
export function mapTopicEdgesToDocumentIds(
  topicEdges: readonly EdgeExtract[],
  documents: readonly { id: string; filename: string }[]
): MappedTopicEdges {
  const byName = new Map<string, string>();
  for (const document of documents) {
    if (!byName.has(document.filename)) byName.set(document.filename, document.id);
  }

  const edges: { from: string; to: string }[] = [];
  const unresolved: EdgeExtract[] = [];

  for (const edge of topicEdges) {
    const from = byName.get(edge.from);
    const to = byName.get(edge.to);
    if (!from || !to || from === to) {
      unresolved.push(edge);
      continue;
    }
    edges.push({ from, to });
  }

  return { edges, autoFixed: unresolved.length > 0, unresolved };
}
