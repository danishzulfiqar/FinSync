import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Check,
  Mail,
  Loader2,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card, CardHeader } from "../components/ui/Card";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../context/AppDataContext";
import {
  api,
  ApiError,
  type StatementImportResponse,
  type StatementFileResult,
} from "../lib/api";

type Phase = "idle" | "working" | "preview" | "done";

function buildForm(files: File[], password: string, dryRun: boolean): FormData {
  const data = new FormData();
  files.forEach((f) => data.append("files", f));
  if (password) data.append("password", password);
  data.append("dry_run", dryRun ? "true" : "false");
  return data;
}

export function Upload() {
  const { refresh } = useAppData();
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<StatementImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const pdfs = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) {
      setError("Please upload PDF bank statements (ABL / HBL).");
      return;
    }
    setError(null);
    setResult(null);
    setPhase("idle");
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...pdfs.filter((f) => !names.has(f.name))];
    });
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function run(dryRun: boolean) {
    if (files.length === 0) return;
    setPhase("working");
    setError(null);
    try {
      const res = await api.upload<StatementImportResponse>(
        "/statements/upload",
        buildForm(files, password, dryRun)
      );
      setResult(res);
      setPhase(dryRun ? "preview" : "done");
      if (!dryRun) {
        setFiles([]);
        void refresh();
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong while processing your statement."
      );
      setPhase("idle");
    }
  }

  function reset() {
    setFiles([]);
    setPassword("");
    setResult(null);
    setError(null);
    setPhase("idle");
  }

  const busy = phase === "working";

  return (
    <Layout title="Import data" subtitle="Upload statements or pull from Gmail">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Upload bank statement"
            subtitle="Password-protected PDFs from Allied Bank (myABL) or HBL"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragging
                ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
                : "border-slate-200 hover:border-brand-400 dark:border-slate-700"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <UploadCloud className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Drop your statement(s) here, or{" "}
              <span className="text-brand-600 dark:text-brand-400">browse</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              We detect the bank layout, categorize rows and reconcile balances
            </p>
          </div>

          {files.length > 0 && (
            <ul className="mt-4 space-y-2">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {f.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {(f.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(f.name);
                    }}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800"
                    aria-label={`Remove ${f.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Lock className="h-3.5 w-3.5" />
                  PDF password (if protected)
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank if not encrypted"
                  className="input"
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => run(true)}
                  disabled={busy}
                  className="btn-primary"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  Parse &amp; preview
                </button>
                <button onClick={reset} className="btn-ghost" disabled={busy}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {phase === "done" && result && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Imported {result.totals.created ?? 0} new transaction(s)
              {result.totals.duplicates
                ? `, skipped ${result.totals.duplicates} duplicate(s)`
                : ""}
              .
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Or connect Gmail" subtitle="Automatic alerts sync" />
          <div className="flex flex-col items-center rounded-xl bg-slate-50 p-6 text-center dark:bg-slate-800/50">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-500 dark:bg-rose-500/15">
              <Mail className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Gmail read-only
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Pull transaction alerts from myABL, HBL &amp; NayaPay senders
              automatically.
            </p>
            <button className="btn-primary mt-4 w-full" disabled>
              Connect Gmail
            </button>
            <p className="mt-3 text-[11px] text-slate-400">Coming soon</p>
          </div>
        </Card>
      </div>

      {result && (
        <div className="mt-4 space-y-4">
          {result.files.map((file) => (
            <StatementResultCard
              key={file.source_file}
              file={file}
              committed={phase === "done"}
            />
          ))}
          {phase === "preview" &&
            result.files.some((f) => f.status === "parsed") && (
              <div className="flex justify-end">
                <button
                  onClick={() => run(false)}
                  disabled={busy}
                  className="btn-primary"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Import {result.totals.parsed} transaction(s)
                </button>
              </div>
            )}
        </div>
      )}
    </Layout>
  );
}

function StatementResultCard({
  file,
  committed,
}: {
  file: StatementFileResult;
  committed: boolean;
}) {
  if (file.status === "error") {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-500 dark:bg-rose-500/15">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {file.source_file}
            </p>
            <p className="text-xs text-rose-500">{file.error}</p>
          </div>
        </div>
      </Card>
    );
  }

  const recon = file.reconciliation;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {file.account_title ?? file.source_file}
            </h3>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {file.provider}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {file.account_number ? `A/C ${file.account_number} · ` : ""}
            {file.parsed} transactions
            {committed
              ? ` · ${file.created} imported, ${file.duplicates} duplicate`
              : ""}
            {committed && file.account_created ? " · account created" : ""}
          </p>
        </div>
        {recon && (
          <div
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
              recon.closing_ok
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
            }`}
          >
            {recon.closing_ok ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {recon.closing_ok
              ? "Balanced"
              : `${recon.row_mismatches} mismatch(es)`}
          </div>
        )}
      </div>

      {recon && (
        <div className="grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 text-center dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
          <Stat label="Opening" value={formatCurrency(recon.opening_balance)} />
          <Stat label="Net" value={formatCurrency(recon.net, { signed: true })} />
          <Stat
            label="Computed close"
            value={formatCurrency(recon.computed_closing)}
          />
          <Stat
            label="Printed close"
            value={formatCurrency(recon.closing_balance)}
          />
        </div>
      )}

      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left text-xs text-slate-400 dark:bg-slate-900">
            <tr>
              <th className="px-5 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-5 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {file.preview.map((row, i) => {
              const amt = Number(row.amount);
              const signed = row.transaction_type === "credit" ? amt : -amt;
              return (
                <tr
                  key={i}
                  className="border-t border-slate-50 dark:border-slate-800/60"
                >
                  <td className="whitespace-nowrap px-5 py-2 text-slate-500 dark:text-slate-400">
                    {row.transaction_datetime
                      ? formatDate(row.transaction_datetime)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {row.description ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {row.category}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-2 text-right font-medium ${
                      signed >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {formatCurrency(signed, { signed: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {file.parsed > file.preview.length && (
          <p className="px-5 py-2 text-center text-xs text-slate-400">
            Showing first {file.preview.length} of {file.parsed} rows
          </p>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-2.5 dark:bg-slate-900">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}
