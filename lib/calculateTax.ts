/**
 * calculateTax.ts — Israeli Income Tax Calculation Engine
 *
 * Implements the full tax calculation pipeline for Israeli salaried employees:
 *   1. Progressive bracket tax (מדרגות מס)
 *   2. Credit points (נקודות זיכוי) — resident, marital status, children, academic degrees
 *   3. Personal deduction credits — Sec. 46 (donations), Sec. 45a (life insurance), Sec. 47 (pension)
 *   4. Capital gains tax from foreign broker data (values expected in ILS)
 *   5. Full refund pipeline producing CalculationResult
 *   6. Dashboard insight builder from CalculationResult
 *
 * Data source: app/data/tax_brackets_2024_2025.json (Bank of Israel / ITA figures)
 */

import taxData from "@/data/tax_brackets_2024_2025.json";
import peripheryData from "@/data/periphery_postcodes.json";
import type { TaxPayer, PersonalDeduction, TaxInsight, ActionItem } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalculationResult {
  totalGrossIncome: number;
  incomeDeductions: number;     // Sec. 9A alimony + other income deductions (reduce taxable income)
  taxableIncome: number;        // totalGrossIncome − incomeDeductions
  calculatedTax: number;        // raw progressive bracket tax on taxableIncome
  creditPointsValue: number;    // total credit point value in ILS
  deductionCredits: number;     // total deduction credits in ILS
  netTaxOwed: number;           // calculatedTax − credits (floored at 0)
  taxPaid: number;              // sum of all employer taxWithheld
  refundFromEmployment: number; // taxPaid − netTaxOwed
  capitalGainsTax: number;      // net capital gains tax owed after foreign credit
  netRefund: number;            // refundFromEmployment − capitalGainsTax
  creditPointsCount: number;
  breakdown: {
    byBracket: { bracket: number; rate: number; taxableAmount: number; tax: number }[];
    creditPointsBreakdown: Record<string, number>;
    deductionsBreakdown: Record<string, number>;
  };
}

// ─── 1. Tax Bracket Calculation ───────────────────────────────────────────────

/**
 * Calculate progressive income tax using Israeli tax brackets.
 * Uses a sliding-window approach — prevMax advances through each band.
 *
 * @param grossIncome Annual gross income in ILS
 * @param year        Tax year (2024 or 2025)
 * @returns           Raw tax liability in ILS (before any credits)
 */
export function calculateTaxOnIncome(
  grossIncome: number,
  year: 2024 | 2025
): { tax: number; byBracket: CalculationResult["breakdown"]["byBracket"] } {
  const yearStr = String(year) as "2024" | "2025";
  const brackets = taxData[yearStr].tax_brackets;

  let rawTax = 0;
  let prevMax = 0;
  const byBracket: CalculationResult["breakdown"]["byBracket"] = [];

  for (const b of brackets) {
    if (grossIncome <= prevMax) break;
    const bandTop = Math.min(grossIncome, b.max);
    const taxableAmount = bandTop - prevMax;
    const tax = taxableAmount * b.rate;
    rawTax += tax;
    byBracket.push({ bracket: b.bracket, rate: b.rate, taxableAmount, tax: Math.round(tax) });
    prevMax = b.max;
  }

  return { tax: Math.round(rawTax), byBracket };
}

// ─── 2. Credit Points ─────────────────────────────────────────────────────────

