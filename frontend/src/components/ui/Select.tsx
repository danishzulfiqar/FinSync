import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/format";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Layout classes for the wrapper (width / flex / min-width). */
  wrapperClassName?: string;
  /** Tighter padding + smaller text for dense table rows. */
  compact?: boolean;
}

/** Native <select> styled to match the app's inputs, with a consistent chevron. */
export function Select({
  className,
  wrapperClassName,
  compact = false,
  children,
  ...props
}: SelectProps) {
  return (
    <div className={cn("relative inline-flex items-center", wrapperClassName)}>
      <select
        {...props}
        className={cn(
          "w-full cursor-pointer appearance-none truncate rounded-xl border border-slate-200 bg-white font-medium text-slate-800 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
          compact ? "py-1.5 pl-2.5 pr-7 text-xs" : "px-3 py-2 pr-9 text-sm",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400",
          compact ? "right-2 h-3.5 w-3.5" : "right-3 h-4 w-4"
        )}
      />
    </div>
  );
}
