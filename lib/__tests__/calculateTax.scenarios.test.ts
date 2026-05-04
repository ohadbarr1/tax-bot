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
  calculateSeveranceExemption,
  calculateQualifyingPensionExemption,
  calculateForeignSalaryCredit,
  calculateDeductionCredits,
  calculateShiftWorkDiscount,
  calculateChaltAdjustment,
  calculateMaternityLeaveAdjustment,
  calculateTaxOnIncome,
} from "../calculateTax";
import { generateOptimizations } from "../optimizer";
import type { TaxPayer, PersonalDeduction, FinancialData } from "@/types";

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

describe("F-007 Periphery per-settlement discount (סעיף 11 + הודעת מס הכנסה)", () => {
  // Statute: each settlement has its own (rate_pct, ceiling) pair set annually
  // by the Director of the Tax Authority. Rates 7%-20%, ceilings ₪146k-₪268k.
  // Dimona 2025: 18% / ₪245,400. Sderot 2025: 20% / ₪267,840. Tzfat 2025: 12%/₪213,240.
  it("calculatePeripheryDiscount Dimona 2025 (18%, ceiling ₪245,400)", () => {
    expect(calculatePeripheryDiscount(200_000, "דימונה", 2025)).toBe(Math.round(200_000 * 0.18));
    expect(calculatePeripheryDiscount(300_000, "דימונה", 2025)).toBe(Math.round(245_400 * 0.18));
  });

  it("calculatePeripheryDiscount Sderot 2025 (20%, ceiling ₪267,840)", () => {
    expect(calculatePeripheryDiscount(200_000, "שדרות", 2025)).toBe(Math.round(200_000 * 0.20));
    expect(calculatePeripheryDiscount(400_000, "שדרות", 2025)).toBe(Math.round(267_840 * 0.20));
  });

  it("calculatePeripheryDiscount unknown settlement → 0", () => {
    expect(calculatePeripheryDiscount(200_000, "תל אביב", 2025)).toBe(0);
    expect(calculatePeripheryDiscount(200_000, "נתניה", 2025)).toBe(0);
  });

  it("calculatePeripheryDiscount empty settlement → 0", () => {
    expect(calculatePeripheryDiscount(200_000, undefined, 2025)).toBe(0);
    expect(calculatePeripheryDiscount(200_000, null, 2025)).toBe(0);
  });

  it("periphery is NOT in credit-points breakdown anymore (replaced by tax-discount)", () => {
    const tp = makeTaxpayer({ residenceSettlement: "דימונה" });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.periphery).toBeUndefined();
  });

  it("calculateFullRefund applies periphery discount as tax reduction (Dimona, ₪400k)", () => {
    // High enough income so discount is not clipped by the netTaxOwed floor.
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
      residenceSettlement: "דימונה", // 2025: 18% × ₪245,400
    });
    const tpNoPeriphery = makeTaxpayer({
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
    });
    const r = calculateFullRefund(tp, 2025);
    const rBase = calculateFullRefund(tpNoPeriphery, 2025);
    const expectedDiscount = Math.round(245_400 * 0.18);
    expect(rBase.netTaxOwed - r.netTaxOwed).toBe(expectedDiscount);
    expect(r.peripheryDiscount).toBe(expectedDiscount);
  });

  it("postcode fallback resolves to settlement (Dimona 86100)", () => {
    const tp = makeTaxpayer({
      employers: [{ id: "e1", name: "מעסיק", isMainEmployer: true, monthsWorked: 12, grossSalary: 400_000, taxWithheld: 100_000 }],
      postcode: "86100",
    });
    const r = calculateFullRefund(tp, 2025);
    expect(r.peripheryDiscount).toBe(Math.round(245_400 * 0.18));
  });

  it("center-city postcode does NOT trigger periphery (Netanya, false-positive guard)", () => {
    const tp = makeTaxpayer({
      employers: [{ id: "e1", name: "מעסיק", isMainEmployer: true, monthsWorked: 12, grossSalary: 400_000, taxWithheld: 100_000 }],
      postcode: "42000", // Netanya — NOT in statute
    });
    const r = calculateFullRefund(tp, 2025);
    expect(r.peripheryDiscount).toBe(0);
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

  it("18-month service ≥ 12 mo → 2.0 pts (full eligibility, capped at 2.0)", () => {
    // הוראת ביצוע 32/2014 — ≥ 12 חודש = 2.0 נק' מלאות; < 12 חודש = פרופורציה.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tp = makeTaxpayer({ dischargeYear: 2024, gender: "male", serviceMonths: 18 } as any);
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.soldier_discharge).toBe(2.0);
  });

  it("year-2 post-discharge → 2.0 pts (still eligible)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tp = makeTaxpayer({ dischargeYear: 2023, gender: "male", serviceMonths: 24 } as any);
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown.soldier_discharge).toBe(2.0);
  });

  it("year-3 post-discharge → no credit (cap is 2 years)", () => {
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

// ═══════════════════════════════════════════════════════════════════════════════
//  Phase 1 §1.A — P1 batch (audits/tax-domain.md §2.3)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── F-013: Severance §9(7א) exemption pre-tax ───────────────────────────────

describe("F-013 Severance §9(7א) auto-exemption (סעיף 9(7א))", () => {
  // סעיף 9(7א) — פטור על פיצויים = שכר חודשי אחרון × שנות שירות × תקרה (₪13,750 ב-2025).
  // החלק החייב במס = ברוטו פיצויים − פטור (לפני פריסה).
  it("calculateSeveranceExemption: 12,000/mo × 10 yrs × ₪13,750 cap → ₪120,000", () => {
    // recognised monthly = min(12,000, 13,750) = 12,000 → 12,000 × 10 = 120,000.
    expect(calculateSeveranceExemption(200_000, 12_000, 10, 2025)).toBe(120_000);
  });

  it("calculateSeveranceExemption capped at gross severance", () => {
    // recognised monthly 12,000 × 10 = 120,000 but gross is only 100,000.
    expect(calculateSeveranceExemption(100_000, 12_000, 10, 2025)).toBe(100_000);
  });

  it("calculateSeveranceExemption: salary above ₪13,750 cap → ceiling clamps", () => {
    // recognised monthly = min(20_000, 13_750) = 13_750 → × 5 = 68,750.
    expect(calculateSeveranceExemption(100_000, 20_000, 5, 2025)).toBe(68_750);
  });

  it("calculateSeveranceExemption uses per-year ceiling for 2024 (₪13,750)", () => {
    expect(calculateSeveranceExemption(100_000, 14_000, 4, 2024)).toBe(55_000);
  });

  it("calculateFullRefund auto-derives taxableSeverance from gross + cap", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: true,
        pulledSeverancePay: true,
        hasForm161: false,
        grossSeverancePay: 200_000,
        lastMonthlySalary: 12_000,
        yearsOfService: 10,
        // taxableSeverancePay intentionally omitted — engine should derive it.
      },
    });
    const result = calculateFullRefund(tp, 2025);
    expect(result.severanceExemption).toBe(120_000);
    expect(result.taxableSeverance).toBe(80_000);
  });
});

