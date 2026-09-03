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
    /**
     * Adds documents to an existing plan (§4). Same path as DOCUMENT_FILE's parent, different
     * verb: POST here *adds* files, while the singular DOCUMENT above *replaces* the one file of
     * a failed draft. Two endpoints one character apart, so the distinction is spelled out at
     * every call site rather than left to the reader.
     */
    ADD_DOCUMENTS: (id: string) => `/api/v1/plans/${id}/documents`,
  },
  INTERVIEWS: {
    BASE: '/api/v1/interviews',
    DETAIL: (id: string) => `/api/v1/interviews/${id}`,
    ANSWERS: (id: string) => `/api/v1/interviews/${id}/answers`,
    PAUSE: (id: string) => `/api/v1/interviews/${id}/pause`,
    RESUME: (id: string) => `/api/v1/interviews/${id}/resume`,
    ABANDON: (id: string) => `/api/v1/interviews/${id}/abandon`,
    SUMMARY: (id: string) => `/api/v1/interviews/${id}/summary`,
    /**
     * AE-10 (#248) — phản hồi về điểm MỘT LƯỢT. Đường dẫn theo lượt, không lồng dưới `:id`:
     * cha của tài nguyên này là lượt, và thêm id phiên vào URL chỉ đẻ thêm một nhánh 404
     * "lượt không thuộc phiên này".
     */
    TURN_FEEDBACK: (turnId: string) => `/api/v1/interviews/turns/${turnId}/feedback`,
  },
  REVIEW_QUEUE: {
    BASE: '/api/v1/review-queue',
    ITEM: (itemId: string) => `/api/v1/review-queue/${itemId}`,
    TODAY: '/api/v1/review-queue/today',
    // Màn Lịch ôn tập (#400). Nằm dưới `review-queue` chứ không phải `/plans/schedule`: planRouter
    // đã có `GET /:id`, nên một `/plans/schedule` chỉ đúng khi được đăng ký TRƯỚC nó — một ràng
    // buộc theo thứ tự dòng, vỡ im lặng khi ai đó sắp lại route.
    SCHEDULE: '/api/v1/review-queue/schedule',
  },
  DASHBOARD: {
    STATS: '/api/v1/dashboard/stats',
  },
  FOCUS_SESSIONS: {
    BASE: '/api/v1/focus-sessions',
    DETAIL: (id: string) => `/api/v1/focus-sessions/${id}`,
    // FS-05 ghi chú nhanh — lồng dưới phiên (#228).
    NOTES: (id: string) => `/api/v1/focus-sessions/${id}/notes`,
    NOTE: (id: string, noteId: string) => `/api/v1/focus-sessions/${id}/notes/${noteId}`,
  },
  USERS: {
    PROFILE: '/api/v1/users/me',
    PASSWORD: '/api/v1/users/me/password',
    POMODORO_CONFIG: '/api/v1/users/me/pomodoro-config',
  },
} as const;
