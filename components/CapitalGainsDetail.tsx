"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/appContext";
import { calculateFullRefund, type CalculationResult } from "@/lib/calculateTax";
import { currentTaxYear } from "@/lib/currentTaxYear";

/**
 * CapitalGainsDetail (Loop 2 / R5) — the per-element drill-down for broker
 * capital gains/losses (the user's 1.6 example). Renders the engine's
 * capitalGainsBreakdown step by step with the rule/§ behind each line, so a
 * filer can trace exactly how the capital-gains tax was reached.
 */
const ils = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  return (v < 0 ? "−₪" : "₪") + Math.round(Math.abs(v)).toLocaleString("he-IL");
};
const paren = (n: number) => `(${ils(Math.abs(n))})`;

export function CapitalGainsDetail() {
  const { state } = useApp();
  const year = state.financials.taxYears?.[0] ?? currentTaxYear();
  const r = useMemo<CalculationResult | undefined>(() => {
    const stored = state.financials.calculationResult as CalculationResult | undefined;
    if (stored?.capitalGainsBreakdown) return stored;
    try {
      return calculateFullRefund(state.taxpayer, year);
    } catch {
      return undefined;
    }
  }, [state.financials.calculationResult, state.taxpayer, year]);

  const b = r?.capitalGainsBreakdown;
  if (!b || (b.grossProfit === 0 && b.dividends === 0 && b.losses === 0)) return null;

  const ratePct = Math.round(b.gainRate * 100);

  const rows: { label: string; value: string; why: string; expense?: boolean; credit?: boolean; subtotal?: boolean }[] = [
    {
      label: "רווח הון ריאלי (מימושים)",
      value: ils(b.grossProfit),
      why: "סך הרווח ממכירת ניירות ערך שמומשו השנה (תמורה פחות עלות מתואמת), לפי דוח הברוקר. סעיף 88 לפקודה.",
    },
    {
      label: "הפסדי הון שמומשו",
      value: paren(b.losses),
      expense: true,
      why: "הפסדים ממכירות מקזזים רווחי הון באותה שנה. סעיף 92(א).",
    },
    {
      label: "הפסד הון מועבר משנים קודמות",
      value: paren(b.carryForwardLoss),
      expense: true,
      why: "הפסד הון שלא נוצל בשנים קודמות מועבר וקוזז כעת. סעיף 92(ב).",
    },
    {
      label: "רווח הון נטו",
      value: ils(b.netGain),
      subtotal: true,
      why: "רווח ריאלי פחות הפסדים פחות הפסד מועבר — הבסיס לחישוב המס.",
    },
    {
      label: `מס על רווח הון (${ratePct}%)`,
      value: paren(b.gainTax),
      expense: true,
      why: b.controllingShareholder
        ? "שיעור 30% — בעל מניות מהותי (מחזיק 10%+). סעיף 91(ב)(1)."
        : "שיעור 25% ליחיד על רווח הון ריאלי מניירות ערך. סעיף 91(ב)(1).",
    },
    {
      label: `מס על דיבידנד (${Math.round(b.dividendRate * 100)}%)`,
      value: paren(b.dividendTax),
      expense: true,
      why: b.controllingShareholder
        ? "דיבידנד לבעל מניות מהותי — 30%. סעיף 125ב(2)."
        : "דיבידנד מניירות ערך סחירים — 25%. סעיף 125ב(1).",
    },
    {
      label: "זיכוי מס זר ששולם בחו״ל",
      value: ils(-b.foreignCredit),
      credit: true,
      why: "מס שנוכה במקור בחו״ל מזוכה כנגד המס הישראלי על אותה הכנסה. סעיף 200/204 (זיכוי מס זר).",
    },
    {
      label: "מס רווחי הון לתשלום",
      value: paren(b.total),
      expense: true,
      subtotal: true,
      why: "המס על רווח ההון והדיבידנד, לאחר זיכוי המס הזר, מתווסף לחבות המס הכוללת.",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/40">
        <h2 className="text-base font-bold text-foreground">פירוט מס רווחי הון</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          כל שלב בחישוב המס על תיק ניירות הערך, עם הסעיף בפקודה שמאחוריו.
        </p>
      </div>
      <div className="divide-y divide-border">
        {rows
          .filter((row) => !/^\(?₪?−?0\)?$/.test(row.value.replace(/[,\s]/g, "")) || row.subtotal)
          .map((row, i) => (
            <div key={i} className={"px-5 py-3 " + (row.subtotal ? "bg-muted/30" : "")}>
              <div className="flex items-center justify-between gap-3">
                <span className={"text-sm " + (row.subtotal ? "font-bold text-foreground" : "text-foreground")}>
                  {row.label}
                </span>
                <span
                  className={
                    "text-sm tabular-nums " +
                    (row.expense ? "text-red-600" : row.credit ? "text-emerald-700" : "font-bold text-foreground")
                  }
                >
                  {row.value}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{row.why}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