// ─── F-020: §46 donation carry-forward over 3 years ──────────────────────────

describe("F-020 §46 donation carry-forward (סעיף 46(ב2))", () => {
  // סעיף 46(ב2) — סכום תרומה שלא הוכר עקב חריגה מ-30% מההכנסה / מהתקרה
  // המוחלטת (₪10,453,805 ב-2025) ניתן להעברה עד 3 שנות מס קדימה.
  it("excess above 30%-of-income cap is returned as carryForwardExcess", () => {
    const deds: PersonalDeduction[] = [
      { id: "d-big", type: "donation_sec46", amount: 50_000, providerName: "עמותה" },
    ];
    // Income 100,000 → cap = min(30,000, ₪10,453,805) = 30,000.
    // Excess = 50,000 − 30,000 = 20,000.
    const r = calculateDeductionCredits(deds, 100_000, 2025);
    expect(r.total).toBe(Math.round(30_000 * 0.35));
    expect(r.carryForwardExcess).toBe(20_000);
  });

  it("prior-year carry-forward is consumed FIFO within remaining cap headroom", () => {
    // Current-year donation 5,000; income 100,000 → cap 30,000; headroom 25,000.
    // Carry stack: [{2023,15_000},{2024,10_000}] — both within the 3-year window.
    const deds: PersonalDeduction[] = [
      { id: "d-cur", type: "donation_sec46", amount: 5_000, providerName: "עמותה" },
    ];
    const r = calculateDeductionCredits(deds, 100_000, 2025, {
      donationCarryForward: [
        { year: 2024, remaining: 10_000 },
        { year: 2023, remaining: 15_000 },
      ],
    });
    // Eligible = 5,000 + 25,000 (15,000 from 2023 first, 10,000 from 2024) = 30,000.
    expect(r.total).toBe(Math.round(30_000 * 0.35));
    expect(r.carryForwardConsumed).toEqual([
      { year: 2023, consumed: 15_000 },
      { year: 2024, consumed: 10_000 },
    ]);
  });

  it("carry-forward older than 3 years is dropped (סעיף 46(ב2) window)", () => {
    const deds: PersonalDeduction[] = [
      { id: "d-cur", type: "donation_sec46", amount: 1_000, providerName: "עמותה" },
    ];
    const r = calculateDeductionCredits(deds, 100_000, 2025, {
      donationCarryForward: [
        // 2025 − 2021 = 4 years > 3-year window → dropped.
        { year: 2021, remaining: 50_000 },
      ],
    });
    // Only the 1,000 current-year donation is credited.
    expect(r.total).toBe(Math.round(1_000 * 0.35));
    expect(r.carryForwardConsumed.length).toBe(0);
  });
});

