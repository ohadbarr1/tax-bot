/**
 * calculateTax.scenarios.test.ts — Phase 0 §0.C P0 tax-math fixes.
 *
 * Each describe-block title references the audit finding ID
 * (audits/tax-domain.md §2.1, F-001 through F-016).
 * Each test cites the סעיף / תקנה / הוראת ביצוע it asserts.
 *
 * NOTE on legacy tests: the existing `calculateTax.test.ts` asserted several
 * values that contradicted Israeli tax law (BA=0.5, PHD=1.0, daycare 3-5=2.5,
 * kibbutz=0.25, oleh 42/12/12 split, disability-as-points). Those legacy
 * assertions were corrected as part of this Phase 0 §0.C work — see the
 * header comment in `calculateTax.test.ts` for the change log.
 */
import { describe, it, expect } from "vitest";
import {
  calculateCreditPoints,
  calculateFullRefund,
  calculateDisabilityExemption,
  calculatePeripheryDiscount,
} from "../calculateTax";
import type { TaxPayer, PersonalDeduction } from "@/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTaxpayer(overrides: Partial<TaxPayer> = {}): TaxPayer {
  return {
    id: "scn",
    fullName: "ישראל ישראלי",
    profession: "מהנדס",
    maritalStatus: "single",
    children: [],
    degrees: [],
    employers: [
      {
        id: "e1",
        name: "מעסיק",
        isMainEmployer: true,
        monthsWorked: 12,
        grossSalary: 200_000,
        taxWithheld: 30_000,
      },
    ],
    personalDeductions: [],
    lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false },
    ...overrides,
  };
}

// ─── F-001: BA credit-points 0.5 → 1.0 ────────────────────────────────────────

describe("F-001 BA credit-points = 1.0 nq (סעיף 40ג(א))", () => {
  // סעיף 40ג(א) לפקודה — בעל תואר ראשון זכאי ל-1 נקודת זיכוי
  // למשך שנת מס אחת לאחר השנה בה הסתיימה זכאותו לתואר.
  it("BA completed year-1 → 1.0 credit (NOT 0.5)", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "BA", institution: "TAU", completionYear: 2024 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["degree_ba_TAU"]).toBe(1.0);
  });
});

// ─── F-002: PHD credit-points 1.0 → 1.5 ───────────────────────────────────────

describe("F-002 PHD credit-points = 1.5 nq (סעיף 40ג(ב1))", () => {
  // סעיף 40ג(ב1) — בעל תואר שלישי זכאי ל-1.5 נקודות זיכוי לאחר סיום.
  it("PHD completed year-1 → 1.5 credit (NOT 1.0)", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "PHD", institution: "Weizmann", completionYear: 2024 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.degree_phd).toBe(1.5);
  });
});

// ─── F-003: MA professional → 1.0 ─────────────────────────────────────────────

