import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  ArrowRight,
  ArrowLeftRight,
  Sparkles,
  Mail,
} from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { KpiCard } from "../components/ui/KpiCard";
import { Card, CardHeader } from "../components/ui/Card";
import { DeltaChip } from "../components/ui/DeltaChip";
import { RangePills } from "../components/ui/RangePills";
import { Sparkline } from "../components/ui/Sparkline";
import {
  KpiCardSkeleton,
  ChartCardSkeleton,
  ListRowsSkeleton,
  TableRowsSkeleton,
  Skeleton,
} from "../components/ui/Skeleton";
import { SpendingDonut } from "../components/charts/SpendingDonut";
import { CashFlowArea } from "../components/charts/CashFlowArea";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { useAppData } from "../context/AppDataContext";
import {
  accountShares,
  balanceSeries,
  cashFlowByMonth,
  computeKpis,
  inRange,
  periodDeltas,
  spendingByCategory,
  RANGE_MONTHS,
} from "../lib/analytics";
import { forecastBalance } from "../lib/forecast";
import type { TimeRange } from "../lib/api";
import { formatCurrency, formatMonth, formatPercent } from "../lib/format";
import { PROVIDERS } from "../types";

export function Dashboard() {
  const { accounts, categories, transactions, flows, settings, gmail, ready, error } =
    useAppData();
  const [range, setRange] = useState<TimeRange>(settings.defaultRange);
  // Follow the saved default until the user picks something on this page.
  useEffect(() => setRange(settings.defaultRange), [settings.defaultRange]);

  const scoped = useMemo(() => inRange(flows, range), [flows, range]);
  const kpis = useMemo(
    () => computeKpis(scoped, accounts, transactions),
    [scoped, accounts, transactions]
  );
  const deltas = useMemo(
    () => periodDeltas(flows, transactions, accounts),
    [flows, transactions, accounts]
  );
  const series = useMemo(() => balanceSeries(transactions, accounts), [transactions, accounts]);
  const flow = useMemo(() => cashFlowByMonth(scoped, categories), [scoped, categories]);
  const spending = useMemo(() => spendingByCategory(scoped, categories), [scoped, categories]);
  const shares = useMemo(() => accountShares(accounts, transactions), [accounts, transactions]);
  const fc = useMemo(
    () => forecastBalance(transactions, accounts, { horizon: settings.forecastHorizon, sims: 600 }),
    [transactions, accounts, settings.forecastHorizon]
  );

  const empty = ready && !error && transactions.length === 0;
  const initialLoading = !ready;
  const hiddenTransfers = settings.excludeInternalTransfers
    ? transactions.filter((t) => t.transfer).length / 2
    : 0;
  const rangeLabel =
    RANGE_MONTHS[range] == null ? "All time" : `Last ${RANGE_MONTHS[range]} month${RANGE_MONTHS[range] === 1 ? "" : "s"}`;
  const inboxStale =
    gmail?.connected && gmail.providers.some((p) => p.configured && !p.last_sync_at);

  return (
    <Layout title="Overview" subtitle="Your money across every account, in one place.">
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
          or{" "}
          <Link to="/settings" className="font-semibold underline">
            sync your inbox
          </Link>{" "}
          to see your dashboard come alive.
        </div>
      )}
      {!empty && inboxStale && (
        <Link
          to="/settings"
          className="mb-4 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/15"
        >
          <Mail className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Your inbox is connected but hasn't been synced yet — pull in alerts newer than your statement.
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {/* Range + context strip */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <RangePills value={range} onChange={setRange} />
          <span className="hidden text-xs text-slate-400 sm:inline">{rangeLabel}</span>
        </div>
        {hiddenTransfers > 0 && (
          <Link
            to="/settings"
            className="chip bg-slate-100 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            title="Internal transfers are excluded from income and expense"
          >
            <ArrowLeftRight className="h-3 w-3" />
            {hiddenTransfers} transfer{hiddenTransfers === 1 ? "" : "s"} hidden
          </Link>
        )}
      </div>

      {initialLoading ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="card p-5 lg:col-span-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-9 w-48" />
              <Skeleton className="mt-6 h-11 w-full" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <KpiCardSkeleton key={i} />
              ))}
            </div>
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
          {/* Hero + KPIs */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 p-5 text-white shadow-soft lg:col-span-4 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-300">Total balance</p>
                  <DeltaChip delta={deltas?.balance} className="bg-white/10 text-white dark:bg-white/10 dark:text-white" />
                </div>
                <p className="mt-2 whitespace-nowrap text-3xl font-bold tabular-nums tracking-tight">
                  {formatCurrency(kpis.balance)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {accounts.length} account{accounts.length === 1 ? "" : "s"} · {series.length} month
                  {series.length === 1 ? "" : "s"} of history
                </p>
                <div className="mt-4">
                  <Sparkline
                    values={series.slice(-12).map((p) => p.balance)}
                    width={320}
                    height={56}
                    stroke="#a78bfa"
                    className="h-14 w-full"
                  />
                </div>
                {fc.summary.monthsHistory > 0 && (
                  <Link
                    to="/predictions"
                    className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs backdrop-blur transition hover:bg-white/15"
                  >
                    <span className="flex items-center gap-1.5 text-slate-200">
                      <Sparkles className="h-3.5 w-3.5 text-brand-300" />
                      Likely by {formatMonth(fc.forecast[fc.forecast.length - 1].month)}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(fc.summary.projMedianEnd)}
                    </span>
                  </Link>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-8">
              <KpiCard
                label="Income"
                value={formatCurrency(kpis.income)}
                icon={TrendingUp}
                accent="green"
                chip={<DeltaChip delta={deltas?.income} />}
                hint={`${kpis.count} transactions · ${rangeLabel.toLowerCase()}`}
              />
              <KpiCard
                label="Expense"
                value={formatCurrency(kpis.spending)}
                icon={TrendingDown}
                accent="red"
                chip={<DeltaChip delta={deltas?.spending} invert />}
                hint={`avg ${formatCurrency(kpis.avgExpense)} per debit`}
              />
              <KpiCard
                label="Net"
                value={formatCurrency(kpis.net, { signed: true })}
                icon={PiggyBank}
                accent="sky"
                chip={<DeltaChip delta={deltas?.net} />}
                hint={`${formatPercent(kpis.savingsRate, 0).replace("+", "")} savings rate`}
              />
            </div>
          </div>

          {/* Charts */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Cash flow" subtitle={`Income vs expense by month · ${rangeLabel.toLowerCase()}`} />
              {flow.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">No activity in this period.</p>
              ) : (
                <CashFlowArea data={flow} />
              )}
            </Card>
            <Card>
              <CardHeader
                title="Where money goes"
                subtitle="Expense by category"
                action={
                  <Link to="/categories" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                    Details
                  </Link>
                }
              />
              {spending.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">No expenses in this period.</p>
              ) : (
                <>
                  <SpendingDonut data={spending} />
                  <ul className="mt-2 space-y-1.5">
                    {spending.slice(0, 4).map((s) => (
                      <li key={s.categoryId} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="truncate">{s.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200">
                          {s.share.toFixed(0)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          {/* Accounts + recent */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader
                title="Accounts"
                subtitle="Share of total balance"
                action={
                  <Link to="/accounts" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                    Manage
                  </Link>
                }
              />
              {shares.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  Accounts are created automatically when you import a statement.
                </p>
              ) : (
                <>
                  <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {shares.map(({ account, share }) => (
                      <div
                        key={account.id}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${share}%`, backgroundColor: PROVIDERS[account.provider].color }}
                        title={`${account.name} · ${share.toFixed(0)}%`}
                      />
                    ))}
                  </div>
                  <div className="space-y-3">
                    {shares.map(({ account, balance, share, transactions: n }) => {
                      const provider = PROVIDERS[account.provider];
                      return (
                        <div
                          key={account.id}
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
                                {account.name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {account.mask} · {n} txns
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                              {formatCurrency(balance)}
                            </p>
                            <p className="text-xs tabular-nums text-slate-400">{share.toFixed(0)}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
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
                <TransactionsTable transactions={transactions.slice(0, 6)} editable={false} />
              </div>
            </Card>
          </div>
        </>
      )}
    </Layout>
  );
}
