import type { TimeRange } from "../../lib/api";
import { RANGE_LABELS } from "../../lib/analytics";
import { cn } from "../../lib/format";

const ORDER: TimeRange[] = ["1m", "3m", "6m", "1y", "all"];

/** Segmented time-range control (1M · 3M · 6M · 1Y · All). */
export function RangePills({
  value,
  onChange,
  className,
}: {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className={cn(
        "inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900",
        className
      )}
    >
      {ORDER.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold transition sm:px-3",
            value === r
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          )}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}
