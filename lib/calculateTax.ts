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
 * Phase 0 §0.C — closes audit findings F-001 through F-011 + F-012 + F-016
 * (see audits/tax-domain.md §2.1). Math model corrections:
 *   • F-001 BA = 1.0 nq (was 0.5)            — סעיף 40ג(א)
 *   • F-002 PHD = 1.5 nq (was 1.0)           — סעיף 40ג(ב1)
 *   • F-003 MA-prof = 1.0 nq (medicine/law/teaching) — סעיף 40ג(ב)
 *   • F-004 Disability §9(5) = income exemption (NOT credit-points) — סעיף 9(5)
 *   • F-005 Sec 47 split: 47(ב)(1) ניכוי vs 47(ב)(2) זיכוי — סעיף 47
 *   • F-006 §9א alimony — only spouse-portion deductible — סעיף 9א
 *   • F-007 Periphery = 11%/13% × income up to cap (NOT credit-points) — צו 2023
 *   • F-008 Kibbutz 0.25 nq DELETED (no statutory basis)
 *   • F-009 Oleh band = 18/12/12/12 months (was 42/12/12) — סעיף 35
 *   • F-010 Daycare = 1.0 nq, ages 0-3 only (was 2.0/2.5, 1-5) — סעיף 40א
 *   • F-011 Military pro-rata 1/12 per month, 2-year cap — סעיף 11 + הוראת ביצוע 32/2014
 *   • F-012 Single-parent extends to רווק/ה — סעיף 40(ב)(1) post-2024
 *   • F-016 carriedForwardLoss wired into capital-gains calc — סעיף 92
 *
 * Data source: app/data/tax_brackets_2024_2025.json (Bank of Israel / ITA figures)
 *              app/data/credit_points_{2024,2025}.json
 *              app/data/periphery_postcodes.json (postcode → tier; percentage logic in code)
 */

import taxData from "@/data/tax_brackets_2024_2025.json";
import peripheryData from "@/data/periphery_postcodes.json";
import type { TaxPayer, PersonalDeduction } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalculationResult {
  totalGrossIncome: number;
  incomeDeductions: number;     // Sec. 9A alimony + Sec. 47(ב)(1) + Sec. 9(5) — reduce taxable income
  taxableIncome: number;        // totalGrossIncome − incomeDeductions
  calculatedTax: number;        // raw progressive bracket tax on taxableIncome
  creditPointsValue: number;    // total credit point value in ILS
  deductionCredits: number;     // total deduction credits in ILS (45a, 46, 47(ב)(2), …)
  peripheryDiscount: number;    // tax-discount under צו 2023 / סעיף 11 (NOT credit-points)
  netTaxOwed: number;           // calculatedTax − credits − peripheryDiscount (floored at 0)
  taxPaid: number;              // sum of all employer taxWithheld
  refundFromEmployment: number; // taxPaid − netTaxOwed
  capitalGainsTax: number;      // net capital gains tax owed after foreign credit
  netRefund: number;            // refundFromEmployment − capitalGainsTax
  creditPointsCount: number;
  warnings?: string[];          // surfaced advisory issues (e.g. alimony default-spouse-100%)
  breakdown: {
    byBracket: { bracket: number; rate: number; taxableAmount: number; tax: number }[];
    creditPointsBreakdown: Record<string, number>;
    deductionsBreakdown: Record<string, number>;
  };
}

// Year-keyed constants. Keep mutable per audit; for years outside the table the
// 2025 value acts as the conservative default (a safer over-estimate than 0).
const DISABILITY_INCOME_CAP: Record<number, number> = {
  2024: 615_840,  // ITA published 2024 ceiling
  2025: 645_360,  // ITA published 2025 ceiling
};

const PERIPHERY_INCOME_CAP: Record<number, number> = {
  2024: 236_520,  // ITA published 2024 ceiling
  2025: 241_920,  // ITA published 2025 ceiling
};

