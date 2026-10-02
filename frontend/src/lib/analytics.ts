import type { Account, Category, Transaction } from "../types";
import { monthKey } from "./format";

/**
 * Calculation semantics follow FinLens (finlib/analysis.py):
 *  - income  = Σ credits, expense = Σ debits (transfers included), net = income − expense
 *  - savings rate = net / income
 *  - balance = the bank-printed running balance of the latest row when known,
 *    otherwise opening balance + Σ signed flows
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
}

/** Headline numbers for the given transaction set (FinLens `kpi_metrics`). */
export function computeKpis(
  transactions: Transaction[],
  accounts: Account[],
  _categories: Category[]
): Kpis {
  let income = 0;
  let spending = 0;
  let debits = 0;
  const months = new Set<string>();
  for (const t of transactions) {
    if (t.type === "credit") income += t.amount;
    else {
      spending += t.amount;
      debits += 1;
    }
    months.add(monthKey(t.date));
  }
  const net = income - spending;
  const balance = accounts.reduce(
    (s, a) => s + accountBalance(a, transactions),
    0
  );
  return {
    income,
    spending,
    net,
    balance,
    count: transactions.length,
    avgExpense: debits ? spending / debits : 0,
    savingsRate: income ? (net / income) * 100 : 0,
    months: months.size,
  };
}

/**
 * Current balance for a single account. Prefers the bank's own running balance
 * on the most recent row (authoritative); falls back to opening + flows.
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[]
): number {
  const mine = sortNewestFirst(
    transactions.filter((t) => t.accountId === account.id)
  );
  const latest = mine.find((t) => t.balanceAfter != null);
  if (latest) return latest.balanceAfter as number;
  const flow = mine.reduce((s, t) => s + signedAmount(t), 0);
  return account.openingBalance + flow;
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
