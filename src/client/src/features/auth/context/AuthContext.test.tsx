import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { registerApi } from '../api/auth.api';
import type { AuthResponse } from '../api/auth.api';

vi.mock('../api/auth.api', () => ({
  registerApi: vi.fn(),
  loginApi: vi.fn(),
}));

const api = vi.mocked(registerApi);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function authResponse(over: Partial<AuthResponse['data']> = {}): AuthResponse {
  return {
    data: {
      user: {
        id: 'u1',
        email: 'new@example.com',
        name: 'New User',
        createdAt: '2026-08-16T00:00:00Z',
      },
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      ...over,
    },
  };
}

/**
 * #390. `register()` gọi `registerApi` rồi vứt response — trong khi server trả cùng cặp
 * token như login. Test này ghim đúng hành vi bị thiếu: register phải lưu token và set user
 * giống hệt login, để component gọi nó (SignupForm) không cần tự redirect về `/login`.
 */
describe('AuthContext register', () => {
  it('stores the token pair and the user the server returns, same as login', async () => {
    const response = authResponse();
    api.mockResolvedValue(response);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.register('new@example.com', 'password123', 'New User');
    });

    expect(localStorage.getItem('access_token')).toBe('access-123');
    expect(localStorage.getItem('refresh_token')).toBe('refresh-456');
    expect(result.current.user).toEqual(response.data.user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('does not touch localStorage or user state when register fails', async () => {
    api.mockRejectedValue(new Error('EMAIL_CONFLICT'));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await expect(
        result.current.register('taken@example.com', 'password123', 'New User')
      ).rejects.toThrow();
    });

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
