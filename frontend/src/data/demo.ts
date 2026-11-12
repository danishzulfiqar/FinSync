/**
 * Static demo snapshot.
 *
 * The public demo loads from this bundled file instead of the API so it opens
 * instantly (no auth, no cold-start, no paging). Regenerate after reseeding
 * with `backend/scripts/export_demo_json.py`.
 */
import type { AccountOut, PreferencesOut, TransactionOut } from "../lib/api";
import raw from "./demo.json";

export const DEMO_ACCOUNTS = raw.accounts as unknown as AccountOut[];
export const DEMO_TRANSACTIONS = raw.transactions as unknown as TransactionOut[];
export const DEMO_PREFERENCES = raw.preferences as unknown as PreferencesOut;
