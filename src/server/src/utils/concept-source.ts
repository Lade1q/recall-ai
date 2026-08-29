import type { AiExtractResponse } from '../schemas/ai-extract.schema';

export interface ConceptSourceRow {
  conceptId: string;
  documentId: string;
  pageFrom: number | null;
  pageTo: number | null;
  /** Tiêu đề mục tài liệu chứa khái niệm, vd "4.2 Ngăn xếp" (#296). */
  sectionTitle: string | null;
  excerpt: string | null;
  /** Đoạn văn bao quanh `excerpt`, cho FS-04 state 6 (#296) — KHÔNG dùng cho `<mark>`/C5. */
  context: string | null;
}

/**
 * Maps extracted concepts to concept_sources rows for one document. A concept is anchored
 * only if it resolved to a created id AND the AI gave at least a page or an excerpt; anything
 * else is skipped (best-effort anchoring). Pure function — no DB, unit-testable. The single
 * `source_page` becomes both pageFrom and pageTo (a one-page span).
 *
 * `sectionTitle`/`context` (#296) ride along whenever the AI gave them — independent of the
 * page/excerpt gate above, since a concept anchored on page alone can still have a section title.
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
        sectionTitle: c.source_section ?? null,
        excerpt: c.source_excerpt ?? null,
        context: c.source_context ?? null,
      },
    ];
  });
}
