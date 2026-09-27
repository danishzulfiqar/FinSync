import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Account, Category, Transaction } from "../types";
import accountsSeed from "../data/accounts.json";
import categoriesSeed from "../data/categories.json";
import transactionsSeed from "../data/transactions.json";

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
  addAccount: (input: NewAccountInput) => Account;
  importTransactions: (rows: Transaction[]) => void;
  updateTransactionCategory: (id: string, categoryId: string) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function sortByDateDesc(rows: Transaction[]): Transaction[] {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date));
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(
    accountsSeed as Account[]
  );
  const [categories] = useState<Category[]>(categoriesSeed as Category[]);
  const [transactions, setTransactions] = useState<Transaction[]>(
    sortByDateDesc(transactionsSeed as Transaction[])
  );

  const addAccount = useCallback((input: NewAccountInput): Account => {
    const account: Account = {
      id: `acc_${Date.now().toString(36)}`,
      currency: "PKR",
      ...input,
    };
    setAccounts((prev) => [...prev, account]);
    return account;
  }, []);

  const importTransactions = useCallback((rows: Transaction[]) => {
    setTransactions((prev) => sortByDateDesc([...rows, ...prev]));
  }, []);

  const updateTransactionCategory = useCallback(
    (id: string, categoryId: string) => {
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, categoryId } : t))
      );
    },
    []
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      accounts,
      categories,
      transactions,
      addAccount,
      importTransactions,
      updateTransactionCategory,
    }),
    [
      accounts,
      categories,
      transactions,
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
