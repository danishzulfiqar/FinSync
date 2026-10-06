import type { Account, Category, Transaction } from "../types";
import type { TimeRange } from "./api";
import { monthKey } from "./format";

/**
 * Calculation semantics follow FinLens (finlib/analysis.py):
 *  - income  = Σ credits, expense = Σ debits (transfers included), net = income − expense
 *  - savings rate = net / income
 *  - balance = the bank-printed running balance of the latest row when known,
 *    otherwise opening balance + Σ signed flows
 *
 * On top of that, FinSync can optionally ignore *internal transfers* (money
 * moving between the user's own accounts) — see `detectInternalTransfers`.
 * When on, they drop out of income/expense and the combined total balance is
 * computed as if the money had never moved (`totalBalance`). Per-account
 * balances are always the bank's own figure.
 */

export function signedAmount(t: Transaction): number {
  return t.type === "credit" ? t.amount : -t.amount;
}

/** Newest first; ties on the same day broken by insertion order (id). */
export function sortNewestFirst(rows: Transaction[]): Transaction[] {
  return [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id)
  );
}

// --------------------------------------------------------------- transfers

const DAY_MS = 86_400_000;

/**
 * Categories that can never be a leg of an own-account transfer: cash leaving
 * via an ATM, a card purchase, a bill, a salary credit. Only generic / transfer
 * categories remain eligible, which keeps round-number coincidences (two
 * unrelated Rs 20,000 movements) from being paired.
 */
const NON_TRANSFER_CATEGORIES = new Set([
  "cash-atm",
  "food-dining",
  "groceries-shopping",
  "fuel-transport",
  "bills-utilities",
  "telecom-mobile",
  "subscriptions",
  "health",
  "education",
  "fees-charges",
  "salary",
  "profit-returns",
  "refunds",
]);

/**
 * Find debit/credit pairs that are really one transfer between two of the
 * user's own accounts: same amount, different accounts, dated within
 * `windowDays` of each other, and neither leg in a category that rules out a
 * transfer. Two matching passes per amount bucket — first legs whose text
 * shares a distinctive word (the account holder's name shows on both sides
 * of a self-transfer), then legs that are both generic or self-named. A
 * payment to a third party is never paired.
 *
 * A final self-name pass flags any lone transfer leg whose only named party is
 * the account holder ("RAAST P2P Danish Zulfiqar", "Received from Danish
 * Zulfiqar") — money moving to or from the user's own accounts even when the
 * opposite leg lives in an account FinSync doesn't track, so no pair exists to
 * match. Returns the ids of every flagged leg.
 */
export function detectInternalTransfers(
  transactions: Transaction[],
  windowDays = 3,
  selfName = ""
): Set<string> {
  const matched = new Set<string>();
  const buckets = new Map<string, { debits: Transaction[]; credits: Transaction[] }>();
  for (const t of transactions) {
    if (!t.accountId || t.amount <= 0) continue;
    if (NON_TRANSFER_CATEGORIES.has(t.categoryId)) continue;
    const key = t.amount.toFixed(2);
    const b = buckets.get(key) ?? { debits: [], credits: [] };
    (t.type === "debit" ? b.debits : b.credits).push(t);
    buckets.set(key, b);
  }
  const self = new Set(
    selfName.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3)
  );
  const window = windowDays * DAY_MS;
  for (const { debits, credits } of buckets.values()) {
    if (debits.length === 0 || credits.length === 0) continue;
    const free = credits.map((c) => ({ c, ts: new Date(c.date).getTime(), words: words(c) }));
    for (const requireOverlap of [true, false]) {
      for (const d of debits) {
        if (matched.has(d.id)) continue;
        const dts = new Date(d.date).getTime();
        const dWords = words(d);
        if (!requireOverlap && !selfOrGeneric(dWords, self)) continue;
        let best = -1;
        let bestGap = Infinity;
        for (let i = 0; i < free.length; i++) {
          const { c, ts, words: cWords } = free[i];
          if (c.accountId === d.accountId) continue;
          const gap = Math.abs(ts - dts);
          if (gap > window || gap >= bestGap) continue;
          if (requireOverlap ? !overlaps(dWords, cWords) : !selfOrGeneric(cWords, self)) continue;
          best = i;
          bestGap = gap;
        }
        if (best >= 0) {
          matched.add(d.id);
          matched.add(free[best].c.id);
          free.splice(best, 1);
        }
      }
    }
  }

  // Self-name pass: a transfer whose only named party is the account holder is
  // money moving between their own accounts, even when the opposite leg lives
  // in an account FinSync doesn't track (so there is no pair to match). Require
  // every name token to be present so a relative who shares a surname, or the
  // word "Danish" inside an unrelated merchant name, is never swept in.
  if (self.size > 0) {
    for (const t of transactions) {
      if (matched.has(t.id) || !t.accountId || t.amount <= 0) continue;
      if (NON_TRANSFER_CATEGORIES.has(t.categoryId)) continue;
      const toks = new Set(
        `${t.description} ${t.merchant}`.toLowerCase().split(/[^a-z]+/)
      );
      let all = true;
      for (const name of self) {
        if (!toks.has(name)) {
          all = false;
          break;
        }
      }
      if (all) matched.add(t.id);
    }
  }

  return matched;
}

