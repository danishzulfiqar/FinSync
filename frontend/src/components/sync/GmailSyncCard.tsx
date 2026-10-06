import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  Eye,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { ApiError, type GmailSyncResponse } from "../../lib/api";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "../../lib/format";
import { PROVIDERS, type Provider } from "../../types";
import { Card, CardHeader } from "../ui/Card";

/**
 * Gmail inbox sync: shows connection + per-provider checkpoint state and lets
 * the user preview (dry run) or commit a sync. Each sync only fetches alerts
 * newer than the latest transaction already on record for that provider, so
 * balances move forward from the last statement without double counting.
 */
export function GmailSyncCard({ compact = false }: { compact?: boolean }) {
  const { gmail, gmailSyncing, syncGmail, refreshGmailStatus, connectGmail } =
    useAppData();
  const [result, setResult] = useState<GmailSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "sync" | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connected = gmail?.connected ?? false;
  const providers = (gmail?.providers ?? []).filter((p) => p.configured);

  // Handle the return from Google's consent screen (?gmail=connected|error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("gmail");
    if (!outcome) return;
    if (outcome === "connected") void refreshGmailStatus();
    else if (outcome === "error") {
      const reason = params.get("reason");
      setError(
        reason
          ? `Gmail authorization failed (${reason}). Please try again.`
          : "Gmail authorization was cancelled or failed. Please try again."
      );
    }
    params.delete("gmail");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "")
    );
  }, [refreshGmailStatus]);

  async function startConnect() {
    setError(null);
    setConnecting(true);
    try {
      await connectGmail();
    } catch (err) {
      setConnecting(false);
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start Gmail authorization."
      );
    }
  }

  async function run(dryRun: boolean) {
    setError(null);
    setResult(null);
    setMode(dryRun ? "preview" : "sync");
    try {
      // Preview is a quick sample; a real sync scans every match so nothing is dropped.
      setResult(await syncGmail(dryRun ? { dryRun, maxResults: 50 } : { dryRun }));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reach the inbox."
      );
    } finally {
      setMode(null);
    }
  }

  return (
    <Card className={cn(compact && "p-4")}>
      <CardHeader
        title="Gmail sync"
        subtitle="Pull ABL & NayaPay alerts that arrived after your last statement"
        action={
          <StatusPill
            connected={connected}
            loading={gmail === null}
            onRefresh={() => void refreshGmailStatus()}
          />
        }
      />

      {gmail && !connected && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Inbox not connected</p>
            <p className="mt-0.5 text-xs opacity-80">
              Connect your Google account to grant read-only access to the bank
              alert emails. You&apos;ll be redirected to Google to approve.
            </p>
          </div>
        </div>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {gmail === null &&
          Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 py-3">
              <span className="h-9 w-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              <span className="h-4 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </li>
          ))}
        {providers.map((p) => {
          const meta = PROVIDERS[p.key as Provider];
          return (
            <li key={p.key} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: meta?.color ?? "#64748b" }}
                >
                  {(meta?.label ?? p.label).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {meta?.label ?? p.label}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {p.latest_transaction_at
                      ? `Records through ${formatDate(p.latest_transaction_at)}`
                      : "No records yet — will fetch the whole inbox"}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-right text-xs text-slate-400">
                {p.last_sync_at ? (
                  <>
                    <span className="block text-slate-500 dark:text-slate-300">Last sync</span>
                    {formatDateTime(p.last_sync_at)}
                  </>
                ) : (
                  "Never synced"
                )}
              </p>
            </li>
          );
        })}
        {gmail && providers.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-400">
            No providers configured for email sync.
          </li>
        )}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {connected ? (
          <>
            <button
              onClick={() => void run(true)}
              disabled={gmailSyncing}
              className="btn-outline flex-1"
            >
              <Eye className="h-4 w-4" />
              {mode === "preview" ? "Previewing…" : "Preview"}
            </button>
            <button
              onClick={() => void run(false)}
              disabled={gmailSyncing}
              className="btn-primary flex-1"
            >
              <RefreshCw className={cn("h-4 w-4", mode === "sync" && "animate-spin")} />
              {mode === "sync" ? "Syncing…" : "Sync now"}
            </button>
          </>
        ) : (
          <button
            onClick={() => void startConnect()}
            disabled={gmail === null || connecting}
            className="btn-primary flex-1"
          >
            <Inbox className="h-4 w-4" />
            {connecting ? "Redirecting…" : "Connect Gmail"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {result && <SyncResult result={result} />}
    </Card>
  );
}

function StatusPill({
  connected,
  loading,
  onRefresh,
}: {
  connected: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading)
    return <span className="chip bg-slate-100 text-slate-500 dark:bg-slate-800">Checking…</span>;
  return (
    <button
      onClick={onRefresh}
      className={cn(
        "chip transition hover:opacity-80",
        connected
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
      )}
      title="Refresh status"
    >
      {connected ? <CheckCircle2 className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
      {connected ? "Connected" : "Not connected"}
    </button>
  );
}

function SyncResult({ result }: { result: GmailSyncResponse }) {
  const t = result.totals;
  const preview = result.providers.flatMap((p) =>
    p.preview.map((row) => ({ ...row, provider: p.provider }))
  );
  const nothing = t.matched === 0;
  const adopted = result.providers.reduce((s, p) => s + (p.adopted ?? 0), 0);

  return (
    <div className="mt-4 animate-fade-in rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Inbox className="h-4 w-4 text-brand-500" />
        {result.dry_run ? "Preview" : "Synced"}
        {nothing && adopted === 0 && (
          <span className="font-normal text-slate-400">— you're already up to date</span>
        )}
      </div>
      {adopted > 0 && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Linked {adopted} earlier record{adopted === 1 ? "" : "s"} to an account so they count toward your balance.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Emails" value={t.matched} />
        <Stat label="Parsed" value={t.parsed} />
        <Stat
          label={result.dry_run ? "Would add" : "Added"}
          value={result.dry_run ? t.parsed : t.created}
          tone="good"
        />
        <Stat label="Already had" value={t.duplicates + t.linked} />
      </div>

      {preview.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-3 font-medium">Date</th>
                <th className="py-1.5 pr-3 font-medium">Provider</th>
                <th className="py-1.5 pr-3 font-medium">Detail</th>
                <th className="py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 10).map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-500">
                    {r.date ? formatDate(r.date) : "—"}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 capitalize text-slate-600 dark:text-slate-300">
                    {PROVIDERS[r.provider as Provider]?.label ?? r.provider}
                  </td>
                  <td className="max-w-[260px] truncate py-1.5 pr-3 text-slate-700 dark:text-slate-200">
                    {r.merchant || r.subject}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap py-1.5 text-right font-semibold tabular-nums",
                      r.type === "credit"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-800 dark:text-slate-100"
                    )}
                  >
                    {formatCurrency(r.type === "credit" ? r.amount : -r.amount, { signed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 10 && (
            <p className="mt-2 text-xs text-slate-400">
              Showing 10 of {preview.length} parsed alerts.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good";
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "good" && value > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-slate-800 dark:text-slate-100"
        )}
      >
        {value}
      </p>
    </div>
  );
}
