import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Moon, Sun, Search, Bell, LogOut, User as UserIcon, ChevronDown } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";
import { initials } from "../../lib/format";

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
  const { loading, slow } = useAppData();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
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

        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-56 pl-9"
            placeholder="Search…"
            aria-label="Search"
          />
        </div>

        <button
          className="relative hidden rounded-xl p-2.5 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 sm:block"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500" />
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
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div
            role="progressbar"
            aria-label="Syncing your data"
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
