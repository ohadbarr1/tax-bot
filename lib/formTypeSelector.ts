/**
 * Form Type Selector — determines whether the taxpayer should file
 * Form 135 (simplified refund request) or Form 1301 (full annual return).
 *
 * Decision rules follow Israeli Tax Authority requirements for tax year 2025.
 */

import type { TaxPayer, FinancialData, IncomeSourceId } from "@/types";

export type FormType = "135" | "1301";

export interface FormTypeResult {
  formType: FormType;
  reasons: string[];
}

/** 2025 threshold: gross salary above this requires Form 1301 */
const SALARY_THRESHOLD_2025 = 721_560;

/**
 * Income-source IDs that signal foreign or self-employment income,
 * mapped to their 1301 trigger reason in Hebrew.
 */
const SOURCE_TRIGGERS: Partial<Record<IncomeSourceId, string>> = {
  freelance: "הכנסה מעסק או משלח יד (פרילנס)",
  foreign:   "הכנסות מחו\"ל",
  crypto:    "הכנסות ממטבעות דיגיטליים (נחשב הכנסה חייבת בדיווח מלא)",
};

export function determineFormType(
  taxpayer: TaxPayer,
  financials: FinancialData,
  selectedSources?: IncomeSourceId[],
): FormTypeResult {
  const reasons: string[] = [];

  // ── 1. Self-employment / business income ──────────────────────────────────
  if (selectedSources?.includes("freelance")) {
    reasons.push("הכנסה מעסק או משלח יד (פרילנס)");
  }

  // ── 2. Foreign income (onboarding tag) ────────────────────────────────────
  if (selectedSources?.includes("foreign")) {
    reasons.push("הכנסות מחו\"ל");
  }

  // ── 3. Crypto income ──────────────────────────────────────────────────────
  if (selectedSources?.includes("crypto")) {
    reasons.push("הכנסות ממטבעות דיגיטליים");
  }

  // ── 4. Foreign broker (IBKR etc.) ─────────────────────────────────────────
  if (financials.hasForeignBroker) {
    reasons.push("הכנסות מברוקר זר (IBKR וכד׳) — חייב דיווח בטופס 1301");
  }

  // ── 5. Capital gains from foreign broker ──────────────────────────────────
  if (
    taxpayer.capitalGains &&
    (taxpayer.capitalGains.totalRealizedProfit > 0 ||
      taxpayer.capitalGains.dividends)
  ) {
    // Only flag if we haven't already flagged hasForeignBroker
    if (!financials.hasForeignBroker) {
      reasons.push("רווחי הון או דיבידנדים מחו\"ל");
    }
  }

  // ── 6. Gross salary above threshold ───────────────────────────────────────
  const totalGross = taxpayer.employers.reduce(
    (sum, emp) => sum + (emp.grossSalary ?? 0),
    0,
  );
  if (totalGross > SALARY_THRESHOLD_2025) {
    reasons.push(
      `שכר ברוטו שנתי (${totalGross.toLocaleString("he-IL")} ₪) עולה על סף הדיווח (${SALARY_THRESHOLD_2025.toLocaleString("he-IL")} ₪)`,
    );
  }

  // ── 7. Rental income (detected via onboarding sources) ────────────────────
  if (selectedSources?.includes("rental")) {
    reasons.push("הכנסות משכירות מעל הפטור — מחייב דיווח מלא");
  }

  // ── 8. Stock options ──────────────────────────────────────────────────────
  // The current data model doesn't have an explicit stockOptions field.
  // When `stockOptionsExercised?: boolean` is added to TaxPayer, check here:
  // if ((taxpayer as any).stockOptionsExercised) {
  //   reasons.push("מימוש אופציות/RSU — חייב דיווח בטופס 1301");
  // }

  // ── 9. Controlling shareholder ────────────────────────────────────────────
  // Not yet in TaxPayer interface. When `controllingShareHolder?: boolean`
  // is added:
  // if ((taxpayer as any).controllingShareHolder) {
  //   reasons.push("בעל שליטה בחברה — חייב בהגשת דוח שנתי");
  // }

  // ── Result ────────────────────────────────────────────────────────────────
  if (reasons.length > 0) {
    return { formType: "1301", reasons };
  }

  return {
    formType: "135",
    reasons: ["שכיר ללא הכנסות נוספות — זכאי להגשת טופס 135 מקוצר"],
  };
}

/** User-facing form labels in Hebrew */
export const FORM_LABELS: Record<FormType, { short: string; full: string }> = {
  "135":  { short: "טופס 135", full: "טופס 135 — דין וחשבון מקוצר (בקשה להחזר מס)" },
  "1301": { short: "טופס 1301", full: "טופס 1301 — דין וחשבון שנתי על ההכנסה" },
};