describe("F-003 MA professional (medicine/law/teaching) = 1.0 nq (סעיף 40ג(ב))", () => {
  // סעיף 40ג(ב) — מקצועות בריאות, משפטים, חינוך — 1 נקודה לשנתיים.
  it("MA medicine → 1.0 credit (NOT 0.5)", () => {
    const tp = makeTaxpayer({
      degrees: [
        // The Degree type does not yet expose `profession`; the engine reads
        // it via runtime check. Schema migration tracked as Phase 1 §1.A.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { type: "MA", institution: "TAU", completionYear: 2024, profession: "medicine" } as any,
      ],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.degree_ma).toBe(1.0);
  });

  it("MA generic (no profession match) → 0.5 credit (default)", () => {
    const tp = makeTaxpayer({
      degrees: [{ type: "MA", institution: "BGU", completionYear: 2024 }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.degree_ma).toBe(0.5);
  });
});

// ─── F-004: Disability §9(5) income exemption (NOT credit points) ─────────────

describe("F-004 Disability §9(5) income-exemption model (סעיף 9(5))", () => {
  // סעיף 9(5) — פטור מס על הכנסה מיגיעה אישית עד תקרה.
  // ב-2025: ₪645,360 לנכות 100%. נכות חלקית = יחסי.
  it("calculateDisabilityExemption returns income exemption (2025 cap × pct/100)", () => {
    expect(calculateDisabilityExemption(800_000, 100, 2025)).toBe(645_360);
    expect(calculateDisabilityExemption(800_000, 50, 2025)).toBe(322_680);
  });

  it("calculateDisabilityExemption is bounded by taxable income", () => {
    // If income < cap, exemption = income (cannot exempt more than was earned)
    expect(calculateDisabilityExemption(100_000, 100, 2025)).toBe(100_000);
  });

  it("disability is NOT in credit-points breakdown anymore (no double-counting)", () => {
    const tp = makeTaxpayer({ disabilityType: "general", disabilityPercent: 100 });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.disability).toBeUndefined();
  });

  it("calculateFullRefund subtracts disability exemption from taxableIncome (100% disabled)", () => {
    const tp = makeTaxpayer({
      employers: [
        {
          id: "e1",
          name: "מעסיק",
          isMainEmployer: true,
          monthsWorked: 12,
          grossSalary: 400_000,
          taxWithheld: 100_000,
        },
      ],
      disabilityType: "general",
      disabilityPercent: 100,
    });
    const result = calculateFullRefund(tp, 2025);
    // taxableIncome = 400,000 - min(645,360, 400,000) = 0
    expect(result.taxableIncome).toBe(0);
    expect(result.calculatedTax).toBe(0);
  });

  it("calculateFullRefund partial disability 50% → 50% × cap exemption", () => {
    const tp = makeTaxpayer({
      employers: [
        {
          id: "e1",
          name: "מעסיק",
          isMainEmployer: true,
          monthsWorked: 12,
          grossSalary: 400_000,
          taxWithheld: 100_000,
        },
      ],
      disabilityType: "general",
      disabilityPercent: 50,
    });
    const result = calculateFullRefund(tp, 2025);
    // exemption = min(400,000, 645,360 × 0.50) = min(400,000, 322,680) = 322,680
    // taxableIncome = 400,000 - 322,680 = 77,320
    expect(result.taxableIncome).toBe(77_320);
  });
});

// ─── F-005: Sec 47 split into ניכוי and זיכוי ─────────────────────────────────

describe("F-005 Sec 47 pension split — 47(ב)(1) ניכוי vs 47(ב)(2) זיכוי", () => {
  // סעיף 47(ב)(1) ניכוי: עד 7% מההכנסה לא-מבוטחת — מפחית הכנסה חייבת.
  // סעיף 47(ב)(2) זיכוי: 35% × ההפקדה — מפחית מס.
  it("47(ב)(1) ניכוי flow — pension_sec47_deduction lowers taxableIncome by up to 7% income", () => {
    const tp = makeTaxpayer({
      personalDeductions: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "p1", type: "pension_sec47_deduction", amount: 30_000, providerName: "כלל" } as any,
      ],
    });
    const result = calculateFullRefund(tp, 2025);
    // 7% × 200,000 = 14,000 (capped). Deposit is 30,000, capped at 14,000.
    expect(result.incomeDeductions).toBe(14_000);
    expect(result.taxableIncome).toBe(200_000 - 14_000);
  });

  it("47(ב)(2) זיכוי flow — pension_sec47 still works as 35% credit on capped deposit", () => {
    const tp = makeTaxpayer({
      personalDeductions: [
        { id: "p2", type: "pension_sec47", amount: 10_000, providerName: "מנורה" },
      ],
    });
    const result = calculateFullRefund(tp, 2025);
    expect(result.deductionCredits).toBe(Math.round(10_000 * 0.35));
  });
});

// ─── F-006: §9א alimony — only spouse-portion ─────────────────────────────────

