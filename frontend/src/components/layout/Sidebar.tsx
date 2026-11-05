import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Upload,
  PieChart,
  Sparkles,
  Settings,
  RefreshCw,
  CheckCircle2,
  X,
} from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { cn, formatDateTime } from "../../lib/format";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/categories", label: "Categories", icon: PieChart },
  { to: "/predictions", label: "Predictions", icon: Sparkles },
  { to: "/upload", label: "Import", icon: Upload },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { gmail, gmailSyncing, syncGmail } = useAppData();
  const navigate = useNavigate();
  const connected = gmail?.connected ?? false;
  const syncDates = (gmail?.providers ?? [])
    .map((p) => p.last_sync_at)
    .filter((d): d is string => !!d)
    .sort();
  const lastSync = syncDates[syncDates.length - 1];

  async function quickSync() {
    if (!connected) {
      navigate("/settings");
      onClose();
      return;
    }
    try {
      await syncGmail();
    } catch {
      navigate("/settings");
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-400 text-slate-950 shadow-soft">
              <svg viewBox="0 0 32 32" className="h-5 w-5 fill-current">
                <path d="M9 22V10h11v3h-7.5v2.5H19v3h-6.5V22H9Z" />
                <circle cx="23" cy="20.5" r="2.4" opacity="0.6" />
              </svg>
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                FinSync
              </p>
              <p className="text-[11px] text-slate-400">Personal Finance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="m-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Gmail sync</p>
            {connected && (
              <span className="flex items-center gap-1 text-[11px] text-brand-300">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {connected
              ? lastSync
                ? `Last synced ${formatDateTime(lastSync)}`
                : "Pull ABL & NayaPay alerts newer than your statement."
              : "Auto-import ABL & NayaPay alerts straight from your inbox."}
          </p>
          <button
            onClick={() => void quickSync()}
            disabled={gmailSyncing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/15 py-2 text-xs font-semibold backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", gmailSyncing && "animate-spin")} />
            {gmailSyncing ? "Syncing…" : connected ? "Sync now" : "Connect inbox"}
          </button>
        </div>
      </aside>
    </>
  );
}
