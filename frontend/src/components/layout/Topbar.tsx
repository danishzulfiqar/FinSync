import { Menu, Moon, Sun, Search, Bell } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

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

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-slate-50/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 lg:px-8">
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 lg:hidden"
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
        className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
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

      <div className="ml-1 flex items-center gap-2.5">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">
            Danish Z.
          </p>
          <p className="text-[11px] text-slate-400">Karachi, PK</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
          DZ
        </span>
      </div>
    </header>
  );
}