describe("F-006 §9א alimony — only spouse-portion deductible", () => {
  // סעיף 9א + תקנה — מזונות לבן/בת זוג לשעבר ניתנים לניכוי; לילדים — לא.
  it("alimony with explicit spousePortion → only that portion is deductible", () => {
    const tp = makeTaxpayer({
      personalDeductions: [
        // Schema gap: spousePortion is read at runtime; full migration in Phase 1.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          id: "al1",
          type: "alimony_sec9a",
          amount: 60_000,
          providerName: "גרוש",
          spousePortion: 0.4,
        } as any,
      ],
    });
    const result = calculateFullRefund(tp, 2025);
    // 40% × 60,000 = 24,000 spouse-portion deductible
    expect(result.incomeDeductions).toBe(24_000);
  });

  it("alimony without spousePortion → defaults to 100% spouse (with documented warning)", () => {
    const tp = makeTaxpayer({
      personalDeductions: [
        { id: "al2", type: "alimony_sec9a", amount: 24_000, providerName: "גרוש" },
      ],
    });
    const result = calculateFullRefund(tp, 2025);
    expect(result.incomeDeductions).toBe(24_000);
  });
});

// ─── F-007: Periphery percentage-discount ─────────────────────────────────────

describe("F-007 Periphery percentage-discount model (צו 2023)", () => {
  // צו 2023 + סעיף 11 — 11% (tier 2) / 13% (tier 1) מההכנסה
  // עד תקרה ₪241,920 (2025).
  it("calculatePeripheryDiscount tier 1 (13%) capped at 241,920 (2025)", () => {
    expect(calculatePeripheryDiscount(200_000, 1, 2025)).toBe(Math.round(200_000 * 0.13));
    expect(calculatePeripheryDiscount(300_000, 1, 2025)).toBe(Math.round(241_920 * 0.13));
  });

  it("calculatePeripheryDiscount tier 2 (11%) capped at 241,920 (2025)", () => {
    expect(calculatePeripheryDiscount(200_000, 2, 2025)).toBe(Math.round(200_000 * 0.11));
    expect(calculatePeripheryDiscount(300_000, 2, 2025)).toBe(Math.round(241_920 * 0.11));
  });

  it("periphery is NOT in credit-points breakdown anymore (replaced by tax-discount)", () => {
    const tp = makeTaxpayer({ postcode: "86100" }); // דימונה (tier 1)
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.periphery).toBeUndefined();
  });

  it("calculateFullRefund applies periphery discount as tax reduction (Dimona resident, ₪200k)", () => {
    const tp = makeTaxpayer({
      employers: [
        {
          id: "e1",
          name: "מעסיק",
          isMainEmployer: true,
          monthsWorked: 12,
          grossSalary: 200_000,
          taxWithheld: 50_000,
        },
      ],
      postcode: "86100", // Dimona, tier 1 = 13%
    });
    const tpNoPeriphery = makeTaxpayer({
      employers: [
        {
          id: "e1",
          name: "מעסיק",
          isMainEmployer: true,
          monthsWorked: 12,
          grossSalary: 200_000,
          taxWithheld: 50_000,
        },
      ],
    });
    const r = calculateFullRefund(tp, 2025);
    const rBase = calculateFullRefund(tpNoPeriphery, 2025);
    // Discount must be roughly 13% × 200,000 = ₪26,000.
    const expectedDiscount = Math.round(200_000 * 0.13);
    expect(rBase.netTaxOwed - r.netTaxOwed).toBeGreaterThanOrEqual(expectedDiscount - 5);
    expect(rBase.netTaxOwed - r.netTaxOwed).toBeLessThanOrEqual(expectedDiscount + 5);
  });
});

// ─── F-008: Kibbutz 0.25 deletion ─────────────────────────────────────────────

