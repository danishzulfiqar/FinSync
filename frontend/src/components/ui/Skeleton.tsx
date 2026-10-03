import { cn } from "../../lib/format";
import type { CSSProperties } from "react";

/** Base shimmer block. Compose these to mirror real content while it loads. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "relative overflow-hidden rounded-md bg-slate-200/70 dark:bg-slate-800/60",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/5" />
    </div>
  );
}

/** Mirrors KpiCard while KPIs load. */
export function KpiCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-7 w-28" />
      <Skeleton className="mt-2 h-4 w-20" />
    </div>
  );
}

/** A card with a title block and a chart-sized body. */
export function ChartCardSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="card p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-5 w-full rounded-xl" style={{ height }} />
    </div>
  );
}

/** A list of avatar + two-line rows (accounts, recent items). */
export function ListRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Table-style rows for the ledger and other tables. */
export function TableRowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40 max-w-[55%]" />
            <Skeleton className="h-3 w-24 max-w-[35%]" />
          </div>
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors an account card on the Accounts page. */
export function AccountCardSkeleton() {
  return (
    <div className="card overflow-hidden p-0">
      <Skeleton className="h-28 w-full rounded-none" />
      <div className="space-y-2 p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-28" />
      </div>
    </div>
  );
}
