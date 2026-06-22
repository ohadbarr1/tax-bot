"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/appContext";
import { calculateFullRefund, type CalculationResult } from "@/lib/calculateTax";
import { currentTaxYear } from "@/lib/currentTaxYear";

/**
 * CalcExplanation — Output 2. A transparent, line-by-line derivation of the tax
 * liability/refund: gross → income deductions → taxable → bracket tax → each
 * credit/discount line → surtax → tax owed → capital-gains tax → withholding →
 * net refund/balance. Renders the engine's existing `breakdown`; no new math.
 */

const ils = (n: number) => {
  const v = Number.isFinite(n) ? n : 0; // never render "NaN ₪"
  return (v < 0 ? "−₪" : "₪") + Math.round(Math.abs(v)).toLocaleString("he-IL");
};

type Row = {
  label: string;
  value: number;
  kind?: "add" | "sub" | "subtotal" | "total";
  note?: string;
  hideIfZero?: boolean;
};

export function CalcExplanation() {
  const { state } = useApp();
  // Prefer the stored result; otherwise compute live from the canonical taxpayer
  // (the questionnaire writes taxpayer without a recalc, so a questionnaire-only
  // user would otherwise see nothing). Pure read — no state mutation.
  const stored = state.financials.calculationResult as CalculationResult | undefined;
  const year = state.financials.taxYears?.[0] ?? currentTaxYear();
  const r = useMemo<CalculationResult | undefined>(() => {
    if (stored) return stored;
    try {
      const computed = calculateFullRefund(state.taxpayer, year);
      return computed.totalGrossIncome > 0 ? computed : undefined;
    } catch {
      return undefined;
    }
  }, [stored, state.taxpayer, year]);

  if (!r) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        החישוב יוצג כאן לאחר השלמת השאלון והעלאת המסמכים.
      </div>
    );
  }

  // Derivations that mirror the engine exactly so the lines reconcile to netRefund:
  //   calculatedTax is ALREADY net of shiftWorkDiscount → show raw bracket tax,
  //   then subtract the shift-work discount as its own line.
  //   netTaxOwed excludes surtax & CGT; total liability = netTaxOwed + CGT + surtax.
  //   netRefund = taxPaid − totalLiability. taxPaid bundles the F-023 overlap
  //   estimate → split it out and flag it as an estimate, not true withholding.
  const rawBracketTax = r.calculatedTax + r.shiftWorkDiscount;
  const totalLiability = r.netTaxOwed + r.capitalGainsTax + r.surtax;
  const employerWithheld = r.taxPaid - r.multiEmployerOverlapRefund;
  const creditsExceedTax =
    rawBracketTax - r.shiftWorkDiscount - r.creditPointsValue - r.deductionCredits - r.peripheryDiscount - r.foreignSalaryCredit < 0;
  const cgtNote = (state.taxpayer.capitalGains?.foreignTaxWithheld ?? 0) > 0 ? "לאחר זיכוי מס זר ששולם בחו״ל" : undefined;

  const rows: Row[] = [
    { label: "הכנסה ברוטו כוללת", value: r.totalGrossIncome },
    { label: "ניכויים מההכנסה", value: -r.incomeDeductions, kind: "sub", note: "פנסיה, מזונות, פטור נכות וכד׳", hideIfZero: true },
    { label: "הכנסה חייבת", value: r.taxableIncome, kind: "subtotal" },
    { label: "מס לפי מדרגות", value: rawBracketTax, kind: "add" },
    { label: "הנחת עבודה במשמרות", value: -r.shiftWorkDiscount, kind: "sub", hideIfZero: true },
    { label: "נקודות זיכוי", value: -r.creditPointsValue, kind: "sub", note: `${r.creditPointsCount} נק׳ × ערך שנתי`, hideIfZero: true },
    { label: "זיכויי מס (§46, §45א)", value: -r.deductionCredits, kind: "sub", note: "תרומות, ביטוח חיים וכד׳", hideIfZero: true },
    { label: "הנחת פריפריה (§11)", value: -r.peripheryDiscount, kind: "sub", hideIfZero: true },
    { label: "זיכוי מס זר על שכר (§67א)", value: -r.foreignSalaryCredit, kind: "sub", hideIfZero: true },
    {
      label: "מס הכנסה לתשלום",
      value: r.netTaxOwed,
      kind: "subtotal",
      note: creditsExceedTax ? "הזיכויים האישיים אינם מוחזרים — עודף הזיכוי לא נוצל" : undefined,
    },
    { label: "מס על רווחי הון", value: r.capitalGainsTax, kind: "add", note: cgtNote, hideIfZero: true },
    { label: "מס יסף (§121ב)", value: r.surtax, kind: "add", hideIfZero: true },
    { label: "סך חבות המס", value: totalLiability, kind: "subtotal" },
    { label: "מס שנוכה במקור", value: -employerWithheld, kind: "sub", note: "ניכויים מהמשכורת ובמקור", hideIfZero: true },
  ];
  if (r.multiEmployerOverlapRefund > 0) {
    rows.push({
      label: "החזר משוער מחפיפת מעסיקים (הערכה)",
      value: -r.multiEmployerOverlapRefund,
      kind: "sub",
      note: "אומדן בלבד — אינו ניכוי במקור בפועל",
    });
  }

  const isRefund = r.netRefund >= 0;
  const finalRow: Row = {
    label: isRefund ? "החזר מס צפוי" : "יתרת מס לתשלום",
    value: Math.abs(r.netRefund),
    kind: "total",
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/40">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-foreground">איך חישבנו את הסכום</h2>
          {!stored && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              תצוגה מקדימה — טרם נשמר
            </span>
          )}
        </div>
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
