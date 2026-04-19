import { createContext, useContext, useEffect, useRef, useState } from "react";
import { authService, type MeResponse } from "@/lib/services/authService";
import { ApiError } from "@/lib/api";

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  login: (email: string, password: string, keepSignedIn: boolean) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleRefresh(expiresAt: string) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
    const refreshIn = Math.max(msUntilExpiry - 30_000, 0);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await authService.refresh();
        setUser({ userId: res.userId, username: res.username });
        scheduleRefresh(res.accessTokenExpiresAt);
      } catch {
        setUser(null);
      }
    }, refreshIn);
  }

  useEffect(() => {
    authService
      .me()
      .then((me) => setUser(me))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  async function login(email: string, password: string, keepSignedIn: boolean) {
    const res = await authService.login(email, password, keepSignedIn);
    setUser({ userId: res.userId, username: res.username });
    scheduleRefresh(res.accessTokenExpiresAt);
  }

  async function register(email: string, username: string, password: string) {
    const res = await authService.register(email, username, password);
    setUser({ userId: res.userId, username: res.username });
    scheduleRefresh(res.accessTokenExpiresAt);
  }

  async function logout() {
    try {
      await authService.logout();
    } catch {
      // always clear client state even if server call fails
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
