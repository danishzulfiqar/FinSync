import type { Account, Category, Transaction } from "../types";
import { monthKey } from "./format";

export function signedAmount(t: Transaction): number {
  return t.type === "credit" ? t.amount : -t.amount;
}

export interface Kpis {
  income: number;
  spending: number;
  net: number;
  balance: number;
}

/** Totals across the provided transactions. `spending` excludes transfers. */
export function computeKpis(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[]
): Kpis {
  const catGroup = new Map(categories.map((c) => [c.id, c.group]));
  let income = 0;
  let spending = 0;
  for (const t of transactions) {
    const group = catGroup.get(t.categoryId);
    if (group === "transfer") continue;
    if (t.type === "credit") income += t.amount;
    else spending += t.amount;
  }
  const opening = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const flow = transactions.reduce((s, t) => s + signedAmount(t), 0);
  return { income, spending, net: income - spending, balance: opening + flow };
}

/** Current balance for a single account (opening + its own flows). */
export function accountBalance(
  account: Account,
  transactions: Transaction[]
): number {
  const flow = transactions
    .filter((t) => t.accountId === account.id)
    .reduce((s, t) => s + signedAmount(t), 0);
  return account.openingBalance + flow;
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string;
  value: number;
  budget: number;
}

/** Spending grouped by category (debits only, transfers excluded). */
export function spendingByCategory(
  transactions: Transaction[],
  categories: Category[]
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const t of transactions) {
    const cat = byId.get(t.categoryId);
    if (!cat || cat.group !== "spending" || t.type !== "debit") continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .map(([categoryId, value]) => {
      const cat = byId.get(categoryId)!;
      return {
        categoryId,
        name: cat.name,
        color: cat.color,
        value,
        budget: cat.budget,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export interface MonthPoint {
  month: string; // yyyy-mm
  income: number;
  spending: number;
  net: number;
}

/** Income vs spending per month (transfers excluded), sorted chronologically. */
export function cashFlowByMonth(
  transactions: Transaction[],
  categories: Category[]
): MonthPoint[] {
  const catGroup = new Map(categories.map((c) => [c.id, c.group]));
  const map = new Map<string, MonthPoint>();
  for (const t of transactions) {
    if (catGroup.get(t.categoryId) === "transfer") continue;
    const key = monthKey(t.date);
    const point =
      map.get(key) ?? { month: key, income: 0, spending: 0, net: 0 };
    if (t.type === "credit") point.income += t.amount;
    else point.spending += t.amount;
    point.net = point.income - point.spending;
    map.set(key, point);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