/**
 * Calculate credit points and their ILS value for a taxpayer.
 *
 * Rules applied (P3 extended — all major Israeli ITA credit-point types):
 *
 * BASE:
 *   - Resident:            2.25 pts (always)
 *   - Married:             +1.0 pt
 *   - Non-working spouse:  +0.5 pt (married && spouseHasIncome === false)
 *   - Single parent:       +1.0 pt (divorced/widowed with children)
 *
 * CHILDREN:
 *   - Child in birth year: +1.5 pts
 *   - Child under 18:      +1.0 pt
 *   - Child age 1-2 in daycare: +2.0 pts
 *   - Child age 3-5 in daycare: +2.5 pts
 *
 * DEGREES (1 year STRICTLY AFTER completion):
 *   - BA:  +0.5 pt
 *   - MA:  +0.5 pt
 *   - PHD: +1.0 pt
 *
 * MILITARY SERVICE:
 *   - Post-discharge (years 1-3): +2.0 pts (male) / +1.75 pts (female)
 *
 * ALIYAH:
 *   - Months 1-42:  +3.0 pts
 *   - Months 43-54: +2.0 pts
 *   - Months 55-66: +1.0 pt
 *
 * PERIPHERY (via postcode lookup):
 *   - Tier 1: +1.0 pt
 *   - Tier 2: +0.5 pt
 *
 * KIBBUTZ/MOSHAV: +0.25 pt
 *
 * DISABILITY (Sec. 9(5)):
 *   - 90%+:   2.0 pts
 *   - 50-89%: 1.0 pt
 *   - 20-49%: 0.5 pt
 *
 * @param taxpayer  TaxPayer object
 * @param year      Tax year
 */
