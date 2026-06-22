/**
 * T5.4 — controlling shareholder (10%+ holder) pays 30% on the capital GAIN
 * and dividends (§91(ב)/§125ב), vs 25% for a regular individual.
 */
import { describe, it, expect } from "vitest";
import { calculateFullRefund } from "../calculateTax";
import { INITIAL_TAXPAYER } from "../initialState";
import type { TaxPayer } from "@/types";

function cg(profit: number, dividends: number, controlling: boolean): TaxPayer {
  return {
    ...INITIAL_TAXPAYER,
    controllingShareholder: controlling,
    capitalGains: { totalRealizedProfit: profit, totalRealizedLoss: 0, foreignTaxWithheld: 0, dividends },
  };
}

describe("capital-gains rate", () => {
  it("regular individual: 25% on gain + dividends", () => {
    const r = calculateFullRefund(cg(100_000, 40_000, false), 2025);
    expect(r.capitalGainsTax).toBe(Math.round(100_000 * 0.25 + 40_000 * 0.25)); // 35,000
  });
  it("controlling shareholder: 30% on gain + dividends", () => {
    const r = calculateFullRefund(cg(100_000, 40_000, true), 2025);
    expect(r.capitalGainsTax).toBe(Math.round(100_000 * 0.30 + 40_000 * 0.30)); // 42,000
  });

  it("capitalGainsBreakdown exposes the step-by-step drill-down (R5)", () => {
    const r = calculateFullRefund(cg(100_000, 40_000, false), 2025);
    const b = r.capitalGainsBreakdown!;
    expect(b.grossProfit).toBe(100_000);
    expect(b.netGain).toBe(100_000);
    expect(b.gainRate).toBe(0.25);
    expect(b.gainTax).toBe(25_000);
    expect(b.dividendTax).toBe(10_000);
    expect(b.total).toBe(35_000); // 25,000 + 10,000, no foreign credit
  });
});
