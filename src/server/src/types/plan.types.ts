import {
  StudyPlanStatus,
  ConceptSource,
  ConceptStatus,
  AnalysisJobStatus,
  AnalysisJobPhase,
  DocumentKind,
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

export interface PlanItemResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  conceptCount: number;
  /** Concepts per mastery band, for the distribution bar. Sums to `conceptCount`. */
  masteryDistribution: MasteryDistribution;
  /** Latest AnalysisJob's status, or `null` when the plan has never had one. */
  analysisStatus: AnalysisJobStatus | null;
  /** When that job was queued — the client turns it into an elapsed timer. */
  analysisStartedAt: Date | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage: string | null;
  document: PlanDocumentSummary | null;
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
  source: ConceptSource;
  status: ConceptStatus;
  createdAt: Date;
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
  /** When the latest job was queued — the client turns it into an elapsed timer (Issue #186). */
  analysisStartedAt: Date | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage: string | null;
  document: PlanDocumentSummary | null;
  dagAutoFixed: boolean;
  tracebackEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  concepts: ConceptItemResponse[];
  edges: EdgeItemResponse[];
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
