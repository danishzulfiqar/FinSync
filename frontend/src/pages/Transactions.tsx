import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Download, SlidersHorizontal } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card } from "../components/ui/Card";
import { TableRowsSkeleton } from "../components/ui/Skeleton";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency } from "../lib/format";
import { signedAmount } from "../lib/analytics";
import type { Account, Category, Transaction } from "../types";

type Flow = "all" | "in" | "out" | "transfers";

function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/** Same columns FinLens exports: date, account, description, category, type, debit, credit, amount, balance. */
function exportCsv(
  rows: Transaction[],
  accounts: Account[],
  categories: Category[]
) {
  const accById = new Map(accounts.map((a) => [a.id, a.name]));
  const catById = new Map(categories.map((c) => [c.id, c.name]));
  const header = [
    "Date",
    "Account",
    "Description",
    "Category",
    "Type",
    "Debit",
    "Credit",
    "Amount",
    "Balance",
  ];
  // Oldest first, like a bank ledger.
  const body = [...rows].reverse().map((t) =>
    [
      t.date.slice(0, 10),
      accById.get(t.accountId) ?? "",
      t.description,
      catById.get(t.categoryId) ?? t.categoryId,
      t.type === "credit" ? "Credit" : "Debit",
      t.type === "debit" ? t.amount.toFixed(2) : "",
      t.type === "credit" ? t.amount.toFixed(2) : "",
      signedAmount(t).toFixed(2),
      t.balanceAfter != null ? t.balanceAfter.toFixed(2) : "",
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = [header.join(","), ...body].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "finsync-transactions.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function Transactions() {
  const { accounts, categories, transactions, settings, ready } = useAppData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [accountId, setAccountId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [flow, setFlow] = useState<Flow>("all");
  const initialLoading = !ready;
  const hasTransfers = transactions.some((t) => t.transfer);

  // Topbar search lands here with ?q=; keep the box in sync when it changes.
  useEffect(() => {
    const q = params.get("q");
    if (q != null) setQuery(q);
  }, [params]);

  function onQuery(next: string) {
    setQuery(next);
    if (params.has("q")) setParams({}, { replace: true });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (accountId !== "all" && t.accountId !== accountId) return false;
      if (categoryId !== "all" && t.categoryId !== categoryId) return false;
      if (flow === "in" && t.type !== "credit") return false;
      if (flow === "out" && t.type !== "debit") return false;
      if (flow === "transfers" && !t.transfer) return false;
      if (q && !`${t.description} ${t.merchant}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [transactions, query, accountId, categoryId, flow]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let hidden = 0;
    for (const t of filtered) {
      if (settings.excludeInternalTransfers && t.transfer) {
        hidden += 1;
        continue;
      }
      if (t.type === "credit") inflow += t.amount;
      else outflow += t.amount;
    }
    return { inflow, outflow, net: inflow - outflow, hidden };
  }, [filtered, settings.excludeInternalTransfers]);

  return (
    <Layout
      title="Transactions"
      subtitle={`${filtered.length} of ${transactions.length} records`}
    >
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              className="input pl-9"
              placeholder="Search description or merchant…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input w-full min-w-[9rem] flex-1 sm:w-auto sm:flex-none"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input w-full min-w-[9rem] flex-1 sm:w-auto sm:flex-none"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex flex-1 flex-wrap rounded-xl border border-slate-200 p-0.5 dark:border-slate-700 sm:flex-none">
              {(hasTransfers
                ? (["all", "in", "out", "transfers"] as Flow[])
                : (["all", "in", "out"] as Flow[])
              ).map((f) => (
                <button
                  key={f}
                  onClick={() => setFlow(f)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition sm:flex-none ${
                    flow === f
                      ? "bg-brand-600 text-white"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {f === "all"
                    ? "All"
                    : f === "in"
                      ? "Money in"
                      : f === "out"
                        ? "Money out"
                        : "Transfers"}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportCsv(filtered, accounts, categories)}
              className="btn-outline w-full sm:w-auto"
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-3 sm:gap-3">
          <Stat label="Money in" value={formatCurrency(totals.inflow)} tone="green" />
          <Stat label="Money out" value={formatCurrency(totals.outflow)} tone="red" />
          <Stat
            label="Net"
            value={formatCurrency(totals.net, { signed: true })}
            tone={totals.net >= 0 ? "green" : "red"}
          />
        </div>
        {totals.hidden > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            {totals.hidden} internal transfer leg{totals.hidden === 1 ? "" : "s"} excluded from these totals.
          </p>
        )}
      </Card>

      <Card className="mt-4 p-0">
        <div className="flex items-center gap-2 px-5 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          Ledger
        </div>
        {initialLoading ? (
          <TableRowsSkeleton rows={10} />
        ) : (
          <TransactionsTable transactions={filtered} />
        )}
      </Card>
    </Layout>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <p className="text-xs text-slate-400">{label}</p>
      <p
        className={`whitespace-nowrap text-base font-bold tabular-nums sm:mt-0.5 sm:text-lg ${
          tone === "green"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