const PERIPHERY_DISCOUNT_PCT: Record<number, number> = {
  1: 0.13, // tier 1 — 13% of personal-effort income up to cap
  2: 0.11, // tier 2 — 11% of personal-effort income up to cap
};

// MA degree professions that earn 1.0 nq under סעיף 40ג(ב).
const MA_PROFESSIONAL_KEYS = new Set([
  "medicine",
  "law",
  "teaching",
  "רפואה",
  "משפטים",
  "הוראה",
  "חינוך",
]);

// ─── 1. Tax Bracket Calculation ───────────────────────────────────────────────

/**
 * Calculate progressive income tax using Israeli tax brackets.
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

// ─── 2. Disability §9(5) income-exemption helper (F-004) ─────────────────────

/**
 * Compute the §9(5) income-exemption amount.
 * Disability is an INCOME EXEMPTION, not credit points (audit F-004).
 *
 * @param taxableIncome     Personal-effort income (יגיעה אישית) before this exemption
 * @param disabilityPercent 0-100, ITA-recognised disability percentage
 * @param year              Tax year (cap is year-keyed)
 * @returns The exempt portion of income (capped at cap × pct/100, never above income)
 */
export function calculateDisabilityExemption(
  taxableIncome: number,
  disabilityPercent: number,
  year: number
): number {
  if (disabilityPercent <= 0 || taxableIncome <= 0) return 0;
  const cap = DISABILITY_INCOME_CAP[year] ?? DISABILITY_INCOME_CAP[2025];
  const exemption = Math.round(cap * (disabilityPercent / 100));
  return Math.min(exemption, taxableIncome);
}

// ─── 3. Periphery percentage-discount helper (F-007) ─────────────────────────

/**
 * Compute the periphery tax-discount under צו 2023 / סעיף 11.
 * Tier 1 = 13% of personal-effort income up to ₪241,920 (2025);
 * Tier 2 = 11% of same.
 * Returns the ILS DISCOUNT (a reduction in tax owed, not credit-points).
 */
export function calculatePeripheryDiscount(
  taxableIncome: number,
  tier: 1 | 2,
  year: number
): number {
  if (taxableIncome <= 0) return 0;
  const cap = PERIPHERY_INCOME_CAP[year] ?? PERIPHERY_INCOME_CAP[2025];
  const pct = PERIPHERY_DISCOUNT_PCT[tier] ?? 0;
  const eligibleIncome = Math.min(taxableIncome, cap);
  return Math.round(eligibleIncome * pct);
}

// ─── 4. Credit Points ─────────────────────────────────────────────────────────

