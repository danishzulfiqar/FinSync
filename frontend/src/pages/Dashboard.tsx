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
  const { accounts, categories, transactions } = useAppData();
  const kpis = computeKpis(transactions, accounts, categories);
  const flow = cashFlowByMonth(transactions, categories);
  const spending = spendingByCategory(transactions, categories);
  const savingsRate =
    kpis.income > 0 ? Math.round((kpis.net / kpis.income) * 100) : 0;

  return (
    <Layout
      title="Overview"
      subtitle="Your money across every account, in one place."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total balance"
          value={formatCurrency(kpis.balance)}
          icon={Wallet}
          accent="brand"
          trend={{ value: `${accounts.length} accounts`, positive: true }}
        />
        <KpiCard
          label="Income (period)"
          value={formatCurrency(kpis.income)}
          icon={TrendingUp}
          accent="green"
          trend={{ value: "+8.2%", positive: true }}
        />
        <KpiCard
          label="Spending (period)"
          value={formatCurrency(kpis.spending)}
          icon={TrendingDown}
          accent="red"
          trend={{ value: "+3.1%", positive: false }}
        />
        <KpiCard
          label="Net saved"
          value={formatCurrency(kpis.net)}
          icon={PiggyBank}
          accent="sky"
          trend={{ value: `${savingsRate}% rate`, positive: savingsRate >= 0 }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Cash flow"
            subtitle="Income vs spending by month"
          />
          <CashFlowArea data={flow} />
        </Card>
        <Card>
          <CardHeader title="Where money goes" subtitle="Spending by category" />
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
            {accounts.map((a) => {
              const provider = PROVIDERS[a.provider];
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: provider.color }}
                    >
                      {provider.label.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {a.name}
                      </p>
                      <p className="text-xs text-slate-400">{a.mask}</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
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
    </Layout>
  );
}
