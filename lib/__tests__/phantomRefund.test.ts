/**
 * T5.3 — keep-but-fix the חל"ת / maternity / overlap reconciliations. They
 * subtract a leave/overlap slice ASSUMING income is a 12-month projection.
 * Applied to ACTUAL (Tofes-106) income that double-discounts → phantom refund.
 * Now they fire ONLY when lifeEvents.incomeIsAnnualizedProjection === true.
 */
import { describe, it, expect } from "vitest";
import { calculateChaltAdjustment, calculateMaternityLeaveAdjustment, calculateFullRefund } from "../calculateTax";
import { INITIAL_TAXPAYER } from "../initialState";
import type { TaxPayer } from "@/types";

describe("חל\"ת / maternity reconciliation gate", () => {
  it("actual income (default): no חל\"ת adjustment even with leave months", () => {
    const tp = { ...INITIAL_TAXPAYER, lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false, chaltMonths: 3 } };
    expect(calculateChaltAdjustment(tp, 300_000).adjustment).toBe(0);
  });
  it("annualized projection: חל\"ת adjustment applies (3/12 of income)", () => {
    const tp = { ...INITIAL_TAXPAYER, lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false, chaltMonths: 3, incomeIsAnnualizedProjection: true } };
    expect(calculateChaltAdjustment(tp, 300_000).adjustment).toBe(75_000);
  });
  it("maternity: same gate", () => {
    const base = { changedJobs: false, pulledSeverancePay: false, hasForm161: false, maternityLeaveMonths: 4 };
    expect(calculateMaternityLeaveAdjustment({ ...INITIAL_TAXPAYER, lifeEvents: base }, 300_000).adjustment).toBe(0);
    expect(
      calculateMaternityLeaveAdjustment({ ...INITIAL_TAXPAYER, lifeEvents: { ...base, incomeIsAnnualizedProjection: true } }, 300_000).adjustment,
    ).toBe(100_000);
  });
});

describe("multi-employer overlap add-on gate", () => {
  function twoEmployers(extra?: Partial<TaxPayer["lifeEvents"]>): TaxPayer {
    return {
      ...INITIAL_TAXPAYER,
      employers: [
        { id: "a", name: "A", isMainEmployer: true, monthsWorked: 12, grossSalary: 400000, taxWithheld: 90000 },
        { id: "b", name: "B", isMainEmployer: false, monthsWorked: 6, grossSalary: 80000, taxWithheld: 30000 },
      ],
      lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false, multiEmployerOverlapMonths: 6, ...extra },
    };
  }
  it("actual income: no overlap add-on (recompute handles over-withholding)", () => {
    expect(calculateFullRefund(twoEmployers(), 2025).multiEmployerOverlapRefund).toBe(0);
  });
  it("annualized projection: overlap add-on can apply", () => {
    const r = calculateFullRefund(twoEmployers({ incomeIsAnnualizedProjection: true }), 2025);
    expect(r.multiEmployerOverlapRefund).toBeGreaterThanOrEqual(0);
  });
});