// ─── F-021: §45a life/LTC ceiling enforcement ────────────────────────────────

describe("F-021 §45א life/LTC ceiling — 5% of income + ₪108k absolute (2025)", () => {
  // סעיף 45א — תקרה משותפת לביטוח חיים וסיעודי = min(5% × הכנסה, ₪108,000 ב-2025).
  it("life-insurance below combined ceiling → full 25% credit", () => {
    const deds: PersonalDeduction[] = [
      { id: "li", type: "life_insurance_sec45a", amount: 4_000, providerName: "הראל" },
    ];
    // Income 200,000 → 5% = 10,000; abs cap 108,000 → ceiling 10,000. 4,000 < 10,000 → all eligible.
    const r = calculateDeductionCredits(deds, 200_000, 2025);
    expect(r.breakdown.li).toBe(Math.round(4_000 * 0.25));
  });

  it("life-insurance above 5%-of-income cap → credited only on 5% slice", () => {
    const deds: PersonalDeduction[] = [
      { id: "li", type: "life_insurance_sec45a", amount: 30_000, providerName: "הראל" },
    ];
    // Income 100,000 → cap = min(5,000, 108,000) = 5,000. Credit = 5,000 × 25%.
    const r = calculateDeductionCredits(deds, 100_000, 2025);
    expect(r.breakdown.li).toBe(Math.round(5_000 * 0.25));
  });

  it("life + LTC SHARE the §45א ceiling (5%/₪108k combined)", () => {
    const deds: PersonalDeduction[] = [
      { id: "li", type: "life_insurance_sec45a", amount: 4_000, providerName: "הראל" },
      { id: "ltc", type: "ltc_insurance_sec45a", amount: 4_000, providerName: "מגדל" },
    ];
    // Income 100,000 → ceiling 5,000. li takes 4,000 → headroom 1,000 → ltc credited on 1,000.
    const r = calculateDeductionCredits(deds, 100_000, 2025);
    expect(r.breakdown.li).toBe(Math.round(4_000 * 0.25));
    expect(r.breakdown.ltc).toBe(Math.round(1_000 * 0.25));
  });

  it("life-insurance above ₪108k absolute cap (high income) → clamped", () => {
    const deds: PersonalDeduction[] = [
      { id: "li", type: "life_insurance_sec45a", amount: 200_000, providerName: "הראל" },
    ];
    // Income 5,000,000 → 5% = 250,000; abs cap 108,000 → ceiling 108,000.
    const r = calculateDeductionCredits(deds, 5_000_000, 2025);
    expect(r.breakdown.li).toBe(Math.round(108_000 * 0.25));
  });
});

// ─── F-022: קרן השתלמות — שכיר gets NO זיכוי ───────────────────────────────

describe("F-022 קרן השתלמות — שכיר NO זיכוי (סעיף 3(ה3))", () => {
  // סעיף 3(ה3) — שכיר אינו מקבל זיכוי על קרן השתלמות; ההפקדה
  // המעסיקית מנוכה ממילא בשלב חישוב המס (המעסיק לא מנכה את חלקו במקור).
  it("study fund for שכיר (default) → 0 credit", () => {
    const deds: PersonalDeduction[] = [
      { id: "sf", type: "study_fund_sec3e3", amount: 10_000, providerName: "אלטשולר" },
    ];
    const r = calculateDeductionCredits(deds, 200_000, 2025);
    expect(r.total).toBe(0);
    expect(r.breakdown.sf).toBe(0);
  });

  it("study fund for עצמאי (isSalaried:false) → legacy 35% retained", () => {
    const deds: PersonalDeduction[] = [
      { id: "sf", type: "study_fund_sec3e3", amount: 10_000, providerName: "אלטשולר" },
    ];
    const r = calculateDeductionCredits(deds, 200_000, 2025, { isSalaried: false });
    expect(r.breakdown.sf).toBe(Math.round(10_000 * 0.35));
  });
});

