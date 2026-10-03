/** Thin fetch wrapper for the FinSync backend API. */

const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

const TOKEN_KEY = "finsync.token";

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  /** JSON body. */
  body?: unknown;
  /** Form-urlencoded body (for OAuth2 password login). */
  form?: Record<string, string>;
  /** multipart/form-data body (for file uploads). */
  multipart?: FormData;
  /** Attach the bearer token. Defaults to true. */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.multipart) {
    // Let the browser set the multipart boundary Content-Type.
    body = options.multipart;
  } else if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(options.form).toString();
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", 0);
  }

  if (!res.ok) {
    let detail = res.statusText || "Request failed";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
      else if (Array.isArray(data?.detail) && data.detail[0]?.msg)
        detail = data.detail[0].msg;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  postForm: <T>(path: string, form: Record<string, string>, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", form }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  upload: <T>(path: string, data: FormData, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", multipart: data }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---- Backend DTOs ----

export interface ApiUser {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: ApiUser;
}

// ---- Statement import DTOs ----

export interface Reconciliation {
  opening_balance: number;
  closing_balance: number;
  computed_closing: number;
  net: number;
  transactions: number;
  row_mismatches: number;
  closing_ok: boolean;
}

export interface StatementPreviewRow {
  transaction_datetime: string | null;
  description: string | null;
  transaction_type: "credit" | "debit";
  amount: string;
  balance_after: string | null;
  category: string;
}

export interface StatementFileResult {
  source_file: string;
  status: "parsed" | "error";
  error: string | null;
  layout: string | null;
  provider: string | null;
  account_title: string | null;
  account_number: string | null;
  currency: string | null;
  parsed: number;
  created: number;
  duplicates: number;
  linked: number;
  needs_review: number;
  account_id: number | null;
  account_created: boolean;
  reconciliation: Reconciliation | null;
  preview: StatementPreviewRow[];
}

export interface StatementImportResponse {
  dry_run: boolean;
  files: StatementFileResult[];
  totals: Record<string, number>;
}

// ---- Account DTOs ----

export interface AccountOut {
  id: number;
  name: string;
  provider: string;
  type: string;
  mask: string | null;
  opening_balance: string | number;
  currency: string;
  color: string | null;
  created_at: string;
}

export interface AccountCreatePayload {
  name: string;
  provider: string;
  type: string;
  mask: string;
  opening_balance: number;
  currency: string;
  color: string;
}

// ---- Transaction DTOs ----

export interface TransactionSourceOut {
  id: number;
  source_type: string;
  source_id: string;
  source_thread_id: string | null;
  received_at: string | null;
}

export interface TransactionOut {
  id: number;
  account_id: number | null;
  provider: string;
  account_identifier: string | null;
  transaction_type: "credit" | "debit";
  amount: string | number;
  currency: string;
  transaction_datetime: string | null;
  merchant: string | null;
  description: string | null;
  reference: string | null;
  balance_after: string | number | null;
  category: string | null;
  source_type: string;
  confidence: number;
  verified: boolean;
  created_at: string;
  updated_at: string;
  sources: TransactionSourceOut[];
}

export interface TransactionListResponse {
  items: TransactionOut[];
  total: number;
  limit: number;
  offset: number;
}

// ---- Preferences DTOs ----

export type TimeRange = "1m" | "3m" | "6m" | "1y" | "all";

export interface PreferencesOut {
  exclude_internal_transfers: boolean;
  transfer_window_days: number;
  privacy_mode: boolean;
  default_range: TimeRange;
  forecast_horizon: number;
}

export type PreferencesPatch = Partial<PreferencesOut>;

// ---- Gmail sync DTOs ----

export interface GmailProviderStatus {
  key: string;
  label: string;
  configured: boolean;
  last_sync_at: string | null;
  latest_transaction_at: string | null;
}

export interface GmailStatus {
  connected: boolean;
  providers: GmailProviderStatus[];
}

export interface GmailSyncPreviewRow {
  date: string | null;
  type: "credit" | "debit";
  amount: number;
  currency: string;
  merchant: string | null;
  reference: string | null;
  subject: string;
}

export interface GmailProviderSyncResult {
  provider: string;
  query: string;
  after: string | null;
  matched: number;
  parsed: number;
  created: number;
  duplicates: number;
  linked: number;
  needs_review: number;
  skipped: number;
  account_id: number | null;
  adopted: number;
  preview: GmailSyncPreviewRow[];
}

export interface GmailSyncResponse {
  status: string;
  dry_run: boolean;
  totals: Record<string, number>;
  providers: GmailProviderSyncResult[];
}
