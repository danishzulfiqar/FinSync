import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { MonthPoint } from "../../lib/analytics";
import { formatCompact, formatCurrency, formatMonth } from "../../lib/format";
import { useTheme } from "../../context/ThemeContext";

export function CashFlowArea({ data }: { data: MonthPoint[] }) {
  const { theme } = useTheme();
  const grid = theme === "dark" ? "#26262e" : "#eeeef1";
  const axis = theme === "dark" ? "#70707b" : "#9d9da7";

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            formatter={(value: number, name) => [
              formatCurrency(value),
              name === "income" ? "Income" : "Spending",
            ]}
            labelFormatter={(l) => formatMonth(String(l))}
            contentStyle={tooltipStyle}
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke="#22c55e"
            strokeWidth={2.5}
            fill="url(#gIncome)"
          />
          <Area
            type="monotone"
            dataKey="spending"
            stroke="#f43f5e"
            strokeWidth={2.5}
            fill="url(#gSpend)"
          />
        </AreaChart>
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
