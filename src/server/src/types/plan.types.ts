import {
  StudyPlanStatus,
  ConceptSource,
  ConceptStatus,
  AnalysisJobStatus,
  AnalysisJobPhase,
  DocumentKind,
  ReviewReason,
} from '@prisma/client';
import { MasteryDistribution } from '../utils/mastery';

/** Metadata for the source document persisted alongside a new plan (SP-01, FS-04). */
export interface DocumentMeta {
  filename: string;
  fileKey: string;
  kind: DocumentKind;
  pageCount: number | null;
  byteSize: number | null;
}

/**
 * The source document a plan card names while its analysis is still running (SP-03).
 * `kind` lets the SP-06 progress panel (Issue #186) know a `text` document never goes
 * through the "gửi tài liệu tới AI Service" upload step — it is inlined into the extract
 * call instead — so that phase should not be shown as done for one.
 */
export interface PlanDocumentSummary {
  filename: string;
  pageCount: number | null;
  kind: DocumentKind;
}

/**
 * One document of a plan, as a node of the topic layer.
 *
 * ONE FILE = ONE TOPIC, so this is the topic layer's node type — there is no `Topic` row to
 * carry an id of its own. `id` is what `?topic=<uuid>` in the URL names, and what
 * `Concept.primaryDocumentId` points at.
 *
 * There is no display name here on purpose: the label is derived from `filename` on the client
 * (`topicLabel`). `Document.filename` must stay byte-for-byte what the student uploaded, because
 * an `UPDATE` on `documents` bumps `updatedAt`, which is the marker C5 citations use to tell "the
 * file was swapped after this quote was taken".
 */
export interface PlanDocumentItemResponse {
  id: string;
  filename: string;
  pageCount: number | null;
  kind: DocumentKind;
}

/**
 * One edge of the topic layer: "study `fromDocumentId` before `toDocumentId`".
 *
 * Every row is inferred by the phase-2 linking call from concept descriptions, never read off a
 * page — phase 1 only ever sees one file, so it cannot produce one of these. That is why there is
 * no `source` field: the property belongs to the whole collection, and the client draws ALL of
 * these dashed and asks the student to check them.
 */
export interface DocumentEdgeItemResponse {
  id: string;
  fromDocumentId: string;
  toDocumentId: string;
}

export interface PlanItemResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  conceptCount: number;
  /** Concepts per mastery band, for the distribution bar. Sums to `conceptCount`. */
  masteryDistribution: MasteryDistribution;
  /**
   * "Hàng đợi ôn · N khái niệm" at the foot of a plan card (#232 → #225): how many concepts of
   * this plan are still on the review schedule. `0` for a plan that has never been interviewed,
   * never `null` — "no concepts waiting" is a fact, not a missing value.
   *
   * Concepts, not rows. The queue itself returns one item per concept (#232), so counting rows
   * would print a bigger number than the screen the link leads to can show: one plan on the dev
   * database holds 8 rows over 3 concepts. Same filter as the queue — see `OFF_SCHEDULE_STATUSES`.
   */
  reviewQueueConceptCount: number;
  /** Latest AnalysisJob's status, or `null` when the plan has never had one. */
  analysisStatus: AnalysisJobStatus | null;
  /** When that job was queued — the client turns it into an elapsed timer. */
  analysisStartedAt: Date | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage: string | null;
  /** The FIRST document of the plan — the card names one file even when the plan holds several. */
  document: PlanDocumentSummary | null;
  /** How many documents the plan holds, so the card can say "+2 tệp khác" rather than lie by
   *  omission. `0` for the (broken, but existing) case of a plan with no document row. */
  documentCount: number;
  createdAt: Date;
}

export interface CreatePlanResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: string;
}

export interface ConceptItemResponse {
  id: string;
  name: string;
  difficulty: number | null;
  masteryScore: number | null;
  /** Last time an interview graded this concept — DB-06's `last_tested_at` (Issue #168). */
  lastTestedAt: Date | null;
  source: ConceptSource;
  status: ConceptStatus;
  createdAt: Date;
}

/**
 * A concept as the DB-05 toolbar and the graph canvas need it (Issue #168).
 *
 * `isRemediating` is a second, orthogonal channel next to the four mastery bands, not a
 * fifth band: the bands are mutually exclusive, "đang ôn lại" layers over any of them. A
 * concept at 0.51 that the AE-07 traceback queued is weak AND being reviewed, and the
 * canvas has to be able to say both at once.
 */
export interface GraphConceptItemResponse extends ConceptItemResponse {
  isRemediating: boolean;
  /**
   * Which document (= topic) this concept is filed under, or `null` for one that belongs to
   * none — a concept the student added by hand at the verification step, or one extracted while
   * the plan had no document row. The client groups those under "Chưa xếp chủ đề" rather than
   * hiding them.
   */
  primaryDocumentId: string | null;
}

export interface EdgeItemResponse {
  id: string;
  fromConceptId: string;
  toConceptId: string;
}

export interface PlanGraphResponse {
  id: string;
  status: StudyPlanStatus;
  dagAutoFixed: boolean;
  concepts: ConceptItemResponse[];
  edges: EdgeItemResponse[];
}

