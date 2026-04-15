import type { TaxPayer, FinancialData } from "@/types";
import { calculateFullRefund } from "./calculateTax";
import peripheryData from "@/data/periphery_postcodes.json";

// Pre-build a lowercase set of city names mentioned in the periphery dataset.
// We can't look up by postcode (the user hasn't entered one yet — that's the
// whole point of the suggestion), but if they live in a Hebrew city name that
// appears anywhere in the periphery postcode map we surface the suggestion.
const peripheryCityNames: Set<string> = (() => {
  const data = peripheryData as { postcodes: Record<string, { city: string }> };
  const set = new Set<string>();
  for (const entry of Object.values(data.postcodes)) {
    if (!entry?.city) continue;
    // City entries look like "באר שבע" or "ירושלים (שכונות פריפריה)".
    // Strip the parenthetical qualifier so "ירושלים" matches on its own.
    const normalized = entry.city.replace(/\s*\([^)]*\)\s*/g, "").trim();
    if (normalized) set.add(normalized);
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

  // 6. Periphery — same reasoning as oleh chadash: do not auto-surface to
  // every user. Only cities in `data/periphery_postcodes.json` qualify and
  // the user already declared their city in Step 0. If we want to surface a
  // match we should do a positive city→postcode lookup and only suggest when
  // the city hit, not when the postcode field is blank.
  const addr = taxpayer.address;
  if (
    addr?.city &&
    !taxpayer.postcode &&
    !result.breakdown.creditPointsBreakdown.periphery &&
    cityLooksPeripheral(addr.city)
  ) {
    suggestions.push({
      id: "opt-periphery",
      title: "בדוק ישוב פריפריה",
      description: `${addr.city} עשוי להיות מזוהה כישוב פריפריה. הוסף מיקוד לפרופיל כדי לחשב זכאות לנקודת זיכוי (₪${Math.round(0.5 * creditPointValue).toLocaleString("he-IL")}–₪${creditPointValue.toLocaleString("he-IL")}).`,
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