/**
 * Calculate credit points and their ILS value for a taxpayer.
 *
 * Phase-0 corrected rules (post-audit):
 *
 * BASE:
 *   - Resident:                 2.25 pts
 *   - Married:                  +1.0 pt
 *   - Non-working spouse:       +0.5 pt (married && spouseHasIncome === false)
 *   - Single parent (F-012):    +1.0 pt (any non-married + children + no spouseId)
 *
 * CHILDREN:
 *   - Born during tax year:     1.5 pt
 *   - Daycare ages 0-3 (F-010): 1.0 pt (NOT 2.0/2.5; ages 3-5 removed)
 *   - Under 18 (default):       1.0 pt
 *
 * DEGREES (1 yr after completion):
 *   - BA (F-001):               1.0 pt
 *   - MA generic:               0.5 pt
 *   - MA professional (F-003):  1.0 pt (medicine/law/teaching)
 *   - PHD (F-002):              1.5 pt
 *
 * MILITARY (F-011):
 *   - Pro-rata 1/12 nq per service month, capped 2.0/yr × 2 years post-discharge.
 *   - 2026 unisex change documented but NOT yet active for 2025 assessments.
 *
 * ALIYAH (F-009):
 *   - Months 0-18:              3.0 pts
 *   - Months 19-30:             2.0 pts
 *   - Months 31-42:             1.0 pt
 *   - Months 43+:               0 pt
 *
 * PERIPHERY:                    NOT credit-points (see F-007 helper).
 * KIBBUTZ:                      DELETED (F-008).
 * DISABILITY:                   NOT credit-points (see F-004 helper).
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

  // F-012: Single-parent extended to any non-married parent without registered spouse,
  // provided they have at least one DEPENDENT child (under 18 or born in tax year).
  // סעיף 40(ב)(1) post-2024 — כולל רווק/ה אם הם הורה יחיד מגדל ילד תלוי.
  const isMarried = taxpayer.maritalStatus === "married";
  const hasSpouseLink =
    !!taxpayer.spouseId || !!(taxpayer.spouse && taxpayer.spouse.idNumber);
  const hasDependentChild = taxpayer.children.some((c) => {
    if (!c.birthDate) return false;
    const by = new Date(c.birthDate).getFullYear();
    if (Number.isNaN(by)) return false;
    return by === year || by > year - 18;
  });
  if (!isMarried && !hasSpouseLink && hasDependentChild) {
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
    } else if (ageInTaxYear >= 0 && ageInTaxYear <= 3 && child.inDaycare) {
      // F-010: Daycare credit applies ages 0-3 ONLY at 1.0 nq (סעיף 40א).
      breakdown[`child_${child.id}_daycare_03`] = 1.0;
      points += 1.0;
    } else if (birthYear > year - 18) {
      // Standard child credit (under 18)
      breakdown[`child_${child.id}`] = 1.0;
      points += 1.0;
    }
    // F-010: ages 3-5 in daycare get the standard under-18 credit (handled above).
    // No separate `child_*_daycare_35` key anymore.
  }

  // ── Academic degrees (1 year STRICTLY AFTER completion) ──────────────────
  for (const degree of taxpayer.degrees) {
    if (degree.completionYear >= year) continue;
    if (degree.completionYear !== year - 1) continue; // window: year-1 only

    if (degree.type === "BA") {
      // F-001: BA = 1.0 nq under סעיף 40ג(א).
      breakdown[`degree_ba_${degree.institution}`] = 1.0;
      points += 1.0;
    } else if (degree.type === "MA") {
      // F-003: MA-professional (medicine/law/teaching) = 1.0 under סעיף 40ג(ב); else default 0.5.
      // Schema gap: `Degree.profession` is read at runtime — full migration tracked in Phase 1.
      const prof = ((degree as unknown) as { profession?: string }).profession?.toLowerCase().trim();
      if (prof && MA_PROFESSIONAL_KEYS.has(prof)) {
        breakdown.degree_ma = 1.0;
        points += 1.0;
      } else {
        breakdown.degree_ma = 0.5;
        points += 0.5;
      }
    } else if (degree.type === "PHD") {
      // F-002: PHD = 1.5 nq under סעיף 40ג(ב1).
      breakdown.degree_phd = 1.5;
      points += 1.5;
    }
  }

  // ── Military service post-discharge (F-011) ──────────────────────────────
  // הוראת ביצוע 32/2014 + סעיף 11:
  //   • ≥ 12 חודש שירות סדיר → 2.0 נק' לכל שנה במשך 2 שנים שלאחר השחרור.
  //   • < 12 חודש (שירות חלקי) → פרופורציה: serviceMonths/12 נק' לכל שנה.
  //   • שנה 3+ לאחר שחרור → אין זכאות.
  // 2026 unisex change (תיקון 2024) is already implicit (gender-blind formula).
  // Schema gap: `taxpayer.serviceMonths` is read at runtime — Phase 1 migrates types.
  // Default fallback (no `serviceMonths`): assume 24 months full service so existing
  // discharged-soldier UX keeps yielding 2.0 pts in years 1-2.
  if (taxpayer.dischargeYear !== undefined) {
    const yearsAfterDischarge = year - taxpayer.dischargeYear;
    // Eligible during the 2 calendar years AFTER the discharge year
    // (i.e. yearsAfterDischarge ∈ {1, 2}). The discharge year itself (=0)
    // is intentionally excluded — partial-year credit during discharge is
    // captured separately by the תיאום מס at year-end.
    if (yearsAfterDischarge >= 1 && yearsAfterDischarge <= 2) {
      const serviceMonths =
        ((taxpayer as unknown) as { serviceMonths?: number }).serviceMonths ?? 24;
      let earned: number;
      if (serviceMonths >= 12) {
        // Full eligibility — 2.0/yr for each of the 2 post-discharge years.
        earned = 2.0;
      } else if (serviceMonths > 0) {
        // Pro-rata: serviceMonths/12 in each of the 2 post-discharge years.
        earned = +(serviceMonths / 12).toFixed(4);
      } else {
        earned = 0;
      }
      const capped = Math.min(2.0, earned);
      if (capped > 0) {
        breakdown.soldier_discharge = capped;
        points += capped;
      }
    }
  }

  // ── Oleh Chadash graduated credit (F-009) ────────────────────────────────
  // Bands: 18 / 12 / 12 / (12 zero) months — 3.0 / 2.0 / 1.0 / 0.0.
  if (taxpayer.aliyahDate) {
    const aliyahMs = new Date(taxpayer.aliyahDate).getTime();
    // Evaluate at end of tax year (Dec 31) — ITA assesses bracket as of year-end.
    const taxYearEnd = new Date(`${year}-12-31`).getTime();
    const monthsSinceAliyah =
      (taxYearEnd - aliyahMs) / (1000 * 60 * 60 * 24 * 30.44);

    if (monthsSinceAliyah >= 0 && monthsSinceAliyah <= 18) {
      breakdown.oleh_chadash_3pts = 3.0;
      points += 3.0;
    } else if (monthsSinceAliyah > 18 && monthsSinceAliyah <= 30) {
      breakdown.oleh_chadash_2pts = 2.0;
      points += 2.0;
    } else if (monthsSinceAliyah > 30 && monthsSinceAliyah <= 42) {
      breakdown.oleh_chadash_1pt = 1.0;
      points += 1.0;
    }
    // > 42 months: no credit (was 42-54=2 + 55-66=1 in legacy code; F-009 fix).
  }

  // ── Periphery (F-007) — handled outside credit-points (see calculateFullRefund).
  // ── Kibbutz (F-008) — DELETED.
  // ── Disability (F-004) — handled outside credit-points (see calculateFullRefund).

  return {
    points,
    annualValue: Math.round(points * creditPointAnnualValue),
    breakdown,
  };
}

// ─── 5. Personal Deduction Credits ───────────────────────────────────────────

/**
 * Extract income-deduction items (reduce taxable income, not direct credit).
 *
 * Phase-0 sources:
 *   - alimony_sec9a              — spouse-portion only (F-006)
 *   - pension_sec47_deduction    — Sec. 47(ב)(1) ניכוי model (F-005), capped 7% income
 *
 * @param deductions  Array of PersonalDeduction
 * @param grossIncome Gross income (used for 7% pension cap)
 */
