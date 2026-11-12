import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken, type ApiUser, type TokenResponse } from "../lib/api";

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  /** True when viewing the bundled, backend-free demo account. */
  isDemo: boolean;
  /** True while restoring an existing session on first load. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Enter the public demo instantly (no backend call). */
  loginDemo: () => void;
  signup: (name: string, email: string, password: string) => Promise<void>;
  updateProfile: (input: { name: string; email: string }) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Session-scoped flag so a page refresh keeps the demo open in the same tab. */
const DEMO_KEY = "finsync.demo";

const DEMO_USER: User = {
  id: 0,
  name: "Demo User",
  email: "demo@finsync.app",
  createdAt: "2026-01-01T00:00:00Z",
};

function toUser(u: ApiUser): User {
  return { id: u.id, name: u.full_name, email: u.email, createdAt: u.created_at };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from a persisted token (or demo flag) on first load.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (window.sessionStorage.getItem(DEMO_KEY)) {
        setIsDemo(true);
        setUser(DEMO_USER);
        setInitializing(false);
        return;
      }
      if (!getToken()) {
        setInitializing(false);
        return;
      }
      try {
        const me = await api.get<ApiUser>("/auth/me");
        if (!cancelled) setUser(toUser(me));
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.postForm<TokenResponse>(
      "/auth/login",
      { username: email, password },
      { auth: false }
    );
    setToken(data.access_token);
    setUser(toUser(data.user));
  }, []);

  const loginDemo = useCallback(() => {
    setToken(null);
    window.sessionStorage.setItem(DEMO_KEY, "1");
    setIsDemo(true);
    setUser(DEMO_USER);
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await api.post<TokenResponse>(
        "/auth/register",
        { full_name: name, email, password },
        { auth: false }
      );
      setToken(data.access_token);
      setUser(toUser(data.user));
    },
    []
  );

  const logout = useCallback(() => {
    window.sessionStorage.removeItem(DEMO_KEY);
    setIsDemo(false);
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (input: { name: string; email: string }) => {
      const updated = await api.patch<ApiUser>("/auth/me", {
        full_name: input.name,
        email: input.email,
      });
      setUser(toUser(updated));
    },
    []
  );

  const changePassword = useCallback(
    async (current: string, next: string) => {
      await api.post<void>("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isDemo,
      initializing,
      login,
      loginDemo,
      signup,
      updateProfile,
      changePassword,
      logout,
    }),
    [user, isDemo, initializing, login, loginDemo, signup, updateProfile, changePassword, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