export function calculateCreditPoints(
  taxpayer: TaxPayer,
  year: number
): { points: number; annualValue: number; breakdown: Record<string, number> } {
  const creditPointAnnualValue =
    year === 2025
      ? taxData["2025"].credit_point_annual_value
      : taxData["2024"].credit_point_annual_value;

  const breakdown: Record<string, number> = {};
  let points = 0;

  // ── Resident ──────────────────────────────────────────────────────────────
  breakdown.resident = 2.25;
  points += 2.25;

  // ── Marital status ────────────────────────────────────────────────────────
  if (taxpayer.maritalStatus === "married") {
    breakdown.married = 1.0;
    points += 1.0;

    if (taxpayer.spouseHasIncome === false) {
      breakdown.nonWorkingSpouse = 0.5;
      points += 0.5;
    }
  }

  // Single parent: divorced or widowed WITH children
  if (
    (taxpayer.maritalStatus === "divorced" || taxpayer.maritalStatus === "widowed") &&
    taxpayer.children.length > 0
  ) {
    breakdown.singleParent = 1.0;
    points += 1.0;
  }

  // ── Children ──────────────────────────────────────────────────────────────
  for (const child of taxpayer.children) {
    const birthYear = child.birthDate
      ? new Date(child.birthDate).getFullYear()
      : null;
    if (birthYear === null) continue;

    const ageInTaxYear = year - birthYear;

    if (birthYear === year) {
      // Born during tax year — birth-year credit
      breakdown[`child_${child.id}_birth`] = 1.5;
      points += 1.5;
    } else if (ageInTaxYear >= 1 && ageInTaxYear <= 2 && child.inDaycare) {
      // Age 1-2 in licensed daycare
      breakdown[`child_${child.id}_daycare_12`] = 2.0;
      points += 2.0;
    } else if (ageInTaxYear >= 3 && ageInTaxYear <= 5 && child.inDaycare) {
      // Age 3-5 in licensed daycare
      breakdown[`child_${child.id}_daycare_35`] = 2.5;
      points += 2.5;
    } else if (birthYear > year - 18) {
      // Under 18 (not birth year, not daycare-eligible)
      breakdown[`child_${child.id}`] = 1.0;
      points += 1.0;
    }
  }

  // ── Academic degrees (1 year STRICTLY AFTER completion) ──────────────────
  for (const degree of taxpayer.degrees) {
    if (degree.completionYear >= year) continue; // not yet eligible

    if (degree.type === "BA") {
      // Eligible for 1 year only after completion
      if (degree.completionYear === year - 1) {
        breakdown[`degree_ba_${degree.institution}`] = 0.5;
        points += 0.5;
      }
    } else if (degree.type === "MA") {
      // Eligible for 1 year only after completion — same rule as BA
      if (degree.completionYear === year - 1) {
        breakdown.degree_ma = 0.5;
        points += 0.5;
      }
    } else if (degree.type === "PHD") {
      if (degree.completionYear === year - 1) {
        breakdown.degree_phd = 1.0;
        points += 1.0;
      }
    }
  }

  // ── Military service post-discharge ──────────────────────────────────────
  if (taxpayer.dischargeYear !== undefined) {
    const yearsAfterDischarge = year - taxpayer.dischargeYear;
    if (yearsAfterDischarge >= 0 && yearsAfterDischarge <= 3) {
      const soldierPts = taxpayer.gender === "female" ? 1.75 : 2.0;
      breakdown.soldier_discharge = soldierPts;
      points += soldierPts;
    }
  }

  // ── Oleh Chadash graduated credit ────────────────────────────────────────
  if (taxpayer.aliyahDate) {
    const aliyahMs = new Date(taxpayer.aliyahDate).getTime();
    // Evaluate at end of tax year (Dec 31) — ITA assesses bracket as of year-end
    const taxYearEnd = new Date(`${year}-12-31`).getTime();
    const monthsSinceAliyah =
      (taxYearEnd - aliyahMs) / (1000 * 60 * 60 * 24 * 30.44);

    if (monthsSinceAliyah >= 0 && monthsSinceAliyah <= 42) {
      breakdown.oleh_chadash_3pts = 3.0;
      points += 3.0;
    } else if (monthsSinceAliyah > 42 && monthsSinceAliyah <= 54) {
      breakdown.oleh_chadash_2pts = 2.0;
      points += 2.0;
    } else if (monthsSinceAliyah > 54 && monthsSinceAliyah <= 66) {
      breakdown.oleh_chadash_1pt = 1.0;
      points += 1.0;
    }
  }

  // ── Periphery (postcode lookup) ───────────────────────────────────────────
  if (taxpayer.postcode) {
    const postcodes = (peripheryData as { postcodes: Record<string, { city: string; tier: number }> }).postcodes;
    const entry = postcodes[taxpayer.postcode];
    if (entry) {
      const periPts = entry.tier === 1 ? 1.0 : 0.5;
      breakdown.periphery = periPts;
      points += periPts;
    }
  }

  // ── Kibbutz / Moshav ──────────────────────────────────────────────────────
  if (taxpayer.kibbutzMember) {
    breakdown.kibbutz = 0.25;
    points += 0.25;
  }

  // ── Disability (Sec. 9(5)) ────────────────────────────────────────────────
  if (taxpayer.disabilityType && taxpayer.disabilityPercent !== undefined) {
    const pct = taxpayer.disabilityPercent;
    if (pct >= 90) {
      breakdown.disability = 2.0;
      points += 2.0;
    } else if (pct >= 50) {
      breakdown.disability = 1.0;
      points += 1.0;
    } else if (pct >= 20) {
      breakdown.disability = 0.5;
      points += 0.5;
    }
  }

  return {
    points,
    annualValue: Math.round(points * creditPointAnnualValue),
    breakdown,
  };
}

// ─── 3. Personal Deduction Credits ───────────────────────────────────────────

/**
 * Extract income-deduction items (reduce taxable income, not a direct credit).
 * Currently only alimony (Sec. 9A).
 *
 * @param deductions  Array of PersonalDeduction
 * @returns Total income reduction in ILS
 */
export function calculateIncomeDeductions(deductions: PersonalDeduction[]): number {
  return deductions
    .filter((d) => d.type === "alimony_sec9a")
    .reduce((sum, d) => sum + d.amount, 0);
}

