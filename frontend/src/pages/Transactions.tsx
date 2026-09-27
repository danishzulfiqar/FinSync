import { useMemo, useState } from "react";
import { Search, Download, SlidersHorizontal } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card } from "../components/ui/Card";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency } from "../lib/format";
import type { Transaction } from "../types";

type Flow = "all" | "in" | "out";

function exportCsv(rows: Transaction[]) {
  const header = ["Date", "Description", "Merchant", "Category", "Account", "Type", "Amount"];
  const body = rows.map((t) =>
    [t.date, t.description, t.merchant, t.categoryId, t.accountId, t.type, t.amount]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
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
  const { accounts, categories, transactions } = useAppData();
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [flow, setFlow] = useState<Flow>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (accountId !== "all" && t.accountId !== accountId) return false;
      if (categoryId !== "all" && t.categoryId !== categoryId) return false;
      if (flow === "in" && t.type !== "credit") return false;
      if (flow === "out" && t.type !== "debit") return false;
      if (q && !`${t.description} ${t.merchant}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [transactions, query, accountId, categoryId, flow]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const t of filtered) {
      if (t.type === "credit") inflow += t.amount;
      else outflow += t.amount;
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [filtered]);

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
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-9"
              placeholder="Search description or merchant…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input w-auto"
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
              className="input w-auto"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
              {(["all", "in", "out"] as Flow[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFlow(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    flow === f
                      ? "bg-brand-600 text-white"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {f === "all" ? "All" : f === "in" ? "Money in" : "Money out"}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportCsv(filtered)}
              className="btn-outline"
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Stat label="Money in" value={formatCurrency(totals.inflow)} tone="green" />
          <Stat label="Money out" value={formatCurrency(totals.outflow)} tone="red" />
          <Stat
            label="Net"
            value={formatCurrency(totals.net, { signed: true })}
            tone={totals.net >= 0 ? "green" : "red"}
          />
        </div>
      </Card>

      <Card className="mt-4 p-0">
        <div className="flex items-center gap-2 px-5 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          Ledger
        </div>
        <TransactionsTable transactions={filtered} />
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
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${
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