export function calculateIncomeDeductions(
  deductions: PersonalDeduction[],
  grossIncome: number = 0
): { total: number; warnings: string[] } {
  const warnings: string[] = [];
  let total = 0;

  for (const d of deductions) {
    const dt = d.type as string;
    if (dt === "alimony_sec9a") {
      // F-006: סעיף 9א — only the spouse-portion is deductible; children are not.
      // Schema gap: `spousePortion` is read at runtime — Phase 1 migrates the type.
      const ext = d as unknown as { spousePortion?: number };
      const sp = typeof ext.spousePortion === "number" ? ext.spousePortion : undefined;
      if (sp === undefined) {
        warnings.push(
          `alimony_sec9a (${d.id}): spousePortion לא הוגדר — מחושב כברירת-מחדל 100% לבן/בת זוג. אנא ודאו את חלוקת המזונות בין בן/בת הזוג לילדים.`
        );
      }
      const portion = Math.max(0, Math.min(1, sp ?? 1));
      total += Math.round(d.amount * portion);
    } else if (dt === "pension_sec47_deduction") {
      // F-005: Sec. 47(ב)(1) — ניכוי הוצאה לפנסיה לעצמאי / לא-מבוטח, עד 7% מההכנסה.
      // We read this new variant as a runtime extension — the type union does not yet
      // include it (Phase 1 migrates). Behaviour: `min(amount, 7% × grossIncome)`.
      const cap = Math.round(grossIncome * 0.07);
      total += Math.min(d.amount, cap);
    }
  }

  return { total, warnings };
}

