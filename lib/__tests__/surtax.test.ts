/**
 * T5.1 — Mas Yesafim (surtax §121ב). One threshold on TOTAL income (3%),
 * +2% on the capital slice above it from 2025. Worked CPA examples.
 */
import { describe, it, expect } from "vitest";
import { calculateFullRefund, surtaxThresholdForYear } from "../calculateTax";
import { INITIAL_TAXPAYER } from "../initialState";
import type { TaxPayer } from "@/types";

const T = 721_560;

function build(grossSalary: number, capitalProfit: number): TaxPayer {
  return {
    ...INITIAL_TAXPAYER,
    employers: [{ id: "m", name: "x", isMainEmployer: true, monthsWorked: 12, grossSalary }],
    capitalGains: capitalProfit
      ? { totalRealizedProfit: capitalProfit, totalRealizedLoss: 0, foreignTaxWithheld: 0 }
      : undefined,
  };
}

describe("surtax §121ב", () => {
  it("threshold is ₪721,560 for 2024–2026", () => {
    expect(surtaxThresholdForYear(2024)).toBe(T);
    expect(surtaxThresholdForYear(2025)).toBe(T);
    expect(surtaxThresholdForYear(2026)).toBe(T);
  });

  it("salary 500k + gains 400k (2025): single shared threshold, 5% on passive slice", () => {
    // total 900k; above = 178,440; all passive (salary < T) → 178,440 × 5% = 8,922
    const r = calculateFullRefund(build(500_000, 400_000), 2025);
    expect(r.taxableIncome).toBe(500_000);
    expect(r.surtax).toBe(8_922);
    expect(r.surtaxActive).toBe(0);
    expect(r.surtaxPassive).toBe(8_922);
  });

  it("salary 900k, no capital (2025): 3% on active above threshold", () => {
    const r = calculateFullRefund(build(900_000, 0), 2025);
    expect(r.surtax).toBe(Math.round((900_000 - T) * 0.03)); // 5,353
    expect(r.surtaxPassive).toBe(0);
  });

  it("salary 800k + gains 200k (2025): active slice 3%, passive slice 5%", () => {
    // total 1,000,000; above 278,440; passiveAbove=200k → active 78,440×3% + 200k×5%
    const r = calculateFullRefund(build(800_000, 200_000), 2025);
    expect(r.surtaxActive).toBe(Math.round(78_440 * 0.03)); // 2,353
    expect(r.surtaxPassive).toBe(Math.round(200_000 * 0.05)); // 10,000
    expect(r.surtax).toBe(12_353);
  });

  it("2024 has no 2% capital surcharge (passive at 3%)", () => {
    const r = calculateFullRefund(build(800_000, 200_000), 2024);
    expect(r.surtaxPassive).toBe(Math.round(200_000 * 0.03)); // 6,000
    expect(r.surtax).toBe(2_353 + 6_000);
  });

  it("below threshold → no surtax", () => {
    const r = calculateFullRefund(build(400_000, 100_000), 2025);
    expect(r.surtax).toBe(0);
  });
});
