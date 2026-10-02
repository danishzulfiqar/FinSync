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
  /** True while restoring an existing session on first load. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  updateProfile: (input: { name: string; email: string }) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toUser(u: ApiUser): User {
  return { id: u.id, name: u.full_name, email: u.email, createdAt: u.created_at };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from a persisted token on first load.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
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
      initializing,
      login,
      signup,
      updateProfile,
      changePassword,
      logout,
    }),
    [user, initializing, login, signup, updateProfile, changePassword, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