// ─── F-023: Multi-employer overlap-month tax effect ──────────────────────────

describe("F-023 Multi-employer overlap (תקנה 5(ג)(2)) — refund add-on", () => {
  // תקנה 5(ג)(2) לתקנות ניכוי — חודשי חפיפה ללא תיאום מס מייצרים גביית-יתר
  // אצל המעסיק המשני שניכה במס שולי מרבי. החזר זה מתווסף לחישוב.
  it("overlap months produce a refund add-on for the secondary employer", () => {
    const tp = makeTaxpayer({
      employers: [
        { id: "main", name: "מעסיק ראשי", isMainEmployer: true, monthsWorked: 12,
          grossSalary: 200_000, taxWithheld: 30_000 },
        // Secondary withholds at the highest rate during 3 overlap months.
        { id: "sec",  name: "מעסיק משני", isMainEmployer: false, monthsWorked: 3,
          grossSalary: 30_000, taxWithheld: 14_100 }, // 47% × 30,000.
      ],
      lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        multiEmployerOverlapMonths: 3 },
    });
    const result = calculateFullRefund(tp, 2025);
    // The refund add-on must be > 0 (effective marginal at ₪230k taxable income
    // is ~25-30%, while secondary withheld ~47%/mo on ₪10k/mo gross).
    expect(result.multiEmployerOverlapRefund).toBeGreaterThan(0);
    // taxPaid includes both employer withholding plus the overlap refund add-on.
    expect(result.taxPaid).toBeGreaterThan(30_000 + 14_100);
  });

  it("zero overlap months → no refund add-on", () => {
    const tp = makeTaxpayer({
      employers: [
        { id: "m", name: "מעסיק", isMainEmployer: true, monthsWorked: 12,
          grossSalary: 200_000, taxWithheld: 30_000 },
      ],
      lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        multiEmployerOverlapMonths: 0 },
    });
    const result = calculateFullRefund(tp, 2025);
    expect(result.multiEmployerOverlapRefund).toBe(0);
  });
});

// ─── F-024: §67א foreign-salary credit ───────────────────────────────────────

describe("F-024 §67א foreign-salary credit (סעיפים 67א, 199-210)", () => {
  // סעיף 67א + סעיפים 199-210 — שכר שעבד בחו"ל חייב במס בישראל; זיכוי על
  // המס הזר ששולם, מוגבל לחלק היחסי של המס הישראלי על אותו מקור (סעיף 200(ג)).
  it("calculateForeignSalaryCredit: capped by source-attributed Israeli tax", () => {
    // foreign 60k of 200k taxable income (30%); israeli tax on total = 50k.
    // Attribution = 30% × 50k = 15k. Foreign paid 8k → min(8k, 15k) = 8k.
    expect(calculateForeignSalaryCredit(60_000, 8_000, 50_000, 200_000)).toBe(8_000);
  });

  it("calculateForeignSalaryCredit: foreign tax > attributed Israeli → clamped", () => {
    // attribution = 30% × 50k = 15k. Foreign paid 25k → min(25k, 15k) = 15k.
    expect(calculateForeignSalaryCredit(60_000, 25_000, 50_000, 200_000)).toBe(15_000);
  });

  it("calculateFullRefund applies the §67א credit to net tax owed", () => {
    const tp = makeTaxpayer({
      employers: [{ id: "isr", name: "מעסיק ישראלי", isMainEmployer: true,
        monthsWorked: 12, grossSalary: 140_000, taxWithheld: 20_000 }],
      foreignSalaryGross: 60_000,
      foreignSalaryTaxPaid: 8_000,
    });
    const tpNoForeignCredit = makeTaxpayer({
      employers: [{ id: "isr", name: "מעסיק ישראלי", isMainEmployer: true,
        monthsWorked: 12, grossSalary: 140_000, taxWithheld: 20_000 }],
      foreignSalaryGross: 60_000,
      // No foreignSalaryTaxPaid → no credit.
    });
    const r = calculateFullRefund(tp, 2025);
    const rNoCredit = calculateFullRefund(tpNoForeignCredit, 2025);
    expect(r.foreignSalaryCredit).toBeGreaterThan(0);
    expect(rNoCredit.foreignSalaryCredit).toBe(0);
    // The foreign-tax credit reduces netTaxOwed by exactly the credit amount,
    // unless the credit overshoots remaining liability (then floored).
    expect(rNoCredit.netTaxOwed - r.netTaxOwed).toBe(r.foreignSalaryCredit);
  });
});

