import type { ComponentType } from "react";
import { cn } from "../../lib/format";

interface KpiCardProps {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  trend?: { value: string; positive: boolean };
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
  accent = "brand",
}: KpiCardProps) {
  const a = accents[accent];
  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", a.bg)}>
          <Icon className={cn("h-5 w-5", a.fg)} />
        </span>
        {trend && (
          <span
            className={cn(
              "chip",
              trend.positive
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
    </div>
  );
}