/**
 * Calculate tax credits from personal deductions.
 *
 * Credit rules:
 *   donation_sec46             35% credit; min ₪207 (2024) / ₪214 (2025); cap 30% of income
 *   life_insurance_sec45a      25% credit; no minimum
 *   ltc_insurance_sec45a       25% credit (long-term care, same section)
 *   pension_sec47              35% credit on capped deposit (Sec. 47(ב)(2) זיכוי)
 *   self_employed_pension_sec47 35% credit; cap = min(income, ₪283k) × 16%
 *   provident_fund_sec47       35% credit; capped at ₪10,000 above employer match
 *   disabled_child_sec45       35% credit on qualifying expenses (capped ₪35,000)
 *   study_fund_sec3e3          35% credit (legacy)
 *
 * Skipped here (handled in calculateIncomeDeductions):
 *   alimony_sec9a              — INCOME deduction (spouse-portion)
 *   pension_sec47_deduction    — Sec. 47(ב)(1) ניכוי (F-005)
 */
export function calculateDeductionCredits(
  deductions: PersonalDeduction[],
  grossIncome: number,
  year: number
): { total: number; breakdown: Record<string, number> } {
  const minDonation = year === 2025 ? 214 : 207;
  const maxDonationPct = 0.30;
  const maxPensionDeposit = 10_000;
  const pensionIncomeCeiling = year === 2025 ? 283_000 : 270_000;
  const maxSelfEmployedPension = Math.round(Math.min(grossIncome, pensionIncomeCeiling) * 0.16);
  const maxDisabledChild = 35_000;
  const maxProvident = 10_000;

  const breakdown: Record<string, number> = {};
  let total = 0;

  for (const ded of deductions) {
    const dt = ded.type as string;
    // F-005 + F-006: skip income-deduction variants (handled separately).
    if (dt === "alimony_sec9a") continue;
    if (dt === "pension_sec47_deduction") continue;

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
        const credit = Math.round(ded.amount * 0.35);
        breakdown[ded.id] = credit;
        total += credit;
        break;
      }
    }
  }

  return { total, breakdown };
}

// ─── 6. USD → ILS Conversion ─────────────────────────────────────────────────

/**
 * Convert a USD amount to ILS using the Bank of Israel annual average rate.
 * Used when ingesting foreign broker data (IBKR Activity Statement).
 * Do NOT call this inside calculateFullRefund — stored capitalGains values are already in ILS.
 *
 * NOTE: F-017 (annual-mean → daily-rate) is in scope for Phase 1 §1.F.
 */
export function convertUsdToIls(usdAmount: number, year: number): number {
  const rates: Record<number, number> = { 2024: 3.71, 2025: 3.65 };
  const rate = rates[year] ?? 3.71;
  return Math.round(usdAmount * rate);
}

// ─── 7. Full Refund Calculation ───────────────────────────────────────────────

/**
 * Run the complete Israeli income-tax refund calculation for a taxpayer.
 *
 * IMPORTANT: taxpayer.capitalGains values must be in ILS before calling this function.
 */
