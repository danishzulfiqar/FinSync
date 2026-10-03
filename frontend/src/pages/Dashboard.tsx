import { Link } from "react-router-dom";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  ArrowRight,
} from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { KpiCard } from "../components/ui/KpiCard";
import { Card, CardHeader } from "../components/ui/Card";
import {
  KpiCardSkeleton,
  ChartCardSkeleton,
  ListRowsSkeleton,
  TableRowsSkeleton,
} from "../components/ui/Skeleton";
import { SpendingDonut } from "../components/charts/SpendingDonut";
import { CashFlowArea } from "../components/charts/CashFlowArea";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { useAppData } from "../context/AppDataContext";
import {
  accountBalance,
  cashFlowByMonth,
  computeKpis,
  spendingByCategory,
} from "../lib/analytics";
import { formatCurrency } from "../lib/format";
import { PROVIDERS } from "../types";

export function Dashboard() {
  const { accounts, categories, transactions, ready, error } = useAppData();
  const kpis = computeKpis(transactions, accounts, categories);
  const flow = cashFlowByMonth(transactions, categories);
  const spending = spendingByCategory(transactions, categories);
  const savingsRate = Math.round(kpis.savingsRate);
  const empty = ready && !error && transactions.length === 0;
  const initialLoading = !ready;

  return (
    <Layout
      title="Overview"
      subtitle="Your money across every account, in one place."
    >
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      )}
      {empty && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
          No transactions yet.{" "}
          <Link to="/upload" className="font-semibold underline">
            Import a bank statement
          </Link>{" "}
          to see your dashboard come alive.
        </div>
      )}

      {initialLoading ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <KpiCardSkeleton key={i} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCardSkeleton height={260} />
            </div>
            <ChartCardSkeleton height={260} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Accounts" />
              <ListRowsSkeleton rows={4} />
            </Card>
            <Card className="lg:col-span-2 p-0">
              <div className="px-5 py-4">
                <CardHeader title="Recent transactions" />
              </div>
              <TableRowsSkeleton rows={6} />
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total balance"
              value={formatCurrency(kpis.balance)}
              icon={Wallet}
              accent="brand"
              trend={{
                value: `${accounts.length} account${accounts.length === 1 ? "" : "s"} · ${kpis.months} month${kpis.months === 1 ? "" : "s"}`,
                positive: true,
              }}
            />
            <KpiCard
              label="Total income"
              value={formatCurrency(kpis.income)}
              icon={TrendingUp}
              accent="green"
              trend={{ value: `${kpis.count} transactions`, positive: true }}
            />
            <KpiCard
              label="Total expense"
              value={formatCurrency(kpis.spending)}
              icon={TrendingDown}
              accent="red"
              trend={{
                value: `avg ${formatCurrency(kpis.avgExpense)}`,
                positive: false,
              }}
            />
            <KpiCard
              label="Net"
              value={formatCurrency(kpis.net, { signed: true })}
              icon={PiggyBank}
              accent="sky"
              trend={{
                value: `${savingsRate}% savings rate`,
                positive: kpis.net >= 0,
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Cash flow"
                subtitle="Income vs expense by month"
              />
              <CashFlowArea data={flow} />
            </Card>
            <Card>
              <CardHeader
                title="Where money goes"
                subtitle="Expense by category"
              />
              <SpendingDonut data={spending} />
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader
                title="Accounts"
                action={
                  <Link
                    to="/accounts"
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Manage
                  </Link>
                }
              />
              <div className="space-y-3">
                {accounts.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Accounts are created automatically when you import a
                    statement.
                  </p>
                )}
                {accounts.map((a) => {
                  const provider = PROVIDERS[a.provider];
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                          style={{ backgroundColor: provider.color }}
                        >
                          {provider.label.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {a.name}
                          </p>
                          <p className="text-xs text-slate-400">{a.mask}</p>
                        </div>
                      </div>
                      <p className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        {formatCurrency(accountBalance(a, transactions))}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent transactions"
                action={
                  <Link
                    to="/transactions"
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="-mx-5 -mb-5">
                <TransactionsTable
                  transactions={transactions.slice(0, 6)}
                  editable={false}
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </Layout>
  );
}
