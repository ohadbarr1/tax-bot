"use client";

/**
 * TaxCalculator — standalone interactive Israeli tax calculator.
 *
 * A fully self-contained planning tool: user inputs annual (or monthly)
 * gross salary, rental income, and credit points; we run the progressive
 * brackets on salary, apply flat 10% to rental (Israel's residential
 * rental special track), subtract the credit-point value, and show the
 * resulting net tax, effective rate, and take-home. All inputs are
 * reactive so every keystroke re-computes and re-renders the charts.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  ArrowRight,
  Calculator,
  Wallet,
  Percent,
  TrendingUp,
  PiggyBank,
} from "lucide-react";
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
  LabelList,
} from "recharts";
import taxData from "@/data/tax_brackets_2024_2025.json";
import { calculateTaxOnIncome } from "@/lib/calculateTax";
import { currentTaxYear } from "@/lib/currentTaxYear";

type Period = "monthly" | "yearly";

const YEAR = (currentTaxYear() === 2025 ? 2025 : 2024) as 2024 | 2025;
const CREDIT_POINT_VALUE = taxData[String(YEAR) as "2024" | "2025"].credit_point_annual_value;
const RENTAL_FLAT_RATE = 0.10;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

function formatILS(v: number): string {
  return `₪${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(Math.round(v))}`;
}
function formatCompactILS(v: number): string {
  if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₪${Math.round(v / 1000)}k`;
  return `₪${Math.round(v)}`;
}
function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

interface TooltipEntry {
  color?: string;
  name?: string;
  value?: number;
  payload?: { fill?: string };
}
const CurrencyTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p
          key={i}
          style={{ color: entry.payload?.fill ?? entry.color }}
          className="font-bold tabular-nums"
        >
          {entry.name ? `${entry.name}: ` : ""}
          {formatILS(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderLegend = (props: any) => {
  const items: { color?: string; value?: string }[] = props?.payload ?? [];
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-3" dir="rtl">
      {items.map((entry, i) => (
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

interface SummaryCardProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  tint: "emerald" | "rose" | "indigo" | "navy";
}
const TINTS: Record<SummaryCardProps["tint"], { bg: string; fg: string }> = {
  emerald: { bg: "bg-emerald-50", fg: "text-emerald-600" },
  rose:    { bg: "bg-rose-50",    fg: "text-rose-600" },
  indigo:  { bg: "bg-indigo-50",  fg: "text-indigo-600" },
  navy:    { bg: "bg-[#0B3B5C]/10", fg: "text-[#0B3B5C]" },
};
function SummaryCard({ label, value, sublabel, icon, tint }: SummaryCardProps) {
  const c = TINTS[tint];
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.fg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground tabular-nums truncate">{value}</p>
          {sublabel && <p className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          step={step ?? 1}
          min={0}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-card text-sm font-semibold text-foreground
                     border-2 border-slate-200 focus:outline-none focus:border-emerald-500 transition-colors tabular-nums"
        />
        {suffix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

export default function TaxCalculator() {
  const [period, setPeriod] = useState<Period>("yearly");
  // Inputs are stored in ANNUAL ILS internally; monthly toggle only affects
  // the display and the edit helpers — we multiply/divide at the I/O edge.
  const [grossAnnual, setGrossAnnual] = useState<number>(240000);
  const [rentalAnnual, setRentalAnnual] = useState<number>(0);
  const [creditPoints, setCreditPoints] = useState<number>(2.25);

  const mult = period === "monthly" ? 1 / 12 : 1;
  const displayGross = grossAnnual * mult;
  const displayRental = rentalAnnual * mult;

  const calc = useMemo(() => {
    const salaryResult = calculateTaxOnIncome(grossAnnual, YEAR);
    const salaryTax = salaryResult.tax;
    const byBracket = salaryResult.byBracket;

    const rentalTax = rentalAnnual * RENTAL_FLAT_RATE;
    const grossTax = salaryTax + rentalTax;

    const creditCredit = Math.max(0, creditPoints) * CREDIT_POINT_VALUE;
    const netTax = Math.max(0, grossTax - creditCredit);

    const totalIncome = grossAnnual + rentalAnnual;
    const netTakeHome = Math.max(0, totalIncome - netTax);
    const effectiveRate = totalIncome > 0 ? netTax / totalIncome : 0;
    const marginalRate = byBracket.length > 0 ? byBracket[byBracket.length - 1].rate : 0;

    return {
      salaryTax,
      rentalTax,
      grossTax,
      creditCredit,
      netTax,
      netTakeHome,
      effectiveRate,
      marginalRate,
      byBracket,
      totalIncome,
    };
  }, [grossAnnual, rentalAnnual, creditPoints]);

  // ─── Chart data ─────────────────────────────────────────────────────────────
  const bracketChartData = useMemo(
    () =>
      calc.byBracket.map((b) => ({
        name: `${Math.round(b.rate * 100)}%`,
        bracket: `מדרגה ${b.bracket}`,
        tax: b.tax * mult,
        income: b.taxableAmount * mult,
      })),
    [calc.byBracket, mult]
  );

  const pieData = useMemo(
    () => [
      { name: "מס נטו (אחרי זיכוי)", value: Math.max(0, calc.netTax * mult), fill: "#e11d48" },
      { name: "נטו בכיס", value: calc.netTakeHome * mult, fill: "#059669" },
    ],
    [calc, mult]
  );

  const hasData = calc.totalIncome > 0;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      dir="rtl"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8"
    >
      {/* ── Header with back link + period toggle ───────────────────────── */}
      <motion.div variants={fadeUp} className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0B3B5C] transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            חזור ללוח הבקרה הראשי
          </Link>
          <h1 className="text-2xl font-bold text-[#0B3B5C] flex items-center gap-2">
            <Calculator className="w-6 h-6" />
            מחשבון מס
          </h1>
          <p className="text-sm text-slate-500">
            חישוב תגובתי · מדרגות ישראל · שנת מס {YEAR}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(["yearly", "monthly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                period === p
                  ? "bg-[#0B3B5C] text-white shadow-sm"
                  : "text-slate-600 hover:text-[#0B3B5C]"
              }`}
            >
              {p === "yearly" ? "שנתי" : "חודשי"}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Input row ────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="bg-white dark:bg-card rounded-2xl border border-border p-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumberField
            label={`ברוטו ${period === "monthly" ? "חודשי" : "שנתי"} (שכר)`}
            value={Math.round(displayGross)}
            onChange={(v) => setGrossAnnual(period === "monthly" ? v * 12 : v)}
            suffix="₪"
            step={period === "monthly" ? 100 : 1000}
          />
          <NumberField
            label={`הכנסה מהשכרה ${period === "monthly" ? "חודשית" : "שנתית"}`}
            value={Math.round(displayRental)}
            onChange={(v) => setRentalAnnual(period === "monthly" ? v * 12 : v)}
            suffix="₪"
            step={period === "monthly" ? 100 : 1000}
          />
          <NumberField
            label="נקודות זיכוי"
            value={creditPoints}
            onChange={setCreditPoints}
            step={0.25}
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          שכר מחושב לפי מדרגות מס פרוגרסיביות · הכנסה מהשכרה מחושבת במסלול המיוחד 10% ·
          נקודות זיכוי ברירת מחדל 2.25 (תושב ישראל) · ערך נקודה שנתי {formatILS(CREDIT_POINT_VALUE)}
        </p>
      </motion.div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <SummaryCard
          label={period === "monthly" ? "הכנסה חודשית (ברוטו)" : "הכנסה שנתית (ברוטו)"}
          value={formatILS(calc.totalIncome * mult)}
          sublabel={rentalAnnual > 0 ? `כולל ${formatILS(rentalAnnual * mult)} שכירות` : undefined}
          icon={<Wallet className="w-5 h-5" />}
          tint="navy"
        />
        <SummaryCard
          label={period === "monthly" ? "מס חודשי (נטו)" : "מס שנתי (נטו)"}
          value={formatILS(calc.netTax * mult)}
          sublabel={`זיכוי נקודות: ${formatILS(calc.creditCredit * mult)}`}
          icon={<TrendingUp className="w-5 h-5" />}
          tint="rose"
        />
        <SummaryCard
          label="שיעור מס אפקטיבי"
          value={formatPct(calc.effectiveRate)}
          sublabel="מס / סך הכנסה"
          icon={<Percent className="w-5 h-5" />}
          tint="indigo"
        />
        <SummaryCard
          label={period === "monthly" ? "נטו לכיס (חודשי)" : "נטו לכיס (שנתי)"}
          value={formatILS(calc.netTakeHome * mult)}
          sublabel={`מדרגה שולית ${formatPct(calc.marginalRate)}`}
          icon={<PiggyBank className="w-5 h-5" />}
          tint="emerald"
        />
      </motion.div>

      {/* ── Charts row ───────────────────────────────────────────────────── */}
      {hasData && (
        <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Bracket bar chart (2/3 width on large screens) */}
          <div className="lg:col-span-2 bg-white dark:bg-card rounded-2xl border border-border p-5">
            <p className="text-sm font-bold text-[#0B3B5C] mb-1">חישוב מס לפי מדרגות</p>
            <p className="text-xs text-slate-500 mb-4">
              פירוק המס על השכר בכל שכבת הכנסה (לפני זיכוי נקודות)
            </p>
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bracketChartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickFormatter={(v) => formatCompactILS(v)}
                    width={55}
                  />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Bar dataKey="tax" name="מס במדרגה" fill="#0B3B5C" radius={[8, 8, 0, 0]}>
                    <LabelList
                      dataKey="tax"
                      position="top"
                      formatter={(v) => {
                        const n = typeof v === "number" ? v : Number(v);
                        return n > 0 ? formatCompactILS(n) : "";
                      }}
                      style={{ fontSize: 10, fill: "#0B3B5C", fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Take-home pie chart */}
          <div className="bg-white dark:bg-card rounded-2xl border border-border p-5">
            <p className="text-sm font-bold text-[#0B3B5C] mb-1">לאן הלך הברוטו</p>
            <p className="text-xs text-slate-500 mb-4">פירוק בין מס לבין נטו בכיס</p>
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={84}
                    paddingAngle={2}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CurrencyTooltip />} />
                  <Legend content={renderLegend} verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Bracket detail table ─────────────────────────────────────────── */}
      {hasData && calc.byBracket.length > 0 && (
        <motion.div
          variants={fadeUp}
          className="bg-white dark:bg-card rounded-2xl border border-border overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-bold text-[#0B3B5C]">פירוט מדרגות — {YEAR}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50/50">
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">מדרגה</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">שיעור</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">
                    הכנסה במדרגה
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">
                    מס במדרגה
                  </th>
                </tr>
              </thead>
              <tbody>
                {calc.byBracket.map((b, i) => {
                  const isMarginal = i === calc.byBracket.length - 1;
                  return (
                    <tr
                      key={b.bracket}
                      className={`border-b border-border last:border-0 ${
                        isMarginal ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="px-5 py-2.5 text-foreground font-medium">{b.bracket}</td>
                      <td className="px-4 py-2.5 text-foreground tabular-nums">
                        {formatPct(b.rate)}
                      </td>
                      <td className="px-4 py-2.5 text-foreground tabular-nums">
                        {formatILS(b.taxableAmount * mult)}
                      </td>
                      <td className="px-4 py-2.5 text-foreground tabular-nums font-semibold">
                        {formatILS(b.tax * mult)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50/50 font-bold">
                  <td className="px-5 py-3 text-[#0B3B5C]" colSpan={3}>
                    סך מס על שכר
                  </td>
                  <td className="px-4 py-3 text-[#0B3B5C] tabular-nums">
                    {formatILS(calc.salaryTax * mult)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