const STOP = new Set([
  "raast", "p2p", "ibft", "transfer", "funds", "fund", "money", "received", "sent",
  "from", "nayapay", "myabl", "inter", "bank", "abl", "hbl", "online", "mobile",
  "internet", "banking", "account", "payment", "transaction", "wallet", "konnect",
]);

/** Distinctive lowercase tokens (≥4 chars, not a generic transfer word). */
function words(t: Transaction): Set<string> {
  const out = new Set<string>();
  for (const w of `${t.description} ${t.merchant}`.toLowerCase().split(/[^a-z]+/)) {
    if (w.length >= 4 && !STOP.has(w)) out.add(w);
  }
  return out;
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) if (b.has(w)) return true;
  return false;
}

/** No distinctive word other than the account holder's own name. */
function selfOrGeneric(ws: Set<string>, self: Set<string>): boolean {
  for (const w of ws) if (!self.has(w)) return false;
  return true;
}

/** Rows that count toward income/expense under the given settings. */
export function flowRows(
  transactions: Transaction[],
  excludeTransfers: boolean
): Transaction[] {
  return excludeTransfers ? transactions.filter((t) => !t.transfer) : transactions;
}

// ------------------------------------------------------------- time ranges

export const RANGE_MONTHS: Record<TimeRange, number | null> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
  all: null,
};

export const RANGE_LABELS: Record<TimeRange, string> = {
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
  all: "All",
};

/** First day (UTC) of the calendar month `n-1` months before `now`'s month. */
export function rangeStart(range: TimeRange, now = new Date()): string | null {
  const n = RANGE_MONTHS[range];
  if (n == null) return null;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1));
  return d.toISOString();
}

/** Calendar-month aligned window ending now (so monthly charts have no partial first bar). */
export function inRange(
  transactions: Transaction[],
  range: TimeRange,
  now = new Date()
): Transaction[] {
  const start = rangeStart(range, now);
  return start ? transactions.filter((t) => t.date >= start) : transactions;
}

// -------------------------------------------------------------------- KPIs

export interface Kpis {
  income: number;
  spending: number;
  net: number;
  balance: number;
  count: number;
  avgExpense: number;
  /** Percentage, e.g. 23.4. 0 when there is no income. */
  savingsRate: number;
  months: number;
  /** Rows hidden from the flow totals as internal transfers. */
  transfersHidden: number;
}

/**
 * Headline numbers (FinLens `kpi_metrics`). `flows` is the (possibly
 * range-filtered, transfer-filtered) set that drives income/expense;
 * `all` is the complete ledger used for authoritative balances.
 */
export function computeKpis(
  flows: Transaction[],
  accounts: Account[],
  all: Transaction[] = flows,
  excludeTransfers = false
): Kpis {
  let income = 0;
  let spending = 0;
  let debits = 0;
  const months = new Set<string>();
  for (const t of flows) {
    if (t.type === "credit") income += t.amount;
    else {
      spending += t.amount;
      debits += 1;
    }
    months.add(monthKey(t.date));
  }
  const net = income - spending;
  const balance = totalBalance(accounts, all, excludeTransfers);
  return {
    income,
    spending,
    net,
    balance,
    count: flows.length,
    avgExpense: debits ? spending / debits : 0,
    savingsRate: income ? (net / income) * 100 : 0,
    months: months.size,
    transfersHidden: all.length - flows.length,
  };
}

