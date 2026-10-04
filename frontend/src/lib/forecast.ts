/**
 * Monte Carlo balance forecast — a port of FinLens `finlib/forecast.py`.
 *
 * Monthly data is short and noisy, so instead of fitting a fragile single
 * curve we bootstrap the historical monthly net cash-flow and simulate many
 * possible futures, reporting the P10 / P50 / P90 spread. This is honest
 * about uncertainty rather than implying false precision.
 */
import type { Account, Transaction } from "../types";
import { balanceSeries, flowRows, signedAmount, totalBalance } from "./analytics";
import { monthKey } from "./format";

export interface ForecastPoint {
  /** yyyy-mm */
  month: string;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

export interface HistoryPoint {
  month: string;
  balance: number;
}

export interface ForecastSummary {
  currentBalance: number;
  horizon: number;
  monthsHistory: number;
  monthlyNetMean: number;
  monthlyNetStd: number;
  projMedianEnd: number;
  projP10End: number;
  projP90End: number;
  /** Share of simulated paths that dip below zero at any point. */
  probNegative: number;
  /** FinLens flags < 3 months of history as unreliable. */
  reliable: boolean;
}

export interface Forecast {
  history: HistoryPoint[];
  forecast: ForecastPoint[];
  summary: ForecastSummary;
}

/** Deterministic 32-bit PRNG so the chart doesn't jitter between renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Linear-interpolated percentile (numpy default). */
function percentile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (q / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Net cash-flow (credits − debits) per calendar month, oldest → newest. */
export function monthlyNet(transactions: Transaction[]): Map<string, number> {
  const nets = new Map<string, number>();
  for (const t of transactions) {
    const key = monthKey(t.date);
    nets.set(key, (nets.get(key) ?? 0) + signedAmount(t));
  }
  return new Map([...nets.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function forecastBalance(
  transactions: Transaction[],
  accounts: Account[],
  opts: { horizon?: number; sims?: number; seed?: number; excludeTransfers?: boolean } = {}
): Forecast {
  const horizon = opts.horizon ?? 6;
  const sims = opts.sims ?? 2000;
  const seed = opts.seed ?? 42;
  const excludeTransfers = opts.excludeTransfers ?? false;

  const nets = monthlyNet(flowRows(transactions, excludeTransfers));
  const months = [...nets.keys()];
  const current = totalBalance(accounts, transactions, excludeTransfers);

  const empty: ForecastSummary = {
    currentBalance: current,
    horizon,
    monthsHistory: months.length,
    monthlyNetMean: 0,
    monthlyNetStd: 0,
    projMedianEnd: current,
    projP10End: current,
    projP90End: current,
    probNegative: 0,
    reliable: false,
  };
  if (months.length === 0) return { history: [], forecast: [], summary: empty };

  // Month-end balances rebuilt backwards from `current`, so the history line
  // and the forecast start from one point.
  const history: HistoryPoint[] = balanceSeries(transactions, accounts, excludeTransfers);

  const pool = Float64Array.from(months.map((m) => nets.get(m) ?? 0));
  const mean = pool.reduce((s, v) => s + v, 0) / pool.length;
  const variance =
    pool.length > 1
      ? pool.reduce((s, v) => s + (v - mean) ** 2, 0) / (pool.length - 1)
      : 0;

  const rand = mulberry32(seed);
  const endpoints = Array.from({ length: horizon }, () => new Float64Array(sims));
  let negative = 0;
  for (let s = 0; s < sims; s++) {
    let balance = current;
    let dipped = false;
    for (let h = 0; h < horizon; h++) {
      balance += pool[Math.floor(rand() * pool.length)];
      endpoints[h][s] = balance;
      if (balance < 0) dipped = true;
    }
    if (dipped) negative += 1;
  }

  const last = months[months.length - 1];
  const forecast: ForecastPoint[] = endpoints.map((col, i) => {
    const sorted = Float64Array.from(col).sort();
    return {
      month: addMonths(last, i + 1),
      p10: percentile(sorted, 10),
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      mean: col.reduce((s, v) => s + v, 0) / sims,
    };
  });

  const end = forecast[forecast.length - 1];
  return {
    history,
    forecast,
    summary: {
      ...empty,
      monthlyNetMean: mean,
      monthlyNetStd: Math.sqrt(variance),
      projMedianEnd: end.p50,
      projP10End: end.p10,
      projP90End: end.p90,
      probNegative: negative / sims,
      reliable: months.length >= 3,
    },
  };
}

export interface CategoryOutlook {
  categoryId: string;
  name: string;
  color: string;
  /** Trailing average per month. */
  expected: number;
  /** Last full month's actual, for comparison. */
  lastMonth: number;
}

export interface MonthOutlook {
  /** Months that fed the average. */
  basis: number;
  income: number;
  spending: number;
  net: number;
  categories: CategoryOutlook[];
}

/**
 * Next-month outlook: recency-weighted average of the trailing `window`
 * calendar months (most recent month weighs most). Partial current month is
 * excluded so a half-finished month doesn't drag the estimate down.
 */
export function nextMonthOutlook(
  transactions: Transaction[],
  categories: { id: string; name: string; color: string }[],
  window = 3,
  now = new Date()
): MonthOutlook {
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const byMonth = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = monthKey(t.date);
    if (key >= currentKey) continue;
    (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(t);
  }
  const months = [...byMonth.keys()].sort().slice(-window);
  if (months.length === 0)
    return { basis: 0, income: 0, spending: 0, net: 0, categories: [] };

  // Weights 1..n (oldest → newest), normalised.
  const weights = months.map((_, i) => i + 1);
  const wsum = weights.reduce((s, w) => s + w, 0);

  let income = 0;
  let spending = 0;
  const perCat = new Map<string, number>();
  const lastCat = new Map<string, number>();
  const lastMonth = months[months.length - 1];

  months.forEach((m, i) => {
    const w = weights[i] / wsum;
    for (const t of byMonth.get(m)!) {
      if (t.type === "credit") income += t.amount * w;
      else {
        spending += t.amount * w;
        perCat.set(t.categoryId, (perCat.get(t.categoryId) ?? 0) + t.amount * w);
        if (m === lastMonth)
          lastCat.set(t.categoryId, (lastCat.get(t.categoryId) ?? 0) + t.amount);
      }
    }
  });

  const byId = new Map(categories.map((c) => [c.id, c]));
  const cats: CategoryOutlook[] = [...perCat.entries()]
    .map(([id, expected]) => ({
      categoryId: id,
      name: byId.get(id)?.name ?? id,
      color: byId.get(id)?.color ?? "#90A4AE",
      expected,
      lastMonth: lastCat.get(id) ?? 0,
    }))
    .sort((a, b) => b.expected - a.expected);

  return {
    basis: months.length,
    income,
    spending,
    net: income - spending,
    categories: cats,
  };
}
