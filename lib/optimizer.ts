import type { TaxPayer, FinancialData } from "@/types";
import { calculateFullRefund } from "./calculateTax";
import peripheryData from "@/data/periphery_postcodes.json";

// Pre-build a set of all eligible-settlement names across the published years.
// Used purely as a hint signal (does the typed city name MATCH a statute row?)
// — NOT as the source of the discount calculation, which is per-year per-name.
const peripheryCityNames: Set<string> = (() => {
  const data = peripheryData as {
    years: Record<string, { settlements: Record<string, unknown> }>;
  };
  const set = new Set<string>();
  for (const yr of Object.values(data.years ?? {})) {
    for (const name of Object.keys(yr?.settlements ?? {})) {
      // Names look like "באר שבע" or "אבו קרינאת (יישוב)".
      const normalized = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
      if (normalized) set.add(normalized);
    }
  }
  return set;
})();

function cityLooksPeripheral(city: string): boolean {
  const trimmed = city.trim();
  if (!trimmed) return false;
  // Exact match only — don't fuzzy-match "תל אביב" into "תל אביב יפו".
  return peripheryCityNames.has(trimmed);
}

export interface OptimizationSuggestion {
  id: string;
  title: string;
  description: string;
  estimatedSaving: number; // ILS
  priority: "high" | "medium" | "low";
  action: "add_deduction" | "update_profile" | "review_credits" | "spread_severance";
  actionPayload?: Record<string, unknown>;
}