/**
 * Calculate tax credits from personal deductions.
 *
 * Credit rules:
 *   donation_sec46             35% credit; min ₪207 (2024) / ₪214 (2025); cap 30% of income
 *   life_insurance_sec45a      25% credit; no minimum
 *   ltc_insurance_sec45a       25% credit (long-term care, same section)
 *   pension_sec47              35% credit; deposit capped at ₪10,000 (salaried)
 *   self_employed_pension_sec47 35% credit; higher cap: 16% of income up to ₪270,000 (2024)
 *   provident_fund_sec47       35% credit; capped at ₪10,000 above employer match
 *   disabled_child_sec45       35% credit on qualifying expenses (capped ₪35,000)
 *   study_fund_sec3e3          study-fund employer over-match: 35% credit on excess
 *   alimony_sec9a              INCOME DEDUCTION — handled in calculateIncomeDeductions(), skipped here
 *
 * @param deductions  Array of PersonalDeduction
 * @param grossIncome Annual gross income (for Sec 46 30% cap + self-employed pension cap)
 * @param year        Tax year
 */
export function calculateDeductionCredits(
  deductions: PersonalDeduction[],
  grossIncome: number,
  year: number
): { total: number; breakdown: Record<string, number> } {
  const minDonation = year === 2025 ? 214 : 207;
  const maxDonationPct = 0.30;
  const maxPensionDeposit = 10_000;
  // Cap = 16% × min(income, income ceiling) — NOT min(16% × income, ceiling)
  const pensionIncomeCeiling = year === 2025 ? 283_000 : 270_000;
  const maxSelfEmployedPension = Math.round(Math.min(grossIncome, pensionIncomeCeiling) * 0.16);
  const maxDisabledChild = 35_000;
  const maxProvident = 10_000;

  const breakdown: Record<string, number> = {};
  let total = 0;

  for (const ded of deductions) {
    // Alimony is an income deduction, not a credit — skip here
    if (ded.type === "alimony_sec9a") continue;

    switch (ded.type) {
      case "donation_sec46": {
        if (ded.amount >= minDonation) {
          const cappedAmount = Math.min(ded.amount, grossIncome * maxDonationPct);
          const credit = Math.round(cappedAmount * 0.35);
          breakdown[ded.id] = credit;
          total += credit;
        }
        break;
      }
      case "life_insurance_sec45a":
      case "ltc_insurance_sec45a": {
        const credit = Math.round(ded.amount * 0.25);
        breakdown[ded.id] = credit;
        total += credit;
        break;
      }
      case "pension_sec47": {
        const cappedDeposit = Math.min(ded.amount, maxPensionDeposit);
        const credit = Math.round(cappedDeposit * 0.35);
        breakdown[ded.id] = credit;
        total += credit;
        break;
      }
      case "self_employed_pension_sec47": {
        const cappedDeposit = Math.min(ded.amount, maxSelfEmployedPension);
        const credit = Math.round(cappedDeposit * 0.35);
        breakdown[ded.id] = credit;
        total += credit;
        break;
      }
      case "provident_fund_sec47": {
        const cappedDeposit = Math.min(ded.amount, maxProvident);
        const credit = Math.round(cappedDeposit * 0.35);
        breakdown[ded.id] = credit;
        total += credit;
        break;
      }
      case "disabled_child_sec45": {
        const cappedAmount = Math.min(ded.amount, maxDisabledChild);
        const credit = Math.round(cappedAmount * 0.35);
        breakdown[ded.id] = credit;
        total += credit;
        break;
      }
      case "study_fund_sec3e3": {
        // Study fund: employer over-match is taxable; here we credit the deductible portion
        // Simplified: 35% credit on declared excess amount (user declares the non-exempt portion)
        const credit = Math.round(ded.amount * 0.35);
        breakdown[ded.id] = credit;
        total += credit;
        break;
      }
    }
  }

  return { total, breakdown };
}

// ─── 4. USD → ILS Conversion ─────────────────────────────────────────────────

/**
 * Convert a USD amount to ILS using the Bank of Israel annual average rate.
 * Used when ingesting foreign broker data (IBKR Activity Statement).
 * Do NOT call this inside calculateFullRefund — stored capitalGains values are already in ILS.
 */
