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
  type GmailStatus,
  type GmailSyncResponse,
  type PreferencesOut,
  type PreferencesPatch,
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
import {
  detectInternalTransfers,
  flowRows,
  sortNewestFirst,
} from "../lib/analytics";
import { setAmountMasking } from "../lib/format";
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

/** Camel-cased mirror of the backend preference document. */
export interface Settings {
  excludeInternalTransfers: boolean;
  transferWindowDays: number;
  privacyMode: boolean;
  defaultRange: PreferencesOut["default_range"];
  forecastHorizon: number;
}

export const DEFAULT_SETTINGS: Settings = {
  excludeInternalTransfers: false,
  transferWindowDays: 3,
  privacyMode: false,
  defaultRange: "all",
  forecastHorizon: 6,
};

function fromPrefs(p: PreferencesOut): Settings {
  return {
    excludeInternalTransfers: p.exclude_internal_transfers,
    transferWindowDays: p.transfer_window_days,
    privacyMode: p.privacy_mode,
    defaultRange: p.default_range,
    forecastHorizon: p.forecast_horizon,
  };
}

function toPrefs(s: Partial<Settings>): PreferencesPatch {
  const out: PreferencesPatch = {};
  if (s.excludeInternalTransfers !== undefined)
    out.exclude_internal_transfers = s.excludeInternalTransfers;
  if (s.transferWindowDays !== undefined)
    out.transfer_window_days = s.transferWindowDays;
  if (s.privacyMode !== undefined) out.privacy_mode = s.privacyMode;
  if (s.defaultRange !== undefined) out.default_range = s.defaultRange;
  if (s.forecastHorizon !== undefined) out.forecast_horizon = s.forecastHorizon;
  return out;
}

export interface GmailSyncOptions {
  provider?: string;
  dryRun?: boolean;
  startDate?: string;
  maxResults?: number;
}

interface AppDataContextValue {
  accounts: Account[];
  categories: Category[];
  /** Complete ledger, newest first, with internal transfers flagged. */
  transactions: Transaction[];
  /** Rows that count toward income/expense under the current settings. */
  flows: Transaction[];
  settings: Settings;
  /** True while any fetch is in flight (initial load or refresh). */
  loading: boolean;
  /** False until the first fetch after sign-in has settled — drive skeletons off this. */
  ready: boolean;
  /** True when a fetch has been pending long enough to suggest a backend cold start. */
  slow: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addAccount: (input: NewAccountInput) => Promise<Account>;
  /** Toggle an account on/off; off accounts drop out of totals and flows. */
  setAccountActive: (id: string, active: boolean) => Promise<void>;
  importTransactions: () => Promise<void>;
  updateTransactionCategory: (id: string, categoryId: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** Gmail inbox state; null until fetched. */
  gmail: GmailStatus | null;
  gmailSyncing: boolean;
  refreshGmailStatus: () => Promise<void>;
  syncGmail: (opts?: GmailSyncOptions) => Promise<GmailSyncResponse>;
  /** Start the Gmail web OAuth flow by redirecting to Google's consent screen. */
  connectGmail: () => Promise<void>;
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
  const { isAuthenticated, initializing, user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slow = useDelayedFlag(loading, 4000);

  // Must run during render so children formatting amounts see the new value.
  setAmountMasking(settings.privacyMode);

  const transactions = useMemo<Transaction[]>(() => {
    const ids = detectInternalTransfers(
      rawTransactions,
      settings.transferWindowDays,
      user?.name ?? ""
    );
    if (ids.size === 0) return rawTransactions;
    return rawTransactions.map((t) => (ids.has(t.id) ? { ...t, transfer: true } : t));
  }, [rawTransactions, settings.transferWindowDays, user?.name]);

  const flows = useMemo(() => {
    const activeIds = new Set(
      accounts.filter((a) => a.isActive).map((a) => a.id)
    );
    // Rows from switched-off accounts drop out of income/expense aggregates;
    // unlinked rows (no account) always count.
    const scoped = transactions.filter(
      (t) => !t.accountId || activeIds.has(t.accountId)
    );
    return flowRows(scoped, settings.excludeInternalTransfers);
  }, [transactions, accounts, settings.excludeInternalTransfers]);

  const categories = useMemo<Category[]>(
    () => buildCategories(transactions.map((t) => t.categoryId)),
    [transactions]
  );

  const refreshGmailStatus = useCallback(async () => {
    try {
      setGmail(await api.get<GmailStatus>("/sync/gmail/status"));
    } catch {
      setGmail({ connected: false, providers: [] });
    }
  }, []);

  const connectGmail = useCallback(async () => {
    const { url } = await api.get<{ url: string }>("/sync/gmail/authorize");
    window.location.href = url;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountRes, txItems, prefs] = await Promise.all([
        api.get<AccountOut[]>("/accounts"),
        fetchAllTransactions(),
        api.get<PreferencesOut>("/preferences").catch(() => null),
      ]);
      setAccounts(accountRes.map(mapAccount));
      setRawTransactions(sortNewestFirst(txItems.map(mapTransaction)));
      if (prefs) setSettings(fromPrefs(prefs));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load your data.";
      setError(message);
    } finally {
      setLoading(false);
      setReady(true);
    }
    // Non-blocking: inbox status shouldn't delay the dashboard.
    void refreshGmailStatus();
  }, [refreshGmailStatus]);

