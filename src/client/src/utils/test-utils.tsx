import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext';
import type { User } from '@/features/auth/api/auth.api';

interface ExtraRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /**
   * Người dùng cho `AuthContext`. Cung cấp value TRỰC TIẾP (không dùng `AuthProvider` thật) để
   * tránh lời gọi `GET /auth/me` lúc mount — test không có backend. `undefined` ⇒ chưa đăng nhập.
   */
  authUser?: User | null;
}

const makeProviders =
  (authUser: User | null) =>
  ({ children }: { children: React.ReactNode }) => {
    const authValue: AuthContextValue = {
      user: authUser,
      isAuthenticated: authUser !== null,
      isLoading: false,
      login: async () => {},
      logout: () => {},
      register: async () => {},
    };
    return (
      <AuthContext.Provider value={authValue}>
        <BrowserRouter>
          <ReactFlowProvider>{children}</ReactFlowProvider>
        </BrowserRouter>
      </AuthContext.Provider>
    );
  };

const customRender = (ui: ReactElement, { authUser = null, ...options }: ExtraRenderOptions = {}) =>
  render(ui, { wrapper: makeProviders(authUser), ...options });

export * from '@testing-library/react';
export { customRender as render };