export function convertUsdToIls(usdAmount: number, year: number): number {
  const rates: Record<number, number> = { 2024: 3.71, 2025: 3.65 };
  const rate = rates[year] ?? 3.71;
  return Math.round(usdAmount * rate);
}

// ─── 5. Full Refund Calculation ───────────────────────────────────────────────

/**
 * Run the complete Israeli income-tax refund calculation for a taxpayer.
 *
 * IMPORTANT: taxpayer.capitalGains values must be in ILS before calling this function.
 * Use convertUsdToIls() when loading foreign broker data, not inside this function.
 *
 * @param taxpayer  Full TaxPayer object (post-questionnaire)
 * @param year      Tax year (typically financials.taxYears[0])
 * @returns         CalculationResult with full breakdown
 */
export function calculateFullRefund(taxpayer: TaxPayer, year: number): CalculationResult {
  // Strict year type guard — default to 2024 for unsupported years
  const safeYear: 2024 | 2025 = year >= 2025 ? 2025 : 2024;

  // Step 1: Total gross income from all employers
  const totalGrossIncome = taxpayer.employers.reduce(
    (s, e) => s + (e.grossSalary ?? 0),
    0
  );

  // Step 1b: Income deductions (alimony Sec. 9A) — reduce taxable income before brackets
  const incomeDeductions = calculateIncomeDeductions(taxpayer.personalDeductions);
  const taxableIncome = Math.max(0, totalGrossIncome - incomeDeductions);

  // Step 2: Raw progressive bracket tax (on income AFTER income deductions)
  const { tax: calculatedTax, byBracket } = calculateTaxOnIncome(
    taxableIncome,
    safeYear
  );

  // Step 3: Credit points
  const {
    annualValue: creditPointsValue,
    points: creditPointsCount,
    breakdown: creditPointsBreakdown,
  } = calculateCreditPoints(taxpayer, year);

  // Step 4: Personal deduction credits (use taxableIncome for caps)
  const { total: deductionCredits, breakdown: deductionsBreakdown } =
    calculateDeductionCredits(taxpayer.personalDeductions, taxableIncome, year);

  // Step 5: Net tax owed (floored at 0 — credits cannot create negative liability)
  const netTaxOwed = Math.max(0, calculatedTax - creditPointsValue - deductionCredits);

  // Step 6: Tax already paid via employer withholding
  const taxPaid = taxpayer.employers.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);

  // Step 7: Refund from employment income
  const refundFromEmployment = taxPaid - netTaxOwed;

  // Step 8: Capital gains tax
  // Values in taxpayer.capitalGains are already in ILS — do NOT re-convert
  // Formula: ((netGain × 25%) + (dividends × 25%)) − foreignTaxWithheld
  let capitalGainsTax = 0;
  if (taxpayer.capitalGains) {
    const { totalRealizedProfit, totalRealizedLoss, foreignTaxWithheld, dividends = 0 } =
      taxpayer.capitalGains;
    const netGain = Math.max(0, totalRealizedProfit - totalRealizedLoss);
    const grossCGTax = Math.round((netGain + dividends) * 0.25);
    capitalGainsTax = Math.max(0, grossCGTax - foreignTaxWithheld);
  }

  // Step 9: Final net refund
  const netRefund = refundFromEmployment - capitalGainsTax;

  return {
    totalGrossIncome,
    incomeDeductions,
    taxableIncome,
    calculatedTax,
    creditPointsValue,
    deductionCredits,
    netTaxOwed,
    taxPaid,
    refundFromEmployment,
    capitalGainsTax,
    netRefund,
    creditPointsCount,
    breakdown: {
      byBracket,
      creditPointsBreakdown,
      deductionsBreakdown,
    },
  };
}

// ─── 6. Build Dashboard Insights ─────────────────────────────────────────────

