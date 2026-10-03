import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Target,
  Wallet,
  Settings as SettingsIcon,
} from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card, CardHeader } from "../components/ui/Card";
import { ChartCardSkeleton, KpiCardSkeleton } from "../components/ui/Skeleton";
import { ForecastChart } from "../components/charts/ForecastChart";
import { useAppData } from "../context/AppDataContext";
import { forecastBalance, nextMonthOutlook } from "../lib/forecast";
import { cn, formatCurrency, formatMonth, formatPercent } from "../lib/format";

export function Predictions() {
  const { transactions, flows, accounts, categories, settings, updateSettings, ready } =
    useAppData();
  const horizon = settings.forecastHorizon;

  const fc = useMemo(
    () => forecastBalance(transactions, accounts, { horizon }),
    [transactions, accounts, horizon]
  );
  const outlook = useMemo(() => nextMonthOutlook(flows, categories), [flows, categories]);
  const s = fc.summary;
  const endMonth = fc.forecast[fc.forecast.length - 1]?.month;
  const change = s.projMedianEnd - s.currentBalance;

  if (!ready) {
    return (
      <Layout title="Predictions" subtitle="Where your balance is likely heading">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-4">
          <ChartCardSkeleton height={320} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Predictions" subtitle="Where your balance is likely heading">
      {!s.reliable && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {s.monthsHistory === 0
              ? "Import a statement or sync your inbox to start forecasting."
              : `Only ${s.monthsHistory} month${s.monthsHistory === 1 ? "" : "s"} of history — treat this as a rough sketch until there are at least three.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Wallet}
          label="Balance today"
          value={formatCurrency(s.currentBalance)}
          hint={`${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
          accent="sky"
        />
        <Metric
          icon={Target}
          label={endMonth ? `Likely by ${formatMonth(endMonth)}` : "Projected"}
          value={formatCurrency(s.projMedianEnd)}
          hint={
            s.currentBalance
              ? `${formatCurrency(change, { signed: true })} · ${formatPercent((change / Math.abs(s.currentBalance)) * 100)}`
              : "—"
          }
          tone={change >= 0 ? "good" : "bad"}
          accent="brand"
        />
        <Metric
          icon={Activity}
          label="Typical month"
          value={formatCurrency(s.monthlyNetMean, { signed: true })}
          hint={`± ${formatCurrency(s.monthlyNetStd)} swing`}
          tone={s.monthlyNetMean >= 0 ? "good" : "bad"}
          accent={s.monthlyNetMean >= 0 ? "green" : "red"}
        />
        <Metric
          icon={AlertTriangle}
          label="Risk of going negative"
          value={`${Math.round(s.probNegative * 100)}%`}
          hint={`within ${horizon} months`}
          tone={s.probNegative > 0.25 ? "bad" : s.probNegative > 0.05 ? "warn" : "good"}
          accent={s.probNegative > 0.25 ? "red" : "green"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Balance projection"
          subtitle={`${s.monthsHistory} months of history · ${horizon} months ahead · 2,000 simulated futures`}
          action={
            <div className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
              {[3, 6, 12, 24].map((h) => (
                <button
                  key={h}
                  onClick={() => void updateSettings({ forecastHorizon: h })}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                    horizon === h
                      ? "bg-brand-600 text-white"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  )}
                >
                  {h}mo
                </button>
              ))}
            </div>
          }
        />
        {fc.history.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            Nothing to project yet.
          </p>
        ) : (
          <>
            <ForecastChart data={fc} />
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400">
              <Legend swatch="bg-sky-500" label="Actual month-end balance" />
              <Legend swatch="bg-brand-500" label="Most likely path (median)" dashed />
              <Legend swatch="bg-brand-500/30" label="80% of outcomes (P10 – P90)" />
            </div>
          </>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Next month outlook"
            subtitle={
              outlook.basis
                ? `Weighted from your last ${outlook.basis} full month${outlook.basis === 1 ? "" : "s"}`
                : "Needs one full month of data"
            }
          />
          {outlook.basis === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Not enough history yet.</p>
          ) : (
            <dl className="space-y-3">
              <OutlookRow label="Expected income" value={outlook.income} tone="good" />
              <OutlookRow label="Expected spending" value={outlook.spending} tone="bad" />
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <OutlookRow
                  label="Expected net"
                  value={outlook.net}
                  signed
                  tone={outlook.net >= 0 ? "good" : "bad"}
                  strong
                />
              </div>
            </dl>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Where next month's money goes"
            subtitle="Expected spend per category vs last month"
            action={
              <Link
                to="/settings"
                className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                <SettingsIcon className="h-3.5 w-3.5" /> Tune
              </Link>
            }
          />
          {outlook.categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No spending history yet.</p>
          ) : (
            <ul className="space-y-3">
              {outlook.categories.slice(0, 8).map((c) => {
                const max = outlook.categories[0].expected || 1;
                const diff = c.lastMonth ? ((c.expected - c.lastMonth) / c.lastMonth) * 100 : null;
                return (
                  <li key={c.categoryId}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                        <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                          {formatCurrency(c.expected)}
                        </span>
                        {diff != null && Number.isFinite(diff) && (
                          <span
                            className={cn(
                              "hidden text-xs tabular-nums sm:inline",
                              diff > 0 ? "text-rose-500" : "text-emerald-500"
                            )}
                          >
                            {formatPercent(diff, 0)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(c.expected / max) * 100}%`, backgroundColor: c.color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        How it works: each of your past months' net cash-flow goes into a hat. We draw {horizon} months
        at random 2,000 times and add them to today's balance. The band shows where 80% of those futures
        land — it is a range of plausible outcomes, not a promise.
      </p>
    </Layout>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  accent = "brand",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint: string;
  tone?: "good" | "bad" | "warn";
  accent?: "brand" | "green" | "red" | "sky";
}) {
  const accents = {
    brand: "bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    red: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
    sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  } as const;
  return (
    <div className="card p-5 animate-fade-in">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", accents[accent])}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 whitespace-nowrap text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-1 text-xs tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          !tone && "text-slate-400"
        )}
      >
        {hint}
      </p>
    </div>
  );
}

function OutlookRow({
  label,
  value,
  tone,
  signed,
  strong,
}: {
  label: string;
  value: number;
  tone: "good" | "bad";
  signed?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-sm", strong ? "font-semibold text-slate-700 dark:text-slate-200" : "text-slate-500")}>
        {label}
      </dt>
      <dd
        className={cn(
          "whitespace-nowrap tabular-nums",
          strong ? "text-lg font-bold" : "text-sm font-semibold",
          tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        )}
      >
        {formatCurrency(value, { signed })}
      </dd>
    </div>
  );
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("h-1 w-5 rounded-full", swatch)}
        style={dashed ? { backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 7px)", backgroundColor: "transparent", color: "#8b5cf6" } : undefined}
      />
      {label}
    </span>
  );
}
