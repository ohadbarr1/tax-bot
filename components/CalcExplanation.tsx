"use client";

import { useApp } from "@/lib/appContext";
import type { CalculationResult } from "@/lib/calculateTax";

/**
 * CalcExplanation — Output 2. A transparent, line-by-line derivation of the tax
 * liability/refund: gross → income deductions → taxable → bracket tax → each
 * credit/discount line → surtax → tax owed → capital-gains tax → withholding →
 * net refund/balance. Renders the engine's existing `breakdown`; no new math.
 */

const ils = (n: number) =>
  (n < 0 ? "−₪" : "₪") + Math.round(Math.abs(n)).toLocaleString("he-IL");

type Row = {
  label: string;
  value: number;
  kind?: "add" | "sub" | "subtotal" | "total";
  note?: string;
  hideIfZero?: boolean;
};

export function CalcExplanation() {
  const { state } = useApp();
  const r = state.financials.calculationResult as CalculationResult | undefined;

  if (!r) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        החישוב יוצג כאן לאחר השלמת השאלון והעלאת המסמכים.
      </div>
    );
  }

  const rows: Row[] = [
    { label: "הכנסה ברוטו כוללת", value: r.totalGrossIncome },
    { label: "ניכויים מההכנסה", value: -r.incomeDeductions, kind: "sub", note: "פנסיה, מזונות, פטור נכות וכד׳", hideIfZero: true },
    { label: "הכנסה חייבת", value: r.taxableIncome, kind: "subtotal" },
    { label: "מס לפי מדרגות", value: r.calculatedTax, kind: "add" },
    { label: "נקודות זיכוי", value: -r.creditPointsValue, kind: "sub", note: `${r.creditPointsCount} נק׳ × ערך שנתי`, hideIfZero: true },
    { label: "זיכויי ניכויים", value: -r.deductionCredits, kind: "sub", note: "תרומות §46, ביטוח חיים §45א וכד׳", hideIfZero: true },
    { label: "הנחת פריפריה (§11)", value: -r.peripheryDiscount, kind: "sub", hideIfZero: true },
    { label: "זיכוי מס זר על שכר (§67א)", value: -r.foreignSalaryCredit, kind: "sub", hideIfZero: true },
    { label: "הנחת עבודה במשמרות", value: -r.shiftWorkDiscount, kind: "sub", hideIfZero: true },
    { label: "מס יסף (§121ב)", value: r.surtax, kind: "add", hideIfZero: true },
    { label: "מס הכנסה לתשלום", value: r.netTaxOwed, kind: "subtotal" },
    { label: "מס על רווחי הון", value: r.capitalGainsTax, kind: "add", hideIfZero: true },
    { label: "מס שנוכה במקור", value: -r.taxPaid, kind: "sub", note: "סך הניכויים מהמשכורת ובמקור", hideIfZero: true },
  ];

  const isRefund = r.netRefund >= 0;
  const finalRow: Row = {
    label: isRefund ? "החזר מס צפוי" : "יתרת מס לתשלום",
    value: Math.abs(r.netRefund),
    kind: "total",
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/40">
        <h2 className="text-base font-bold text-foreground">איך חישבנו את הסכום</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          כל שורה נגזרת מהנתונים שמסרת ומפקודת מס הכנסה.
        </p>
      </div>

      <div className="divide-y divide-border">
        {rows
          .filter((row) => !(row.hideIfZero && Math.abs(row.value) < 1))
          .map((row, i) => (
            <Line key={i} row={row} />
          ))}
      </div>

      {/* Bracket detail */}
      {r.breakdown?.byBracket?.length > 0 && (
        <details className="border-t border-border">
          <summary className="px-5 py-3 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
            פירוט מדרגות המס
          </summary>
          <div className="px-5 pb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-right">
                  <th className="py-1 font-medium">שיעור</th>
                  <th className="py-1 font-medium">הכנסה במדרגה</th>
                  <th className="py-1 font-medium">מס</th>
                </tr>
              </thead>
              <tbody>
                {r.breakdown.byBracket
                  .filter((b) => b.taxableAmount > 0)
                  .map((b, i) => (
                    <tr key={i} className="text-foreground">
                      <td className="py-1">{Math.round(b.rate * 100)}%</td>
                      <td className="py-1">{ils(b.taxableAmount)}</td>
                      <td className="py-1">{ils(b.tax)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Final */}
      <div
        className={
          "px-5 py-4 flex items-center justify-between border-t-2 " +
          (isRefund ? "border-emerald-400 bg-emerald-50" : "border-amber-400 bg-amber-50")
        }
      >
        <span className="text-sm font-bold text-foreground">{finalRow.label}</span>
        <span className={"text-xl font-extrabold " + (isRefund ? "text-emerald-700" : "text-amber-700")}>
          {ils(finalRow.value)}
        </span>
      </div>

      {r.warnings && r.warnings.length > 0 && (
        <div className="px-5 py-3 border-t border-border text-xs text-amber-700 bg-amber-50/60 space-y-1">
          {r.warnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ row }: { row: Row }) {
  const subtotal = row.kind === "subtotal";
  return (
    <div
      className={
        "px-5 py-2.5 flex items-center justify-between " +
        (subtotal ? "bg-muted/30 font-semibold" : "")
      }
    >
      <div className="flex flex-col">
        <span className={"text-sm " + (subtotal ? "text-foreground font-semibold" : "text-foreground")}>
          {row.label}
        </span>
        {row.note && <span className="text-[11px] text-muted-foreground">{row.note}</span>}
      </div>
      <span
        className={
          "text-sm tabular-nums " +
          (row.kind === "sub" ? "text-emerald-700" : subtotal ? "font-bold text-foreground" : "text-foreground")
        }
      >
        {ils(row.value)}
      </span>
    </div>
  );
}
