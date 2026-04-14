/**
 * calculateTax.test.ts
 *
 * Unit tests for the Israeli income tax calculation engine.
 * Verified ground truth (Ohad Bar 2024):
 *   Gross:          ₪376,000 (₪312k + ₪64k)
 *   Bracket tax:    ₪88,903
 *   Credit pts:     4.75 × ₪2,904 = ₪13,794
 *   Ded credits:    ₪525 (donation) + ₪750 (life ins) = ₪1,275
 *   Net tax owed:   ₪73,834
 *   Tax paid:       ₪102,480 (₪72,400 + ₪30,080)
 *   Refund from emp:₪28,646
 *   CG tax (ILS):   ₪477 (net gain ₪2,026 × 25% − ₪30 foreign)
 *   Net refund:     ₪28,169
 */

import { describe, it, expect } from "vitest";
import {
  calculateCreditPoints,
  calculateDeductionCredits,
  calculateIncomeDeductions,
  calculateFullRefund,
} from "../calculateTax";
import type { TaxPayer, PersonalDeduction } from "@/types";

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeTaxpayer(overrides: Partial<TaxPayer> = {}): TaxPayer {
  return {
    id: "test",
    fullName: "ישראל ישראלי",
    profession: "מהנדס",
    maritalStatus: "single",
    children: [],
    degrees: [],
    employers: [{ id: "e1", name: "מעסיק", isMainEmployer: true, monthsWorked: 12, grossSalary: 180000, taxWithheld: 30000 }],
    personalDeductions: [],
    lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false },
    ...overrides,
  };
}

// ─── 1. calculateCreditPoints — base credits ──────────────────────────────────

describe("calculateCreditPoints — base", () => {
  it("single resident → 2.25 pts only", () => {
    const tp = makeTaxpayer();
    const { points, breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.resident).toBe(2.25);
    expect(points).toBe(2.25);
  });

  it("married + working spouse → 3.25 pts (resident + married)", () => {
    const tp = makeTaxpayer({ maritalStatus: "married", spouseHasIncome: true });
    const { points } = calculateCreditPoints(tp, 2024);
    expect(points).toBe(2.25 + 1.0); // 3.25
  });

  it("married + non-working spouse → 3.75 pts", () => {
    const tp = makeTaxpayer({ maritalStatus: "married", spouseHasIncome: false });
    const { points, breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.married).toBe(1.0);
    expect(breakdown.nonWorkingSpouse).toBe(0.5);
    expect(points).toBe(3.75);
  });

  it("divorced with children → single parent +1.0 pt", () => {
    const tp = makeTaxpayer({
      maritalStatus: "divorced",
      children: [{ id: "c1", birthDate: "2015-01-01" }],
    });
    const { points, breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.singleParent).toBe(1.0);
    expect(points).toBe(2.25 + 1.0 + 1.0); // resident + singleParent + child_under18
  });

  it("widowed with children → single parent credit applies", () => {
    const tp = makeTaxpayer({
      maritalStatus: "widowed",
      children: [{ id: "c1", birthDate: "2010-01-01" }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.singleParent).toBe(1.0);
  });

  it("divorced with NO children → no single parent credit", () => {
    const tp = makeTaxpayer({ maritalStatus: "divorced", children: [] });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.singleParent).toBeUndefined();
  });
});

// ─── 2. calculateCreditPoints — children ──────────────────────────────────────

describe("calculateCreditPoints — children", () => {
  it("child born in tax year → 1.5 birth-year credit", () => {
    const tp = makeTaxpayer({ children: [{ id: "c1", birthDate: "2024-06-01" }] });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown["child_c1_birth"]).toBe(1.5);
    expect(breakdown["child_c1"]).toBeUndefined();
  });

  it("child under 18 (not birth year) → 1.0 credit", () => {
    const tp = makeTaxpayer({ children: [{ id: "c2", birthDate: "2015-06-01" }] });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown["child_c2"]).toBe(1.0);
  });

  it("child age 1-2 in daycare → 2.0 credit", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c3", birthDate: "2023-01-01", inDaycare: true }], // age 1 in 2024
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown["child_c3_daycare_12"]).toBe(2.0);
  });

  it("child age 3-5 in daycare → 2.5 credit", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c4", birthDate: "2020-06-01", inDaycare: true }], // age 4 in 2024
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown["child_c4_daycare_35"]).toBe(2.5);
  });

  it("child age 18+ → no credit", () => {
    const tp = makeTaxpayer({ children: [{ id: "c5", birthDate: "2005-01-01" }] }); // age 19
    const { points } = calculateCreditPoints(tp, 2024);
    expect(points).toBe(2.25); // resident only
  });

  it("child without inDaycare at age 1-2 → 1.0 regular credit (not daycare)", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c6", birthDate: "2023-01-01", inDaycare: false }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown["child_c6_daycare_12"]).toBeUndefined();
    expect(breakdown["child_c6"]).toBe(1.0);
  });
});

