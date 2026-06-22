/**
 * Real-data regression: the user's actual IBKR 2025 Activity Statement parses
 * correctly and drives the capital-gains drill-down (R5). Fixture:
 * fixtures/ibkr_real_2025.csv (account U14867394).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseIbkrCsv } from "../ibkrParser";
import { calculateFullRefund } from "../calculateTax";
import { INITIAL_TAXPAYER } from "../initialState";

const csv = readFileSync(join(__dirname, "fixtures", "ibkr_real_2025.csv"), "utf-8");

describe("real IBKR 2025 statement", () => {
  const r = parseIbkrCsv({ csv });

  it("parses the realized P/L, dividends and WHT (USD + ILS)", () => {
    expect(r.taxYear).toBe(2025);
    expect(r.totalProfitUSD).toBeCloseTo(24970.17, 2);
    expect(r.totalLossUSD).toBeCloseTo(8564.88, 2);
    expect(r.totalRealizedProfit).toBe(91141);
    expect(r.totalRealizedLoss).toBe(31262);
    expect(r.dividendsILS).toBe(963);
    expect(r.foreignTaxWithheld).toBe(312);
  });

  it("drives the capital-gains drill-down breakdown", () => {
    const taxpayer = {
      ...INITIAL_TAXPAYER,
      capitalGains: {
        totalRealizedProfit: r.totalRealizedProfit,
        totalRealizedLoss: r.totalRealizedLoss,
        foreignTaxWithheld: r.foreignTaxWithheld,
        dividends: r.dividendsILS,
      },
    };
    const b = calculateFullRefund(taxpayer, 2025).capitalGainsBreakdown!;
    expect(b.grossProfit).toBe(91141);
    expect(b.losses).toBe(31262);
    expect(b.netGain).toBe(59879); // 91,141 − 31,262
    expect(b.gainRate).toBe(0.25);
    expect(b.gainTax).toBe(14970); // round(59,879 × 25%)
    expect(b.dividendTax).toBe(241); // round(963 × 25%)
    expect(b.foreignCredit).toBe(312);
    expect(b.total).toBe(14899); // 14,970 + 241 − 312
  });
});
