export interface Concept {
  id: string;
  name: string;
  description?: string;
  mastery_score: number | null; // null means untested
  difficulty?: number | null;
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
}

// Backend Response Types
export interface BackendConcept {
  id: string;
  name: string;
  difficulty: number | null;
  masteryScore: number | null;
}

export interface BackendEdge {
  id: string;
  fromConceptId: string;
  toConceptId: string;
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
