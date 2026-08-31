/**
 * Provenance của một khái niệm (enum `ConceptSource` phía server). Quan trọng với microcopy:
 * `difficulty` của khái niệm `manual` là giá trị mặc định server đặt (1), không phải ước lượng
 * của ai cả — nên không được gắn nhãn "AI ước lượng" cho nó.
 */
export type ConceptSource = 'ai_generated' | 'manual' | 'imported';

export interface Concept {
  id: string;
  name: string;
  mastery_score: number | null; // null means untested
  difficulty?: number | null;
  source?: ConceptSource;
  /** Last time an interview graded this concept — DB-06's `last_tested_at` (Issue #168). */
  lastTestedAt?: string | null;
  /** Second, orthogonal channel next to mastery band: pending in the AE-07 review queue. */
  isRemediating?: boolean;
}

export interface ConceptEdge {
  id: string;
  source: string; // ID of the prerequisite concept
  target: string; // ID of the target concept
}

export interface PlanGraph {
  concepts: Concept[];
  edges: ConceptEdge[];
}

/**
 * The three values of the backend's `StudyPlanStatus` enum — no more, no less.
 * (There is no `completed`: a plan the user is done with is `archived`, SP-04.)
 */
export type PlanStatus = 'draft' | 'active' | 'archived';

export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'failed';

/** Sub-step of a `processing` AnalysisJob (Issue #186, SP-06 mockup's 4-phase progress). */
export type AnalysisPhase = 'sending_to_ai' | 'extracting' | 'validating';

/**
 * `kind` matters to the SP-06 progress panel: a `text` document is inlined into the extract
 * call, so it never goes through a "gửi tài liệu tới AI Service" upload step — the panel
 * must not show that phase as done for one (Issue #186).
 */
export interface PlanDocumentSummary {
  filename: string;
  pageCount: number | null;
  kind: 'pdf' | 'image' | 'text';
}

export interface PlanDetails {
  id: string;
  name: string;
  deadline?: string;
  status: PlanStatus;
  analysisStatus?: AnalysisStatus | null;
  analysisPhase?: AnalysisPhase | null;
  analysisStartedAt?: string | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage?: string | null;
  document?: PlanDocumentSummary | null;
  dagAutoFixed?: boolean;
  graph: PlanGraph;
}

/** Concepts per mastery band. Sums to `conceptCount`; `untested` is never folded into `weak`. */
export interface MasteryDistribution {
  strong: number;
  learning: number;
  weak: number;
  untested: number;
}

/** One row of `GET /plans` — everything a plan card on SP-03 draws, with no follow-up call. */
export interface PlanSummary {
  id: string;
  name: string;
  deadline: string | null;
  status: PlanStatus;
  conceptCount: number;
  masteryDistribution: MasteryDistribution;
  analysisStatus: AnalysisStatus | null;
  analysisStartedAt: string | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage: string | null;
  document: PlanDocumentSummary | null;
  createdAt: string;
  /** Số KHÁI NIỆM distinct đang chờ ôn của plan (#232 phần 2, đếm theo `conceptId` — KHÔNG phải
   *  số dòng `ReviewQueueItem`) — chân thẻ SP-03 dùng, khác `conceptCount`. */
  reviewQueueConceptCount: number;
}

// Backend Response Types
export interface BackendConcept {
  id: string;
  name: string;
  difficulty: number | null;
  masteryScore: number | null;
  lastTestedAt?: string | null;
  isRemediating?: boolean;
  source?: ConceptSource;
}

export interface BackendEdge {
  id: string;
  fromConceptId: string;
  toConceptId: string;
}

/** One passage of the source document a concept was extracted from (DB-06 "Trích từ tài liệu"). */
export interface ConceptSourceExcerpt {
  documentId: string;
  filename: string;
  kind: 'pdf' | 'image' | 'text';
  pageFrom: number | null;
  pageTo: number | null;
  excerpt: string | null;
}

/** Latest plan document, available even when a concept has no source anchor (#378). */
export interface ConceptDocumentSummary {
  documentId: string;
  filename: string;
  kind: 'pdf' | 'image' | 'text';
}

/** One row of the DB-06 "Lịch sử học tập" list. */
export interface ConceptHistoryEntry {
  kind: 'interview' | 'focus';
  id: string;
  at: string;
  score: number | null;
  turnCount: number | null;
  durationMinutes: number | null;
}

export type RemediationReason = 'traceback' | 'spaced_repetition' | 'deadline_priority' | 'manual';

/** GET /plans/:id/concepts/:conceptId response — the DB-06 panel's data (Issue #168). */
export interface ConceptDetail {
  id: string;
  name: string;
  difficulty: number | null;
  masteryScore: number | null;
  lastTestedAt: string | null;
  isRemediating: boolean;
  remediationReason: RemediationReason | null;
  document: ConceptDocumentSummary | null;
  sources: ConceptSourceExcerpt[];
  history: ConceptHistoryEntry[];
}

export interface BackendPlanDetails {
  id: string;
  userId: string;
  name: string;
  deadline: string;
  status: PlanStatus;
  analysisStatus: AnalysisStatus | null;
  analysisPhase: AnalysisPhase | null;
  analysisStartedAt: string | null;
  analysisErrorMessage: string | null;
  document: PlanDocumentSummary | null;
  dagAutoFixed: boolean;
  concepts: BackendConcept[];
  edges: BackendEdge[];
}
