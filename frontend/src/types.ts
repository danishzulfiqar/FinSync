export type Provider = "abl" | "hbl" | "nayapay";

export type TransactionType = "credit" | "debit";

export type AccountType = "current" | "savings" | "wallet";

export interface Account {
  id: string;
  name: string;
  provider: Provider;
  type: AccountType;
  /** Last 4 digits / masked identifier, e.g. "•••• 4821". */
  mask: string;
  openingBalance: number;
  currency: string; // "PKR"
  color: string; // tailwind-ish hex for accents
}

export interface Transaction {
  id: string;
  accountId: string;
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  description: string;
  merchant: string;
  /** Always a positive magnitude; direction is in `type`. */
  amount: number;
  type: TransactionType;
  categoryId: string;
  /** Where the record came from. */
  source: "gmail" | "statement" | "manual";
  /** Bank-printed running balance after this row (statements only). */
  balanceAfter?: number | null;
  pending?: boolean;
}

export interface Category {
  id: string;
  name: string;
  group: "income" | "spending" | "transfer";
  color: string;
  /** Monthly budget in PKR (0 = untracked). */
  budget: number;
}

export interface ProviderMeta {
  key: Provider;
  label: string;
  color: string;
}

export const PROVIDERS: Record<Provider, ProviderMeta> = {
  abl: { key: "abl", label: "Allied Bank", color: "#0ea5e9" },
  hbl: { key: "hbl", label: "HBL", color: "#16a34a" },
  nayapay: { key: "nayapay", label: "NayaPay", color: "#7c3aed" },
};