// ─── F-025: §9א pension exemption (52% of qualifying pension) ────────────────

describe("F-025 §9א pension exemption — 52% of קצבה מזכה (סעיף 9א)", () => {
  // סעיף 9א — קצבה מזכה (פנסיה משלמת לאחר גיל פרישה) פטורה ב-52% (2025).
  it("calculateQualifyingPensionExemption: 52% of qualifying pension", () => {
    expect(calculateQualifyingPensionExemption(100_000, 2025)).toBe(52_000);
  });

  it("calculateFullRefund subtracts §9א exemption only when isPensionEligible", () => {
    const tpRetired = makeTaxpayer({
      employers: [{ id: "p", name: "פנסיה", isMainEmployer: true,
        monthsWorked: 12, grossSalary: 100_000, taxWithheld: 8_000 }],
      qualifyingPensionAmount: 100_000,
      isPensionEligible: true,
    });
    const tpNotEligible = makeTaxpayer({
      employers: [{ id: "p", name: "פנסיה", isMainEmployer: true,
        monthsWorked: 12, grossSalary: 100_000, taxWithheld: 8_000 }],
      qualifyingPensionAmount: 100_000,
      isPensionEligible: false,
    });
    const r = calculateFullRefund(tpRetired, 2025);
    const rNot = calculateFullRefund(tpNotEligible, 2025);
    expect(r.qualifyingPensionExemption).toBe(52_000);
    expect(rNot.qualifyingPensionExemption).toBe(0);
    // taxableIncome reduced by exactly the exemption amount.
    expect(rNot.taxableIncome - r.taxableIncome).toBe(52_000);
  });
});

// ─── F-026: Disability §9(5) for 50%-89% — verify partial exemption ─────────

describe("F-026 Disability §9(5) partial 50-89% — relative exemption (תקנות נכים 1979)", () => {
  // תקנות מס הכנסה (פטור לנכים מסעיף 9(5)) תשל"ט-1979 — פטור יחסי = תקרה × אחוז נכות / 100.
  it("disability 75% → 75% of cap exempted", () => {
    // 2025 cap = 645,360 → 75% = 484,020.
    expect(calculateDisabilityExemption(800_000, 75, 2025)).toBe(Math.round(645_360 * 0.75));
  });

  it("disability 50% with income below relative cap → income fully exempt", () => {
    // 50% × 645,360 = 322,680. Income 200,000 < 322,680 → exempt = income.
    expect(calculateDisabilityExemption(200_000, 50, 2025)).toBe(200_000);
  });

  it("disability 89% → 89% of cap exempted (boundary band 50-89%)", () => {
    expect(calculateDisabilityExemption(900_000, 89, 2025)).toBe(Math.round(645_360 * 0.89));
  });
});

// ─── F-027: ילד נטל מיוחד — auto 2 nq per parent (תיקון 196) ────────────────

describe("F-027 ילד נטל מיוחד — automatic 2 nq per parent (תיקון 196)", () => {
  // סעיף 45 הרחב + תיקון 196 — לכל הורה לילד נטל מיוחד מגיעות 2 נקודות זיכוי
  // אוטומטיות, בנוסף להוצאות בפועל לפי סעיף 45.
  it("child with hasSpecialNeeds → +2.0 nq breakdown entry", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c1", birthDate: "2015-01-01", hasSpecialNeeds: true }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["child_c1_special_needs"]).toBe(2.0);
    // Standard child credit is preserved alongside the special-needs supplement.
    expect(breakdown["child_c1"]).toBe(1.0);
  });

  it("child without hasSpecialNeeds → no special-needs entry", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c1", birthDate: "2015-01-01" }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["child_c1_special_needs"]).toBeUndefined();
  });
});

// ─── F-028: Joint custody — 0.5 nq each parent ───────────────────────────────