export function generateOptimizations(
  taxpayer: TaxPayer,
  financials: FinancialData,
  taxYear: number
): OptimizationSuggestion[] {
  const result = financials.calculationResult ?? calculateFullRefund(taxpayer, taxYear);
  const suggestions: OptimizationSuggestion[] = [];
  const creditPointValue = taxYear === 2025 ? 3000 : 2904;

  // 1. Check if donation would be beneficial
  const hasDonation = taxpayer.personalDeductions.some((d) => d.type === "donation_sec46");
  if (!hasDonation && result.taxableIncome > 50000) {
    const potentialDonation = Math.min(result.taxableIncome * 0.10, 10000);
    const saving = Math.round(potentialDonation * 0.35);
    suggestions.push({
      id: "opt-donation",
      title: "תרומה מוכרת לפי סעיף 46",
      description: `תרומה של ₪${potentialDonation.toLocaleString("he-IL")} לעמותה מוכרת תחסוך ₪${saving.toLocaleString("he-IL")} במס (35% זיכוי).`,
      estimatedSaving: saving,
      priority: saving > 1000 ? "high" : "medium",
      action: "add_deduction",
      actionPayload: { type: "donation_sec46" },
    });
  }

  // 2. Pension deposit missing
  const hasPension = taxpayer.personalDeductions.some((d) => d.type === "pension_sec47" || d.type === "provident_fund_sec47");
  if (!hasPension && result.taxableIncome > 80000) {
    const optimalDeposit = Math.min(result.taxableIncome * 0.05, 10000);
    const saving = Math.round(optimalDeposit * 0.35);
    suggestions.push({
      id: "opt-pension",
      title: "הפקדה לפנסיה עצמאית — סעיף 47",
      description: `הפקדה עצמאית של ₪${optimalDeposit.toLocaleString("he-IL")} לפנסיה/קופת גמל תחסוך ₪${saving.toLocaleString("he-IL")} (35% זיכוי, תקרה ₪10,000).`,
      estimatedSaving: saving,
      priority: "high",
      action: "add_deduction",
      actionPayload: { type: "pension_sec47" },
    });
  }

  // 3. Severance spreading
  if (taxpayer.lifeEvents?.pulledSeverancePay && taxpayer.lifeEvents?.taxableSeverancePay) {
    const severance = taxpayer.lifeEvents.taxableSeverancePay;
    const lumpSumTax = Math.round(severance * 0.35); // rough marginal
    const spreadTax = Math.round(severance * 0.20); // rough lower marginal over 3 years
    const saving = lumpSumTax - spreadTax;
    if (saving > 0) {
      suggestions.push({
        id: "opt-severance",
        title: "פריסת פיצויים — סעיף 8ג",
        description: `פריסת ₪${severance.toLocaleString("he-IL")} פיצויים על 3 שנים חוסכת כ-₪${saving.toLocaleString("he-IL")} במס.`,
        estimatedSaving: saving,
        priority: "high",
        action: "spread_severance",
      });
    }
  }

  // 4. Oleh chadash — DO NOT auto-suggest to every user who hasn't set an
  // aliyahDate. The overwhelming majority of Israeli taxpayers are lifelong
  // residents and pushing a "check עולה חדש eligibility" card at them was
  // noise. The CreditQuiz (components/CreditQuiz.tsx) asks the question
  // explicitly instead — that's the right place for opt-in discovery.

  // 5. LTC insurance missing
  const hasLtc = taxpayer.personalDeductions.some((d) => d.type === "ltc_insurance_sec45a");
  const hasLifeIns = taxpayer.personalDeductions.some((d) => d.type === "life_insurance_sec45a");
  if (!hasLtc && !hasLifeIns && result.taxableIncome > 100000) {
    suggestions.push({
      id: "opt-ltc",
      title: "ביטוח חיים / סיעודי — סעיף 45א",
      description: `פרמיית ביטוח חיים או סיעודי מזכה ב-25% זיכוי. פרמיה שנתית ממוצעת של ₪3,600 = זיכוי ₪900.`,
      estimatedSaving: 900,
      priority: "low",
      action: "add_deduction",
      actionPayload: { type: "life_insurance_sec45a" },
    });
  }

  // 6. Periphery — F-007 corrected: periphery is a per-settlement % discount
  // (rate 7%-20%, per-settlement ceiling) under סעיף 11 + annual ITA notice,
  // NOT credit-points and NOT a flat tier system. We surface a "set your
  // settlement" hint when:
  //   (a) the user typed a city name that matches a statute row,
  //   (b) they haven't yet provided residenceSettlement nor postcode, and
  //   (c) their peripheryDiscount is currently 0 (uncomputed).
  // Saving uses 7% (the floor rate) on a conservative ₪100k slice — actual
  // benefit is computed precisely once the settlement is set.
  const addr = taxpayer.address;
  if (
    addr?.city &&
    !taxpayer.residenceSettlement &&
    !taxpayer.postcode &&
    !result.peripheryDiscount &&
    cityLooksPeripheral(addr.city)
  ) {
    const conservativeIncomeForHint = Math.min(result.taxableIncome, 100_000);
    const conservativeSaving = Math.round(conservativeIncomeForHint * 0.07);
    suggestions.push({
      id: "opt-periphery",
      title: "בדוק ישוב מוטב",
      description: `${addr.city} עשוי להופיע ברשימת היישובים המוטבים (סעיף 11). הגדר את היישוב בפרופיל כדי לקבל הנחת מס של 7%–20% מההכנסה החייבת (עד תקרה שנתית) — חיסכון משוער מינימלי ₪${conservativeSaving.toLocaleString("he-IL")}.`,
      estimatedSaving: conservativeSaving,
      priority: "low",
      action: "update_profile",
      actionPayload: { field: "residenceSettlement" },
    });
  }
  // Reference unused so TS doesn't fail when downstream callers strip — the
  // existing creditPointValue is still used by the spouse + LTC suggestions.
  void creditPointValue;

  // 7. Non-working spouse unclaimed
  if (taxpayer.maritalStatus === "married" && taxpayer.spouseHasIncome === undefined) {
    suggestions.push({
      id: "opt-spouse",
      title: "אשר סטטוס הכנסת בן/בת זוג",
      description: `אם בן/בת זוגך אינו/ה עובד/ת, מגיעה נקודת זיכוי נוספת (0.5) בשווי ₪${Math.round(0.5 * creditPointValue).toLocaleString("he-IL")}.`,
      estimatedSaving: Math.round(0.5 * creditPointValue),
      priority: "medium",
      action: "update_profile",
      actionPayload: { field: "spouseHasIncome" },
    });
  }

  // 8. F-030 — מענק עבודה (Earned Income Tax Credit / EITC) eligibility nudge.
  // סעיף 60א + חוק להגדלת ההכנסה החודשית מעבודה (מענק עבודה).
  // Paid by ביטוח לאומי (not רשות המסים), but a common refund scenario for the
  // target audience. Eligibility tiers (2025 figures):
  //   • Low-income (gross < ~₪75K/yr) parent with at least 1 child  → up to ~₪626/mo (~₪7,500/yr).
  //   • Low-income (gross < ~₪75K/yr) single parent / 55+              → richer tier (~₪9,000/yr).
  //   • Low-income (~₪25K-₪75K/yr) without children                    → ~₪1,500/yr.
  // We surface the nudge when income is plausibly inside the band; the actual
  // grant is computed by ביטוח לאומי, so this is purely a discovery nudge.
  const annualGross = result.totalGrossIncome;
  const hasChild = taxpayer.children.length > 0;
  const isSingleParent =
    taxpayer.maritalStatus !== "married" && hasChild;
  if (annualGross >= 25_000 && annualGross <= 75_000) {
    let estimatedAnnualGrant: number;
    let title: string;
    if (isSingleParent) {
      estimatedAnnualGrant = 9_000; // upper-tier single-parent estimate
      title = "מענק עבודה — הורה עצמאי בעל הכנסה נמוכה";
    } else if (hasChild) {
      estimatedAnnualGrant = 7_500; // family-with-children estimate
      title = "מענק עבודה — משפחה עם ילדים";
    } else {
      estimatedAnnualGrant = 1_500; // no-children base estimate
      title = "מענק עבודה — עובד בהכנסה נמוכה";
    }
    suggestions.push({
      id: "opt-eitc",
      title,
      description:
        `על-בסיס שכר ברוטו של ₪${annualGross.toLocaleString("he-IL")} ייתכן שאתם זכאים ל"מענק עבודה" (מס שלילי) של עד כ-₪${estimatedAnnualGrant.toLocaleString("he-IL")} בשנה. המענק משולם ע"י ביטוח לאומי (לא רשות המסים) — יש להגיש בקשה ב-MyGov או בסניף ביטוח לאומי. סעיף 60א + חוק מענק עבודה.`,
      estimatedSaving: estimatedAnnualGrant,
      priority: isSingleParent ? "high" : "medium",
      action: "review_credits",
      actionPayload: { type: "eitc_maanak_avoda" },
    });
  }

  // Sort by estimated saving descending
  return suggestions.sort((a, b) => b.estimatedSaving - a.estimatedSaving).slice(0, 6);
}