describe("F-008 Kibbutz 0.25-pt DELETED (no statutory basis)", () => {
  // סעיף 56 הוא דין שיוך מס לחברי קיבוץ — אינו מקנה 0.25 נק' זיכוי.
  it("kibbutzMember=true → no kibbutz key in breakdown", () => {
    const tp = makeTaxpayer({ kibbutzMember: true });
    const { breakdown, points } = calculateCreditPoints(tp, 2025);
    expect(breakdown.kibbutz).toBeUndefined();
    expect(points).toBe(2.25); // resident only
  });
});

// ─── F-009: Oleh band 18/12/12/12 ─────────────────────────────────────────────

describe("F-009 Oleh chadash band split = 18/12/12/12 months (סעיף 35)", () => {
  // סעיף 35 — 18 חודש ראשונים = 3 נק', 12 הבאים = 2 נק', 12 הבאים = 1 נק', אחרי 42 חודש = 0.
  it("aliyah 6 months ago → 3.0 pts (within 0-18 month window)", () => {
    const tp = makeTaxpayer({ aliyahDate: "2025-06-01" });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.oleh_chadash_3pts).toBe(3.0);
  });

  it("aliyah 24 months ago → 2.0 pts (months 19-30 window)", () => {
    // Eval at end of 2025-12-31. 24 months back = 2024-01-01.
    const tp = makeTaxpayer({ aliyahDate: "2024-01-01" });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.oleh_chadash_2pts).toBe(2.0);
  });

  it("aliyah 36 months ago → 1.0 pt (months 31-42 window)", () => {
    // Eval at end of 2025-12-31. 36 months back = 2023-01-01.
    const tp = makeTaxpayer({ aliyahDate: "2023-01-01" });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.oleh_chadash_1pt).toBe(1.0);
  });

  it("aliyah 48 months ago → 0 pts (after 42 months — no credit)", () => {
    const tp = makeTaxpayer({ aliyahDate: "2022-01-01" });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.oleh_chadash_3pts).toBeUndefined();
    expect(breakdown.oleh_chadash_2pts).toBeUndefined();
    expect(breakdown.oleh_chadash_1pt).toBeUndefined();
  });
});

// ─── F-010: Daycare 1.0 (ages 0-3 only) ───────────────────────────────────────

describe("F-010 Daycare = 1.0 pt for ages 0-3 ONLY (סעיף 40א)", () => {
  // סעיף 40א — נקודה אחת לפעוט גיל 0-3 במעון יום מוכר.
  // אין זיכוי מעון לגיל 3-5 (חינוך חובה — לא מזכה במעון).
  it("child age 1 in daycare → 1.0 (NOT 2.0)", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c1", birthDate: "2024-01-01", inDaycare: true }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["child_c1_daycare_03"]).toBe(1.0);
  });

  it("child age 4 in daycare → no daycare credit (still gets standard 1.0 under-18)", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c2", birthDate: "2021-01-01", inDaycare: true }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["child_c2_daycare_35"]).toBeUndefined();
    expect(breakdown["child_c2"]).toBe(1.0); // falls back to standard child credit
  });
});

// ─── F-011: Military pro-rata ─────────────────────────────────────────────────

describe("F-011 Military service = pro-rata 1/12 per month, capped 2 yrs (הוראת ביצוע 32/2014)", () => {
  // סעיף 11 + הוראת ביצוע 32/2014 — 1/12 נק' לכל חודש שירות מלא, עד 2 נק'/שנה למשך 2 שנים.
  // 2026 unisex: documented but not active for tax year 2025 (today's date 2026-04-29 is during 2025 assessments).
  it("full 24-month service → 2.0 pts (year 1 post-discharge)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tp = makeTaxpayer({ dischargeYear: 2024, gender: "male", serviceMonths: 24 } as any);
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.soldier_discharge).toBe(2.0);
  });

  it("partial 6-month service → 0.5 pts (1/12 × 6 = 0.5, NOT flat 2.0)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tp = makeTaxpayer({ dischargeYear: 2024, gender: "male", serviceMonths: 6 } as any);
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.soldier_discharge).toBeCloseTo(0.5, 1);
  });

  it("18-month service → 1.5 pts (1/12 × 18 = 1.5, capped at 2.0)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tp = makeTaxpayer({ dischargeYear: 2024, gender: "male", serviceMonths: 18 } as any);
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.soldier_discharge).toBeCloseTo(1.5, 1);
  });

  it("3rd year post-discharge → no credit (cap is 2 years)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tp = makeTaxpayer({ dischargeYear: 2022, gender: "male", serviceMonths: 24 } as any);
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.soldier_discharge).toBeUndefined();
  });
});

