export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  /** ISO 8601. The client shows this as the account's join date. */
  createdAt: string;
}

export interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}
