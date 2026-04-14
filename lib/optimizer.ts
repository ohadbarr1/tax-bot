import type { TaxPayer, FinancialData } from "@/types";
import { calculateFullRefund } from "./calculateTax";

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

  // 4. Oleh chadash unclaimed
  if (!taxpayer.aliyahDate && !result.breakdown.creditPointsBreakdown.oleh_chadash_3pts) {
    suggestions.push({
      id: "opt-oleh",
      title: "בדוק זכאות — עולה חדש",
      description: `עולים חדשים זכאים לעד 3 נקודות זיכוי (₪${(3 * creditPointValue).toLocaleString("he-IL")}/שנה) ב-3.5 השנים הראשונות. עדכן תאריך עלייה בפרופיל.`,
      estimatedSaving: 3 * creditPointValue,
      priority: "medium",
      action: "update_profile",
      actionPayload: { field: "aliyahDate" },
    });
  }

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

  // 6. Periphery postcode missing
  if (!taxpayer.postcode && !result.breakdown.creditPointsBreakdown.periphery) {
    suggestions.push({
      id: "opt-periphery",
      title: "בדוק ישוב פריפריה",
      description: `תושבי ישובים פריפריאליים זכאים ל-0.5-1.0 נקודת זיכוי (₪${Math.round(0.5 * creditPointValue).toLocaleString("he-IL")}–₪${creditPointValue.toLocaleString("he-IL")}). עדכן מיקוד בפרופיל.`,
      estimatedSaving: creditPointValue,
      priority: "low",
      action: "update_profile",
      actionPayload: { field: "postcode" },
    });
  }

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

  // Sort by estimated saving descending
  return suggestions.sort((a, b) => b.estimatedSaving - a.estimatedSaving).slice(0, 6);
}
