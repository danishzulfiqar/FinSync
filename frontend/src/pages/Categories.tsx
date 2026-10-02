import { Layout } from "../components/layout/Layout";
import { Card, CardHeader } from "../components/ui/Card";
import { MonthlyBars } from "../components/charts/MonthlyBars";
import { useAppData } from "../context/AppDataContext";
import {
  cashFlowByMonth,
  incomeByCategory,
  spendingByCategory,
  topExpenses,
  type CategorySlice,
} from "../lib/analytics";
import { formatCurrency, formatDate } from "../lib/format";

export function Categories() {
  const { categories, transactions } = useAppData();
  const spending = spendingByCategory(transactions, categories);
  const income = incomeByCategory(transactions, categories);
  const flow = cashFlowByMonth(transactions, categories);
  const biggest = topExpenses(transactions, 10);
  const budgeted = spending.filter((s) => s.budget > 0);

  return (
    <Layout title="Categories" subtitle="Where your money comes from and goes">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Net cash flow by month"
            subtitle="Income minus expense (all credits and debits)"
          />
          <MonthlyBars data={flow} />
        </Card>

        <Card>
          <CardHeader title="Top spending" subtitle="Share of total expense" />
          <BreakdownList slices={spending.slice(0, 6)} empty="No expenses yet." />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spending" subtitle="Every expense category" />
          <BreakdownTable slices={spending} empty="No expenses in your data." />
        </Card>
        <Card>
          <CardHeader title="Income" subtitle="Every income category" />
          <BreakdownTable slices={income} empty="No income in your data." />
        </Card>
      </div>

      <Card className="mt-4 p-0">
        <div className="px-5 pt-5">
          <CardHeader title="Top 10 expenses" subtitle="Largest single debits" />
        </div>
        {biggest.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-400">No expenses yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {biggest.map((t) => {
                  const cat = categories.find((c) => c.id === t.categoryId);
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-slate-50 dark:border-slate-800/60"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500 dark:text-slate-400">
                        {formatDate(t.date)}
                      </td>
                      <td className="max-w-[360px] truncate px-5 py-3 text-slate-800 dark:text-slate-100">
                        {t.description}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: cat?.color }}
                          />
                          {cat?.name ?? "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        {formatCurrency(-t.amount, { signed: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Budget tracker"
          subtitle="How close you are to each monthly budget"
        />
        {budgeted.length === 0 ? (
          <p className="text-sm text-slate-400">
            No budgets set yet — per-category budgets are coming soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {budgeted.map((s) => {
              const pct = Math.min((s.value / s.budget) * 100, 100);
              const over = s.value > s.budget;
              return (
                <div
                  key={s.categoryId}
                  className="rounded-xl border border-slate-100 p-4 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {s.name}
                    </span>
                    <span
                      className={`chip ${
                        over
                          ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                      }`}
                    >
                      {Math.round((s.value / s.budget) * 100)}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: over ? "#f43f5e" : s.color,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {formatCurrency(s.value)} of {formatCurrency(s.budget)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </Layout>
  );
}

function BreakdownList({
  slices,
  empty,
}: {
  slices: CategorySlice[];
  empty: string;
}) {
  if (slices.length === 0)
    return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  const max = Math.max(...slices.map((s) => s.value), 1);
  return (
    <div className="space-y-4">
      {slices.map((s) => (
        <div key={s.categoryId}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {formatCurrency(s.value)}
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                {s.share.toFixed(1)}%
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(s.value / max) * 100}%`,
                backgroundColor: s.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function BreakdownTable({
  slices,
  empty,
}: {
  slices: CategorySlice[];
  empty: string;
}) {
  if (slices.length === 0)
    return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <th className="py-2 font-medium">Category</th>
          <th className="py-2 text-right font-medium">Txns</th>
          <th className="py-2 text-right font-medium">Total</th>
          <th className="py-2 text-right font-medium">Share</th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => (
          <tr
            key={s.categoryId}
            className="border-b border-slate-50 dark:border-slate-800/60"
          >
            <td className="py-2.5">
              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </span>
            </td>
            <td className="py-2.5 text-right tabular-nums text-slate-500">
              {s.transactions}
            </td>
            <td className="py-2.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {formatCurrency(s.value)}
            </td>
            <td className="py-2.5 text-right tabular-nums text-slate-500">
              {s.share.toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          <td className="pt-3">Total</td>
          <td className="pt-3 text-right tabular-nums">
            {slices.reduce((s, x) => s + x.transactions, 0)}
          </td>
          <td className="pt-3 text-right tabular-nums text-slate-800 dark:text-slate-100">
            {formatCurrency(total)}
          </td>
          <td className="pt-3 text-right tabular-nums">100%</td>
        </tr>
      </tfoot>
    </table>
  );
}
