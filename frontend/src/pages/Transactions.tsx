import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Download, SlidersHorizontal, X } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { TableRowsSkeleton } from "../components/ui/Skeleton";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency } from "../lib/format";
import { inRange, signedAmount } from "../lib/analytics";
import type { TimeRange } from "../lib/api";
import type { Account, Category, Transaction } from "../types";

type Flow = "all" | "in" | "out" | "transfers";
type Sort = "newest" | "oldest" | "largest" | "smallest";
type RangeMode = TimeRange | "custom";
type SourceFilter = "all" | Transaction["source"];

const SOURCE_FILTER_LABELS: Record<SourceFilter, string> = {
  all: "All sources",
  statement: "Statement",
  gmail: "Email",
  sms: "SMS",
  manual: "Manual",
};

const RANGE_FILTER_LABELS: Record<RangeMode, string> = {
  all: "All time",
  "1m": "This month",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "1y": "Last 12 months",
  custom: "Custom range",
};

const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  largest: "Largest amount",
  smallest: "Smallest amount",
};

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
  const [source, setSource] = useState<SourceFilter>("all");
  const [flow, setFlow] = useState<Flow>("all");
  const [range, setRange] = useState<RangeMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const initialLoading = !ready;
  const hasTransfers = transactions.some((t) => t.transfer);

  const filtersActive =
    query.trim() !== "" ||
    accountId !== "all" ||
    categoryId !== "all" ||
    source !== "all" ||
    flow !== "all" ||
    range !== "all" ||
    sort !== "newest";

  function resetFilters() {
    setQuery("");
    setAccountId("all");
    setCategoryId("all");
    setSource("all");
    setFlow("all");
    setRange("all");
    setCustomFrom("");
    setCustomTo("");
    setSort("newest");
    if (params.has("q")) setParams({}, { replace: true });
  }

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
    let scoped: Transaction[];
    if (range === "custom") {
      scoped = transactions.filter((t) => {
        const d = t.date.slice(0, 10);
        if (customFrom && d < customFrom) return false;
        if (customTo && d > customTo) return false;
        return true;
      });
    } else if (range === "all") {
      scoped = transactions;
    } else {
      scoped = inRange(transactions, range);
    }
    return scoped.filter((t) => {
      if (accountId !== "all" && t.accountId !== accountId) return false;
      if (categoryId !== "all" && t.categoryId !== categoryId) return false;
      if (source !== "all" && t.source !== source) return false;
      if (flow === "in" && t.type !== "credit") return false;
      if (flow === "out" && t.type !== "debit") return false;
      if (flow === "transfers" && !t.transfer) return false;
      if (q && !`${t.description} ${t.merchant}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [
    transactions,
    query,
    accountId,
    categoryId,
    source,
    flow,
    range,
    customFrom,
    customTo,
  ]);

  // `filtered` keeps the context's newest-first order; re-sort only when asked.
  const visible = useMemo(() => {
    if (sort === "newest") return filtered;
    const rows = [...filtered];
    if (sort === "oldest") return rows.reverse();
    if (sort === "largest") return rows.sort((a, b) => b.amount - a.amount);
    return rows.sort((a, b) => a.amount - b.amount);
  }, [filtered, sort]);

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
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                className="input pl-9"
                placeholder="Search description or merchant…"
              />
            </div>
            <button
              onClick={() => exportCsv(visible, accounts, categories)}
              className="btn-outline w-full sm:w-auto"
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                      ? "bg-brand-400 text-slate-950"
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
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="Filter by account"
              wrapperClassName="min-w-[8.5rem] flex-1 sm:flex-none"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filter by category"
              wrapperClassName="min-w-[8.5rem] flex-1 sm:flex-none"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as SourceFilter)}
              aria-label="Filter by source"
              wrapperClassName="min-w-[8.5rem] flex-1 sm:flex-none"
            >
              {(Object.keys(SOURCE_FILTER_LABELS) as SourceFilter[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_FILTER_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeMode)}
              aria-label="Filter by date range"
              wrapperClassName="min-w-[8.5rem] flex-1 sm:flex-none"
            >
              {(Object.keys(RANGE_FILTER_LABELS) as RangeMode[]).map((r) => (
                <option key={r} value={r}>
                  {RANGE_FILTER_LABELS[r]}
                </option>
              ))}
            </Select>
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort transactions"
              wrapperClassName="min-w-[8.5rem] flex-1 sm:flex-none"
            >
              {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </Select>
            {filtersActive && (
              <button
                onClick={resetFilters}
                className="btn-ghost px-3 py-2 text-xs"
                title="Clear all filters"
              >
                <X className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>

          {range === "custom" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex flex-1 items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                From
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="Start date"
                  className="input py-1.5 text-xs"
                />
              </label>
              <label className="flex flex-1 items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                To
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="End date"
                  className="input py-1.5 text-xs"
                />
              </label>
            </div>
          )}
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
          <TransactionsTable transactions={visible} />
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