/**
 * Current balance for a single account. Statements are authoritative, so this
 * anchors on the running balance of the most recent *statement* row (its closing
 * balance), then applies the signed flows of every transaction dated strictly
 * after that row (e.g. email/SMS alerts that arrived since the statement). Any
 * row at or before the anchor instant is already reflected in its balance, so it
 * is never re-added. When the account has no statement yet it falls back to any
 * row carrying a running balance, then to opening + all flows.
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[]
): number {
  const mine = sortNewestFirst(
    transactions.filter((t) => t.accountId === account.id)
  );
  const anchor =
    mine.find((t) => t.source === "statement" && t.balanceAfter != null) ??
    mine.find((t) => t.balanceAfter != null);
  if (!anchor) {
    const flow = mine.reduce((s, t) => s + signedAmount(t), 0);
    return account.openingBalance + flow;
  }
  const flow = mine
    .filter((t) => t.date > anchor.date)
    .reduce((s, t) => s + signedAmount(t), 0);
  return (anchor.balanceAfter as number) + flow;
}

/** Net signed amount of every flagged transfer leg. */
export function transferFlow(transactions: Transaction[]): number {
  let sum = 0;
  for (const t of transactions) if (t.transfer) sum += signedAmount(t);
  return sum;
}

/**
 * Combined balance across accounts. With `excludeTransfers` the total is what
 * it would be had money never moved between the user's own accounts: a pair
 * of legs between two tracked accounts cancels out, while a lone leg whose
 * other side is an account FinSync doesn't track shifts the total — money
 * sent to yourself is still yours, money received from yourself was never
 * income. Per-account figures are untouched; this only adjusts the sum.
 */
export function totalBalance(
  accounts: Account[],
  transactions: Transaction[],
  excludeTransfers = false
): number {
  const bank = accounts.reduce((s, a) => s + accountBalance(a, transactions), 0);
  return excludeTransfers ? bank - transferFlow(transactions) : bank;
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string;
  value: number;
  /** Share of the total, in percent. */
  share: number;
  transactions: number;
  budget: number;
}

