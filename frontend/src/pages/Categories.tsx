import { Layout } from "../components/layout/Layout";
import { Card, CardHeader } from "../components/ui/Card";
import { MonthlyBars } from "../components/charts/MonthlyBars";
import { useAppData } from "../context/AppDataContext";
import { cashFlowByMonth, spendingByCategory } from "../lib/analytics";
import { formatCurrency } from "../lib/format";

export function Categories() {
  const { categories, transactions } = useAppData();
  const spending = spendingByCategory(transactions, categories);
  const flow = cashFlowByMonth(transactions, categories);
  const maxSpend = Math.max(...spending.map((s) => s.value), 1);

  return (
    <Layout title="Categories" subtitle="Budgets & spending trends">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Net savings by month"
            subtitle="Income minus spending, transfers excluded"
          />
          <MonthlyBars data={flow} />
        </Card>

        <Card>
          <CardHeader title="Top categories" subtitle="This period" />
          <div className="space-y-4">
            {spending.slice(0, 6).map((s) => (
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
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(s.value / maxSpend) * 100}%`,
                      backgroundColor: s.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Budget tracker"
          subtitle="How close you are to each monthly budget"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {spending
            .filter((s) => s.budget > 0)
            .map((s) => {
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
      </Card>
    </Layout>
  );
}
