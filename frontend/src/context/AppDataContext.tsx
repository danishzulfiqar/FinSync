import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Account, Category, Transaction } from "../types";
import {
  api,
  ApiError,
  type AccountOut,
  type TransactionListResponse,
  type TransactionOut,
} from "../lib/api";
import {
  buildCategories,
  categoryNameFor,
  mapAccount,
  mapTransaction,
  toAccountPayload,
} from "../lib/catalog";
import { sortNewestFirst } from "../lib/analytics";
import { useDelayedFlag } from "../lib/hooks";
import { useAuth } from "./AuthContext";

export interface NewAccountInput {
  name: string;
  provider: Account["provider"];
  type: Account["type"];
  mask: string;
  openingBalance: number;
  color: string;
}

interface AppDataContextValue {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  /** True while any fetch is in flight (initial load or refresh). */
  loading: boolean;
  /** False until the first fetch after sign-in has settled — drive skeletons off this. */
  ready: boolean;
  /** True when a fetch has been pending long enough to suggest a backend cold start. */
  slow: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addAccount: (input: NewAccountInput) => Promise<Account>;
  importTransactions: () => Promise<void>;
  updateTransactionCategory: (id: string, categoryId: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

const PAGE_SIZE = 500;

/** Fetch every page so client-side totals cover the whole ledger. */
async function fetchAllTransactions(): Promise<TransactionOut[]> {
  const items: TransactionOut[] = [];
  let offset = 0;
  for (;;) {
    const page = await api.get<TransactionListResponse>(
      `/transactions?limit=${PAGE_SIZE}&offset=${offset}`
    );
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  return items;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slow = useDelayedFlag(loading, 4000);

  const categories = useMemo<Category[]>(
    () => buildCategories(transactions.map((t) => t.categoryId)),
    [transactions]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountRes, txItems] = await Promise.all([
        api.get<AccountOut[]>("/accounts"),
        fetchAllTransactions(),
      ]);
      setAccounts(accountRes.map(mapAccount));
      setTransactions(sortNewestFirst(txItems.map(mapTransaction)));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load your data.";
      setError(message);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (initializing) return;
    if (!isAuthenticated) {
      setAccounts([]);
      setTransactions([]);
      setError(null);
      setReady(false);
      return;
    }
    void refresh();
  }, [initializing, isAuthenticated, refresh]);

  const addAccount = useCallback(
    async (input: NewAccountInput): Promise<Account> => {
      const created = await api.post<AccountOut>(
        "/accounts",
        toAccountPayload(input)
      );
      const account = mapAccount(created);
      setAccounts((prev) => [...prev, account]);
      return account;
    },
    []
  );

  const importTransactions = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const updateTransactionCategory = useCallback(
    async (id: string, categoryId: string) => {
      const name = categoryNameFor(
        categoryId,
        buildCategories(transactions.map((t) => t.categoryId))
      );
      // Optimistic update.
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, categoryId } : t))
      );
      try {
        const updated = await api.patch<TransactionOut>(
          `/transactions/${id}`,
          { category: name }
        );
        const mapped = mapTransaction(updated);
        setTransactions((prev) => prev.map((t) => (t.id === id ? mapped : t)));
      } catch {
        // Revert to authoritative state on failure.
        void refresh();
      }
    },
    [transactions, refresh]
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      accounts,
      categories,
      transactions,
      loading,
      ready,
      slow,
      error,
      refresh,
      addAccount,
      importTransactions,
      updateTransactionCategory,
    }),
    [
      accounts,
      categories,
      transactions,
      loading,
      ready,
      slow,
      error,
      refresh,
      addAccount,
      importTransactions,
      updateTransactionCategory,
    ]
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
