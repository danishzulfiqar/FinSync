import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useDelayedFlag } from "../lib/hooks";

type Mode = "login" | "signup";

export function Login() {
  const { login, signup } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const from = location.state?.from ?? "/";

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slow = useDelayedFlag(busy, 4000);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await signup(name.trim(), email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="bg-grid relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-400 text-slate-950">
            <svg viewBox="0 0 32 32" className="h-5 w-5 fill-current">
              <path d="M9 22V10h11v3h-7.5v2.5H19v3h-6.5V22H9Z" />
              <circle cx="23" cy="20.5" r="2.4" opacity="0.6" />
            </svg>
          </span>
          <span className="text-lg font-bold">FinSync</span>
        </div>

        <div className="my-auto max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            All your money, finally in{" "}
            <span className="text-brand-400">one clear view</span>.
          </h1>
          <p className="mt-4 text-slate-400">
            Track Allied Bank, HBL and NayaPay together — auto-imported from your
            inbox and statements, beautifully organized.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              { icon: Wallet, text: "Unified balances across every account" },
              { icon: TrendingUp, text: "Spending insights & budget tracking" },
              { icon: ShieldCheck, text: "Read-only, private by design" },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-400/20 bg-brand-400/10 text-brand-300">
                  <f.icon className="h-4 w-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} FinSync · Karachi, Pakistan
        </p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-brand-400/15 blur-3xl" />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-400 text-slate-950">
                <svg viewBox="0 0 32 32" className="h-5 w-5 fill-current">
                  <path d="M9 22V10h11v3h-7.5v2.5H19v3h-6.5V22H9Z" />
                </svg>
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                FinSync
              </span>
            </div>
            <button
              onClick={toggle}
              className="ml-auto rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {theme === "dark" ? "Light" : "Dark"} mode
            </button>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "login"
              ? "Sign in to your FinSync dashboard."
              : "Start tracking your finances in minutes."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <Field
                icon={UserIcon}
                label="Full name"
                value={name}
                onChange={setName}
                placeholder="Jane Doe"
                type="text"
                autoComplete="name"
              />
            )}
            <Field
              icon={Mail}
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-9 pr-10"
                  placeholder="••••••••"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {mode === "login" && (
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-slate-500">
                  <input type="checkbox" defaultChecked className="rounded border-slate-300" />
                  Remember me
                </label>
                <button
                  type="button"
                  className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
            {slow && (
              <p className="animate-fade-in text-center text-xs text-slate-400">
                Waking up the server — this can take up to a minute on first use.
              </p>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? "New to FinSync?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
              className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>

          <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-center text-[11px] text-slate-400 dark:bg-slate-800/60">
            New here? Create an account — it’s stored securely by the FinSync API.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type,
  autoComplete,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-500">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input pl-9"
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
      </div>
    </div>
  );
}
