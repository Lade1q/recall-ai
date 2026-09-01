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

/** Upload-validation codes with a clear, ready-to-show message already set by the server —
 *  shared by plan creation and POST /plans/:id/document (ENCRYPTED_PDF added for Issue #223:
 *  a PDF with an `/Encrypt` dictionary, rejected at upload time before an AnalysisJob exists). */
const UPLOAD_VALIDATION_CODES = new Set([
  'FILE_TOO_LARGE',
  'INVALID_FILE_TYPE',
  'FILE_REQUIRED',
  'ENCRYPTED_PDF',
  // #363. Goes here rather than the allowlist in `error-code-contract.test.ts` to sit with
  // `FILE_REQUIRED`, which plan.controller.ts throws two lines below it in the same guard
  // cluster — splitting a pair that fails together would be arbitrary.
  //
  // Not reachable from the current UI: CreatePlanPage turns pasted text into a `File` and never
  // sends a `content` field at all, so `req.file && input.content` cannot both hold. The server
  // schema is written for a client that *does* post both (see the `content` preprocess in
  // plan.schema.ts, which normalises an untouched textarea's `''` away), so this is the branch
  // that catches such a client rather than dead weight.
  'CONTENT_OR_FILE_CONFLICT',
]);

/** Same shape as getRetryErrorMessage, for POST /plans/:id/document's DOCUMENT_CHANGE_NOT_ALLOWED
 *  and the upload-validation codes it shares with plan creation — those already have clear
 *  messages from the server, so pass them through. */
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
  if (code && UPLOAD_VALIDATION_CODES.has(code)) {
    return error.response.data?.error?.message ?? 'Tài liệu không hợp lệ.';
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

/** Same upload-validation codes as getChangeDocumentErrorMessage, for POST /plans (plan
 *  creation) — CreatePlanPage's catch previously showed a generic toast for every failure,
 *  which hid the server's actual reason (e.g. an encrypted PDF) from the user. */
export function getCreatePlanErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Có lỗi xảy ra khi tạo kế hoạch. Vui lòng thử lại.';
  }
  if (!error.response) {
    return 'Không kết nối được tới máy chủ. Vui lòng thử lại.';
  }
  const code: string | undefined = error.response.data?.error?.code;
  if (code && UPLOAD_VALIDATION_CODES.has(code)) {
    return error.response.data?.error?.message ?? 'Tài liệu không hợp lệ.';
  }
  return 'Có lỗi xảy ra khi tạo kế hoạch. Vui lòng thử lại.';
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
    const plans = response.data.data.plans;

    // Kiểu generic của Axios không kiểm tra payload lúc chạy. Ném ngay tại biên để mọi consumer
    // đi vào đường xử lý lỗi của chính nó, thay vì nhận `undefined` rồi vỡ ở `.length`/spread.
    if (!Array.isArray(plans)) {
      throw new TypeError('Invalid /plans response: data.plans must be an array');
    }

    return plans;
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

  /**
   * GET /plans/:id/documents/:documentId — the original file, for deep C5 verification (#203).
   *
   * Fetched as a blob rather than linked to directly: auth is a Bearer token in a header
   * (`apiClient`), not a cookie, so a bare `<a href target="_blank">` would open a tab that
   * sends no token and gets a 401. Going through `apiClient` also means a request landing on
   * an expired token still hits the refresh-and-retry interceptor.
   */
  getDocumentFile: async (planId: string, documentId: string): Promise<Blob> => {
    const response = await apiClient.get<Blob>(ENDPOINTS.PLANS.DOCUMENT_FILE(planId, documentId), {
      responseType: 'blob',
      // A scanned PDF can be several MB; the 10s default is tuned for JSON, and the upload
      // cap (10MB) is the real bound on how long this can legitimately take.
      timeout: 60000,
    });

    // XHR builds the Blob with only the *essence* of Content-Type — `text/plain; charset=utf-8`
    // arrives as `text/plain`, charset dropped. That loss is invisible until the blob URL is
    // opened as a top-level tab: with no charset and no parent document to inherit one from,
    // the browser falls back to its platform default and renders Vietnamese material as
    // mojibake (measured in Chrome). Rebuilding the Blob from the header restores what the
    // server actually said — verified by reading back what Chrome then serves for the object
    // URL. An `<iframe>` hides this bug, because it inherits the host page's UTF-8.
    const contentType = response.headers['content-type'];
    if (typeof contentType === 'string' && contentType !== response.data.type) {
      return new Blob([response.data], { type: contentType });
    }
    return response.data;
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