describe("F-028 Joint custody (משמורת משותפת) — 0.5 nq each (סעיף 66א(א1))", () => {
  // סעיף 66א(א1) (תיקון 2018+) — במשמורת משותפת כל הורה מקבל 0.5 נק' לכל ילד
  // (במקום 1.0 לאחד ההורים בלבד).
  it("standard child credit halved under joint custody", () => {
    const tp = makeTaxpayer({
      jointCustody: true,
      children: [{ id: "c1", birthDate: "2015-01-01" }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["child_c1"]).toBe(0.5);
  });

  it("WITHOUT joint custody → full 1.0 standard credit (existing behaviour)", () => {
    const tp = makeTaxpayer({
      children: [{ id: "c1", birthDate: "2015-01-01" }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["child_c1"]).toBe(1.0);
  });

  it("special-needs supplement is NOT halved by joint custody", () => {
    const tp = makeTaxpayer({
      jointCustody: true,
      children: [{ id: "c1", birthDate: "2015-01-01", hasSpecialNeeds: true }],
    });
    const { breakdown } = calculateCreditPoints(tp, 2025);
    expect(breakdown["child_c1"]).toBe(0.5);
    expect(breakdown["child_c1_special_needs"]).toBe(2.0);
  });
});

// ─── F-030: מענק עבודה nudge in optimizer ───────────────────────────────────

describe("F-030 מענק עבודה (negative-income tax) optimizer nudge (סעיף 60א + חוק מענק עבודה)", () => {
  // חוק להגדלת ההכנסה החודשית מעבודה (מענק עבודה) — מס שלילי לעובדים בהכנסה
  // נמוכה (₪25K-₪75K/שנה). הסעיף נמצא ב-optimizer.ts כ-nudge (לא חישוב מס).
  function makeFinancials(taxpayer: TaxPayer): FinancialData {
    return {
      taxYears: [2025],
      employersCount: taxpayer.employers.length,
      hasForeignBroker: false,
      estimatedRefund: 0,
      insights: [],
      actionItems: [],
    };
  }

  it("low-income single-parent → high-priority opt-eitc suggestion", () => {
    const tp = makeTaxpayer({
      maritalStatus: "single",
      children: [{ id: "c1", birthDate: "2018-01-01" }],
      employers: [{ id: "e1", name: "מעסיק", isMainEmployer: true,
        monthsWorked: 12, grossSalary: 60_000, taxWithheld: 1_000 }],
    });
    const sug = generateOptimizations(tp, makeFinancials(tp), 2025);
    const eitc = sug.find((s) => s.id === "opt-eitc");
    expect(eitc).toBeDefined();
    expect(eitc?.priority).toBe("high");
    expect(eitc?.estimatedSaving).toBeGreaterThan(0);
  });

  it("low-income with children (married) → eitc nudge with family-tier estimate", () => {
    const tp = makeTaxpayer({
      maritalStatus: "married",
      spouseHasIncome: true,
      children: [{ id: "c1", birthDate: "2018-01-01" }],
      employers: [{ id: "e1", name: "מעסיק", isMainEmployer: true,
        monthsWorked: 12, grossSalary: 50_000, taxWithheld: 500 }],
    });
    const sug = generateOptimizations(tp, makeFinancials(tp), 2025);
    const eitc = sug.find((s) => s.id === "opt-eitc");
    expect(eitc).toBeDefined();
    expect(eitc?.estimatedSaving).toBeGreaterThanOrEqual(7_500);
  });

  it("income above ₪75k → no eitc nudge", () => {
    const tp = makeTaxpayer({
      employers: [{ id: "e1", name: "מעסיק", isMainEmployer: true,
        monthsWorked: 12, grossSalary: 200_000, taxWithheld: 30_000 }],
    });
    const sug = generateOptimizations(tp, makeFinancials(tp), 2025);
    const eitc = sug.find((s) => s.id === "opt-eitc");
    expect(eitc).toBeUndefined();
  });
});

// ─── pensionIncomeCeiling per-year extension ────────────────────────────────

describe("Per-year pensionIncomeCeiling (Phase 1 §1.A — was 2025?283:270)", () => {
  // סעיף 47 — תקרת ההכנסה ל-self-employed pension משתנה משנה לשנה לפי הצמדה.
  // החוק קבע ₪283,000 ל-2025; הקוד הישן עשה year===2025?283:270 — מורחב כעת לפי שנה.
  it("self_employed_pension_sec47 cap differs across years (2024 ≠ 2023)", () => {
    const deds: PersonalDeduction[] = [
      { id: "sep", type: "self_employed_pension_sec47", amount: 100_000, providerName: "מנורה" },
    ];
    // High income so the income cap (not the deposit) drives the result.
    const r2024 = calculateDeductionCredits(deds, 5_000_000, 2024);
    const r2023 = calculateDeductionCredits(deds, 5_000_000, 2023);
    // 2024 cap = 270,000 × 16% = 43,200; 2023 cap = 223,920 × 16% = 35,827.
    expect(r2024.total).toBe(Math.round(Math.round(270_000 * 0.16) * 0.35));
    expect(r2023.total).toBe(Math.round(Math.round(223_920 * 0.16) * 0.35));
    // Sanity: 2024 > 2023 because indexation grew the ceiling.
    expect(r2024.total).toBeGreaterThan(r2023.total);
  });
});

// ─── F-018: שכר במשמרות (shift-work tax discount) — תקנה 5 ───────────────────

describe("F-018 שכר במשמרות — תקנה 5 לתקנות מס הכנסה (15% הנחה על שעות 175-200 לחודש)", () => {
  // תקנה 5 לתקנות מס הכנסה (שיעור המס על הכנסה ממשמרות) +
  // הוראת ביצוע 24/2002 — עובד שעיקר עבודתו במשמרות וההיקף החודשי
  // נמצא בטווח 175-200 שעות זכאי להנחת מס של 15% על המס השולי
  // המיוחס לשעות אלה.
  it("≥ 175h × 12 months → positive discount, scaled by 15% × marginal-rate × shift slice", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        shiftWorkHours: { months: 12, avgHoursPerMonth: 200 },
      },
    });
    const r = calculateFullRefund(tp, 2025);
    expect(r.shiftWorkDiscount).toBeGreaterThan(0);
    // The discount must never exceed the raw bracket tax.
    expect(r.shiftWorkDiscount).toBeLessThanOrEqual(r.calculatedTax + r.shiftWorkDiscount);
    // Ballpark: 25 recognised hours × 12 = 300 hours; (300/1900) × 200k ≈ ₪31.6k
    // shift slice; effective marginal ≈ 30k/200k = 15%; discount ≈ 0.15 × 0.15 × 31.6k
    // ≈ ₪711. Allow generous bounds — the model is a documented proxy.
    expect(r.shiftWorkDiscount).toBeGreaterThan(300);
    expect(r.shiftWorkDiscount).toBeLessThan(2_500);
  });

  it("< 175 hours/month → NO discount (eligibility floor)", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        shiftWorkHours: { months: 12, avgHoursPerMonth: 170 },
      },
    });
    const r = calculateShiftWorkDiscount(tp, 200_000, 30_000);
    expect(r.adjustment).toBe(0);
    // The Hebrew explanation must surface the eligibility floor.
    expect(r.explanation).toContain("175");
  });

  it("hours capped at 200 — extra hours above 200 do NOT increase the discount", () => {
    const tp200 = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        shiftWorkHours: { months: 12, avgHoursPerMonth: 200 },
      },
    });
    const tp250 = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        shiftWorkHours: { months: 12, avgHoursPerMonth: 250 },
      },
    });
    const r200 = calculateShiftWorkDiscount(tp200, 200_000, 30_000);
    const r250 = calculateShiftWorkDiscount(tp250, 200_000, 30_000);
    // Both cap at 200 → identical recognised band.
    expect(r250.adjustment).toBe(r200.adjustment);
  });

  it("citation must reference תקנה 5 + הוראת ביצוע 24/2002", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        shiftWorkHours: { months: 12, avgHoursPerMonth: 190 },
      },
    });
    const r = calculateShiftWorkDiscount(tp, 200_000, 30_000);
    expect(r.cite).toContain("תקנה 5");
    expect(r.cite).toContain("24/2002");
  });

  it("calculateFullRefund without shiftWorkHours → discount = 0 (back-compat)", () => {
    const tp = makeTaxpayer();
    const r = calculateFullRefund(tp, 2025);
    expect(r.shiftWorkDiscount).toBe(0);
  });
});

