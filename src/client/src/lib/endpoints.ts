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
  },
} as const;
