import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface User {
  name: string;
  email: string;
  location: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "finsync.user";

function loadUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function persist(user: User | null) {
  if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(STORAGE_KEY);
}

/** Mock auth — accepts any non-empty credentials. Swap for a real API later. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadUser);

  const login = useCallback(async (email: string, _password: string) => {
    await new Promise((r) => setTimeout(r, 500));
    const name = email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const next: User = { name: name || "Danish Z.", email, location: "Karachi, PK" };
    setUser(next);
    persist(next);
  }, []);

  const signup = useCallback(
    async (name: string, email: string, _password: string) => {
      await new Promise((r) => setTimeout(r, 600));
      const next: User = { name, email, location: "Karachi, PK" };
      setUser(next);
      persist(next);
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    persist(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: !!user, login, signup, logout }),
    [user, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
