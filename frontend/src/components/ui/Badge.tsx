import type { ReactNode } from "react";
import { cn } from "../../lib/format";

export function Badge({
  children,
  color = "#64748b",
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("chip", className)}
      style={{
        backgroundColor: `${color}1a`,
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}