/** Totals per category for one flow direction (FinLens `category_breakdown`). */
export function breakdownByCategory(
  transactions: Transaction[],
  categories: Category[],
  kind: "expense" | "income"
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const wanted = kind === "expense" ? "debit" : "credit";
  const totals = new Map<string, { value: number; count: number }>();
  for (const t of transactions) {
    if (t.type !== wanted || t.amount <= 0) continue;
    const acc = totals.get(t.categoryId) ?? { value: 0, count: 0 };
    acc.value += t.amount;
    acc.count += 1;
    totals.set(t.categoryId, acc);
  }
  const grand = [...totals.values()].reduce((s, v) => s + v.value, 0);
  return [...totals.entries()]
    .map(([categoryId, { value, count }]) => {
      const cat = byId.get(categoryId);
      return {
        categoryId,
        name: cat?.name ?? categoryId,
        color: cat?.color ?? "#90A4AE",
        value,
        share: grand ? (value / grand) * 100 : 0,
        transactions: count,
        budget: cat?.budget ?? 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/** Spending grouped by category (debits only). */
export function spendingByCategory(
  transactions: Transaction[],
  categories: Category[]
): CategorySlice[] {
  return breakdownByCategory(transactions, categories, "expense");
}

/** Income grouped by category (credits only). */
export function incomeByCategory(
  transactions: Transaction[],
  categories: Category[]
): CategorySlice[] {
  return breakdownByCategory(transactions, categories, "income");
}

export interface MonthPoint {
  month: string; // yyyy-mm
  income: number;
  spending: number;
  net: number;
  transactions: number;
  /** Bank balance on the last row of the month, when known. */
  closingBalance: number | null;
}

/** Per-month income/expense/net (FinLens `monthly_summary`), chronological. */
export function cashFlowByMonth(
  transactions: Transaction[],
  _categories: Category[]
): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  // Walk oldest → newest so the last balance seen per month is the closing one.
  for (const t of sortNewestFirst(transactions).reverse()) {
    const key = monthKey(t.date);
    const point = map.get(key) ?? {
      month: key,
      income: 0,
      spending: 0,
      net: 0,
      transactions: 0,
      closingBalance: null,
    };
    if (t.type === "credit") point.income += t.amount;
    else point.spending += t.amount;
    point.net = point.income - point.spending;
    point.transactions += 1;
    if (t.balanceAfter != null) point.closingBalance = t.balanceAfter;
    map.set(key, point);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Largest debits first (FinLens "Top 10 expenses"). */
export function topExpenses(transactions: Transaction[], n = 10): Transaction[] {
  return transactions
    .filter((t) => t.type === "debit" && t.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

// ---------------------------------------------------------- balance series

export interface BalancePoint {
  month: string; // yyyy-mm
  balance: number;
}

/**
 * Combined month-end balance per month, rebuilt backwards from today's
 * authoritative total so the series always terminates at the real balance
 * (FinLens `forecast_balance` history). With `excludeTransfers` both the
 * endpoint and the monthly steps leave internal transfers out.
 */
export function balanceSeries(
  transactions: Transaction[],
  accounts: Account[],
  excludeTransfers = false
): BalancePoint[] {
  const nets = new Map<string, number>();
  for (const t of flowRows(transactions, excludeTransfers)) {
    const k = monthKey(t.date);
    nets.set(k, (nets.get(k) ?? 0) + signedAmount(t));
  }
  const months = [...nets.keys()].sort();
  let running = totalBalance(accounts, transactions, excludeTransfers);
  const out: BalancePoint[] = [];
  for (let i = months.length - 1; i >= 0; i--) {
    out.unshift({ month: months[i], balance: running });
    running -= nets.get(months[i]) ?? 0;
  }
  return out;
}

// ----------------------------------------------------------- period deltas

export interface Delta {
  current: number;
  previous: number;
  /** Percent change; null when the previous value is 0. */
  pct: number | null;
  /** yyyy-mm of the comparison month. */
  versus: string;
}

function delta(current: number, previous: number, versus: string): Delta {
  return {
    current,
    previous,
    pct: previous ? ((current - previous) / Math.abs(previous)) * 100 : null,
    versus,
  };
}

export interface PeriodDeltas {
  income: Delta;
  spending: Delta;
  net: Delta;
  balance: Delta;
}

/**
 * Month-over-month change, like a market "24h change" chip. Flow metrics
 * compare the last two *complete* months (a 3-day-old month would otherwise
 * read as a 90% collapse); balance compares today against the previous
 * month-end. Returns null with fewer than two months of data.
 */
export function periodDeltas(
  flows: Transaction[],
  all: Transaction[],
  accounts: Account[],
  excludeTransfers = false,
  now = new Date()
): PeriodDeltas | null {
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const months = cashFlowByMonth(flows, []).filter((m) => m.month < currentKey);
  const balances = balanceSeries(all, accounts, excludeTransfers);
  if (months.length < 2 || balances.length < 2) return null;
  const [prev, cur] = months.slice(-2);
  const [bPrev, bCur] = balances.slice(-2);
  return {
    income: delta(cur.income, prev.income, prev.month),
    spending: delta(cur.spending, prev.spending, prev.month),
    net: delta(cur.net, prev.net, prev.month),
    balance: delta(bCur.balance, bPrev.balance, bPrev.month),
  };
}

// --------------------------------------------------------- account shares

export interface AccountShare {
  account: Account;
  balance: number;
  /** Share of the positive total, in percent. */
  share: number;
  transactions: number;
}

export interface AccountShares {
  rows: AccountShare[];
  /**
   * Money that left tracked accounts for ones FinSync doesn't know about
   * (net), when internal transfers are ignored. 0 otherwise.
   */
  elsewhere: number;
  /** Share of the total held `elsewhere`, in percent. */
  elsewhereShare: number;
}

/** Per-account balance and share of the total (a "dominance" bar). */
export function accountShares(
  accounts: Account[],
  transactions: Transaction[],
  excludeTransfers = false
): AccountShares {
  const rows = accounts.map((account) => ({
    account,
    balance: accountBalance(account, transactions),
    transactions: transactions.filter((t) => t.accountId === account.id).length,
    share: 0,
  }));
  const elsewhere = excludeTransfers ? -transferFlow(transactions) : 0;
  const total =
    rows.reduce((s, r) => s + Math.max(r.balance, 0), 0) + Math.max(elsewhere, 0);
  for (const r of rows) r.share = total ? (Math.max(r.balance, 0) / total) * 100 : 0;
  return {
    rows: rows.sort((a, b) => b.balance - a.balance),
    elsewhere,
    elsewhereShare: total ? (Math.max(elsewhere, 0) / total) * 100 : 0,
  };
}
