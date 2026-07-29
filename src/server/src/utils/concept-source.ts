import type { AiExtractResponse } from '../schemas/ai-extract.schema';

export interface ConceptSourceRow {
  conceptId: string;
  documentId: string;
  pageFrom: number | null;
  pageTo: number | null;
  excerpt: string | null;
}

/**
 * Maps extracted concepts to concept_sources rows for one document. A concept is anchored
 * only if it resolved to a created id AND the AI gave at least a page or an excerpt; anything
 * else is skipped (best-effort anchoring). Pure function — no DB, unit-testable. The single
 * `source_page` becomes both pageFrom and pageTo (a one-page span).
 */
export function buildConceptSourceRows(
  concepts: AiExtractResponse['concepts'],
  conceptIdByName: Map<string, string>,
  documentId: string
): ConceptSourceRow[] {
  return concepts.flatMap((c) => {
    const conceptId = conceptIdByName.get(c.name);
    if (!conceptId || (c.source_page == null && !c.source_excerpt)) return [];
    return [
      {
        conceptId,
        documentId,
        pageFrom: c.source_page ?? null,
        pageTo: c.source_page ?? null,
        excerpt: c.source_excerpt ?? null,
      },
    ];
  });
}
