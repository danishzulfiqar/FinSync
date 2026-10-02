/**
 * Maps backend DTOs (lib/api) to the frontend domain types (types.ts) and
 * provides a static category catalog derived from the backend keyword rules.
 *
 * Categories are a free-text string on the backend today; a user-editable,
 * persisted category system lands in a later slice. Until then this catalog
 * gives every known category a stable id, display group and colour so the
 * charts and ledger render consistently.
 */
import type {
  AccountOut,
  AccountCreatePayload,
  TransactionOut,
} from "./api";
import type {
  Account,
  AccountType,
  Category,
  Provider,
  Transaction,
} from "../types";
import { PROVIDERS } from "../types";

interface CatalogEntry {
  name: string;
  group: Category["group"];
  color: string;
}

/**
 * Mirrors FinLens' CATEGORY_COLORS and its accounting model: every credit is
 * income and every debit is an expense, so bank transfers count toward the
 * totals (an IBFT/Raast payment is money that genuinely left the account).
 */
const CATALOG: CatalogEntry[] = [
  // Income (credits)
  { name: "Salary", group: "income", color: "#2E7D32" },
  { name: "Profit & Returns", group: "income", color: "#43A047" },
  { name: "Refunds", group: "income", color: "#66BB6A" },
  { name: "Transfers In", group: "income", color: "#81C784" },
  { name: "Other Income", group: "income", color: "#A5D6A7" },
  // Expenses (debits)
  { name: "Bills & Utilities", group: "spending", color: "#1F4E79" },
  { name: "Telecom & Mobile", group: "spending", color: "#2E75B6" },
  { name: "Food & Dining", group: "spending", color: "#E64A19" },
  { name: "Groceries & Shopping", group: "spending", color: "#F57C00" },
  { name: "Fuel & Transport", group: "spending", color: "#6D4C41" },
  { name: "Cash & ATM", group: "spending", color: "#8E24AA" },
  { name: "Transfers Out", group: "spending", color: "#5E35B1" },
  { name: "Fees & Charges", group: "spending", color: "#C62828" },
  { name: "Health", group: "spending", color: "#00838F" },
  { name: "Education", group: "spending", color: "#3949AB" },
  { name: "Subscriptions", group: "spending", color: "#AD1457" },
  { name: "Other Expense", group: "spending", color: "#90A4AE" },
];

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  );
}

const BY_SLUG = new Map<string, CatalogEntry>(
  CATALOG.map((c) => [slugify(c.name), c])
);

/** Full category list (catalog + any extra names found in the data). */
export function buildCategories(extraNames: Iterable<string>): Category[] {
  const seen = new Set(BY_SLUG.keys());
  const extras: Category[] = [];
  for (const name of extraNames) {
    const id = slugify(name);
    if (seen.has(id)) continue;
    seen.add(id);
    extras.push({ id, name, group: "spending", color: "#90A4AE", budget: 0 });
  }
  const base = CATALOG.map<Category>((c) => ({
    id: slugify(c.name),
    name: c.name,
    group: c.group,
    color: c.color,
    budget: 0,
  }));
  return [...base, ...extras];
}

/** Resolve the category id for a transaction, honouring credit/debit default. */
export function categoryIdFor(
  name: string | null,
  type: Transaction["type"]
): string {
  const resolved =
    name ?? (type === "credit" ? "Other Income" : "Other Expense");
  return slugify(resolved);
}

function normalizeProvider(raw: string): Provider {
  const key = raw.toLowerCase();
  return (key in PROVIDERS ? key : "abl") as Provider;
}

function mapSource(sourceType: string): Transaction["source"] {
  if (sourceType === "statement") return "statement";
  if (sourceType === "email") return "gmail";
  return "manual";
}

/** Canonical UTC ISO string so slicing yyyy-mm / yyyy-mm-dd is timezone-safe. */
function toUtcIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

export function mapAccount(a: AccountOut): Account {
  const provider = normalizeProvider(a.provider);
  return {
    id: String(a.id),
    name: a.name,
    provider,
    type: (a.type as AccountType) ?? "current",
    mask: a.mask ?? "•••• 0000",
    openingBalance: Number(a.opening_balance) || 0,
    currency: a.currency || "PKR",
    color: a.color || PROVIDERS[provider].color,
  };
}

export function mapTransaction(t: TransactionOut): Transaction {
  const type = t.transaction_type;
  const name =
    t.category ?? (type === "credit" ? "Other Income" : "Other Expense");
  return {
    id: String(t.id),
    accountId: t.account_id != null ? String(t.account_id) : "",
    date: toUtcIso(t.transaction_datetime ?? t.created_at),
    description: t.description || t.merchant || t.reference || "Transaction",
    merchant: t.merchant || t.provider || "",
    amount: Math.abs(Number(t.amount)) || 0,
    type,
    categoryId: slugify(name),
    source: mapSource(t.source_type),
    balanceAfter:
      t.balance_after != null && t.balance_after !== ""
        ? Number(t.balance_after)
        : null,
  };
}

/** Category id -> backend category name (for persisting inline edits). */
export function categoryNameFor(
  id: string,
  categories: Category[]
): string {
  const match = categories.find((c) => c.id === id);
  if (match) return match.name;
  const entry = BY_SLUG.get(id);
  return entry ? entry.name : id;
}

export function toAccountPayload(input: {
  name: string;
  provider: string;
  type: string;
  mask: string;
  openingBalance: number;
  color: string;
}): AccountCreatePayload {
  return {
    name: input.name,
    provider: input.provider,
    type: input.type,
    mask: input.mask,
    opening_balance: input.openingBalance,
    currency: "PKR",
    color: input.color,
  };
}
