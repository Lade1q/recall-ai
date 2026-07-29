import {
  StudyPlanStatus,
  ConceptSource,
  ConceptStatus,
  AnalysisJobStatus,
  DocumentKind,
} from '@prisma/client';

/** Metadata for the source document persisted alongside a new plan (SP-01, FS-04). */
export interface DocumentMeta {
  filename: string;
  fileKey: string;
  kind: DocumentKind;
  pageCount: number | null;
  byteSize: number | null;
}

export interface PlanItemResponse {
  id: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
  conceptCount: number;
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
  dagAutoFixed: boolean;
  tracebackEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  concepts: ConceptItemResponse[];
  edges: EdgeItemResponse[];
}
