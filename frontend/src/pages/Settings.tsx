import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  EyeOff,
  CalendarRange,
  LineChart,
  ShieldCheck,
  ChevronRight,
  Check,
} from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card, CardHeader } from "../components/ui/Card";
import { Switch } from "../components/ui/Switch";
import { Select } from "../components/ui/Select";
import { RangePills } from "../components/ui/RangePills";
import { GmailSyncCard } from "../components/sync/GmailSyncCard";
import { useAppData, type Settings as SettingsShape } from "../context/AppDataContext";
import { ApiError } from "../lib/api";
import { formatCurrency } from "../lib/format";

export function Settings() {
  const { settings, updateSettings, transactions, accounts } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  async function save(patch: Partial<SettingsShape>, key: string) {
    setError(null);
    try {
      await updateSettings(patch);
      setSavedKey(key);
      window.setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that setting.");
    }
  }

  const transferLegs = transactions.filter((t) => t.transfer);
  const transferTotal = transferLegs
    .filter((t) => t.type === "debit")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <Layout title="Settings" subtitle="Tune how FinSync reads your money">
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Calculations"
              subtitle="These change how your income, expense and total balance are worked out"
            />
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <SettingRow
                icon={ArrowLeftRight}
                title="Ignore transfers between my accounts"
                description={
                  accounts.length < 2
                    ? "Needs at least two accounts. Money you move between your own accounts will stop counting as income and expense."
                    : `Money you move between your own accounts stops counting as income and expense, and your total balance is worked out as if it never moved. ${
                        transferLegs.length
                          ? `Found ${transferLegs.length} transfer${transferLegs.length === 1 ? "" : "s"} worth ${formatCurrency(transferTotal)}.`
                          : "No transfers found yet."
                      }`
                }
                saved={savedKey === "transfers"}
                control={
                  <Switch
                    label="Ignore internal transfers"
                    checked={settings.excludeInternalTransfers}
                    onChange={(v) => void save({ excludeInternalTransfers: v }, "transfers")}
                  />
                }
              >
                {settings.excludeInternalTransfers && (
                  <label className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    Match window
                    <Select
                      value={settings.transferWindowDays}
                      onChange={(e) =>
                        void save({ transferWindowDays: Number(e.target.value) }, "transfers")
                      }
                      compact
                      wrapperClassName="w-auto"
                      aria-label="Transfer match window"
                    >
                      {[0, 1, 2, 3, 5, 7, 14].map((d) => (
                        <option key={d} value={d}>
                          {d === 0 ? "Same day" : `±${d} day${d === 1 ? "" : "s"}`}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </SettingRow>

              <SettingRow
                icon={CalendarRange}
                title="Default time range"
                description="The period the Overview and Categories pages open on."
                saved={savedKey === "range"}
                control={
                  <RangePills
                    value={settings.defaultRange}
                    onChange={(r) => void save({ defaultRange: r }, "range")}
                  />
                }
              />

              <SettingRow
                icon={LineChart}
                title="Forecast horizon"
                description="How far ahead Predictions projects your balance."
                saved={savedKey === "horizon"}
                control={
                  <div className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
                    {[3, 6, 12, 24].map((h) => (
                      <button
                        key={h}
                        onClick={() => void save({ forecastHorizon: h }, "horizon")}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                          settings.forecastHorizon === h
                            ? "bg-brand-600 text-white"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        {h}mo
                      </button>
                    ))}
                  </div>
                }
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Display" subtitle="How numbers appear on screen" />
            <SettingRow
              icon={EyeOff}
              title="Privacy mode"
              description="Mask every amount. Handy when sharing your screen or in public."
              saved={savedKey === "privacy"}
              control={
                <Switch
                  label="Privacy mode"
                  checked={settings.privacyMode}
                  onChange={(v) => void save({ privacyMode: v }, "privacy")}
                />
              }
            />
          </Card>
        </div>

        <div className="space-y-4">
          <GmailSyncCard />

          <Link
            to="/profile"
            className="card flex items-center justify-between gap-3 p-4 transition hover:border-brand-300 dark:hover:border-brand-500/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Account & security
                </p>
                <p className="text-xs text-slate-400">Name, email and password</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        </div>
      </div>
    </Layout>
  );
}

function SettingRow({
  icon: Icon,
  title,
  description,
  control,
  saved,
  children,
}: {
  icon: typeof ArrowLeftRight;
  title: string;
  description: string;
  control: ReactNode;
  saved?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {title}
              {saved && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 animate-fade-in dark:text-emerald-400">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>
          </div>
        </div>
        <div className="shrink-0 sm:pl-4">{control}</div>
      </div>
      {children && <div className="pl-12">{children}</div>}
    </div>
  );
}
