import { isAxiosError } from 'axios';
import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import {
  Concept,
  ConceptEdge,
  ConceptDetail,
  PlanDetails,
  BackendPlanDetails,
  PlanSummary,
} from '../types/concept';

export interface CreatePlanResponse {
  planId: string;
}

/**
 * Chuyển lỗi retry thành thông báo tiếng Việt. Backend luôn trả cùng một code
 * RETRY_NOT_ALLOWED cho mọi lý do từ chối (job đang chạy, plan không ở trạng
 * thái failed, đã bị cleanup...) nên gộp chung một thông báo yêu cầu tải lại trang
 * thay vì đoán message tiếng Anh của từng trường hợp.
 */
export function getRetryErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
  if (!error.response) {
    return 'Không kết nối được tới máy chủ. Vui lòng thử lại.';
  }
  const code: string | undefined = error.response.data?.error?.code;
  if (code === 'RETRY_NOT_ALLOWED') {
    return 'Không thể thử lại lúc này — kế hoạch có thể đã đổi trạng thái. Vui lòng tải lại trang.';
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

/** Same shape as getRetryErrorMessage, for POST /plans/:id/document's DOCUMENT_CHANGE_NOT_ALLOWED
 *  and the upload-validation codes it shares with plan creation (FILE_REQUIRED, FILE_TOO_LARGE,
 *  INVALID_FILE_TYPE) — those already have clear messages from the server, so pass them through. */
export function getChangeDocumentErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
  if (!error.response) {
    return 'Không kết nối được tới máy chủ. Vui lòng thử lại.';
  }
  const code: string | undefined = error.response.data?.error?.code;
  if (code === 'DOCUMENT_CHANGE_NOT_ALLOWED') {
    return 'Không thể đổi tài liệu lúc này — kế hoạch có thể đã đổi trạng thái. Vui lòng tải lại trang.';
  }
  if (code === 'FILE_TOO_LARGE' || code === 'INVALID_FILE_TYPE' || code === 'FILE_REQUIRED') {
    return error.response.data?.error?.message ?? 'Tài liệu không hợp lệ.';
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

interface BackendCreatePlanResponse {
  success: boolean;
  data: {
    plan: {
      id: string;
    };
    message: string;
  };
}

export const planApi = {
  listPlans: async (): Promise<PlanSummary[]> => {
    const response = await apiClient.get<{ success: boolean; data: { plans: PlanSummary[] } }>(
      ENDPOINTS.PLANS.BASE
    );
    return response.data.data.plans;
  },

  createPlan: async (formData: FormData): Promise<CreatePlanResponse> => {
    const response = await apiClient.post<BackendCreatePlanResponse>(
      ENDPOINTS.PLANS.BASE,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return {
      planId: response.data.data.plan.id,
    };
  },

  getPlan: async (id: string): Promise<PlanDetails> => {
    const response = await apiClient.get<{ success: boolean; data: BackendPlanDetails }>(
      `${ENDPOINTS.PLANS.BASE}/${id}`
    );
    const backendData = response.data.data;

    const mappedConcepts: Concept[] = backendData.concepts.map((c) => ({
      id: c.id,
      name: c.name,
      difficulty: c.difficulty,
      mastery_score: c.masteryScore,
      lastTestedAt: c.lastTestedAt ?? null,
      isRemediating: c.isRemediating ?? false,
      source: c.source,
    }));

    const mappedEdges: ConceptEdge[] = backendData.edges.map((e) => ({
      id: e.id,
      source: e.fromConceptId,
      target: e.toConceptId,
    }));

    return {
      id: backendData.id,
      name: backendData.name,
      deadline: backendData.deadline,
      status: backendData.status,
      analysisStatus: backendData.analysisStatus,
      analysisPhase: backendData.analysisPhase,
      analysisStartedAt: backendData.analysisStartedAt,
      analysisErrorMessage: backendData.analysisErrorMessage,
      document: backendData.document,
      dagAutoFixed: backendData.dagAutoFixed,
      graph: {
        concepts: mappedConcepts,
        edges: mappedEdges,
      },
    };
  },

  updatePlanGraph: async (
    id: string,
    concepts: Concept[],
    edges: ConceptEdge[]
  ): Promise<{ success: boolean; data?: { status: string } }> => {
    // Backend PUT expects concepts: [{name, difficulty}], edges: [{from, to}] referencing by NAME.
    const nameMap = new Map<string, string>();
    concepts.forEach((c) => nameMap.set(c.id, c.name));

    const backendConcepts = concepts.map((c) => {
      const payload: { name: string; difficulty?: number } = { name: c.name };
      if (c.difficulty != null) {
        payload.difficulty = c.difficulty;
      }
      return payload;
    });

    const backendEdges = edges.map((e) => ({
      from: nameMap.get(e.source) || e.source,
      to: nameMap.get(e.target) || e.target,
    }));

    const response = await apiClient.put<{ success: boolean; data?: { status: string } }>(
      `${ENDPOINTS.PLANS.BASE}/${id}/graph`,
      {
        concepts: backendConcepts,
        edges: backendEdges,
        confirm: true,
      }
    );
    return response.data;
  },

  /** GET /plans/:id/concepts/:conceptId — the DB-06 detail panel's data (Issue #168). */
  getConceptDetail: async (planId: string, conceptId: string): Promise<ConceptDetail> => {
    const response = await apiClient.get<{ success: boolean; data: ConceptDetail }>(
      ENDPOINTS.PLANS.CONCEPT(planId, conceptId)
    );
    return response.data.data;
  },

  retryPlan: async (id: string): Promise<void> => {
    await apiClient.post(ENDPOINTS.PLANS.RETRY(id));
  },

  /**
   * "Đổi tài liệu khác" (#187) — for a failed draft where the original file itself was the
   * problem (retryPlan alone reuses that same file and would fail the same way).
   */
  changeDocument: async (id: string, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);
    await apiClient.post(ENDPOINTS.PLANS.DOCUMENT(id), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Archive a plan (SP-04), or pull an archived one back to active. */
  setPlanStatus: async (id: string, status: 'active' | 'archived'): Promise<void> => {
    await apiClient.patch(ENDPOINTS.PLANS.DETAIL(id), { status });
  },

  /**
   * Queue a fresh analysis of an active plan's document (SP-05). Returns as soon as the job
   * is queued — the caller polls the list, same as the create flow.
   */
  reanalyzePlan: async (id: string): Promise<void> => {
    await apiClient.post(ENDPOINTS.PLANS.REANALYZE(id));
  },

  /** Permanent, cascading delete (SP-04). No undo. */
  deletePlan: async (id: string): Promise<void> => {
    await apiClient.delete(ENDPOINTS.PLANS.DETAIL(id));
  },
};