export function calculateFullRefund(taxpayer: TaxPayer, year: number): CalculationResult {
  const safeYear: 2024 | 2025 = year >= 2025 ? 2025 : 2024;

  // Step 1: Total gross income from all employers
  const totalGrossIncome = taxpayer.employers.reduce(
    (s, e) => s + (e.grossSalary ?? 0),
    0
  );

  // Step 1b: Income deductions (F-005 47(ב)(1) ניכוי + F-006 alimony spouse-portion)
  const { total: incomeDeductionsCore, warnings: incomeDeductionWarnings } =
    calculateIncomeDeductions(taxpayer.personalDeductions, totalGrossIncome);

  // Step 1c: F-004 Disability §9(5) — income exemption (NOT credit points).
  let disabilityExemption = 0;
  if (taxpayer.disabilityType && typeof taxpayer.disabilityPercent === "number") {
    const incomeAfterCoreDeductions = Math.max(0, totalGrossIncome - incomeDeductionsCore);
    disabilityExemption = calculateDisabilityExemption(
      incomeAfterCoreDeductions,
      taxpayer.disabilityPercent,
      year
    );
  }

  const incomeDeductions = incomeDeductionsCore + disabilityExemption;
  const taxableIncome = Math.max(0, totalGrossIncome - incomeDeductions);

  // Step 2: Raw progressive bracket tax (on income AFTER income deductions).
  const { tax: calculatedTax, byBracket } = calculateTaxOnIncome(
    taxableIncome,
    safeYear
  );

  // Step 3: Credit points (now WITHOUT periphery / disability / kibbutz).
  const {
    annualValue: creditPointsValue,
    points: creditPointsCount,
    breakdown: creditPointsBreakdown,
  } = calculateCreditPoints(taxpayer, year);

  // Step 4: Personal deduction credits (use taxableIncome for caps).
  const { total: deductionCredits, breakdown: deductionsBreakdown } =
    calculateDeductionCredits(taxpayer.personalDeductions, taxableIncome, year);

  // Step 4b: F-007 Periphery percentage-discount.
  let peripheryDiscount = 0;
  if (taxpayer.postcode) {
    const postcodes = (peripheryData as { postcodes: Record<string, { city: string; tier: number }> })
      .postcodes;
    const entry = postcodes[taxpayer.postcode];
    if (entry && (entry.tier === 1 || entry.tier === 2)) {
      peripheryDiscount = calculatePeripheryDiscount(
        taxableIncome,
        entry.tier as 1 | 2,
        year
      );
    }
  }

  // Step 5: Net tax owed (floored at 0).
  const netTaxOwed = Math.max(
    0,
    calculatedTax - creditPointsValue - deductionCredits - peripheryDiscount
  );

  // Step 6: Tax already paid via employer withholding.
  const taxPaid = taxpayer.employers.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);

  // Step 7: Refund from employment income.
  const refundFromEmployment = taxPaid - netTaxOwed;

  // Step 8: Capital gains tax (F-016: subtract carriedForwardLoss before 25% rate).
  let capitalGainsTax = 0;
  if (taxpayer.capitalGains) {
    const {
      totalRealizedProfit,
      totalRealizedLoss,
      foreignTaxWithheld,
      dividends = 0,
      carriedForwardLoss = 0,
    } = taxpayer.capitalGains;
    // F-016: סעיף 92 — קיזוז הפסד הון מועבר לפני חישוב המס.
    const netGain = Math.max(0, totalRealizedProfit - totalRealizedLoss - carriedForwardLoss);
    const grossCGTax = Math.round((netGain + dividends) * 0.25);
    capitalGainsTax = Math.max(0, grossCGTax - foreignTaxWithheld);
  }

  // Step 9: Final net refund.
  const netRefund = refundFromEmployment - capitalGainsTax;

  return {
    totalGrossIncome,
    incomeDeductions,
    taxableIncome,
    calculatedTax,
    creditPointsValue,
    deductionCredits,
    peripheryDiscount,
    netTaxOwed,
    taxPaid,
    refundFromEmployment,
    capitalGainsTax,
    netRefund,
    creditPointsCount,
    warnings: incomeDeductionWarnings,
    breakdown: {
      byBracket,
      creditPointsBreakdown,
      deductionsBreakdown,
    },
  };
}

