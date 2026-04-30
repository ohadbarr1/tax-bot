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
 * Data source: app/data/tax_brackets_{2020..2025}.json (Bank of Israel / ITA figures)
 *              app/data/credit_points_{2020..2025}.json
 *              app/data/periphery_postcodes.json (postcode → tier; percentage logic in code)
 *
 * Phase 1 §1.B (audit F-031): support the full 6-year claim window per סעיף 160(א).
 * Each year is a separate JSON file; `loadYearData()` is the year-keyed loader.
 * Years 2020–2023 brackets are best-effort (ITA indexation circulars) and bear a
 * `_verification_status` field — the engine accepts them but a CPA should
 * re-verify before reliance on a filing older than 2024.
 *
 * Phase 1 §1.A (P1 tax-math batch). Closes findings:
 *   • F-013 Severance §9(7א) pre-tax exemption (last salary × years × ceiling).
 *   • F-020 §46 donation carry-forward over 3 years (excess above 30% / cap).
 *   • F-021 §45a life/LTC ceiling: 5% of income + ₪108k absolute cap.
 *   • F-022 קרן השתלמות — שכיר receives NO זיכוי (study_fund_sec3e3 zeroed).
 *   • F-023 Multi-employer overlap-month over-withholding effect.
 *   • F-024 §67א foreign-salary credit (capped by Israeli source attribution).
 *   • F-025 §9א pension exemption — 52% of qualifying pension exempt at retirement.
 *   • F-026 Disability §9(5) for 50%-89% — verified relative-exemption (already in 0.C).
 *   • F-027 ילד נטל מיוחד — automatic 2 nq per child (תיקון 196).
 *   • F-028 Joint custody (משמורת משותפת) — 0.5 nq each parent — סעיף 66א(א1).
 *   • Per-year `pensionIncomeCeiling` table (was 2025?283000:270000 — extended).
 */

import brackets2020 from "@/data/tax_brackets_2020.json";
import brackets2021 from "@/data/tax_brackets_2021.json";
import brackets2022 from "@/data/tax_brackets_2022.json";
import brackets2023 from "@/data/tax_brackets_2023.json";
import brackets2024 from "@/data/tax_brackets_2024.json";
import brackets2025 from "@/data/tax_brackets_2025.json";
import peripheryData from "@/data/periphery_postcodes.json";
import { getFxRate } from "@/lib/fx";
import type { TaxPayer, PersonalDeduction } from "@/types";

// ─── Year-keyed loader (F-031) ────────────────────────────────────────────────

/**
 * Shape of a per-year `tax_brackets_<year>.json` file.
 * The `_source` / `_verification_status` keys are documentation-only.
 */
export interface YearTaxData {
  tax_year: number;
  credit_point_monthly_value: number;
  credit_point_annual_value: number;
  tax_brackets: { bracket: number; rate: number; min: number; max: number }[];
  _source?: string;
  _verification_status?: string;
}

const YEAR_DATA: Record<number, YearTaxData> = {
  2020: brackets2020 as YearTaxData,
  2021: brackets2021 as YearTaxData,
  2022: brackets2022 as YearTaxData,
  2023: brackets2023 as YearTaxData,
  2024: brackets2024 as YearTaxData,
  2025: brackets2025 as YearTaxData,
};

/**
 * Resolve year-specific tax data. For an unsupported year the engine falls
 * back to the closest supported year (2020 floor / 2025 ceiling) — a
 * conservative behaviour that prevents silent NaN propagation while making
 * the deviation observable in test coverage.
 */
export function loadYearData(year: number): YearTaxData {
  if (YEAR_DATA[year]) return YEAR_DATA[year];
  if (year < 2020) return YEAR_DATA[2020];
  return YEAR_DATA[2025];
}

/**
 * Set of years the engine fully supports. Mirrors `SupportedTaxYear` in
 * `currentTaxYear.ts`. Kept as a runtime list so tests can iterate it.
 */
