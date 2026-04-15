"use client";

/**
 * IncomeTaxDashboard — full-screen analytics view for Form 106 data.
 *
 * Reads the parsed employer records from `state.taxpayer.employers` and
 * runs the progressive-bracket calculation for the aggregate gross salary
 * to expose the marginal bracket the user lands in — the single data
 * point a salaried employee wants to see when they're trying to decide
 * how much extra pension/study-fund contribution would actually save.
 */

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  ArrowRight,
  ReceiptText,
  Upload,
  Wallet,
  Percent,
  TrendingUp,
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
import { useApp } from "@/lib/appContext";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { calculateTaxOnIncome } from "@/lib/calculateTax";
import type { Employer } from "@/types";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09 } },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatILS(v: number): string {
  return `₪${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(v)}`;
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
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

const CurrencyTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
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

// ─── Empty state ──────────────────────────────────────────────────────────────

function NoDataState() {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center justify-center gap-6 py-24 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
        <ReceiptText className="w-8 h-8 text-amber-600" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-bold text-slate-800">
          עדיין לא הועלה טופס 106
        </h3>
        <p className="text-sm text-slate-500">
          העלה טופס 106 (PDF או תמונה) כדי לראות ניתוח מלא של ברוטו, מס שנוכה,
          שיעור מס אפקטיבי, ומדרגת המס השולית שלך.
        </p>
      </div>
      <Link
        href="/documents"
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700
                   text-stone-950 font-semibold px-6 py-3 rounded-2xl shadow-md
                   transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
      >
        <Upload className="w-4 h-4" />
        <span>העלה טופס 106</span>
      </Link>
    </motion.div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  tint: "emerald" | "rose" | "indigo" | "amber";
}

const TINTS: Record<SummaryCardProps["tint"], { bg: string; fg: string }> = {
  emerald: { bg: "bg-emerald-50",  fg: "text-emerald-600" },
  rose:    { bg: "bg-rose-50",     fg: "text-rose-600" },
  indigo:  { bg: "bg-indigo-50",   fg: "text-indigo-600" },
  amber:   { bg: "bg-amber-50",    fg: "text-amber-600" },
};

function SummaryCard({ label, value, sublabel, icon, tint }: SummaryCardProps) {
  const c = TINTS[tint];
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function IncomeTaxDashboard() {
  const { state } = useApp();
  const { taxpayer, financials } = state;

  const year = (financials.taxYears[0] ?? currentTaxYear()) as 2024 | 2025;
  const employersWithData = useMemo(
    () =>
      taxpayer.employers.filter(
        (e): e is Employer & { grossSalary: number } =>
          typeof e.grossSalary === "number" && e.grossSalary > 0
      ),
    [taxpayer.employers]
  );

  const hasData = employersWithData.length > 0;

  const totals = useMemo(() => {
    const gross = employersWithData.reduce((s, e) => s + (e.grossSalary ?? 0), 0);
    const withheld = employersWithData.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);
    const pension = employersWithData.reduce((s, e) => s + (e.pensionDeduction ?? 0), 0);
    return { gross, withheld, pension };
  }, [employersWithData]);

  const bracketCalc = useMemo(
    () => calculateTaxOnIncome(totals.gross, year),
    [totals.gross, year]
  );

  const marginalRate = useMemo(() => {
    const last = bracketCalc.byBracket[bracketCalc.byBracket.length - 1];
    return last?.rate ?? 0;
  }, [bracketCalc]);

  const effectiveRate = totals.gross > 0 ? bracketCalc.tax / totals.gross : 0;
  const netTakeHome = Math.max(0, totals.gross - totals.withheld - totals.pension);

  // Chart data ───────────────────────────────────────────────────────────────
  const bracketData = bracketCalc.byBracket.map((b) => ({
    name: `${Math.round(b.rate * 100)}%`,
    tax: b.tax,
    taxable: b.taxableAmount,
    rate: b.rate,
  }));

  const employerData = employersWithData.map((e) => ({
    name: e.name.length > 14 ? e.name.slice(0, 14) + "…" : e.name,
    gross: e.grossSalary ?? 0,
    tax: e.taxWithheld ?? 0,
    pension: e.pensionDeduction ?? 0,
  }));

  const pieData = [
    { name: "מס הכנסה",        value: totals.withheld, fill: "#ef4444" },
    { name: "הפרשות פנסיוניות", value: totals.pension,  fill: "#6366F1" },
    { name: "נטו לעובד",         value: netTakeHome,     fill: "#10B981" },
  ].filter((d) => d.value > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8" dir="rtl">
      {/* ── Top nav ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground
                     hover:text-foreground bg-card border border-border
                     hover:border-muted-foreground/40 px-4 py-2.5 rounded-xl shadow-sm
                     transition-all duration-150 hover:shadow"
        >
          <ArrowRight className="w-4 h-4" />
          <span>חזור ללוח הבקרה הראשי</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="text-end">
            <h1 className="text-lg font-bold text-foreground">
              ניתוח מס הכנסה
            </h1>
            <p className="text-xs text-muted-foreground">
              טופס 106 · שנת מס {year}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <ReceiptText className="w-5 h-5 text-amber-600" />
          </div>
        </div>
      </div>

      {!hasData ? (
        <NoDataState />
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {/* ── Row 1: summary cards ──────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              label="ברוטו שנתי"
              value={formatILS(totals.gross)}
              sublabel={`${employersWithData.length} מעסיק${employersWithData.length > 1 ? "ים" : ""}`}
              icon={<Wallet className="w-5 h-5" />}
              tint="emerald"
            />
            <SummaryCard
              label="מס הכנסה שנוכה"
              value={formatILS(totals.withheld)}
              sublabel={`הפרשות פנסיה: ${formatILS(totals.pension)}`}
              icon={<ReceiptText className="w-5 h-5" />}
              tint="rose"
            />
            <SummaryCard
              label="שיעור מס אפקטיבי"
              value={formatPct(effectiveRate)}
              sublabel="מס בפועל / ברוטו"
              icon={<Percent className="w-5 h-5" />}
              tint="indigo"
            />
            <SummaryCard
              label="מדרגת מס שולית"
              value={formatPct(marginalRate)}
              sublabel="השקל הבא ימוסה בשיעור זה"
              icon={<TrendingUp className="w-5 h-5" />}
              tint="amber"
            />
          </motion.div>

          {/* ── Row 2: bracket bar + breakdown pie ────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bracket bar chart */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1 text-right">
                חישוב מס לפי מדרגות
              </h3>
              <p className="text-xs text-muted-foreground mb-4 text-right">
                כמה מס נגבה על כל שכבת הכנסה ({formatILS(bracketCalc.tax)} בסך הכול)
              </p>
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={bracketData}
                    margin={{ top: 18, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatCompactILS(v)}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      content={<CurrencyTooltip />}
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    />
                    <Bar
                      dataKey="tax"
                      name="מס במדרגה"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={56}
                      fill="#f59e0b"
                    >
                      <LabelList
                        dataKey="tax"
                        position="top"
                        fontSize={10}
                        fill="#64748b"
                        formatter={(v) => {
                          const n = typeof v === "number" ? v : Number(v);
                          return n > 0 ? formatCompactILS(n) : "";
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gross breakdown pie */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1 text-right">
                לאן הלך הברוטו שלך
              </h3>
              <p className="text-xs text-muted-foreground mb-4 text-right">
                פירוק הברוטו למס, פנסיה ונטו לעובד
              </p>
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={`slice-${i}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CurrencyTooltip />} />
                    <Legend content={renderLegend} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>

          {/* ── Row 3: employer comparison (only when >1 employer) ───────── */}
          {employerData.length > 1 && (
            <motion.div variants={fadeUp}>
              <div className="bg-card rounded-2xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-1 text-right">
                  השוואת מעסיקים
                </h3>
                <p className="text-xs text-muted-foreground mb-4 text-right">
                  ברוטו, מס שנוכה והפרשות פנסיוניות לכל מעסיק
                </p>
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={employerData}
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => formatCompactILS(v)}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <Tooltip
                        content={<CurrencyTooltip />}
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      />
                      <Legend content={renderLegend} />
                      <Bar dataKey="gross"   name="ברוטו"  fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={42} />
                      <Bar dataKey="tax"     name="מס"     fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={42} />
                      <Bar dataKey="pension" name="פנסיה" fill="#6366F1" radius={[6, 6, 0, 0]} maxBarSize={42} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Row 4: bracket detail table ──────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 text-right">
                פירוט מדרגות מס — {year}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 text-right font-medium">מדרגה</th>
                      <th className="py-2 text-right font-medium">שיעור</th>
                      <th className="py-2 text-right font-medium">הכנסה במדרגה</th>
                      <th className="py-2 text-right font-medium">מס במדרגה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bracketCalc.byBracket.map((b) => (
                      <tr
                        key={b.bracket}
                        className={`border-b border-border/50 ${
                          b.rate === marginalRate ? "bg-amber-50/60 dark:bg-amber-900/10" : ""
                        }`}
                      >
                        <td className="py-2 text-right tabular-nums">{b.bracket}</td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {Math.round(b.rate * 100)}%
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatILS(b.taxableAmount)}
                        </td>
                        <td className="py-2 text-right tabular-nums font-semibold">
                          {formatILS(b.tax)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="py-2 text-right" colSpan={3}>
                        סך מס לפי חישוב מדרגות
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatILS(bracketCalc.tax)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3 text-right leading-relaxed">
                החישוב לעיל מבוסס על הברוטו המצטבר מטפסי 106 שלך, לפני נקודות זיכוי
                והכרה בהפקדות פנסיוניות. הסכום שנוכה בפועל עשוי להיות נמוך יותר בזכות
                הזיכויים המגיעים לך — ראה את לוח הבקרה הראשי לחישוב החזר המס המלא.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
