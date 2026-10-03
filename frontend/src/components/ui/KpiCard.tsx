import type { ComponentType, ReactNode } from "react";
import { cn } from "../../lib/format";

interface KpiCardProps {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  trend?: { value: string; positive: boolean };
  /** Custom top-right element (e.g. a DeltaChip); takes precedence over `trend`. */
  chip?: ReactNode;
  /** Small muted line under the label. */
  hint?: string;
  accent?: "brand" | "green" | "red" | "sky";
}

const accents: Record<
  NonNullable<KpiCardProps["accent"]>,
  { bg: string; fg: string }
> = {
  brand: { bg: "bg-brand-100 dark:bg-brand-500/15", fg: "text-brand-600 dark:text-brand-300" },
  green: { bg: "bg-emerald-100 dark:bg-emerald-500/15", fg: "text-emerald-600 dark:text-emerald-400" },
  red: { bg: "bg-rose-100 dark:bg-rose-500/15", fg: "text-rose-600 dark:text-rose-400" },
  sky: { bg: "bg-sky-100 dark:bg-sky-500/15", fg: "text-sky-600 dark:text-sky-400" },
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  chip,
  hint,
  accent = "brand",
}: KpiCardProps) {
  const a = accents[accent];
  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", a.bg)}>
          <Icon className={cn("h-5 w-5", a.fg)} />
        </span>
        {chip ??
          (trend && (
            <span
              className={cn(
                "chip min-w-0 max-w-full truncate",
                trend.positive
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
              )}
              title={trend.value}
            >
              {trend.value}
            </span>
          ))}
      </div>
      <p className="mt-4 whitespace-nowrap text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400/80">{hint}</p>}
    </div>
  );
}
