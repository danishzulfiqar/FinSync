import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import type { CategorySlice } from "../../lib/analytics";
import { formatCurrency } from "../../lib/format";

export function SpendingDonut({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={96}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.categoryId} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name) => [formatCurrency(value), name]}
            contentStyle={tooltipStyle}
            itemStyle={{ color: "inherit" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-slate-400">Total spent</span>
        <span className="text-xl font-bold text-slate-900 dark:text-white">
          {formatCurrency(total)}
        </span>
      </div>
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