// ─── 8. Build Dashboard Insights ─────────────────────────────────────────────

/**
 * Generate TaxInsight[] for all 5 Dashboard pillars from a CalculationResult.
 */
export function buildInsightsFromResult(
  result: CalculationResult,
  taxpayer: TaxPayer,
  year: number
): import("@/types").TaxInsight[] {
  const creditPointAnnualValue =
    year === 2025
      ? taxData["2025"].credit_point_annual_value
      : taxData["2024"].credit_point_annual_value;

  const insights: import("@/types").TaxInsight[] = [];

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
  if (cpb.degree_ma)          cpNames.push(`תואר שני (${cpb.degree_ma})`);
  if (cpb.degree_phd)         cpNames.push(`דוקטורט (${cpb.degree_phd})`);

  Object.keys(cpb)
    .filter(k => k.startsWith("degree_ba_"))
    .forEach((k) => cpNames.push(`תואר ראשון (${cpb[k]})`));

  const childKeys = Object.keys(cpb).filter((k) => k.startsWith("child_"));
  if (childKeys.length > 0) {
    const birthYearChildren = childKeys.filter((k) => k.endsWith("_birth")).length;
    const daycareChildren = childKeys.filter((k) => k.includes("_daycare_")).length;
    const regularChildren = childKeys.length - birthYearChildren - daycareChildren;
    if (birthYearChildren > 0) cpNames.push(`לידה בשנת המס (1.5)`);
    if (daycareChildren > 0)   cpNames.push(`ילד במעון יום (${daycareChildren})`);
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

  // F-007 periphery insight (now a tax-discount, not a credit-point line).
  if (result.peripheryDiscount > 0) {
    insights.push({
      id: "insight-periphery",
      pillar: "credit_points",
      category: "credit_point",
      title: "ישוב פריפריה — צו 2023",
      description: `הנחה במס בגין מקום מגורים ביישוב מוטב (סעיף 11 + צו 2023). חיסכון מחושב על ההכנסה החייבת עד תקרה.`,
      value: result.peripheryDiscount,
      year,
    });
  }

  // F-004 disability income-exemption insight.
  if (taxpayer.disabilityType && typeof taxpayer.disabilityPercent === "number") {
    const exemption = calculateDisabilityExemption(
      result.totalGrossIncome,
      taxpayer.disabilityPercent,
      year
    );
    if (exemption > 0) {
      insights.push({
        id: "insight-disability",
        pillar: "deductions",
        category: "deduction",
        title: "פטור נכות — סעיף 9(5)",
        description: `פטור הכנסה מיגיעה אישית בסך ₪${exemption.toLocaleString("he-IL")} בגין ${taxpayer.disabilityPercent}% נכות מוכרת.`,
        value: exemption,
        year,
      });
    }
  }

  // Future-year degree notes.
  for (const degree of taxpayer.degrees) {
    if (degree.completionYear >= year) {
      const degLabel = degree.type === "BA" ? "ראשון" : degree.type === "MA" ? "שני" : "דוקטורט";
      const pts = degree.type === "PHD" ? 1.5 : degree.type === "BA" ? 1.0 : 0.5;
      insights.push({
        id: `insight-degree-future-${degree.type}`,
        pillar: "credit_points",
        category: "credit_point",
        title: `נקודת זיכוי — תואר ${degLabel}`,
        description: `זכאות ל-${pts} נקודות זיכוי בגין תואר ${degLabel} מ-${degree.institution}, החל משנת המס ${degree.completionYear + 1}.`,
        value: Math.round(pts * creditPointAnnualValue),
        year: degree.completionYear + 1,
      });
    }
  }

  // Alimony income-deduction insight.
  if (result.incomeDeductions > 0) {
    const taxSaved = Math.round(result.incomeDeductions * 0.31);
    insights.push({
      id: "insight-alimony",
      pillar: "deductions",
      category: "deduction",
      title: "ניכויים מההכנסה — מזונות / פנסיה / נכות",
      description: `סך הניכויים מההכנסה: ₪${result.incomeDeductions.toLocaleString("he-IL")}. חיסכון מס משוער: ₪${taxSaved.toLocaleString("he-IL")}.`,
      value: taxSaved,
      year,
    });
  }

  // ── 3. Deductions pillar ───────────────────────────────────────────────────
  const dedLabelMap: Record<string, { label: string; rate: string }> = {
    donation_sec46:              { label: "תרומה לעמותה מוכרת — סעיף 46", rate: "35%" },
    life_insurance_sec45a:       { label: "ביטוח חיים פרטי — סעיף 45א", rate: "25%" },
    ltc_insurance_sec45a:        { label: "ביטוח סיעודי — סעיף 45א", rate: "25%" },
    pension_sec47:               { label: "פנסיה עצמאית — סעיף 47(ב)(2) זיכוי", rate: "35%" },
    self_employed_pension_sec47: { label: "פנסיה עצמאי — סעיף 47", rate: "35%" },
    provident_fund_sec47:        { label: "קופת גמל — סעיף 47", rate: "35%" },
    disabled_child_sec45:        { label: "הוצאות ילד נכה — סעיף 45", rate: "35%" },
    study_fund_sec3e3:           { label: "קרן השתלמות — סעיף 3(ה3)", rate: "35%" },
  };

  for (const ded of taxpayer.personalDeductions) {
    if (ded.type === "alimony_sec9a") continue;
    if ((ded.type as string) === "pension_sec47_deduction") continue;
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
      value: 0,
      year,
    });
  }

  // ── 5. Capital Markets pillar ──────────────────────────────────────────────
  if (taxpayer.capitalGains) {
    const { totalRealizedProfit, totalRealizedLoss, carriedForwardLoss = 0 } = taxpayer.capitalGains;
    const netGain = Math.max(0, totalRealizedProfit - totalRealizedLoss - carriedForwardLoss);
    const usdRate = year === 2025 ? 3.65 : 3.71;

    insights.push({
      id: "insight-capital-markets",
      pillar: "capital_markets",
      category: "capital_markets",
      title: "שוק ההון — רווחי הון ומס זר",
      description: `רווח נקי לאחר קיזוז הפסד מועבר: ${Math.round(netGain).toLocaleString("he-IL")} ₪ · מס רווחי הון לתשלום: ${result.capitalGainsTax.toLocaleString("he-IL")} ₪. סכומים הומרו מ-USD לשקלים לפי שער יציג ${usdRate} (${year}).`,
      value: result.capitalGainsTax > 0 ? -result.capitalGainsTax : 0,
      year,
    });
  }

  return insights;
}

