import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Forecast } from "../../lib/forecast";
import { formatCompact, formatCurrency, formatMonth } from "../../lib/format";
import { useTheme } from "../../context/ThemeContext";

interface Row {
  month: string;
  history?: number;
  p50?: number;
  /** Stacked band: invisible base up to p10, visible slab from p10 to p90. */
  base?: number;
  band?: number;
  p10?: number;
  p90?: number;
}

export function ForecastChart({ data }: { data: Forecast }) {
  const { theme } = useTheme();
  const grid = theme === "dark" ? "#26262e" : "#eeeef1";
  const axis = theme === "dark" ? "#70707b" : "#9d9da7";

  const last = data.history[data.history.length - 1];
  const rows: Row[] = [
    ...data.history.map((h) => ({ month: h.month, history: h.balance })),
    ...data.forecast.map((f) => ({
      month: f.month,
      p50: f.p50,
      base: f.p10,
      band: f.p90 - f.p10,
      p10: f.p10,
      p90: f.p90,
    })),
  ];
  // Join the two series at "today" so the median line starts on the history.
  if (last) {
    const bridge = rows.find((r) => r.month === last.month);
    if (bridge) {
      bridge.p50 = last.balance;
      bridge.base = last.balance;
      bridge.band = 0;
      bridge.p10 = last.balance;
      bridge.p90 = last.balance;
    }
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="gBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#facc15" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#facc15" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fill: axis, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fill: axis, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            content={<ForecastTooltip />}
          />
          {last && (
            <ReferenceLine
              x={last.month}
              stroke={axis}
              strokeDasharray="4 4"
              label={{ value: "Today", position: "insideTopRight", fill: axis, fontSize: 11 }}
            />
          )}
          <ReferenceLine y={0} stroke="#f43f5e" strokeOpacity={0.5} />
          <Area
            type="monotone"
            dataKey="base"
            stackId="band"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="band"
            stackId="band"
            stroke="none"
            fill="url(#gBand)"
            isAnimationActive={false}
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="history"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#eab308"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ForecastTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div style={tooltipStyle} className="space-y-1 px-3 py-2">
      <p className="font-semibold">{formatMonth(String(label))}</p>
      {row.history != null && (
        <p>
          <span className="text-sky-300">Balance</span> {formatCurrency(row.history)}
        </p>
      )}
      {row.band != null && row.band > 0 && (
        <>
          <p>
            <span className="text-brand-300">Median</span> {formatCurrency(row.p50 ?? 0)}
          </p>
          <p className="text-slate-300">
            Range {formatCurrency(row.p10 ?? 0)} – {formatCurrency(row.p90 ?? 0)}
          </p>
        </>
      )}
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