// ─── 3. calculateCreditPoints — degrees ───────────────────────────────────────

describe("calculateCreditPoints — degrees", () => {
  it("BA completed year-1 → 0.5 credit (strict 1-year window)", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "BA", institution: "TAU", completionYear: 2023 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown["degree_ba_TAU"]).toBe(0.5);
  });

  it("BA completed year-2 → no credit (window expired)", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "BA", institution: "TAU", completionYear: 2022 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown["degree_ba_TAU"]).toBeUndefined();
  });

  it("MA completed year-1 → 0.5 credit (1-year window only)", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "MA", institution: "BGU", completionYear: 2023 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.degree_ma).toBe(0.5);
  });

  it("MA completed 2+ years ago → no credit", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "MA", institution: "BGU", completionYear: 2020 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.degree_ma).toBeUndefined();
  });

  it("MA completed same year → no credit", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "MA", institution: "BGU", completionYear: 2024 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.degree_ma).toBeUndefined();
  });

  it("PHD completed year-1 → 1.0 credit", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "PHD", institution: "Weizmann", completionYear: 2023 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.degree_phd).toBe(1.0);
  });

  it("PHD completed year-2 → no credit (strict window)", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "PHD", institution: "Weizmann", completionYear: 2022 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.degree_phd).toBeUndefined();
  });
});

// ─── 4. calculateCreditPoints — soldier discharge ─────────────────────────────

