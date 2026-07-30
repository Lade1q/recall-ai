import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ENDPOINTS } from './endpoints';
export interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
}

interface RefreshResponse {
  data: {
    accessToken: string;
    refreshToken?: string;
  };
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

/** Axios instance duy nhất cho toàn bộ app. */
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: tự động đính kèm access token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Hàng chờ xử lý các request bị 401 song song trong lúc đang làm mới Token (Queue Subscriber)
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

// Kiểm tra các endpoint Auth công khai dựa trên Hằng số ENDPOINTS
const isAuthEndpoint = (url?: string): boolean => {
  if (!url) return false;
  const path = url.split('?')[0];
  return [ENDPOINTS.AUTH.LOGIN, ENDPOINTS.AUTH.REGISTER, ENDPOINTS.AUTH.REFRESH].some((ep) =>
    path.endsWith(ep)
  );
};

// Response interceptor: xử lý tự động làm mới token chuẩn Enterprise
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Nếu nhận mã 401 và request không thuộc đường dẫn Auth công khai & chưa từng retry
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      if (isRefreshing) {
        // Đưa các request đồng thời vào hàng chờ
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(apiClient(originalRequest));
            },
            reject: (err: unknown) => {
              reject(err);
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const { data } = await axios.post<RefreshResponse>(`${BASE_URL}${ENDPOINTS.AUTH.REFRESH}`, {
          refreshToken,
        });

        const newAccessToken = data.data.accessToken;
        const newRefreshToken = data.data.refreshToken;

        if (!newAccessToken) {
          throw new Error('No access token returned from refresh endpoint');
        }

        localStorage.setItem('access_token', newAccessToken);
        if (newRefreshToken) {
          localStorage.setItem('refresh_token', newRefreshToken);
        }

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        processQueue(null, newAccessToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
