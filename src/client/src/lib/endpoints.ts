/**
 * API endpoint constants.
 * Mỗi khi backend thay đổi URL, chỉ cần sửa ở đây.
 * KHONG hardcode URL string trong component.
 */
export const ENDPOINTS = {
  AUTH: {
    REGISTER: '/api/v1/auth/register',
    LOGIN: '/api/v1/auth/login',
    REFRESH: '/api/v1/auth/refresh',
    ME: '/api/v1/auth/me',
  },
  PLANS: {
    BASE: '/api/v1/plans',
    DETAIL: (id: string) => `/api/v1/plans/${id}`,
    RETRY: (id: string) => `/api/v1/plans/${id}/retry`,
    DOCUMENT: (id: string) => `/api/v1/plans/${id}/document`,
    REANALYZE: (id: string) => `/api/v1/plans/${id}/reanalyze`,
    CONCEPT: (planId: string, conceptId: string) => `/api/v1/plans/${planId}/concepts/${conceptId}`,
    /** Reads one stored document back (#203) — plural, unlike DOCUMENT above which replaces it. */
    DOCUMENT_FILE: (planId: string, documentId: string) =>
      `/api/v1/plans/${planId}/documents/${documentId}`,
  },
  INTERVIEWS: {
    BASE: '/api/v1/interviews',
    DETAIL: (id: string) => `/api/v1/interviews/${id}`,
    ANSWERS: (id: string) => `/api/v1/interviews/${id}/answers`,
    PAUSE: (id: string) => `/api/v1/interviews/${id}/pause`,
    RESUME: (id: string) => `/api/v1/interviews/${id}/resume`,
    ABANDON: (id: string) => `/api/v1/interviews/${id}/abandon`,
  },
  REVIEW_QUEUE: {
    BASE: '/api/v1/review-queue',
    ITEM: (itemId: string) => `/api/v1/review-queue/${itemId}`,
    TODAY: '/api/v1/review-queue/today',
  },
  FOCUS_SESSIONS: {
    BASE: '/api/v1/focus-sessions',
    DETAIL: (id: string) => `/api/v1/focus-sessions/${id}`,
    // FS-05 ghi chú nhanh — lồng dưới phiên (#228).
    NOTES: (id: string) => `/api/v1/focus-sessions/${id}/notes`,
    NOTE: (id: string, noteId: string) => `/api/v1/focus-sessions/${id}/notes/${noteId}`,
  },
  USERS: {
    POMODORO_CONFIG: '/api/v1/users/me/pomodoro-config',
  },
} as const;