// ─── חל"ת: תקנה 5(ג)(4) — חופשה ללא תשלום ──────────────────────────────────

describe('חל"ת — תקנה 5(ג)(4) (תיאום מס לאחר חזרה מחל"ת)', () => {
  // תקנה 5(ג)(4) — תיאום מס לאחר חזרה מחל"ת. ניכוי המס נעשה על
  // בסיס הצפי השנתי המלא; כשבפועל עובד רק חלק מהשנה, נוצרת גביית-יתר
  // שמוחזרת בתיאום. המהנדס ההכנסה החייבת מורד בנתח החודשים בחל"ת.
  it("3 months חל\"ת → taxableIncome reduced by 25% before bracket calc", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        chaltMonths: 3,
      },
    });
    const r = calculateFullRefund(tp, 2025);
    // 200k gross, 3/12 leave → 50k removed.
    expect(r.chaltAdjustment).toBe(50_000);
    expect(r.taxableIncome).toBe(150_000);
  });

  it('0 months → no adjustment (back-compat)', () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        chaltMonths: 0,
      },
    });
    const r = calculateFullRefund(tp, 2025);
    expect(r.chaltAdjustment).toBe(0);
    expect(r.taxableIncome).toBe(200_000);
  });

  it('full-year (12 months) חל"ת → adjustment 0 (no income to reconcile)', () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        chaltMonths: 12,
      },
    });
    const r = calculateChaltAdjustment(tp, 200_000);
    expect(r.adjustment).toBe(0);
    expect(r.explanation).toContain("חל\"ת מלא");
  });

  it('citation must reference תקנה 5(ג)(4)', () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        chaltMonths: 4,
      },
    });
    const r = calculateChaltAdjustment(tp, 200_000);
    expect(r.cite).toContain("תקנה 5(ג)(4)");
  });

  it("reduced taxableIncome → strictly lower bracket tax than no-chalt baseline", () => {
    const tpBase = makeTaxpayer();
    const tpChalt = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        chaltMonths: 4,
      },
    });
    const rBase = calculateFullRefund(tpBase, 2025);
    const rChalt = calculateFullRefund(tpChalt, 2025);
    expect(rChalt.calculatedTax).toBeLessThan(rBase.calculatedTax);
    // Sanity: the bracket-tax delta matches calculateTaxOnIncome on the
    // post-adjustment income.
    const expectedTax = calculateTaxOnIncome(rChalt.taxableIncome, 2025).tax;
    expect(rChalt.calculatedTax).toBe(expectedTax);
  });
});

