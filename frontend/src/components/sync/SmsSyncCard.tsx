import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useAppData } from "../../context/AppDataContext";
import { ApiError, type SmsSyncResponse } from "../../lib/api";
import { cn, formatDateTime } from "../../lib/format";
import { Card, CardHeader } from "../ui/Card";

/**
 * On-demand HBL SMS sync. A sync asks the phone (via the sms-gateway cloud) to
 * replay its inbox since the latest HBL SMS on record; matching transaction
 * SMS arrive through the webhook a few seconds later, so the ledger refreshes
 * itself shortly after the request.
 */
export function SmsSyncCard({ compact = false }: { compact?: boolean }) {
  const { sms, smsSyncing, syncSms, refreshSmsStatus } = useAppData();
  const [result, setResult] = useState<SmsSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configured = sms?.configured ?? false;

  async function run() {
    setError(null);
    setResult(null);
    try {
      setResult(await syncSms());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reach the SMS gateway."
      );
    }
  }

  return (
    <Card className={cn(compact && "p-4")}>
      <CardHeader
        title="SMS sync"
        subtitle="Pull HBL card & account alerts from your phone"
        action={
          <button
            onClick={() => void refreshSmsStatus()}
            className="btn-ghost px-2 py-1 text-xs"
            title="Refresh gateway status"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      />

      {sms && !configured && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">SMS gateway not configured</p>
            <p className="mt-0.5 text-xs opacity-80">
              Set the SMS gateway credentials and public URL in the backend
              environment, then refresh.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              HBL (14250)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {sms?.latest_hbl_sms_at
                ? `Latest SMS transaction: ${formatDateTime(sms.latest_hbl_sms_at)}`
                : "No SMS transactions yet"}
            </p>
          </div>
        </div>
        <button
          onClick={() => void run()}
          disabled={!configured || smsSyncing}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          <MessageSquare
            className={cn("h-3.5 w-3.5", smsSyncing && "animate-pulse")}
          />
          {smsSyncing ? "Requesting…" : "Sync SMS"}
        </button>
      </div>

      {result && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Requested {result.since.slice(0, 10)} → {result.until.slice(0, 10)}
            </p>
            <p className="mt-0.5 text-xs opacity-80">
              Keep the gateway app open on your phone. New transactions appear
              here automatically within about a minute; duplicates are merged.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </Card>
  );
}
