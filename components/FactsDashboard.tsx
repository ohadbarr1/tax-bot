"use client";

/**
 * FactsDashboard — /facts
 *
 * Shows the user's full financial picture for the tax year:
 *   - Income sources (salary, capital gains, dividends, RSU placeholder)
 *   - Taxes paid
 *   - Tax calculation summary (if calculationResult exists)
 *   - PieChart (income breakdown) + BarChart (tax bracket breakdown)
 */

import { useApp } from "@/lib/appContext";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Briefcase,
  TrendingUp,
  GitBranch,
  Upload,
  ReceiptText,
  PieChart as PieIcon,
  ArrowLeft,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

// ─── Custom Recharts Tooltips ─────────────────────────────────────────────────

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

const ILSTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm" dir="rtl">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-bold tabular-nums">
          {fmt(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
};

const PieTooltipILS = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm" dir="rtl">
      <p className="font-semibold text-slate-700 mb-1">{item.name}</p>
      <p className="font-bold tabular-nums" style={{ color: item.payload?.fill ?? item.color }}>
        {fmt(item.value ?? 0)}
      </p>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderLegendRTL = (props: any) => {
  const payload: { color?: string; value?: string }[] = props?.payload ?? [];
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-3" dir="rtl">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Empty Card ───────────────────────────────────────────────────────────────

function EmptyCard({ title, cta, href }: { title: string; cta: string; href: string }) {
  return (
    <Card className="border-dashed border-2 border-border/60">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
          <Upload className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">לא נמצאו נתונים</p>
        </div>
        <a
          href={href}
          className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
        >
          {cta}
          <ArrowLeft className="w-3.5 h-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}

// ─── Section Heading ──────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function FactsDashboard() {
  const { state, hydrated } = useApp();

  if (!hydrated) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const { taxpayer, financials } = state;
  const { employers, capitalGains } = taxpayer;
  const { calculationResult, ibkrData } = financials;
  const taxYear = financials.taxYears[0] ?? 2024;

  // ── Salary aggregates ─────────────────────────────────────────────────────
  const hasEmployers = employers.length > 0;
  const totalGrossSalary = employers.reduce((s, e) => s + (e.grossSalary ?? 0), 0);
  const totalTaxWithheld = employers.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);

  // ── Capital gains aggregates ──────────────────────────────────────────────
  const hasCapitalGains = !!capitalGains;
  const netCapitalGain = hasCapitalGains
    ? (capitalGains!.totalRealizedProfit ?? 0) - (capitalGains!.totalRealizedLoss ?? 0)
    : 0;

  // ── Total income ──────────────────────────────────────────────────────────
  const dividendsILS = capitalGains?.dividends ?? 0;
  const totalIncome = totalGrossSalary + Math.max(0, netCapitalGain) + dividendsILS;

  // ── Effective rate ────────────────────────────────────────────────────────
  const capitalGainsTaxPaid = calculationResult?.capitalGainsTax ?? 0;
  const totalTaxPaid = totalTaxWithheld + capitalGainsTaxPaid;
  const effectiveRate = totalIncome > 0 ? (totalTaxPaid / totalIncome) * 100 : 0;

  // ── Pie chart: income breakdown ───────────────────────────────────────────
  const pieData = [
    totalGrossSalary > 0 && { name: "משכורת", value: totalGrossSalary, fill: "#6366F1" },
    netCapitalGain > 0 && { name: "רווח הון נטו", value: netCapitalGain, fill: "#10B981" },
    dividendsILS > 0 && { name: "דיבידנדים", value: dividendsILS, fill: "#F59E0B" },
  ].filter(Boolean) as { name: string; value: number; fill: string }[];

  const hasPieData = pieData.length > 0;

  // ── Bar chart: bracket breakdown ──────────────────────────────────────────
  const bracketData = calculationResult?.breakdown?.byBracket ?? [];
  const hasBarData = bracketData.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8" dir="rtl">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">תמונת מצב</h1>
        <p className="text-sm text-muted-foreground mt-1">
          סקירת הכנסות ומסים לשנת המס {taxYear}
        </p>
      </div>

      <div className="space-y-10">

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — Income Sources (הכנסות)
        ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeading icon={Briefcase} title="הכנסות" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Salary card */}
            {hasEmployers ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-indigo-500" />
                    הכנסות ממשכורת
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(totalGrossSalary)}</p>
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    {employers.map((emp) => (
                      <div key={emp.id} className="flex justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground truncate max-w-[55%]">{emp.name || "מעסיק"}</span>
                        <span className="tabular-nums">{fmt(emp.grossSalary ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <EmptyCard
                title="הכנסות ממשכורת"
                cta="העלה טופס 106"
                href="/documents"
              />
            )}

            {/* Investment card */}
            {hasCapitalGains ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    שוק ההון
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(Math.max(0, netCapitalGain))}</p>
                  <p className="text-xs text-muted-foreground">רווח הון נטו</p>
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">רווחים</span>
                      <span className="tabular-nums text-emerald-600">{fmt(capitalGains!.totalRealizedProfit ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">הפסדים</span>
                      <span className="tabular-nums text-red-500">{fmt(capitalGains!.totalRealizedLoss ?? 0)}</span>
                    </div>
                    {dividendsILS > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">דיבידנדים</span>
                        <span className="tabular-nums text-amber-600">{fmt(dividendsILS)}</span>
                      </div>
                    )}
                    {ibkrData && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">שער יחס $</span>
                        <span className="tabular-nums">{ibkrData.exchangeRate.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <EmptyCard
                title="שוק ההון"
                cta="העלה דוח IBKR"
                href="/documents"
              />
            )}

            {/* RSU placeholder */}
            <Card className="border-dashed border-2 border-border/50 bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-muted-foreground">
                  <GitBranch className="w-4 h-4" />
                  RSU / אופציות
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">תמיכה ב-RSU בקרוב</p>
              </CardContent>
            </Card>
          </div>

          {/* Total income row */}
          {totalIncome > 0 && (
            <div className="mt-4 flex items-center justify-between bg-primary/5 border border-primary/15 rounded-2xl px-5 py-4">
              <span className="text-sm font-semibold text-foreground">סך הכנסות</span>
              <span className="text-xl font-bold tabular-nums text-primary">{fmt(totalIncome)}</span>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2 — Taxes Paid (מסים ששולמו)
        ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeading icon={ReceiptText} title="מסים ששולמו" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">מס הכנסה שנוכה</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(totalTaxWithheld)}</p>
                <p className="text-xs text-muted-foreground mt-1">ממעסיקים</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">מס רווחי הון</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(capitalGainsTaxPaid)}</p>
                <p className="text-xs text-muted-foreground mt-1">25% על רווח נטו</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">שיעור מס אפקטיבי</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-foreground">{pct(effectiveRate)}</p>
                <p className="text-xs text-muted-foreground mt-1">מסך ההכנסה</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 3 — Tax Calculation Summary
        ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeading icon={ReceiptText} title="סיכום חישוב מס" />

          {calculationResult ? (
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {[
                    { label: "הכנסה ברוטו", value: calculationResult.totalGrossIncome, highlight: false },
                    { label: "הכנסה חייבת במס", value: calculationResult.taxableIncome, highlight: false },
                    { label: "מס מחושב (לפי מדרגות)", value: calculationResult.calculatedTax, highlight: false },
                    { label: "נקודות זיכוי", value: -calculationResult.creditPointsValue, highlight: false, negative: true },
                    { label: "זיכויים נוספים", value: -calculationResult.deductionCredits, highlight: false, negative: true },
                    { label: "מס לאחר זיכויים", value: calculationResult.netTaxOwed, highlight: false },
                    { label: "החזר ממעסיקים", value: calculationResult.refundFromEmployment, highlight: true },
                    { label: "מס רווחי הון", value: -calculationResult.capitalGainsTax, highlight: false, negative: true },
                    { label: "החזר מס נטו", value: calculationResult.netRefund, highlight: true, accent: true },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between py-2 border-b border-border/50 last:border-0 ${
                        row.accent ? "bg-green-50 rounded-xl px-3 -mx-3" : ""
                      }`}
                    >
                      <span className={`text-sm ${row.highlight ? "font-semibold" : "text-muted-foreground"}`}>
                        {row.label}
                      </span>
                      <span
                        className={`tabular-nums font-semibold text-sm ${
                          row.accent
                            ? "text-green-700 text-base font-bold"
                            : row.negative && (row.value ?? 0) < 0
                            ? "text-red-500"
                            : row.highlight
                            ? "text-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {fmt(Math.abs(row.value ?? 0))}
                        {row.negative && (row.value ?? 0) < 0 ? " -" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyCard
              title="עדיין לא מולא שאלון"
              cta="למילוי השאלון"
              href="/questionnaire"
            />
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 4 — Charts
        ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeading icon={PieIcon} title="גרפים" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pie — income breakdown */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 text-right">פילוח הכנסות</h3>
              {hasPieData ? (
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
                        {pieData.map((entry, i) => (
                          <Cell key={`pie-${i}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltipILS />} />
                      <Legend content={renderLegendRTL} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  אין נתונים להצגה
                </div>
              )}
            </div>

            {/* Bar — bracket breakdown */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 text-right">מס לפי מדרגות (₪)</h3>
              {hasBarData ? (
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={bracketData.map((b) => ({
                        name: `${(b.rate * 100).toFixed(0)}%`,
                        מס: b.tax,
                        הכנסה: b.taxableAmount,
                      }))}
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis
                        tickFormatter={(v: number) => `₪${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <Tooltip content={<ILSTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="מס" fill="#6366F1" radius={[6, 6, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  מלא את השאלון לצפייה בפירוט
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