// ─── F-019: חופשת לידה — תקנות 168 + 174 + סעיף 9(7)(ב) ──────────────────────

describe("F-019 חופשת לידה — תקנות 168 + 174 (תיאום מס) + סעיף 9(7)(ב) (פטור על דמי לידה)", () => {
  // תקנות 168 + 174 — תיאום מס לאחר חופשת לידה (אותו מנגנון כמו חל"ת).
  // סעיף 9(7)(ב) לפקודה — דמי לידה מבל"ל פטורים ממס ולא נוספים להכנסה.
  it("4 months מטרניטי → taxableIncome reduced by 1/3 before bracket calc", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        maternityLeaveMonths: 4,
      },
    });
    const r = calculateFullRefund(tp, 2025);
    // 200k × 4/12 ≈ 66,667.
    expect(r.maternityLeaveAdjustment).toBe(Math.round(200_000 * (4 / 12)));
    expect(r.taxableIncome).toBe(200_000 - r.maternityLeaveAdjustment);
  });

  it("דמי לידה (allowance) NEVER added to taxable income (סעיף 9(7)(ב) exemption)", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        maternityLeaveMonths: 4,
        maternityLeaveAllowanceIls: 35_000, // BL grant
      },
    });
    const r = calculateFullRefund(tp, 2025);
    // The grant is exempt — totalGrossIncome reflects only employer salary.
    expect(r.totalGrossIncome).toBe(200_000);
    // …and the explanation surfaces the exempt allowance line.
    const m = calculateMaternityLeaveAdjustment(tp, 200_000);
    expect(m.explanation).toContain("דמי לידה");
    expect(m.explanation).toContain("9(7)(ב)");
  });

  it('0 months → no adjustment (back-compat)', () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        maternityLeaveMonths: 0,
      },
    });
    const r = calculateMaternityLeaveAdjustment(tp, 200_000);
    expect(r.adjustment).toBe(0);
  });

  it('citation must reference תקנות 168 + 174 + סעיף 9(7)(ב)', () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        maternityLeaveMonths: 3,
      },
    });
    const r = calculateMaternityLeaveAdjustment(tp, 200_000);
    expect(r.cite).toContain("168");
    expect(r.cite).toContain("174");
    expect(r.cite).toContain("9(7)(ב)");
  });

  it("חל\"ת + maternity in same year → both reductions compose, not double-count", () => {
    const tp = makeTaxpayer({
      lifeEvents: {
        changedJobs: false, pulledSeverancePay: false, hasForm161: false,
        chaltMonths: 2,
        maternityLeaveMonths: 3,
      },
    });
    const r = calculateFullRefund(tp, 2025);
    // First: chalt removes 2/12 = 33,333. Remaining base = 166,667.
    // Then: maternity removes 3/12 of 166,667 = 41,667. Final taxable ≈ 125,000.
    expect(r.chaltAdjustment).toBe(Math.round(200_000 * (2 / 12)));
    const expectedMaternityBase = 200_000 - r.chaltAdjustment;
    expect(r.maternityLeaveAdjustment).toBe(Math.round(expectedMaternityBase * (3 / 12)));
    expect(r.taxableIncome).toBe(
      Math.max(0, 200_000 - r.chaltAdjustment - r.maternityLeaveAdjustment)
    );
  });
});