export interface PlanDetailResponse {
  id: string;
  userId: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  analysisStatus: AnalysisJobStatus | null;
  /** Sub-step of a `processing` job — null outside that state (Issue #186). */
  analysisPhase: AnalysisJobPhase | null;
  /**
   * Progress of the extraction phase, so the panel can say "đã đọc 2/3 tệp" instead of showing
   * a blind bar while several documents are read in parallel.
   *
   * `null` for a job that ran before these columns existed. The client must read that as "not
   * known" and fall back to the phase-only bar — NOT as zero, which would render "đã đọc 0/0".
   */
  analysisDocumentsTotal: number | null;
  analysisDocumentsDone: number | null;
  /** When the latest job was queued — the client turns it into an elapsed timer (Issue #186). */
  analysisStartedAt: Date | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage: string | null;
  /** The first document, kept for the SP-06 progress panel that names a single file. */
  document: PlanDocumentSummary | null;
  /** Every document of the plan, oldest first — the nodes of the topic layer. */
  documents: PlanDocumentItemResponse[];
  /** Study order between those documents. Empty is a legitimate answer ("order unknown"), and
   *  the client must still draw the topics, just without arrows. */
  documentEdges: DocumentEdgeItemResponse[];
  dagAutoFixed: boolean;
  tracebackEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  concepts: GraphConceptItemResponse[];
  edges: EdgeItemResponse[];
}

/**
 * One passage of the source document a concept was extracted from — `concept_sources`
 * joined to its `Document` (Issue #168, DB-06 "Trích từ tài liệu").
 *
 * This is where constraint C5 ("AI không bịa") becomes something a student can check: the
 * panel shows the excerpt that produced the concept, next to the file and page it lives on.
 * Every field but `documentId`/`filename` is best-effort — the AI supplies page and excerpt,
 * and `buildConceptSourceRows` anchors on whichever of the two it got.
 *
 * `sectionTitle`/`context` (#296): `null` on every row anchored before this field existed — the
 * client must fall back to the pre-#296 rendering (#227) rather than show an empty heading.
 */
export interface ConceptSourceItemResponse {
  documentId: string;
  filename: string;
  kind: DocumentKind;
  pageFrom: number | null;
  pageTo: number | null;
  sectionTitle: string | null;
  excerpt: string | null;
  context: string | null;
}

/** Latest source document of the plan, even when this concept has no anchored passage (#378). */
export interface ConceptDocumentItemResponse {
  documentId: string;
  filename: string;
  kind: DocumentKind;
}

/** One row of the DB-06 "Lịch sử học tập" list — see `utils/concept-history.ts`. */
export interface ConceptHistoryItemResponse {
  kind: 'interview' | 'focus';
  id: string;
  at: Date;
  score: number | null;
  turnCount: number | null;
  durationMinutes: number | null;
}

/**
 * Response shape for GET /plans/:id/concepts/:conceptId (Issue #168) — the DB-06 panel.
 *
 * Deliberately excludes prerequisites and dependents: the client already holds the whole
 * graph from GET /plans/:id, so computing upstream/downstream there keeps names and scores
 * in sync with the canvas instead of shipping a second, separately-aged copy of them.
 *
 * Read-only. The panel's "Học lại" / "Kiểm tra ngay" buttons navigate to FS-01 / AE-01;
 * neither this endpoint nor the panel mutates anything.
 */
export interface ConceptDetailResponse {
  id: string;
  name: string;
  difficulty: number | null;
  masteryScore: number | null;
  lastTestedAt: Date | null;
  isRemediating: boolean;
  /** Why it sits in the review queue — `traceback` is the AE-07 path the panel names. */
  remediationReason: ReviewReason | null;
  /** Lets focus mode open the original file when `sources` is empty (#378). */
  document: ConceptDocumentItemResponse | null;
  sources: ConceptSourceItemResponse[];
  history: ConceptHistoryItemResponse[];
}

/** Response shape for PATCH /plans/:id (SP-04, Issue #171). */
export interface UpdatePlanStatusResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  updatedAt: Date;
}

/** Response shape for POST /plans/:id/retry (Issue #106). */
export interface RetryPlanResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  analysisStatus: AnalysisJobStatus;
}

/**
 * Response shape for POST /plans/:id/reanalyze (SP-05, Issue #170).
 *
 * Same fields as a retry, but the two are not interchangeable: `status` here stays `active`
 * because the existing graph remains usable while the new job runs, whereas a retry is by
 * definition a plan still stuck in `draft`.
 */
export interface ReanalyzePlanResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  analysisStatus: AnalysisJobStatus;
}

/**
 * Response shape for POST /plans/:id/document (Issue #187).
 *
 * Distinct from retry (#106): retry reuses the failed job's fileKey, this replaces it —
 * for the "Đổi tài liệu khác" alt flow, where the original file itself was the problem.
 */
export interface ChangeDocumentResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  analysisStatus: AnalysisJobStatus;
}

/**
 * Response shape for POST /plans/:id/documents (§4 — thêm tài liệu).
 *
 * Same envelope as reanalyze: the plan drops back to `draft` and a job is pending, so the
 * client polls the very same progress endpoint. `mode` is echoed back because the two modes
 * behave visibly differently at the end (append never deprecates), and a client that has to
 * explain "vì sao khái niệm cũ vẫn còn" needs to know which one actually ran.
 */
export interface AddPlanDocumentsResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  analysisStatus: AnalysisJobStatus;
  mode: 'full' | 'append';
  documentCount: number;
}
