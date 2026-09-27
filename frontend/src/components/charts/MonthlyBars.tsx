import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { MonthPoint } from "../../lib/analytics";
import { formatCompact, formatCurrency, formatMonth } from "../../lib/format";
import { useTheme } from "../../context/ThemeContext";

export function MonthlyBars({ data }: { data: MonthPoint[] }) {
  const { theme } = useTheme();
  const grid = theme === "dark" ? "#1e293b" : "#eef2f7";
  const axis = theme === "dark" ? "#64748b" : "#94a3b8";

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fill: axis, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fill: axis, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.1)" }}
            formatter={(value: number) => [formatCurrency(value), "Net savings"]}
            labelFormatter={(l) => formatMonth(String(l))}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="net" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {data.map((d) => (
              <Cell
                key={d.month}
                fill={d.net >= 0 ? "#7c3aed" : "#f43f5e"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.92)",
  color: "#f1f5f9",
  fontSize: 12,
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.4)",
} as const;