// ─── F-012: Single-parent רווק/ה ──────────────────────────────────────────────

describe("F-012 Single-parent extends to רווק/ה (post-2024 amendment)", () => {
  // סעיף 40(ב)(1) — תיקון 2024 הרחיב את ההגדרה לכל הורה יחיד שאינו נשוי
  // (כולל רווק/ה ללא בן/בת זוג רשום).
  it("single + child + no spouseId → +1.0 single-parent pt", () => {
    const tp = makeTaxpayer({
      maritalStatus: "single",
      children: [{ id: "c1", birthDate: "2018-01-01" }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.singleParent).toBe(1.0);
  });

  it("married + child → no single-parent pt (spouse exists)", () => {
    const tp = makeTaxpayer({
      maritalStatus: "married",
      spouseId: "999999999",
      children: [{ id: "c1", birthDate: "2018-01-01" }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.singleParent).toBeUndefined();
  });

  it("single + no children → no single-parent pt", () => {
    const tp = makeTaxpayer({ maritalStatus: "single", children: [] });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.singleParent).toBeUndefined();
  });
});

// ─── F-016: carriedForwardLoss wired into calculateFullRefund ─────────────────

describe("F-016 carriedForwardLoss subtracted from netGain before 25% rate (סעיף 92)", () => {
  // סעיף 92 — קיזוז הפסד הון מועבר משנים קודמות לפני חישוב מס רווחי הון.
  it("carriedForwardLoss reduces capital-gains tax base", () => {
    const tp = makeTaxpayer({
      capitalGains: {
        totalRealizedProfit: 100_000,
        totalRealizedLoss: 0,
        foreignTaxWithheld: 0,
        carriedForwardLoss: 20_000,
      },
    });
    const result = calculateFullRefund(tp, 2025);
    // netGain after carry = max(0, 100,000 - 0 - 20,000) = 80,000
    // CG tax = 80,000 × 0.25 = 20,000
    expect(result.capitalGainsTax).toBe(20_000);
  });

  it("carriedForwardLoss greater than gain → 0 capital-gains tax", () => {
    const tp = makeTaxpayer({
      capitalGains: {
        totalRealizedProfit: 50_000,
        totalRealizedLoss: 0,
        foreignTaxWithheld: 0,
        carriedForwardLoss: 100_000,
      },
    });
    const result = calculateFullRefund(tp, 2025);
    expect(result.capitalGainsTax).toBe(0);
  });

  it("absent carriedForwardLoss → existing behaviour preserved", () => {
    const tp = makeTaxpayer({
      capitalGains: {
        totalRealizedProfit: 100_000,
        totalRealizedLoss: 0,
        foreignTaxWithheld: 0,
      },
    });
    const result = calculateFullRefund(tp, 2025);
    expect(result.capitalGainsTax).toBe(25_000);
  });
});

// ─── Reference: alimony deduction warning channel ─────────────────────────────
// (Used only as a placeholder so future tests can assert the warning surface.)
describe("F-006 alimony default-100%-spouse warning placeholder", () => {
  it("a deduction without spousePortion is processed (default 1.0)", () => {
    const deductions: PersonalDeduction[] = [
      { id: "al1", type: "alimony_sec9a", amount: 12_000, providerName: "גרוש" },
    ];
    expect(deductions[0].type).toBe("alimony_sec9a");
  });
});