export const SUPPORTED_TAX_YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalculationResult {
  totalGrossIncome: number;
  incomeDeductions: number;     // Sec. 9A alimony + Sec. 47(ב)(1) + Sec. 9(5) + Sec. 9א pension
  taxableIncome: number;        // totalGrossIncome − incomeDeductions
  calculatedTax: number;        // raw progressive bracket tax on taxableIncome
  creditPointsValue: number;    // total credit point value in ILS
  deductionCredits: number;     // total deduction credits in ILS (45a, 46, 47(ב)(2), …)
  peripheryDiscount: number;    // tax-discount under צו 2023 / סעיף 11 (NOT credit-points)
  /** F-024: סעיף 67א foreign-salary credit (capped by Israeli source attribution). */
  foreignSalaryCredit: number;
  /** F-013: §9(7א) severance exempt portion (auto-computed when fields present). */
  severanceExemption: number;
  /** F-013: net taxable severance after the §9(7א) exemption (informational). */
  taxableSeverance: number;
  /** F-025: §9א qualifying-pension exemption (52% × קצבה מזכה). */
  qualifyingPensionExemption: number;
  /** F-020: per-year donation excess to carry forward to subsequent years (סעיף 46(ב2)). */
  donationCarryForwardExcess: number;
  /** F-020: prior-year carry-forward consumed in this calculation. */
  donationCarryForwardConsumed: { year: number; consumed: number }[];
  /** F-023: estimated refund-add-on from multi-employer overlap-month over-withholding. */
  multiEmployerOverlapRefund: number;
  /**
   * Phase 1 §1.I (F-018) — שכר במשמרות tax discount per תקנה 5.
   * Subtracted from `calculatedTax` AFTER bracket calc.
   */
  shiftWorkDiscount: number;
  /**
   * Phase 1 §1.I (חל"ת) — un-earned-income slice removed from `taxableIncome`
   * BEFORE bracket calc per תקנה 5(ג)(4) reconciliation.
   */
  chaltAdjustment: number;
  /**
   * Phase 1 §1.I (F-019) — un-earned-income slice removed from `taxableIncome`
   * BEFORE bracket calc per תקנות 168/174 reconciliation. The דמי לידה
   * grant from BL is NEVER added to taxable income (סעיף 9(7)(ב)).
   */
  maternityLeaveAdjustment: number;
  netTaxOwed: number;           // calculatedTax − credits − peripheryDiscount − foreignSalaryCredit
  taxPaid: number;              // sum of all employer taxWithheld + F-023 overlap refund
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
// nearest-supported value acts as the conservative default.
//
// Phase 1 §1.B (F-031): 2020–2023 ceilings are best-effort (ITA indexation
// circulars). They mirror the values in `data/credit_points_<year>.json`.
const DISABILITY_INCOME_CAP: Record<number, number> = {
  2020: 573_600,  // best-effort — ITA 2020 indexation
  2021: 580_680,  // best-effort — ITA 2021 indexation
  2022: 596_400,  // best-effort — ITA 2022 indexation
  2023: 605_640,  // best-effort — ITA 2023 indexation
  2024: 615_840,  // ITA published 2024 ceiling
  2025: 645_360,  // ITA published 2025 ceiling
};

// Periphery percentage-discount under צו 2023 only takes effect from tax year
// 2024 onwards. For 2020–2023 the cap is intentionally 0 — the calculator
// returns 0 discount, which is the conservative no-claim outcome. Pre-2024
// claims that were eligible under the legacy flat-points model are out of
// scope for the percentage-discount engine and require a future migration.
const PERIPHERY_INCOME_CAP: Record<number, number> = {
  2020: 0,
  2021: 0,
  2022: 0,
  2023: 0,
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

// ─── Per-year ceilings (Phase 1 §1.A) ────────────────────────────────────────
// Pension income ceiling for סעיף 47 self-employed credit (16% × min(income, cap)).
// Best-effort indexed values per ITA circulars; 2025 published is ₪283,000.
// Sourced from יד הפועלים / ITA תקנות תיאומי הצמדה published per year.
const PENSION_INCOME_CEILING: Record<number, number> = {
  2020: 211_200,  // best-effort — ITA 2020 indexation
  2021: 213_840,  // best-effort — ITA 2021 indexation
  2022: 220_320,  // best-effort — ITA 2022 indexation
  2023: 223_920,  // best-effort — ITA 2023 indexation
  2024: 270_000,  // ITA published 2024 ceiling
  2025: 283_000,  // ITA published 2025 ceiling
};

// סעיף 46(ב) absolute donation cap. Indexed annually; 2025 is ₪10,453,805.
const DONATION_ABSOLUTE_CAP: Record<number, number> = {
  2020: 9_295_000,   // best-effort — ITA 2020 indexation
  2021: 9_350_000,   // best-effort — ITA 2021 indexation
  2022: 9_649_780,   // best-effort — ITA 2022 indexation
  2023: 9_877_000,   // best-effort — ITA 2023 indexation
  2024: 10_354_180,  // ITA published 2024 ceiling
  2025: 10_453_805,  // ITA published 2025 ceiling
};

// סעיף 45א absolute ceiling on life + LTC insurance premium TOTAL eligible
// for the 25% credit (in addition to the 5%-of-income relative cap).
const LIFE_INSURANCE_ABSOLUTE_CAP: Record<number, number> = {
  2020: 100_000,     // best-effort — ITA 2020 indexation
  2021: 100_000,     // best-effort — ITA 2021 indexation
  2022: 102_000,     // best-effort — ITA 2022 indexation
  2023: 104_000,     // best-effort — ITA 2023 indexation
  2024: 106_000,     // best-effort — ITA 2024 indexation
  2025: 108_000,     // ITA 2025 (audit F-021)
};

// סעיף 9(7א) — annual exemption ceiling per year of service for severance.
// The exempt portion is min(grossSeverance, lastMonthlySalary × yearsOfService × cap[year]).
const SEVERANCE_CEILING_PER_YEAR: Record<number, number> = {
  2020: 12_420,    // best-effort — ITA 2020 indexation
  2021: 12_640,    // best-effort — ITA 2021 indexation
  2022: 12_944,    // best-effort — ITA 2022 indexation
  2023: 13_310,    // best-effort — ITA 2023 indexation
  2024: 13_750,    // ITA published 2024 ceiling
  2025: 13_750,    // ITA published 2025 ceiling
};

// סעיף 9א (קצבה מזכה) — exempt percentage of qualifying pension at retirement.
// 52% from 2025 onwards (תיקון 190); pre-2025 mostly 52% (post-2024 transition).
const QUALIFYING_PENSION_EXEMPT_PCT: Record<number, number> = {
  2020: 0.52,
  2021: 0.52,
  2022: 0.52,
  2023: 0.52,
  2024: 0.52,
  2025: 0.52,
};

// Period (years) over which excess donations are carryable per סעיף 46(ב2).
const DONATION_CARRY_FORWARD_YEARS = 3;

// ─── 1. Tax Bracket Calculation ───────────────────────────────────────────────

/**
 * Calculate progressive income tax using Israeli tax brackets.
 *
 * @param grossIncome Annual gross income in ILS
 * @param year        Tax year (2020-2025; year-keyed loader picks the right table)
 * @returns           Raw tax liability in ILS (before any credits)
 */
export function calculateTaxOnIncome(
  grossIncome: number,
  year: number
): { tax: number; byBracket: CalculationResult["breakdown"]["byBracket"] } {
  const brackets = loadYearData(year).tax_brackets;

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

// ─── 3b. Severance §9(7א) exemption helper (F-013) ───────────────────────────

/**
 * Compute the §9(7א) pre-tax exemption on a severance grant.
 *
 * Formula: min(grossSeverance, lastMonthlySalary × yearsOfService × ceilingPerYear[year]).
 * The cap per year of service is published annually by the ITA — ₪13,750 in 2025.
 *
 * @param grossSeverance     Gross severance grant (ILS) before any tax.
 * @param lastMonthlySalary  Last monthly salary at the paying employer (ILS).
 * @param yearsOfService     Years of service that produced the grant (may be fractional).
 * @param year               Tax year of payment.
 * @returns                  The exempt portion (ILS), bounded by the gross.
 */
export function calculateSeveranceExemption(
  grossSeverance: number,
  lastMonthlySalary: number,
  yearsOfService: number,
  year: number
): number {
  if (grossSeverance <= 0) return 0;
  if (lastMonthlySalary <= 0 || yearsOfService <= 0) return 0;
  const ceiling = SEVERANCE_CEILING_PER_YEAR[year] ?? SEVERANCE_CEILING_PER_YEAR[2025];
  // The statutory base uses the LOWER of the actual last salary and the
  // per-year ceiling — the per-year cap functions as the maximum-recognised
  // monthly salary, not as a multiplier on top of an arbitrary salary.
  const recognisedMonthly = Math.min(lastMonthlySalary, ceiling);
  const fullExemption = Math.round(recognisedMonthly * yearsOfService);
  return Math.min(fullExemption, grossSeverance);
}

// ─── 3c. Pension §9א qualifying-pension exemption helper (F-025) ────────────

/**
 * Compute the §9א exemption on a qualifying pension (קצבה מזכה).
 * Per 2025 settings: 52% of the qualifying pension is exempt for taxpayers
 * who reached pension-eligible age. The exemption applies only when
 * `isPensionEligible` is set (gate the call from the engine).
 *
 * @param qualifyingPension Annual קצבה מזכה (ILS).
 * @param year              Tax year (year-keyed exemption-pct).
 */
export function calculateQualifyingPensionExemption(
  qualifyingPension: number,
  year: number
): number {
  if (qualifyingPension <= 0) return 0;
  const pct = QUALIFYING_PENSION_EXEMPT_PCT[year] ?? QUALIFYING_PENSION_EXEMPT_PCT[2025];
  return Math.round(qualifyingPension * pct);
}

// ─── 3d. §67א foreign-salary credit helper (F-024) ──────────────────────────

/**
 * Compute the foreign-tax credit on a foreign salary (סעיף 67א + 199-210).
 *
 * The credit is the LOWER of:
 *   (a) the actual foreign tax paid on the foreign salary (`foreignSalaryTaxPaid`), and
 *   (b) the Israeli tax attributable to that foreign-source slice of income —
 *       i.e. `(foreignSalaryGross / totalTaxableIncome) × calculatedIsraelTax`.
 *
 * Source-by-source cap follows סעיף 200(ג) — foreign credit cannot reduce
 * Israeli tax on Israeli-source income.
 *
 * @param foreignSalaryGross    Foreign salary gross in ILS.
 * @param foreignSalaryTaxPaid  Foreign tax paid in ILS.
 * @param israeliTaxOnTotal     Israeli bracket tax on TOTAL taxable income.
 * @param totalTaxableIncome    Taxable income (denominator for attribution).
 */
export function calculateForeignSalaryCredit(
  foreignSalaryGross: number,
  foreignSalaryTaxPaid: number,
  israeliTaxOnTotal: number,
  totalTaxableIncome: number
): number {
  if (foreignSalaryGross <= 0 || foreignSalaryTaxPaid <= 0) return 0;
  if (totalTaxableIncome <= 0 || israeliTaxOnTotal <= 0) return 0;
  const attribution = Math.round(
    (foreignSalaryGross / totalTaxableIncome) * israeliTaxOnTotal
  );
  return Math.min(foreignSalaryTaxPaid, attribution);
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
  const creditPointAnnualValue = loadYearData(year).credit_point_annual_value;

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
  // F-028 joint custody (משמורת משותפת) — סעיף 66א(א1): each parent in joint
  // custody receives 0.5 nq for the otherwise-1.0 child credit. Birth-year
  // (1.5) and daycare (1.0) credits remain unsplit; only the standard
  // under-18 credit is halved per the statute.
  const jointCustodyMultiplier =
    (taxpayer as { jointCustody?: boolean }).jointCustody === true ? 0.5 : 1.0;

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
      // F-028: Standard child credit (under 18) — halved under joint custody.
      const standard = +(1.0 * jointCustodyMultiplier).toFixed(4);
      breakdown[`child_${child.id}`] = standard;
      points += standard;
    }
    // F-010: ages 3-5 in daycare get the standard under-18 credit (handled above).
    // No separate `child_*_daycare_35` key anymore.

    // F-027: ילד נטל מיוחד — automatic 2 nq per parent (תיקון 196 לסעיף 45).
    // This is in ADDITION to the standard child credit (and to any §45
    // disabled-child expense deduction). Joint custody does NOT halve the
    // נטל-מיוחד credit — it is granted to each parent regardless.
    if (child.hasSpecialNeeds) {
      breakdown[`child_${child.id}_special_needs`] = 2.0;
      points += 2.0;
    }
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
 * Per-year minimum donation for סעיף 46 eligibility (₪).
 * Phase 1 §1.B (F-031): extended to 2020–2025 per ITA published indexation.
 * Source: `data/credit_points_<year>.json :: rules.donation_min_sec46.amount`.
 */
const DONATION_MIN_SEC46: Record<number, number> = {
  2020: 199,
  2021: 200,
  2022: 207,
  2023: 209,
  2024: 207,
  2025: 214,
};

/**
 * Optional context for `calculateDeductionCredits` introduced in Phase 1 §1.A.
 * Lets the engine pass a prior-year donation carry-forward stack (F-020) and
 * a "is salaried (שכיר)" flag for the קרן השתלמות gate (F-022). Both are
 * fully optional so existing callers / tests keep their behaviour unchanged.
 */
export interface DeductionCreditContext {
  /** F-020: ordered list of prior years' un-credited donation excesses (ILS). */
  donationCarryForward?: { year: number; remaining: number }[];
  /**
   * F-022: when true, study-fund (קרן השתלמות) קבלות get NO זיכוי.
   * שכיר never receives זיכוי for קרן השתלמות per סעיף 3(ה3). Default true
   * because the engine is salaried-first.
   */
  isSalaried?: boolean;
}

/**
 * Calculate tax credits from personal deductions.
 *
 * Credit rules (Phase 0 + 1.A):
 *   donation_sec46             35% credit; min varies by year (DONATION_MIN_SEC46);
 *                              cap = min(30% × income, DONATION_ABSOLUTE_CAP[year]).
 *                              Excess (over the cap) is returned via `carryForwardExcess`
 *                              for the engine to persist for up to 3 years (F-020).
 *                              Prior-year carry-forward is consumed first (FIFO),
 *                              within the same 30%/absolute cap envelope.
 *   life_insurance_sec45a      25% credit; F-021: combined-with-LTC cap =
 *                              min(5% × income, LIFE_INSURANCE_ABSOLUTE_CAP[year]).
 *   ltc_insurance_sec45a       25% credit (shares the same §45א ceiling).
 *   pension_sec47              35% credit on capped deposit (Sec. 47(ב)(2) זיכוי).
 *   self_employed_pension_sec47 35% credit; cap = min(income, PENSION_INCOME_CEILING[year]) × 16%.
 *   provident_fund_sec47       35% credit; capped at ₪10,000 above employer match.
 *   disabled_child_sec45       35% credit on qualifying expenses (capped ₪35,000).
 *   study_fund_sec3e3          F-022: שכיר (default) receives 0 credit.
 *                              Caller can opt-out by passing `isSalaried:false`.
 *
 * Skipped here (handled in calculateIncomeDeductions):
 *   alimony_sec9a              — INCOME deduction (spouse-portion).
 *   pension_sec47_deduction    — Sec. 47(ב)(1) ניכוי (F-005).
 */
export function calculateDeductionCredits(
  deductions: PersonalDeduction[],
  grossIncome: number,
  year: number,
  context: DeductionCreditContext = {}
): {
  total: number;
  breakdown: Record<string, number>;
  /** F-020: per-year excess of donations over the §46 cap, to carry forward. */
  carryForwardExcess: number;
  /** F-020: per-prior-year carry-forward consumed in this calc (for state mutation). */
  carryForwardConsumed: { year: number; consumed: number }[];
} {
  // Default to the 2024 floor (₪207) for any year not in the table — keeps
  // legacy assumptions intact while explicitly supporting 2020–2025.
  const minDonation = DONATION_MIN_SEC46[year] ?? 207;
  const maxDonationPct = 0.30;
  const maxPensionDeposit = 10_000;
  // Phase 1 §1.A — replaces the legacy `year === 2025 ? 283_000 : 270_000`.
  const pensionIncomeCeiling = PENSION_INCOME_CEILING[year] ?? PENSION_INCOME_CEILING[2025];
  const maxSelfEmployedPension = Math.round(Math.min(grossIncome, pensionIncomeCeiling) * 0.16);
  const maxDisabledChild = 35_000;
  const maxProvident = 10_000;

  // F-020: donation absolute cap (סעיף 46(ב)).
  const donationAbsoluteCap = DONATION_ABSOLUTE_CAP[year] ?? DONATION_ABSOLUTE_CAP[2025];
  // F-021: §45א combined ceiling (life + LTC) — min of 5% × income and absolute cap.
  const lifeInsuranceAbsoluteCap = LIFE_INSURANCE_ABSOLUTE_CAP[year] ?? LIFE_INSURANCE_ABSOLUTE_CAP[2025];
  const lifeInsuranceCeiling = Math.min(
    Math.round(grossIncome * 0.05),
    lifeInsuranceAbsoluteCap
  );

  // The salaried-default for F-022. Callers (engine + tests) can opt-out
  // by passing `{ isSalaried: false }`. Default = true (salaried-first engine).
  const isSalaried = context.isSalaried !== false;

  const breakdown: Record<string, number> = {};
  let total = 0;
  let lifeAndLtcAccumulated = 0;        // F-021: running sum, capped together.

  // F-020 step A: combine current-year donations and consume prior-year carry-forwards.
  // First we walk the deductions, summing eligible donation amounts, then we apply
  // the §46 30%/absolute cap once; excess feeds carryForwardExcess; remainder of
  // cap headroom consumes carry-forwards FIFO.
  let currentYearDonationGross = 0;
  for (const ded of deductions) {
    if (ded.type === "donation_sec46" && ded.amount >= minDonation) {
      currentYearDonationGross += ded.amount;
    }
  }
  const donationCap = Math.min(grossIncome * maxDonationPct, donationAbsoluteCap);
  // Eligible from the current year, before consuming carry-forwards.
  const eligibleCurrentYear = Math.min(currentYearDonationGross, donationCap);
  const excessCurrentYear = Math.max(0, currentYearDonationGross - donationCap);
  // The remaining cap headroom can be filled by prior-year carry-forwards.
  let remainingHeadroom = Math.max(0, donationCap - eligibleCurrentYear);

  const carryForwardConsumed: { year: number; consumed: number }[] = [];
  let carryForwardEligible = 0;
  if (Array.isArray(context.donationCarryForward)) {
    // FIFO: oldest year first (per סעיף 46(ב2) "first-in-first-out").
    const sorted = [...context.donationCarryForward].sort((a, b) => a.year - b.year);
    for (const entry of sorted) {
      if (remainingHeadroom <= 0) break;
      // Only entries from the trailing 3 years are still eligible per סעיף 46(ב2).
      if (year - entry.year > DONATION_CARRY_FORWARD_YEARS) continue;
      const take = Math.min(entry.remaining, remainingHeadroom);
      if (take > 0) {
        carryForwardConsumed.push({ year: entry.year, consumed: take });
        carryForwardEligible += take;
        remainingHeadroom -= take;
      }
    }
  }

  if (eligibleCurrentYear > 0 || carryForwardEligible > 0) {
    const totalDonationEligible = eligibleCurrentYear + carryForwardEligible;
    const donationCredit = Math.round(totalDonationEligible * 0.35);
    // Attribute the credit to the first donation_sec46 deduction id (the
    // breakdown dictionary mirrors per-deduction credits — for current-year
    // donations split across multiple receipts, callers see the aggregated
    // line).
    const firstDonationId = deductions.find(
      (d) => d.type === "donation_sec46" && d.amount >= minDonation
    )?.id;
    if (firstDonationId) breakdown[firstDonationId] = donationCredit;
    else if (carryForwardEligible > 0) breakdown.donation_carry_forward = donationCredit;
    total += donationCredit;
  }

  for (const ded of deductions) {
    const dt = ded.type as string;
    // F-005 + F-006: skip income-deduction variants (handled separately).
    if (dt === "alimony_sec9a") continue;
    if (dt === "pension_sec47_deduction") continue;
    // F-020: donations are aggregated above; skip the per-row pass here.
    if (dt === "donation_sec46") continue;

    switch (ded.type) {
      case "life_insurance_sec45a":
      case "ltc_insurance_sec45a": {
        // F-021: enforce the combined §45א ceiling against the running total.
        const headroom = Math.max(0, lifeInsuranceCeiling - lifeAndLtcAccumulated);
        const eligible = Math.min(ded.amount, headroom);
        const credit = Math.round(eligible * 0.25);
        breakdown[ded.id] = credit;
        total += credit;
        lifeAndLtcAccumulated += eligible;
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
        // F-022: שכיר receives NO זיכוי for קרן השתלמות per סעיף 3(ה3).
        // The legacy 35% calc was a fabrication. Self-employed עצמאי has a
        // separate ניכוי route (4.5% of income up to ~₪19,920) — that is
        // out of scope for the salaried-first engine; opt-out via
        // `context.isSalaried = false` keeps the legacy 35% path for callers
        // who explicitly opt in.
        if (isSalaried) {
          breakdown[ded.id] = 0;
        } else {
          const credit = Math.round(ded.amount * 0.35);
          breakdown[ded.id] = credit;
          total += credit;
        }
        break;
      }
    }
  }

  return { total, breakdown, carryForwardExcess: excessCurrentYear, carryForwardConsumed };
}

// ─── 5b. Phase 1 §1.I — משמרות / חל"ת / חופשת לידה helpers ───────────────────

/**
 * Standard return-shape for the Phase 1 §1.I helpers (audit F-018, F-019, חל"ת
 * 41-42). Each helper computes a single ILS adjustment and reports the
 * statutory citation + a Hebrew explanation that the dashboard / 135 review
 * surface can use directly. `adjustment` is signed POSITIVE when it INCREASES
 * the user's refund (i.e. it is added to `netRefund` or subtracted from
 * `calculatedTax`/`taxableIncome` upstream).
 */
export interface LifeEventAdjustment {
  /** ILS amount of the adjustment (positive when it benefits the refund). */
  adjustment: number;
  /** Statutory citation in Hebrew (e.g. "תקנה 5 לתקנות מס הכנסה"). */
  cite: string;
  /** Hebrew explanation of how the adjustment was derived. */
  explanation: string;
}

/**
 * F-018: Compute the שכר במשמרות tax discount.
 *
 * Statutory basis: תקנה 5 לתקנות מס הכנסה (שיעור המס על הכנסה ממשמרות) +
 * הוראת ביצוע 24/2002. A worker who performs eligible משמרות where the
 * monthly hours fall in the 175-200 band receives a 15% discount on the
 * marginal tax attributable to those shift hours, capped at 200 hours / month.
 *
 * Model (intentionally simple — the law sets a band, not a per-minute meter):
 *   1. Eligibility floor = 175 hours / month. Below the floor → no discount.
 *   2. Recognised hours / month = min(avgHoursPerMonth, 200) − 175. (0–25 band).
 *   3. Total recognised shift hours = recognisedPerMonth × months.
 *   4. Effective marginal rate = calculatedTax / max(1, taxableIncome).
 *   5. Shift-portion income ≈ recognised hours × (taxableIncome / 1900) per
 *      ITA standard 1900 work-hours/year proxy (190h × 10 months baseline).
 *   6. Discount = 15% × effectiveMarginalRate × shiftPortionIncome.
 *
 * The result is an additive ILS amount (refund-side). The caller subtracts it
 * from `calculatedTax` (the brief mandates "shift discount adjusts
 * calculatedTax AFTER bracket calc").
 *
 * @param taxpayer    TaxPayer (reads `lifeEvents.shiftWorkHours`).
 * @param taxableIncome Annual taxable income post-deductions (ILS).
 * @param calculatedTax Annual progressive bracket tax on `taxableIncome` (ILS).
 * @returns           {adjustment, cite, explanation}. `adjustment` = 0 when not eligible.
 */
export function calculateShiftWorkDiscount(
  taxpayer: TaxPayer,
  taxableIncome: number,
  calculatedTax: number
): LifeEventAdjustment {
  const cite = "תקנה 5 לתקנות מס הכנסה (שיעור המס על הכנסה ממשמרות) + הוראת ביצוע 24/2002";
  const sw = taxpayer.lifeEvents?.shiftWorkHours;
  if (!sw || taxableIncome <= 0 || calculatedTax <= 0) {
    return {
      adjustment: 0,
      cite,
      explanation: "אין נתוני משמרות מוכרות (175-200 שעות לחודש) — לא חושב זיכוי משמרות.",
    };
  }

  const months = Math.max(0, Math.min(12, sw.months));
  const avg = Math.max(0, sw.avgHoursPerMonth);

  // Eligibility floor: ≥ 175 hours/month. Below the floor — no discount.
  if (months <= 0 || avg < 175) {
    return {
      adjustment: 0,
      cite,
      explanation: `לא קיימת זכאות: עבודה במשמרות מוכרת מ-175 שעות לחודש ומעלה (חודשים: ${months}, ממוצע: ${avg}).`,
    };
  }

  // Recognised band: 175-200 hours / month → up to 25 eligible hours / month.
  const recognisedPerMonth = Math.min(avg, 200) - 175;
  const totalRecognisedHours = recognisedPerMonth * months;

  // Standard ITA proxy for full-year work hours (190h × 10 base months).
  const ANNUAL_WORK_HOURS = 1_900;
  const effectiveMarginalRate = calculatedTax / Math.max(1, taxableIncome);
  // Shift-portion income ≈ proportional slice of taxable income.
  const shiftPortionIncome = (totalRecognisedHours / ANNUAL_WORK_HOURS) * taxableIncome;
  // 15% discount per תקנה 5.
  const discount = Math.round(0.15 * effectiveMarginalRate * shiftPortionIncome);
  // Bound by the actual tax on the shift portion (cannot refund more than was due).
  const shiftPortionTax = Math.round(effectiveMarginalRate * shiftPortionIncome);
  const adjustment = Math.max(0, Math.min(discount, shiftPortionTax));

  return {
    adjustment,
    cite,
    explanation:
      `זיכוי 15% על שעות משמרות מוכרות (175-200 שעות לחודש): ${totalRecognisedHours.toFixed(1)} שעות שנתיות, ` +
      `מס שולי אפקטיבי ${(effectiveMarginalRate * 100).toFixed(1)}%, חיסכון ${adjustment.toLocaleString("he-IL")} ₪.`,
  };
}

/**
 * חל"ת: Compute the תקנה 5(ג)(4) reconciliation adjustment.
 *
 * When ניכוי במקור was withheld during worked months on the assumption of a
 * full 12-month income trajectory, but the worker was actually on חל"ת for
 * some months, the engine recognises the over-withheld slice as a refund.
 *
 * Model (per the brief):
 *   1. Treat `taxableIncome` as the *projected* annual taxable income
 *      (the basis the employer used for withholding).
 *   2. monthsWorked = 12 − chaltMonths.
 *   3. actualEarnedSlice = taxableIncome × (monthsWorked / 12).
 *   4. The leave fraction (chaltMonths / 12) of taxableIncome is income that
 *      was NOT actually earned but that the projection-based withholding
 *      already taxed at the marginal rate. The reconciliation REDUCES
 *      `taxableIncome` by the un-earned slice.
 *
 * Returns the ILS amount to SUBTRACT from `taxableIncome` BEFORE bracket calc
 * (positive value = un-earned income to remove).
 *
 * @param taxpayer    TaxPayer (reads `lifeEvents.chaltMonths`).
 * @param taxableIncome Projected annual taxable income (ILS).
 * @returns           {adjustment, cite, explanation}.
 */
export function calculateChaltAdjustment(
  taxpayer: TaxPayer,
  taxableIncome: number
): LifeEventAdjustment {
  const cite = 'תקנה 5(ג)(4) לתקנות מס הכנסה (תיאום מס לאחר חזרה מחל"ת)';
  const months = taxpayer.lifeEvents?.chaltMonths;
  if (!months || months <= 0 || taxableIncome <= 0) {
    return {
      adjustment: 0,
      cite,
      explanation: 'אין חודשי חל"ת בשנת המס — לא חושבה התאמה.',
    };
  }
  if (months >= 12) {
    return {
      adjustment: 0,
      cite,
      explanation: 'חל"ת מלא לשנה — אין הכנסה אמיתית; ההתאמה מחושבת ברמת הנתונים, לא כאן.',
    };
  }

  const cappedMonths = Math.min(12, months);
  const leaveFraction = cappedMonths / 12;
  const adjustment = Math.round(taxableIncome * leaveFraction);

  return {
    adjustment,
    cite,
    explanation:
      `חל"ת — ${cappedMonths} חודשים מתוך 12. מההכנסה החייבת המוצהרת מורד נתח של ` +
      `${(leaveFraction * 100).toFixed(1)}% (₪${adjustment.toLocaleString("he-IL")}) ` +
      `שלא נכנס בפועל בגלל החל"ת, ולכן ניכוי המס שבוצע עליו חוזר כהחזר.`,
  };
}

/**
 * F-019: Compute the חופשת לידה reconciliation adjustment.
 *
 * Statutory basis: תקנות 168 + 174 (תיאום מס לאחר חופשת לידה) +
 * סעיף 9(7)(ב) — דמי לידה ששולמו על-ידי המוסד לביטוח לאומי הם פטורים ממס.
 *
 * Same reconciliation arithmetic as חל"ת (the projection-based withholding
 * vs. actual months worked). The maternity allowance grant from BL is
 * EXCLUDED from `taxableIncome` (per the §9(7)(ב) exemption); the engine
 * never adds it to the gross.
 *
 * Returns the ILS amount to SUBTRACT from `taxableIncome` BEFORE bracket calc.
 *
 * @param taxpayer    TaxPayer (reads `lifeEvents.maternityLeaveMonths` +
 *                    `lifeEvents.maternityLeaveAllowanceIls`).
 * @param taxableIncome Projected annual taxable income (ILS).
 * @returns           {adjustment, cite, explanation}.
 */
export function calculateMaternityLeaveAdjustment(
  taxpayer: TaxPayer,
  taxableIncome: number
): LifeEventAdjustment {
  const cite = 'תקנות 168 + 174 + סעיף 9(7)(ב) (פטור על דמי לידה)';
  const months = taxpayer.lifeEvents?.maternityLeaveMonths;
  if (!months || months <= 0 || taxableIncome <= 0) {
    return {
      adjustment: 0,
      cite,
      explanation: "אין ימי חופשת לידה בשנת המס — לא חושבה התאמה.",
    };
  }
  if (months >= 12) {
    return {
      adjustment: 0,
      cite,
      explanation: "שנת המס כולה בחופשת לידה — אין הכנסה אמיתית; ההתאמה מחושבת ברמת הנתונים, לא כאן.",
    };
  }

  const cappedMonths = Math.min(12, months);
  const leaveFraction = cappedMonths / 12;
  const adjustment = Math.round(taxableIncome * leaveFraction);
  const allowance = Math.max(0, taxpayer.lifeEvents?.maternityLeaveAllowanceIls ?? 0);

  const allowanceNote = allowance > 0
    ? ` דמי לידה מבל"ל בסך ₪${allowance.toLocaleString("he-IL")} פטורים ממס לפי סעיף 9(7)(ב) ולא נוספו להכנסה החייבת.`
    : "";

  return {
    adjustment,
    cite,
    explanation:
      `חופשת לידה — ${cappedMonths} חודשים מתוך 12. מההכנסה החייבת המוצהרת מורד נתח של ` +
      `${(leaveFraction * 100).toFixed(1)}% (₪${adjustment.toLocaleString("he-IL")}) ` +
      `שלא נכנס בפועל בגלל חופשת הלידה.${allowanceNote}`,
  };
}

// ─── 6. USD → ILS Conversion ─────────────────────────────────────────────────

/**
 * Convert a USD amount to ILS using the Bank of Israel publish rate.
 *
 * Phase 1 §1.F (audit F-017) migrated this from annual-mean to daily-rate
 * conversion: the new signature accepts an optional transaction-date and,
 * when supplied, dispatches to `lib/fx.ts#getFxRate` for the שער יציג of
 * that day (with prior-business-day fallback per תקנות מס הכנסה / המרה).
 *
 * Backward compat: when called with `(usdAmount, year)` the old shape, the
 * function falls back to the year's BoI annual mean (sourced from
 * `data/fx/usd_ils_daily.json#annualMean`). New callers should pass a Date.
 *
 * Do NOT call this inside `calculateFullRefund` — stored `capitalGains`
 * values are expected to already be in ILS (converted at ingestion time
 * by `lib/ibkrParser.ts`, which now uses per-row daily rates).
 */
export function convertUsdToIls(
  usdAmount: number,
  yearOrDate: number | Date | string
): number {
  if (typeof yearOrDate === "number") {
    // Legacy code path — annual-mean fallback. Use mid-year date so getFxRate
    // returns the year's annual-mean from the documented dataset.
    const rate = getFxRate("USD", `${yearOrDate}-06-30`);
    return Math.round(usdAmount * rate);
  }
  const rate = getFxRate("USD", yearOrDate);
  return Math.round(usdAmount * rate);
}

// ─── 7. Full Refund Calculation ───────────────────────────────────────────────

/**
 * Run the complete Israeli income-tax refund calculation for a taxpayer.
 *
 * IMPORTANT: taxpayer.capitalGains values must be in ILS before calling this function.
 */
export function calculateFullRefund(taxpayer: TaxPayer, year: number): CalculationResult {
  // Phase 1 §1.B (F-031): all years 2020–2025 dispatch through `loadYearData`;
  // the legacy `safeYear: 2024 | 2025` clamp is gone.

  // Step 1: Total gross income from all employers
  const employerGrossIncome = taxpayer.employers.reduce(
    (s, e) => s + (e.grossSalary ?? 0),
    0
  );
  // F-024: include foreign-source salary in the gross / taxable base. The
  // foreign tax already paid abroad is a credit against Israeli tax — applied
  // in step 5 below — not an exclusion from income.
  const foreignSalaryGross = Math.max(0, taxpayer.foreignSalaryGross ?? 0);
  const totalGrossIncome = employerGrossIncome + foreignSalaryGross;

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

  // Step 1d: F-025 §9א qualifying-pension exemption — 52% of qualifying pension
  // exempt at retirement age. The exempt slice is bounded by the qualifying
  // pension itself (cannot exempt more than was received).
  let qualifyingPensionExemption = 0;
  if (
    taxpayer.qualifyingPensionAmount &&
    taxpayer.qualifyingPensionAmount > 0 &&
    taxpayer.isPensionEligible === true
  ) {
    qualifyingPensionExemption = calculateQualifyingPensionExemption(
      taxpayer.qualifyingPensionAmount,
      year
    );
  }

  const incomeDeductions = incomeDeductionsCore + disabilityExemption + qualifyingPensionExemption;
  const preLifeEventTaxableIncome = Math.max(0, totalGrossIncome - incomeDeductions);

  // Step 1e: Phase 1 §1.I — חל"ת + חופשת לידה reconciliation.
  // Per the brief, both adjustments REDUCE `taxableIncome` BEFORE bracket
  // calc — the engine treats the user-reported income as the projected
  // 12-month basis the employer used for withholding, and removes the
  // leave-month slice that was never earned in practice.
  const chaltResult = calculateChaltAdjustment(taxpayer, preLifeEventTaxableIncome);
  // The maternity reconciliation runs against the income AFTER the חל"ת
  // adjustment so the two leave-month buckets compose correctly when both
  // are present (rare but possible — e.g. חל"ת directly after maternity).
  const maternityBase = Math.max(0, preLifeEventTaxableIncome - chaltResult.adjustment);
  const maternityResult = calculateMaternityLeaveAdjustment(taxpayer, maternityBase);
  const taxableIncome = Math.max(
    0,
    preLifeEventTaxableIncome - chaltResult.adjustment - maternityResult.adjustment
  );

  // Step 2: Raw progressive bracket tax (on income AFTER income deductions
  // AND חל"ת / maternity reconciliation).
  const { tax: rawCalculatedTax, byBracket } = calculateTaxOnIncome(
    taxableIncome,
    year
  );

  // Step 2b: Phase 1 §1.I (F-018) — שכר במשמרות discount on bracket tax.
  // Per תקנה 5 the 15% discount applies AFTER the bracket calc. Bound the
  // discount at the raw tax (cannot reduce calculatedTax below 0).
  const shiftWorkResult = calculateShiftWorkDiscount(
    taxpayer,
    taxableIncome,
    rawCalculatedTax
  );
  const shiftWorkDiscount = Math.min(shiftWorkResult.adjustment, rawCalculatedTax);
  const calculatedTax = Math.max(0, rawCalculatedTax - shiftWorkDiscount);

  // Step 3: Credit points (now WITHOUT periphery / disability / kibbutz).
  const {
    annualValue: creditPointsValue,
    points: creditPointsCount,
    breakdown: creditPointsBreakdown,
  } = calculateCreditPoints(taxpayer, year);

  // Step 4: Personal deduction credits (use taxableIncome for caps).
  const {
    total: deductionCredits,
    breakdown: deductionsBreakdown,
    carryForwardExcess: donationCarryForwardExcess,
    carryForwardConsumed: donationCarryForwardConsumed,
  } = calculateDeductionCredits(taxpayer.personalDeductions, taxableIncome, year, {
    // F-020: pass any prior-year donation carry-forward stack from the taxpayer.
    donationCarryForward: taxpayer.donationCarryForward,
    // F-022: שכיר default — the engine is salaried-first.
    isSalaried: true,
  });

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

  // Step 4c: F-024 §67א foreign-salary credit. Calculated against the
  // pre-credit Israeli bracket tax with attribution by income share, capped
  // by the foreign tax actually paid (סעיף 200(ג) source-by-source).
  let foreignSalaryCredit = 0;
  if (foreignSalaryGross > 0 && (taxpayer.foreignSalaryTaxPaid ?? 0) > 0) {
    foreignSalaryCredit = calculateForeignSalaryCredit(
      foreignSalaryGross,
      taxpayer.foreignSalaryTaxPaid ?? 0,
      calculatedTax,
      taxableIncome
    );
  }

  // Step 5: Net tax owed (floored at 0).
  const netTaxOwed = Math.max(
    0,
    calculatedTax
      - creditPointsValue
      - deductionCredits
      - peripheryDiscount
      - foreignSalaryCredit
  );

  // Step 6: Tax already paid via employer withholding.
  const employerTaxWithheld = taxpayer.employers.reduce(
    (s, e) => s + (e.taxWithheld ?? 0),
    0
  );

  // F-023: multi-employer overlap-month over-withholding. When two employers
  // both withheld at the highest marginal rate during overlap months without
  // prior תיאום מס, the secondary's withholding on those months is largely
  // refundable (47% withheld vs. effective marginal often <31%). The engine
  // estimates the refundable slice as the difference between the secondary's
  // monthly withholding and the year's effective marginal rate × secondary
  // monthly gross — surfaced as a refund add-on so it is not silently lost
  // in the bracket math (which only sees the totals, not the timing).
  let overlapOverWithholding = 0;
  const overlapMonths = taxpayer.lifeEvents?.multiEmployerOverlapMonths ?? 0;
  if (overlapMonths > 0 && taxpayer.employers.length >= 2 && taxableIncome > 0) {
    // Identify the secondary employer (smallest gross) for attribution.
    const sortedByGross = [...taxpayer.employers].sort(
      (a, b) => (a.grossSalary ?? 0) - (b.grossSalary ?? 0)
    );
    const secondary = sortedByGross[0];
    if (secondary && (secondary.grossSalary ?? 0) > 0 && (secondary.monthsWorked ?? 0) > 0) {
      const monthlyGross = (secondary.grossSalary ?? 0) / (secondary.monthsWorked ?? 12);
      const monthlyWithheld = (secondary.taxWithheld ?? 0) / (secondary.monthsWorked ?? 12);
      const effectiveMarginal = calculatedTax / Math.max(1, taxableIncome);
      // Refundable per overlap month = withholding done minus the effective
      // marginal liability at that income level. Floored at 0.
      const perMonthRefund = Math.max(0, monthlyWithheld - monthlyGross * effectiveMarginal);
      overlapOverWithholding = Math.round(perMonthRefund * Math.min(overlapMonths, secondary.monthsWorked ?? 12));
    }
  }
  const taxPaid = employerTaxWithheld + overlapOverWithholding;

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

  // Step 10: F-013 §9(7א) auto-compute severance exemption + emit a warning
  // when the user-entered `taxableSeverancePay` (Field 272) appears to ignore
  // the statutory exemption. This does NOT alter `netRefund` — severance is
  // taxed via spreading on Form 161 (1.E owns) — but it surfaces the
  // exemption headline so downstream code can prefill correctly.
  let severanceExemption = 0;
  let taxableSeverance = taxpayer.lifeEvents?.taxableSeverancePay ?? 0;
  const grossSev = taxpayer.lifeEvents?.grossSeverancePay ?? 0;
  const lastMonthly = taxpayer.lifeEvents?.lastMonthlySalary ?? 0;
  const yos = taxpayer.lifeEvents?.yearsOfService ?? 0;
  if (grossSev > 0 && lastMonthly > 0 && yos > 0) {
    severanceExemption = calculateSeveranceExemption(grossSev, lastMonthly, yos, year);
    const computedTaxable = Math.max(0, grossSev - severanceExemption);
    if (taxpayer.lifeEvents?.taxableSeverancePay === undefined) {
      taxableSeverance = computedTaxable;
    } else if (Math.abs(computedTaxable - taxableSeverance) > 1) {
      incomeDeductionWarnings.push(
        `severance §9(7א): user-entered taxableSeverancePay (${taxableSeverance}) differs from auto-computed ${computedTaxable} (gross ${grossSev} − exempt ${severanceExemption}). אנא ודאו את הסכום החייב במס.`
      );
    }
  }

  return {
    totalGrossIncome,
    incomeDeductions,
    taxableIncome,
    calculatedTax,
    creditPointsValue,
    deductionCredits,
    peripheryDiscount,
    foreignSalaryCredit,
    severanceExemption,
    taxableSeverance,
    qualifyingPensionExemption,
    donationCarryForwardExcess,
    donationCarryForwardConsumed,
    multiEmployerOverlapRefund: overlapOverWithholding,
    shiftWorkDiscount,
    chaltAdjustment: chaltResult.adjustment,
    maternityLeaveAdjustment: maternityResult.adjustment,
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
  const creditPointAnnualValue = loadYearData(year).credit_point_annual_value;

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
    // F-017: ILS sums on `result` are derived from per-trade daily rates by
    // the IBKR parser. The display headline uses the year's documented BoI
    // annual mean (data/fx/usd_ils_daily.json#annualMean) so users see one
    // recognisable summary number rather than a meaningless per-row average.
    const usdRate = getFxRate("USD", `${year}-06-30`);

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