  useEffect(() => {
    if (initializing) return;
    if (!isAuthenticated) {
      setAccounts([]);
      setRawTransactions([]);
      setSettings(DEFAULT_SETTINGS);
      setGmail(null);
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

  const setAccountActive = useCallback(
    async (id: string, active: boolean) => {
      const before = accounts;
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: active } : a))
      );
      try {
        await api.patch<AccountOut>(`/accounts/${id}`, { is_active: active });
      } catch (err) {
        setAccounts(before);
        throw err;
      }
    },
    [accounts]
  );

  const importTransactions = useCallback(async () => {
    await refresh();
  }, [refresh]);
  const updateTransactionCategory = useCallback(
    async (id: string, categoryId: string) => {
      const name = categoryNameFor(categoryId, categories);
      // Optimistic update.
      setRawTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, categoryId } : t))
      );
      try {
        const updated = await api.patch<TransactionOut>(
          `/transactions/${id}`,
          { category: name }
        );
        const mapped = mapTransaction(updated);
        setRawTransactions((prev) => prev.map((t) => (t.id === id ? mapped : t)));
      } catch {
        // Revert to authoritative state on failure.
        void refresh();
      }
    },
    [categories, refresh]
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const before = settings;
      setSettings((prev) => ({ ...prev, ...patch }));
      try {
        const saved = await api.patch<PreferencesOut>("/preferences", toPrefs(patch));
        setSettings(fromPrefs(saved));
      } catch (err) {
        setSettings(before);
        throw err;
      }
    },
    [settings]
  );

  const syncGmail = useCallback(
    async (opts: GmailSyncOptions = {}): Promise<GmailSyncResponse> => {
      const params = new URLSearchParams();
      if (opts.provider) params.set("provider", opts.provider);
      if (opts.dryRun) params.set("dry_run", "true");
      if (opts.startDate) params.set("start_date", opts.startDate);
      if (opts.maxResults) params.set("max_results", String(opts.maxResults));
      const qs = params.toString();
      setGmailSyncing(true);
      try {
        const result = await api.post<GmailSyncResponse>(
          `/sync/gmail${qs ? `?${qs}` : ""}`
        );
        // A real sync can create accounts and re-link rows even when nothing
        // new was added, so always re-pull the ledger afterwards.
        if (!opts.dryRun) await refresh();
        else void refreshGmailStatus();
        return result;
      } finally {
        setGmailSyncing(false);
      }
    },
    [refresh, refreshGmailStatus]
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      accounts,
      categories,
      transactions,
      flows,
      settings,
      loading,
      ready,
      slow,
      error,
      refresh,
      addAccount,
      setAccountActive,
      importTransactions,
      updateTransactionCategory,
      updateSettings,
      gmail,
      gmailSyncing,
      refreshGmailStatus,
      syncGmail,
      connectGmail,
    }),
    [
      accounts,
      categories,
      transactions,
      flows,
      settings,
      loading,
      ready,
      slow,
      error,
      refresh,
      addAccount,
      setAccountActive,
      importTransactions,
      updateTransactionCategory,
      updateSettings,
      gmail,
      gmailSyncing,
      refreshGmailStatus,
      syncGmail,
      connectGmail,
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
