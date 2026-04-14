"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface IbkrChartsProps {
  totalProfitUSD: number;
  totalLossUSD: number;
  dividendsUSD: number;
  foreignTaxUSD: number;
  exchangeRate: number;
}

function formatUSD(val: number): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(val)}`;
}

// Custom tooltip props — intentionally loose to avoid recharts generic hell
interface TooltipEntry {
  color?: string;
  name?: string;
  value?: number;
  payload?: { fill?: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

// Custom tooltip for BarChart
const BarTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-bold tabular-nums">
          {formatUSD(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
};

// Custom tooltip for PieChart
const PieTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{item.name}</p>
      <p
        className="font-bold tabular-nums"
        style={{ color: item.payload?.fill ?? item.color }}
      >
        {formatUSD(item.value ?? 0)}
      </p>
    </div>
  );
};

interface LegendItem {
  color?: string;
  value?: string;
}

// Custom legend renderer for RTL Hebrew labels
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderLegend = (props: any) => {
  const payload: LegendItem[] = props?.payload ?? [];
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-3" dir="rtl">
      {payload.map((entry: LegendItem, i: number) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function IbkrCharts({
  totalProfitUSD,
  totalLossUSD,
  dividendsUSD,
  foreignTaxUSD,
  exchangeRate: _exchangeRate, // used by parent — suppress unused-var
}: IbkrChartsProps) {
  // ── Bar chart data ────────────────────────────────────────────────────────
  const barData = [
    { name: "רווח ממומש", value: totalProfitUSD, fill: "#10B981" },
    { name: "הפסד ממומש", value: totalLossUSD,   fill: "#ef4444" },
  ];

  // ── Pie chart data ────────────────────────────────────────────────────────
  const netGainUSD  = Math.max(0, totalProfitUSD - totalLossUSD);
  const israeliCGT  = netGainUSD * 0.25;
  const dividendTax = dividendsUSD * 0.25;
  const foreignCredit = foreignTaxUSD; // shown as an offset/credit slice

  const pieDataRaw = [
    { name: "מס רווחי הון (25%)", value: israeliCGT,    fill: "#0F172A" },
    { name: "מס דיבידנדים (25%)", value: dividendTax,   fill: "#6366F1" },
    { name: "מס זר שנוכה",        value: foreignCredit, fill: "#10B981" },
  ].filter((d) => d.value > 0);

  const pieData = pieDataRaw.length > 0
    ? pieDataRaw
    : [{ name: "אין נתונים", value: 1, fill: "#e2e8f0" }];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* ── Bar Chart: Profit vs Loss ──────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 text-right">
          רווח מול הפסד ממומש (USD)
        </h3>
        {/* recharts requires LTR container for correct axis rendering */}
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={72}>
                {barData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Pie Chart: Tax Breakdown ───────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 text-right">
          פירוט מס רווחי הון (USD)
        </h3>
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`pie-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend content={renderLegend} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