/**
 * Generate TaxInsight[] for all 5 Dashboard pillars from a CalculationResult.
 * Produces real, calculation-backed insight values — no hardcoded mock constants.
 */
export function buildInsightsFromResult(
  result: CalculationResult,
  taxpayer: TaxPayer,
  year: number
): TaxInsight[] {
  const yearStr = String(year) as "2024" | "2025";
  const creditPointAnnualValue =
    year === 2025
      ? taxData["2025"].credit_point_annual_value
      : taxData["2024"].credit_point_annual_value;

  const insights: TaxInsight[] = [];

  // ── 1. Coordination pillar ─────────────────────────────────────────────────
  if (taxpayer.employers.length > 1 && result.refundFromEmployment > 0) {
    insights.push({
      id: "insight-coordination",
      pillar: "coordination",
      category: "employer",
      title: "גביית יתר — חפיפת מעסיקים ללא תיאום מס",
      description: `זוהתה עבודה אצל ${taxpayer.employers.length} מעסיקים ללא תיאום מס. המעסיק המשני ניכה מס בשיעור מרבי (47%), בעוד השיעור האפקטיבי הנכון נמוך משמעותית. נוצר החזר עקב גביית יתר במס שולי.`,
      value: result.refundFromEmployment,
      year,
    });
  }

  // ── 2. Credit Points pillar ────────────────────────────────────────────────
  const cpb = result.breakdown.creditPointsBreakdown;
  const cpNames: string[] = [];

  if (cpb.resident)           cpNames.push("תושב (2.25)");
  if (cpb.married)            cpNames.push("נשוי (1.0)");
  if (cpb.nonWorkingSpouse)   cpNames.push("בן/בת זוג שאינו עובד (0.5)");
  if (cpb.singleParent)       cpNames.push("הורה עצמאי (1.0)");
  if (cpb.soldier_discharge)  cpNames.push(`שחרור צבאי (${cpb.soldier_discharge})`);
  if (cpb.oleh_chadash_3pts)  cpNames.push("עולה חדש (3.0)");
  if (cpb.oleh_chadash_2pts)  cpNames.push("עולה חדש (2.0)");
  if (cpb.oleh_chadash_1pt)   cpNames.push("עולה חדש (1.0)");
  if (cpb.periphery)          cpNames.push(`פריפריה (${cpb.periphery})`);
  if (cpb.kibbutz)            cpNames.push("קיבוץ/מושב (0.25)");
  if (cpb.disability)         cpNames.push(`נכות (${cpb.disability})`);
  if (cpb.degree_ma)          cpNames.push("תואר שני (0.5)");
  if (cpb.degree_phd)         cpNames.push("דוקטורט (1.0)");

  // Degree BA keys
  Object.keys(cpb).filter(k => k.startsWith("degree_ba_")).forEach(() => cpNames.push("תואר ראשון (0.5)"));

  // Children
  const childKeys = Object.keys(cpb).filter((k) => k.startsWith("child_"));
  if (childKeys.length > 0) {
    const birthYearChildren = childKeys.filter((k) => k.endsWith("_birth")).length;
    const daycareChildren = childKeys.filter((k) => k.includes("_daycare_")).length;
    const regularChildren = childKeys.length - birthYearChildren - daycareChildren;
    if (birthYearChildren > 0) cpNames.push(`לידה בשנת המס (1.5)`);
    if (daycareChildren > 0)   cpNames.push(`ילד בגן (${daycareChildren})`);
    if (regularChildren > 0)   cpNames.push(`ילד/ים (${regularChildren})`);
  }

  if (result.creditPointsValue > 0) {
    insights.push({
      id: "insight-credit-points",
      pillar: "credit_points",
      category: "credit_point",
      title: `נקודות זיכוי — ${result.creditPointsCount.toFixed(2)} נקודות`,
      description: cpNames.join(" · "),
      value: result.creditPointsValue,
      year,
    });
  }

  // Future-year degree notes
  for (const degree of taxpayer.degrees) {
    if (degree.completionYear >= year) {
      const degLabel = degree.type === "BA" ? "ראשון" : degree.type === "MA" ? "שני" : "דוקטורט";
      const pts = degree.type === "PHD" ? 1.0 : 0.5;
      insights.push({
        id: `insight-degree-future-${degree.type}`,
        pillar: "credit_points",
        category: "credit_point",
        title: `נקודת זיכוי — תואר ${degLabel}`,
        description: `זכאות ל-${pts} נקודת זיכוי בגין תואר ${degLabel} מ-${degree.institution}, החל משנת המס ${degree.completionYear + 1}.`,
        value: Math.round(pts * creditPointAnnualValue),
        year: degree.completionYear + 1,
      });
    }
  }

  // Alimony income-deduction insight
  if (result.incomeDeductions > 0) {
    const taxSaved = Math.round(result.incomeDeductions * 0.31); // approx at median bracket
    insights.push({
      id: "insight-alimony",
      pillar: "deductions",
      category: "deduction",
      title: "ניכוי מזונות — סעיף 9א",
      description: `תשלומי מזונות ₪${result.incomeDeductions.toLocaleString("he-IL")} מופחתים מההכנסה החייבת. חיסכון מס משוער: ₪${taxSaved.toLocaleString("he-IL")}.`,
      value: taxSaved,
      year,
    });
  }

  // ── 3. Deductions pillar ───────────────────────────────────────────────────
  const dedLabelMap: Record<string, { label: string; rate: string }> = {
    donation_sec46:              { label: "תרומה לעמותה מוכרת — סעיף 46", rate: "35%" },
    life_insurance_sec45a:       { label: "ביטוח חיים פרטי — סעיף 45א", rate: "25%" },
    ltc_insurance_sec45a:        { label: "ביטוח סיעודי — סעיף 45א", rate: "25%" },
    pension_sec47:               { label: "פנסיה עצמאית — סעיף 47", rate: "35%" },
    self_employed_pension_sec47: { label: "פנסיה עצמאי — סעיף 47", rate: "35%" },
    provident_fund_sec47:        { label: "קופת גמל — סעיף 47", rate: "35%" },
    disabled_child_sec45:        { label: "הוצאות ילד נכה — סעיף 45", rate: "35%" },
    study_fund_sec3e3:           { label: "קרן השתלמות — סעיף 3(ה3)", rate: "35%" },
  };

  for (const ded of taxpayer.personalDeductions) {
    if (ded.type === "alimony_sec9a") continue; // handled above as income deduction
    const credit = result.breakdown.deductionsBreakdown[ded.id] ?? 0;
    if (credit > 0) {
      const meta = dedLabelMap[ded.type] ?? { label: ded.type, rate: "" };
      insights.push({
        id: `insight-ded-${ded.id}`,
        pillar: "deductions",
        category: "deduction",
        title: meta.label,
        description: `${ded.providerName}: ${ded.amount.toLocaleString("he-IL")} ₪ × ${meta.rate} = ${credit.toLocaleString("he-IL")} ₪ זיכוי.`,
        value: credit,
        year,
      });
    }
  }

  // ── 4. Severance pillar ────────────────────────────────────────────────────
  if (taxpayer.lifeEvents?.pulledSeverancePay) {
    insights.push({
      id: "insight-severance",
      pillar: "severance",
      category: "severance",
      title: "פריסת מס על פיצויים חייבים — סעיף 8ג",
      description:
        "עקב משיכת פיצויים החייבים במס מומלץ לבצע פריסת מס לצמצום המדרגה השולית. החוק מאפשר פריסה על פני עד 6 שנות מס. המערכת תכין נספח פריסה מפורט בשלב הבא.",
      value: 0, // placeholder — Form 161 logic required for real calculation
      year,
    });
  }

  // ── 5. Capital Markets pillar ──────────────────────────────────────────────
  if (taxpayer.capitalGains) {
    const { totalRealizedProfit, totalRealizedLoss } = taxpayer.capitalGains;
    const netGain = totalRealizedProfit - totalRealizedLoss;
    const usdRate = year === 2025 ? 3.65 : 3.71;

    insights.push({
      id: "insight-capital-markets",
      pillar: "capital_markets",
      category: "capital_markets",
      title: "שוק ההון — רווחי הון ומס זר",
      description: `רווח נקי: ${Math.round(netGain).toLocaleString("he-IL")} ₪ · מס רווחי הון לתשלום: ${result.capitalGainsTax.toLocaleString("he-IL")} ₪. סכומים הומרו מ-USD לשקלים לפי שער יציג ${usdRate} (${year}).`,
      value: result.capitalGainsTax > 0 ? -result.capitalGainsTax : 0,
      year,
    });
  }

  return insights;
}

