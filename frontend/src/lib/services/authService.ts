import { api } from "@/lib/api";

export interface AuthResponse {
  userId: number;
  username: string;
  accessTokenExpiresAt: string;
}

export interface MeResponse {
  userId: number;
  username: string;
}

export interface SessionItem {
  id: number;
  browserInfo: string;
  ip: string;
  createdAt: string;
  current: boolean;
}

export const authService = {
  register: (email: string, username: string, password: string) =>
    api.post<AuthResponse>("/api/auth/register", { email, username, password }),

  login: (email: string, password: string, keepSignedIn: boolean) =>
    api.post<AuthResponse>("/api/auth/login", { email, password, keepSignedIn }),

  logout: () => api.post<void>("/api/auth/logout"),

  refresh: () => api.post<AuthResponse>("/api/auth/refresh"),

  me: () => api.get<MeResponse>("/api/auth/me"),

  forgotPassword: (email: string) =>
    api.post<void>("/api/auth/forgot-password", { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<void>("/api/auth/reset-password", { token, newPassword }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<void>("/api/auth/change-password", { currentPassword, newPassword }),

  getSessions: () => api.get<SessionItem[]>("/api/auth/sessions"),

  revokeSession: (sessionId: number) =>
    api.delete<void>(`/api/auth/sessions/${sessionId}`),

  deleteAccount: () => api.delete<void>("/api/users/me"),
};
