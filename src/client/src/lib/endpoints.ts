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
  },
} as const;