/**
 * Build ActionItem[] from a CalculationResult + taxpayer profile.
 * Items are prioritized: high = required for filing, medium = important, low = optional.
 */
export function buildActionItemsFromResult(
  result: CalculationResult,
  taxpayer: TaxPayer
): ActionItem[] {
  const items: ActionItem[] = [];

  // Upload Form 106 for each employer without grossSalary
  const employersWithoutForm106 = taxpayer.employers.filter((e) => !e.grossSalary);
  if (employersWithoutForm106.length > 0) {
    items.push({
      id: "action-upload-106",
      label: `העלה טופס 106 (${employersWithoutForm106.length} מעסיק${employersWithoutForm106.length > 1 ? "ים" : ""})`,
      completed: false,
      priority: "high",
      formNumber: "106",
    });
  } else if (taxpayer.employers.length > 0) {
    items.push({
      id: "action-form106-done",
      label: "טופס 106 — הועלה",
      completed: true,
      priority: "high",
      formNumber: "106",
    });
  }

  // Tax coordination (תיאום מס) — multiple employers
  if (taxpayer.employers.length > 1) {
    items.push({
      id: "action-tax-coord",
      label: "בצע תיאום מס (עבדת אצל יותר ממעסיק אחד)",
      completed: false,
      priority: "high",
    });
  }

  // Capital gains — need IBKR statement
  if (taxpayer.capitalGains) {
    items.push({
      id: "action-ibkr-done",
      label: "דוח IBKR / ברוקר — הועלה",
      completed: true,
      priority: "high",
    });
  } else if (result.totalGrossIncome > 0) {
    items.push({
      id: "action-upload-ibkr",
      label: "העלה דוח ברוקר זר (אם רלוונטי)",
      completed: false,
      priority: "medium",
    });
  }

  // Download & file Form 135
  items.push({
    id: "action-download-135",
    label: "הורד טופס 135 ממוולא",
    completed: false,
    priority: "high",
    formNumber: "135",
  });

  // Personal deductions — if none declared but income is high
  if (taxpayer.personalDeductions.length === 0 && result.totalGrossIncome > 50_000) {
    items.push({
      id: "action-personal-deductions",
      label: "בדוק זכאות לזיכויים: פנסיה, תרומות, ביטוח חיים",
      completed: false,
      priority: "medium",
    });
  }

  // Severance — Form 161
  if (taxpayer.lifeEvents?.pulledSeverancePay) {
    items.push({
      id: "action-form161",
      label: "צרף טופס 161 (פיצויים)",
      completed: taxpayer.lifeEvents.hasForm161,
      priority: "high",
      formNumber: "161",
    });
  }

  // Capital gains refund — WHT credit
  if (result.capitalGainsTax > 0 && taxpayer.capitalGains?.foreignTaxWithheld) {
    items.push({
      id: "action-wht-credit",
      label: "בדוק זיכוי מס זר על רווחי הון (WHT)",
      completed: false,
      priority: "medium",
    });
  }

  return items;
}
