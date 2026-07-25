import { StudyPlanStatus, ConceptSource, ConceptStatus, AnalysisJobStatus } from '@prisma/client';

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