/**
 * Build ActionItem[] from a CalculationResult + taxpayer profile.
 */
export function buildActionItemsFromResult(
  result: CalculationResult,
  taxpayer: TaxPayer
): import("@/types").ActionItem[] {
  const items: import("@/types").ActionItem[] = [];

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

  if (taxpayer.employers.length > 1) {
    items.push({
      id: "action-tax-coord",
      label: "בצע תיאום מס (עבדת אצל יותר ממעסיק אחד)",
      completed: false,
      priority: "high",
    });
  }

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

  items.push({
    id: "action-download-135",
    label: "הורד טופס 135 ממוולא",
    completed: false,
    priority: "high",
    formNumber: "135",
  });

  if (taxpayer.personalDeductions.length === 0 && result.totalGrossIncome > 50_000) {
    items.push({
      id: "action-personal-deductions",
      label: "בדוק זכאות לזיכויים: פנסיה, תרומות, ביטוח חיים",
      completed: false,
      priority: "medium",
    });
  }

  if (taxpayer.lifeEvents?.pulledSeverancePay) {
    items.push({
      id: "action-form161",
      label: "צרף טופס 161 (פיצויים)",
      completed: taxpayer.lifeEvents.hasForm161,
      priority: "high",
      formNumber: "161",
    });
  }

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
