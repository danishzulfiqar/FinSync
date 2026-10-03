import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  Moon,
  Sun,
  Search,
  RefreshCw,
  Eye,
  EyeOff,
  LogOut,
  User as UserIcon,
  Settings as SettingsIcon,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";
import { cn, initials } from "../../lib/format";

export function Topbar({
  title,
  subtitle,
  onMenu,
}: {
  title: string;
  subtitle?: string;
  onMenu: () => void;
}) {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const { loading, slow, settings, updateSettings, gmail, gmailSyncing, syncGmail } =
    useAppData();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/transactions?q=${encodeURIComponent(q)}` : "/transactions");
    setQuery("");
  }

  async function quickSync() {
    if (!gmail?.connected) {
      navigate("/settings");
      return;
    }
    try {
      await syncGmail({ maxResults: 200 });
    } catch {
      navigate("/settings");
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="relative flex h-16 items-center gap-2 px-4 sm:gap-3 lg:px-8">
        <button
          onClick={onMenu}
          className="-ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-slate-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          )}
        </div>

        <form onSubmit={submitSearch} className="relative hidden md:block" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input w-56 pl-9"
            placeholder="Search transactions…"
            aria-label="Search transactions"
          />
        </form>

        <button
          onClick={() => void quickSync()}
          disabled={gmailSyncing}
          className={cn(
            "relative hidden rounded-xl p-2.5 text-slate-500 hover:bg-slate-200/60 disabled:opacity-60 dark:hover:bg-slate-800 sm:block",
            gmailSyncing && "text-brand-600 dark:text-brand-400"
          )}
          aria-label={gmail?.connected ? "Sync Gmail now" : "Set up Gmail sync"}
          title={gmail?.connected ? "Sync Gmail now" : "Set up Gmail sync"}
        >
          <RefreshCw className={cn("h-5 w-5", gmailSyncing && "animate-spin")} />
          {gmail && !gmail.connected && (
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </button>

        <button
          onClick={() => void updateSettings({ privacyMode: !settings.privacyMode }).catch(() => undefined)}
          className={cn(
            "rounded-xl p-2.5 hover:bg-slate-200/60 dark:hover:bg-slate-800",
            settings.privacyMode ? "text-brand-600 dark:text-brand-400" : "text-slate-500"
          )}
          aria-label={settings.privacyMode ? "Show amounts" : "Hide amounts"}
          aria-pressed={settings.privacyMode}
          title={settings.privacyMode ? "Show amounts" : "Hide amounts"}
        >
          {settings.privacyMode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>

        <button
          onClick={toggle}
          className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        <div ref={menuRef} className="relative ml-1">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition hover:bg-slate-200/60 dark:hover:bg-slate-800"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">
                {user?.name ?? "Guest"}
              </p>
              <p className="text-[11px] text-slate-400">
                {user?.email ?? "Not signed in"}
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              {user ? initials(user.name) : "?"}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {user?.name}
                </p>
                <p className="truncate text-xs text-slate-400">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/profile");
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <UserIcon className="h-4 w-4 text-slate-400" />
                Profile
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings");
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <SettingsIcon className="h-4 w-4 text-slate-400" />
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>

        {(loading || gmailSyncing) && (
          <div
            role="progressbar"
            aria-label={gmailSyncing ? "Syncing your inbox" : "Syncing your data"}
            className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-brand-100 dark:bg-brand-500/20"
          >
            <div className="h-full w-1/4 animate-progress rounded-full bg-brand-600" />
          </div>
        )}
      </div>

      {slow && (
        <div className="flex items-center justify-center gap-2 border-t border-brand-100 bg-brand-50 px-4 py-1.5 text-center text-xs text-brand-800 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-200">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          Waking up the server — the first load can take up to a minute.
        </div>
      )}
    </header>
  );
}
