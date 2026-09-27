import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Check,
  Mail,
  Loader2,
  Trash2,
} from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card, CardHeader } from "../components/ui/Card";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency } from "../lib/format";
import type { Transaction } from "../types";

/** Deterministic-ish synthetic "parsed" rows to mimic a statement import. */
function synthesizeRows(accountId: string, fileName: string): Transaction[] {
  const seed = [
    { d: "Bykea ride", m: "Bykea", a: 540, c: "transport", t: "debit" },
    { d: "Cheezious order", m: "Cheezious", a: 1890, c: "dining", t: "debit" },
    { d: "Naheed store", m: "Naheed", a: 7650, c: "groceries", t: "debit" },
    { d: "Salary top-up", m: "Employer", a: 45000, c: "salary", t: "credit" },
    { d: "PSO fuel", m: "PSO", a: 6800, c: "transport", t: "debit" },
    { d: "Outfitters", m: "Outfitters", a: 5200, c: "shopping", t: "debit" },
  ] as const;
  const stamp = Date.now().toString(36);
  const base = new Date();
  return seed.map((row, i) => {
    const date = new Date(base);
    date.setDate(base.getDate() - i * 2);
    return {
      id: `imp_${stamp}_${i}`,
      accountId,
      date: date.toISOString().slice(0, 10),
      description: row.d,
      merchant: row.m,
      amount: row.a,
      type: row.t,
      categoryId: row.c,
      source: fileName.toLowerCase().endsWith(".pdf") ? "statement" : "statement",
    } satisfies Transaction;
  });
}

export function Upload() {
  const { accounts, importTransactions } = useAppData();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [imported, setImported] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setImported(false);
    setParsing(true);
    setRows([]);
    window.setTimeout(() => {
      setRows(synthesizeRows(accountId, file.name));
      setParsing(false);
    }, 900);
  }

  function confirmImport() {
    importTransactions(rows);
    setImported(true);
    setRows([]);
    setFileName(null);
  }

  const previewTotal = rows.reduce(
    (s, r) => s + (r.type === "credit" ? r.amount : -r.amount),
    0
  );

  return (
    <Layout
      title="Import data"
      subtitle="Upload statements or pull from Gmail"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Upload bank statement"
            subtitle="PDF or CSV from ABL, HBL or NayaPay"
            action={
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="input w-auto py-1.5 text-xs"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            }
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
              handleFile(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
              dragging
                ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
                : "border-slate-200 hover:border-brand-400 dark:border-slate-700"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.csv,.xlsx"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <UploadCloud className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Drop your statement here, or{" "}
              <span className="text-brand-600 dark:text-brand-400">browse</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              We’ll auto-detect transactions and categorize them
            </p>
          </div>

          {fileName && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {fileName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {parsing
                      ? "Parsing…"
                      : `${rows.length} transactions detected`}
                  </p>
                </div>
              </div>
              {parsing ? (
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileName(null);
                    setRows([]);
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {imported && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Transactions imported — view them in the ledger.
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
              Pull transaction alerts from myabl, HBL &amp; NayaPay senders
              automatically.
            </p>
            <button className="btn-primary mt-4 w-full">Connect Gmail</button>
            <p className="mt-3 text-[11px] text-slate-400">
              Backend hook coming soon · currently using synthetic data
            </p>
          </div>
        </Card>
      </div>

      {rows.length > 0 && (
        <Card className="mt-4 p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Review before importing
              </h3>
              <p className="text-xs text-slate-400">
                Net effect {formatCurrency(previewTotal, { signed: true })} ·{" "}
                {rows.length} rows
              </p>
            </div>
            <button onClick={confirmImport} className="btn-primary">
              <Check className="h-4 w-4" />
              Import {rows.length}
            </button>
          </div>
          <TransactionsTable transactions={rows} />
        </Card>
      )}
    </Layout>
  );
}