describe("calculateCreditPoints — soldier discharge", () => {
  it("male discharged 1 year ago → 2.0 pts", () => {
    const tp = makeTaxpayer({ dischargeYear: 2023, gender: "male" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.soldier_discharge).toBe(2.0);
  });

  it("female discharged 1 year ago → 1.75 pts", () => {
    const tp = makeTaxpayer({ dischargeYear: 2023, gender: "female" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.soldier_discharge).toBe(1.75);
  });

  it("discharged exactly 3 years ago → still eligible", () => {
    const tp = makeTaxpayer({ dischargeYear: 2021, gender: "male" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.soldier_discharge).toBe(2.0);
  });

  it("discharged 4 years ago → no credit", () => {
    const tp = makeTaxpayer({ dischargeYear: 2020, gender: "male" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.soldier_discharge).toBeUndefined();
  });
});

// ─── 5. calculateCreditPoints — oleh chadash ──────────────────────────────────

describe("calculateCreditPoints — oleh chadash", () => {
  it("aliyah < 42 months ago → 3.0 pts", () => {
    // Tax year 2024 starts 2024-01-01. Aliyah 12 months before = 2023-01-01
    const tp = makeTaxpayer({ aliyahDate: "2023-01-01" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.oleh_chadash_3pts).toBe(3.0);
  });

  it("aliyah ~48 months ago → 2.0 pts (months 43-54)", () => {
    // ITA evaluates at Dec 31, 2024.
    // Dec 2020 → Dec 2024 = 48 months → bracket 43-54 → 2 pts
    const tp = makeTaxpayer({ aliyahDate: "2020-12-01" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.oleh_chadash_2pts).toBe(2.0);
  });

  it("aliyah ~60 months ago → 1.0 pt (months 55-66)", () => {
    // ITA evaluates at Dec 31, 2024.
    // Aug 2019 → Dec 2024 ≈ 64 months → bracket 55-66 → 1 pt
    const tp = makeTaxpayer({ aliyahDate: "2019-08-01" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.oleh_chadash_1pt).toBe(1.0);
  });

  it("aliyah > 66 months ago → 0 pts (expired)", () => {
    const tp = makeTaxpayer({ aliyahDate: "2017-01-01" }); // ~84 months
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.oleh_chadash_3pts).toBeUndefined();
    expect(breakdown.oleh_chadash_2pts).toBeUndefined();
    expect(breakdown.oleh_chadash_1pt).toBeUndefined();
  });
});

// ─── 6. calculateCreditPoints — periphery, kibbutz, disability ────────────────

describe("calculateCreditPoints — periphery / kibbutz / disability", () => {
  it("kibbutz member → +0.25 pts", () => {
    const tp = makeTaxpayer({ kibbutzMember: true });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.kibbutz).toBe(0.25);
  });

  it("disability 90%+ → 2.0 pts", () => {
    const tp = makeTaxpayer({ disabilityType: "general", disabilityPercent: 90 });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.disability).toBe(2.0);
  });

  it("disability 50-89% → 1.0 pt", () => {
    const tp = makeTaxpayer({ disabilityType: "general", disabilityPercent: 65 });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.disability).toBe(1.0);
  });

  it("disability 20-49% → 0.5 pt", () => {
    const tp = makeTaxpayer({ disabilityType: "general", disabilityPercent: 35 });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.disability).toBe(0.5);
  });

  it("disability < 20% → no credit", () => {
    const tp = makeTaxpayer({ disabilityType: "general", disabilityPercent: 15 });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.disability).toBeUndefined();
  });

  it("unknown postcode → no periphery credit", () => {
    const tp = makeTaxpayer({ postcode: "00000" });
    const { breakdown } = calculateCreditPoints(tp, 2024);
    expect(breakdown.periphery).toBeUndefined();
  });
});

// ─── 7. calculateDeductionCredits ────────────────────────────────────────────

describe("calculateDeductionCredits", () => {
  it("donation below ₪207 minimum → 0 credit (2024)", () => {
    const deds: PersonalDeduction[] = [
      { id: "d1", type: "donation_sec46", amount: 100, providerName: "עמותה" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(0);
  });

  it("donation above minimum → 35% credit", () => {
    const deds: PersonalDeduction[] = [
      { id: "d1", type: "donation_sec46", amount: 1_000, providerName: "עמותה" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(Math.round(1_000 * 0.35)); // 350
  });

  it("donation capped at 30% of income", () => {
    const grossIncome = 100_000;
    const largeDonation = 50_000; // exceeds 30% cap
    const deds: PersonalDeduction[] = [
      { id: "d1", type: "donation_sec46", amount: largeDonation, providerName: "עמותה" },
    ];
    const { total } = calculateDeductionCredits(deds, grossIncome, 2024);
    expect(total).toBe(Math.round(grossIncome * 0.30 * 0.35)); // 10500
  });

  it("donation min threshold differs: 2025 requires ₪214", () => {
    const deds: PersonalDeduction[] = [
      { id: "d1", type: "donation_sec46", amount: 210, providerName: "עמותה" },
    ];
    // 210 >= 207 (2024) → credit; 210 < 214 (2025) → no credit
    const { total: t2024 } = calculateDeductionCredits(deds, 100_000, 2024);
    const { total: t2025 } = calculateDeductionCredits(deds, 100_000, 2025);
    expect(t2024).toBeGreaterThan(0);
    expect(t2025).toBe(0);
  });

  it("life insurance → 25% credit", () => {
    const deds: PersonalDeduction[] = [
      { id: "li", type: "life_insurance_sec45a", amount: 4_000, providerName: "הראל" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(Math.round(4_000 * 0.25)); // 1000
  });

  it("LTC insurance → 25% credit", () => {
    const deds: PersonalDeduction[] = [
      { id: "ltc", type: "ltc_insurance_sec45a", amount: 2_400, providerName: "מגדל" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(Math.round(2_400 * 0.25)); // 600
  });

  it("pension_sec47 capped at ₪10,000", () => {
    const deds: PersonalDeduction[] = [
      { id: "p1", type: "pension_sec47", amount: 20_000, providerName: "כלל" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(Math.round(10_000 * 0.35)); // 3500
  });

  it("self_employed_pension_sec47 → 35% credit up to 16% of income cap", () => {
    const grossIncome = 200_000;
    const deposit = 40_000; // exceeds 16% = 32,000
    const deds: PersonalDeduction[] = [
      { id: "sep", type: "self_employed_pension_sec47", amount: deposit, providerName: "מנורה" },
    ];
    const { total } = calculateDeductionCredits(deds, grossIncome, 2024);
    const expectedCap = Math.round(grossIncome * 0.16); // 32000
    expect(total).toBe(Math.round(expectedCap * 0.35)); // 11200
  });

  it("disabled child → 35% credit capped at ₪35,000 expenses", () => {
    const deds: PersonalDeduction[] = [
      { id: "dc", type: "disabled_child_sec45", amount: 50_000, providerName: "טיפול" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(Math.round(35_000 * 0.35)); // 12250
  });

  it("study fund → 35% credit on declared amount", () => {
    const deds: PersonalDeduction[] = [
      { id: "sf", type: "study_fund_sec3e3", amount: 5_000, providerName: "קרן השתלמות" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(Math.round(5_000 * 0.35)); // 1750
  });

  it("alimony_sec9a is skipped (income deduction, not credit)", () => {
    const deds: PersonalDeduction[] = [
      { id: "al", type: "alimony_sec9a", amount: 24_000, providerName: "גרוש" },
    ];
    const { total } = calculateDeductionCredits(deds, 200_000, 2024);
    expect(total).toBe(0);
  });

  it("empty array → zero total and empty breakdown", () => {
    const { total, breakdown } = calculateDeductionCredits([], 200_000, 2024);
    expect(total).toBe(0);
    expect(Object.keys(breakdown).length).toBe(0);
  });
});

// ─── 8. calculateIncomeDeductions ────────────────────────────────────────────

describe("calculateIncomeDeductions", () => {
  it("alimony returns full amount as income deduction", () => {
    const deds: PersonalDeduction[] = [
      { id: "al", type: "alimony_sec9a", amount: 36_000, providerName: "גרוש" },
    ];
    const result = calculateIncomeDeductions(deds);
    expect(result).toBe(36_000);
  });

  it("non-alimony deductions return 0 income deduction", () => {
    const deds: PersonalDeduction[] = [
      { id: "li", type: "life_insurance_sec45a", amount: 4_000, providerName: "הראל" },
    ];
    const result = calculateIncomeDeductions(deds);
    expect(result).toBe(0);
  });

  it("multiple alimony entries sum correctly", () => {
    const deds: PersonalDeduction[] = [
      { id: "al1", type: "alimony_sec9a", amount: 12_000, providerName: "גרוש 1" },
      { id: "al2", type: "alimony_sec9a", amount: 18_000, providerName: "גרוש 2" },
    ];
    const result = calculateIncomeDeductions(deds);
    expect(result).toBe(30_000);
  });
});

// ─── 9. calculateFullRefund — smoke tests ────────────────────────────────────

describe("calculateFullRefund", () => {
  it("basic single taxpayer ₪180k salary → produces valid result shape", () => {
    const tp = makeTaxpayer();
    const result = calculateFullRefund(tp, 2024);
    expect(result.totalGrossIncome).toBe(180_000);
    expect(result.netTaxOwed).toBeGreaterThanOrEqual(0);
    expect(result.taxPaid).toBe(30_000);
    expect(typeof result.netRefund).toBe("number");
    expect(result.creditPointsCount).toBe(2.25);
  });

  it("alimony reduces taxable income", () => {
    const base = makeTaxpayer();
    const withAlimony = makeTaxpayer({
      personalDeductions: [
        { id: "al", type: "alimony_sec9a", amount: 20_000, providerName: "גרוש" },
      ],
    });
    const rBase = calculateFullRefund(base, 2024);
    const rAlimony = calculateFullRefund(withAlimony, 2024);
    expect(rAlimony.taxableIncome).toBe(rBase.taxableIncome - 20_000);
    expect(rAlimony.calculatedTax).toBeLessThan(rBase.calculatedTax);
  });

  it("net tax owed never goes below zero", () => {
    const tp = makeTaxpayer({
      employers: [
        { id: "e1", name: "מעסיק", isMainEmployer: true, monthsWorked: 1, grossSalary: 5_000, taxWithheld: 0 },
      ],
      maritalStatus: "married",
      spouseHasIncome: false,
      children: [
        { id: "c1", birthDate: "2024-01-01" },
        { id: "c2", birthDate: "2022-01-01", inDaycare: true },
      ],
    });
    const result = calculateFullRefund(tp, 2024);
    expect(result.netTaxOwed).toBeGreaterThanOrEqual(0);
  });

  it("capital gains net profit → positive capital gains tax", () => {
    const tp = makeTaxpayer({
      capitalGains: {
        totalRealizedProfit: 100_000,
        totalRealizedLoss: 0,
        foreignTaxWithheld: 0,
      },
    });
    const result = calculateFullRefund(tp, 2024);
    expect(result.capitalGainsTax).toBe(Math.round(100_000 * 0.25)); // 25000
  });

  it("foreign tax credit reduces capital gains tax", () => {
    const tp = makeTaxpayer({
      capitalGains: {
        totalRealizedProfit: 100_000,
        totalRealizedLoss: 0,
        foreignTaxWithheld: 5_000,
      },
    });
    const result = calculateFullRefund(tp, 2024);
    expect(result.capitalGainsTax).toBe(25_000 - 5_000); // 20000
  });
});
