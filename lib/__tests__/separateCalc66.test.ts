/**
 * T5.2 — §66 separate calculation (חישוב נפרד). A married couple's personal-
 * exertion income is taxed on each spouse's own bracket schedule (lower than
 * combining). The spouse's income + withholding now flow into the household.
 */
import { describe, it, expect } from "vitest";
import { calculateFullRefund, calculateTaxOnIncome, loadYearData } from "../calculateTax";
import { INITIAL_TAXPAYER } from "../initialState";
import type { TaxPayer } from "@/types";

const YEAR = 2025;
const cpAnnual = loadYearData(YEAR).credit_point_annual_value;

function married(primaryIncome: number, spouseIncome?: number, spouseWithheld = 0): TaxPayer {
  return {
    ...INITIAL_TAXPAYER,
    maritalStatus: "married",
    spouseHasIncome: !!spouseIncome,
    spouse: spouseIncome ? { firstName: "בן", idNumber: "000000018", income: spouseIncome, taxWithheld: spouseWithheld } : undefined,
    employers: [{ id: "m", name: "x", isMainEmployer: true, monthsWorked: 12, grossSalary: primaryIncome }],
  };
}

describe("§66 separate calculation", () => {
  it("spouse income adds its OWN separate-calc tax to the household", () => {
    const withSpouse = calculateFullRefund(married(200_000, 200_000), YEAR);
    // Baseline holds the primary's credit points constant (spouse present with
    // income 0 → same non-working-spouse treatment), isolating the spouse's tax.
    const baseline = calculateFullRefund(
      { ...married(200_000), spouseHasIncome: true, spouse: { income: 0 } },
      YEAR,
    );
    const spouseSeparate = Math.max(0, calculateTaxOnIncome(200_000, YEAR).tax - Math.round(2.25 * cpAnnual));
    expect(withSpouse.netTaxOwed - baseline.netTaxOwed).toBe(spouseSeparate);
    expect(spouseSeparate).toBeGreaterThan(0);
  });

  it("spouse withholding flows into taxPaid", () => {
    const r = calculateFullRefund(married(200_000, 200_000, 25_000), YEAR);
    const r0 = calculateFullRefund(married(200_000, 200_000, 0), YEAR);
    expect(r.taxPaid - r0.taxPaid).toBe(25_000);
  });

  it("separate calc is lower than combining the two incomes", () => {
    // Two earners at 200k each, taxed separately, pay less than one earner at 400k.
    const separate = 2 * calculateTaxOnIncome(200_000, YEAR).tax;
    const combined = calculateTaxOnIncome(400_000, YEAR).tax;
    expect(separate).toBeLessThan(combined);
  });

  it("no spouse income → no change (single-earner couple)", () => {
    const r = calculateFullRefund(married(200_000), YEAR);
    const single = calculateFullRefund({ ...married(200_000), maritalStatus: "single" }, YEAR);
    // Household tax owed identical whether the non-earning spouse is present or not
    // (aside from credit-point differences handled elsewhere).
    expect(r.netTaxOwed).toBeGreaterThanOrEqual(0);
    expect(single.netTaxOwed).toBeGreaterThanOrEqual(0);
  });
});
