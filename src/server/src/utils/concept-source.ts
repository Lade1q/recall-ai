import type { AiExtractResponse } from '../schemas/ai-extract.schema';

/**
 * Review #425 (Quân, 29/08) đo LIVE trên Gemini thật: `context` là **all-or-nothing theo LƯỢT
 * phân tích**, không theo từng khái niệm — 14/14 lượt đo được, tỉ lệ hàng có `context` trong một
 * lượt luôn là 0% hoặc 100%, không lần nào lẻ. Xác suất một lượt "trúng" ~29%. Vì field chỉ ghi
 * lúc phân tích, một kế hoạch rơi vào lượt "không" sẽ **vĩnh viễn** không có ngữ cảnh cho tới khi
 * người dùng re-analyze — client (FS-04, #227) phải coi `context: null` trên MỌI khái niệm của
 * một kế hoạch là nhánh THƯỜNG, không phải nhánh hiếm/lỗi.
 */
export interface ConceptSourceRow {
  conceptId: string;
  documentId: string;
  pageFrom: number | null;
  pageTo: number | null;
  /** Tiêu đề mục tài liệu chứa khái niệm, vd "4.2 Ngăn xếp" (#296) — đã qua guard đối chiếu
   *  `materialText`, xem `verifiedSectionTitle`. `materialText` chỉ tồn tại cho tài liệu `.txt`
   *  (repo không đọc text PDF/ảnh cục bộ) — với PDF/ảnh, trường này **luôn null (100%)**, không
   *  phải "phần lớn null" như `context`. Client (FS-04, #227) phải coi đây là nhánh THƯỜNG cho
   *  3/4 định dạng tài liệu được chấp nhận, không phải nhánh hiếm/lỗi. */
  sectionTitle: string | null;
  excerpt: string | null;
  /** Đoạn văn bao quanh `excerpt`, cho FS-04 state 6 (#296) — KHÔNG dùng cho `<mark>`/C5. Đã qua
   *  guard chứa `excerpt`, xem `verifiedContext`. All-or-nothing theo lượt — xem docstring trên. */
  context: string | null;
}

/** Collapses whitespace so a wrapped/re-flowed quote still compares equal to the source. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Review #425 (Quân, 29/08) measured live: the prompt's "copied or lightly normalized" escape
 * hatch for `source_section` lets the model slip in its own commentary 13/67 times (19%) —
 * e.g. `"4.4 Danh sách liên kết đôi (Giáo trình … - 4.4 … / trang 2, dòng 4 - 5)"`. Unlike
 * `source_excerpt` ("a short **verbatim** quote", measured 69/69 verbatim), nothing forces this
 * field to actually be text from the material — the model is a fabrication risk here exactly
 * where DocumentExcerpt.tsx's own history warns about it ("#227 đã bỏ vì đó là nhãn bịa").
 *
 * `materialText` is the plan's raw text when the material is `.txt` (the only kind the server
 * ever decodes locally — PDF/image go to Gemini's File API by URI, and this codebase has no
 * local PDF/image text extraction). `null` means "cannot verify" — per this rule, unverifiable
 * is not the same as trusted, so it never survives. On the measured live sample this discarded
 * exactly the 13 polluted values and 0 good ones (for the `.txt` cases the measurement covered);
 * PDF/image material now conservatively loses `sectionTitle` entirely until the server can read
 * PDF/image text itself — a real gap, not silently papered over.
 */
function verifiedSectionTitle(
  section: string | null | undefined,
  materialText: string | null
): string | null {
  if (!section || materialText === null) return null;
  return normalizeWhitespace(materialText).includes(normalizeWhitespace(section)) ? section : null;
}

/**
 * Review #425 (Quân) — cheap insurance the reviewer measured as pass 21/21 on live data: keep
 * `context` only when it actually contains `excerpt` (whitespace-normalized). This also enforces
 * the prompt's own unenforced rule ("Null when source_excerpt is null — there is no excerpt to
 * surround") for free, since a `null` excerpt can never be "contained" by anything.
 */
function verifiedContext(
  context: string | null | undefined,
  excerpt: string | null
): string | null {
  if (!context || excerpt === null) return null;
  return normalizeWhitespace(context).includes(normalizeWhitespace(excerpt)) ? context : null;
}

/**
 * Maps extracted concepts to concept_sources rows for one document. A concept is anchored
 * only if it resolved to a created id AND the AI gave at least a page or an excerpt; anything
 * else is skipped (best-effort anchoring). Pure function — no DB, unit-testable. The single
 * `source_page` becomes both pageFrom and pageTo (a one-page span).
 *
 * `sectionTitle`/`context` (#296) ride along whenever the AI gave them and pass their guard —
 * independent of the page/excerpt gate above, since a concept anchored on page alone can still
 * have a section title.
 */
export function buildConceptSourceRows(
  concepts: AiExtractResponse['concepts'],
  conceptIdByName: Map<string, string>,
  documentId: string,
  materialText: string | null
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
        sectionTitle: verifiedSectionTitle(c.source_section, materialText),
        excerpt: c.source_excerpt ?? null,
        context: verifiedContext(c.source_context, c.source_excerpt ?? null),
      },
    ];
  });
}
