export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const pkr = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

/**
 * Privacy mode masks every amount. Set once per render by the data provider
 * (before children render) so every formatter call sees the current value
 * without threading a flag through hundreds of call sites.
 */
let masked = false;
export function setAmountMasking(on: boolean): void {
  masked = on;
}
const MASK = "Rs ••••••";

/** Format a PKR amount. Pass `signed` to show +/- prefix. */
export function formatCurrency(
  amount: number,
  opts: { signed?: boolean } = {}
): string {
  if (masked) return MASK;
  const base = pkr.format(Math.abs(amount));
  if (!opts.signed) return base;
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${base}`;
}

/** Compact currency for tight spaces / axis labels, e.g. Rs 1.2M. */
export function formatCompact(amount: number): string {
  if (masked) return "••••";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}Rs ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}Rs ${Math.round(abs / 1_000)}k`;
  return `${sign}Rs ${abs}`;
}

/** Calendar dates are rendered in UTC: statement rows are day-precision UTC midnights. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/** yyyy-mm -> "Mar 2025". */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Signed percent with one decimal, e.g. "+12.4%". */
export function formatPercent(pct: number, digits = 1): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

/** "3 Oct 2026, 14:05" in the viewer's local time, for sync timestamps. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
