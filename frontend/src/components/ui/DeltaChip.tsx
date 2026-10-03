import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { Delta } from "../../lib/analytics";
import { cn, formatMonth, formatPercent } from "../../lib/format";

/**
 * Market-style change chip ("▲ 12.4% vs Aug 2026"). `invert` flips the colour
 * logic for metrics where going up is bad (spending).
 */
export function DeltaChip({
  delta,
  invert = false,
  className,
}: {
  delta: Delta | null | undefined;
  invert?: boolean;
  className?: string;
}) {
  if (!delta || delta.pct == null || !Number.isFinite(delta.pct)) {
    return (
      <span className={cn("chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", className)}>
        <Minus className="h-3 w-3" /> no prior month
      </span>
    );
  }
  const up = delta.pct > 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : delta.pct < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "chip whitespace-nowrap",
        delta.pct === 0
          ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          : good
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
        className
      )}
      title={`vs ${formatMonth(delta.versus)}`}
    >
      <Icon className="h-3 w-3" />
      {formatPercent(delta.pct)}
      <span className="hidden font-normal opacity-70 sm:inline">
        vs {formatMonth(delta.versus)}
      </span>
    </span>
  );
}
