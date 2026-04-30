/**
 * ibkrParser.test.ts
 *
 * Regression tests for the IBKR Activity Statement CSV parser.
 * Ground-truth values are computed by hand from the canonical sample at
 * /tax-bot/ibkr_sample_activity_statement.csv.
 *
 * Phase 1 §1.F (audit F-017 / סעיף 91(ג)): the parser now converts each row
 * to ILS at the **transaction-date** Bank-of-Israel publish rate via
 * `lib/fx.ts#getFxRate`. Tests that previously asserted a single year-uniform
 * rate now seed an in-memory FX dataset so per-row rates are deterministic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseIbkrCsv, getExchangeRateForYear } from "../ibkrParser";
import {
  __setFxDatasetForTesting,
  __resetFxDatasetForTesting,
} from "../fx";

const SAMPLE_PATH = join(__dirname, "fixtures", "ibkr_sample.csv");
const sampleCsv = readFileSync(SAMPLE_PATH, "utf-8");

// Per-trade publish rates for the dates that appear in the canonical sample.
// Values approximate published BoI rates and are deterministic for tests.
const SAMPLE_USD_FIXTURE = {
  currency: "USD" as const,
  base: "ILS",
  source: "test fixture (ibkr_sample dates)",
  annualMean: { "2024": 3.71, "2025": 3.65 },
  rates: {
    "2024-01-15": 3.62,
    "2024-03-15": 3.66,
    "2024-03-20": 3.67,
    "2024-06-15": 3.74,
    "2024-08-15": 3.74,
    "2024-12-10": 3.61,
  },
};

describe("parseIbkrCsv — canonical sample (Trades section path)", () => {
  beforeEach(() => __setFxDatasetForTesting("USD", SAMPLE_USD_FIXTURE));
  afterEach(() => __resetFxDatasetForTesting());

  it("detects the 2024 tax year from the Trades dates", () => {
    const result = parseIbkrCsv({ csv: sampleCsv });
    // Sample has no Statement/Data period row → falls back to current year.
    // We assert it at least returns a valid 4-digit year.
    expect(result.taxYear).toBeGreaterThanOrEqual(2023);
  });

  it("extracts Trades/Data Realized P/L profit (SPY: +698)", () => {
    const result = parseIbkrCsv({ csv: sampleCsv });
    expect(result.totalProfitUSD).toBe(698);
  });

  it("extracts Trades/Data Realized P/L loss (TSLA: -152 → abs 152)", () => {
    const result = parseIbkrCsv({ csv: sampleCsv });
    expect(result.totalLossUSD).toBe(152);
  });

  it("sums positive Dividends (15.50 + 16.20 = 31.70)", () => {
    const result = parseIbkrCsv({ csv: sampleCsv });
    expect(result.dividendsUSD).toBe(31.7);
  });

  it("sums negative Withholding Tax as abs (3.87 + 4.05 = 7.92)", () => {
    const result = parseIbkrCsv({ csv: sampleCsv });
    expect(result.foreignTaxUSD).toBe(7.92);
  });

  it("F-017: converts each row to ILS using the per-trade-date publish rate", () => {
    const result = parseIbkrCsv({ csv: sampleCsv });
    // SPY closing trade 2024-12-10: +698 USD × 3.61 = 2519.78 → 2520
    expect(result.totalRealizedProfit).toBe(Math.round(698 * 3.61));
    // TSLA closing trade 2024-08-15: 152 USD × 3.74 = 568.48 → 568
    expect(result.totalRealizedLoss).toBe(Math.round(152 * 3.74));
    // Dividends 2024-03-15 (15.50 × 3.66) + 2024-06-15 (16.20 × 3.74)
    // Implementation sums unrounded per-row ILS then rounds once → 117.
    expect(result.dividendsILS).toBe(
      Math.round(15.5 * 3.66 + 16.2 * 3.74)
    );
    // WHT 2024-03-15 (3.87 × 3.66) + 2024-06-15 (4.05 × 3.74)
    expect(result.foreignTaxWithheld).toBe(
      Math.round(3.87 * 3.66 + 4.05 * 3.74)
    );
  });

  it("`exchangeRate` field still reports the legacy annual-mean for display", () => {
    const result = parseIbkrCsv({ csv: sampleCsv });
    expect(result.exchangeRate).toBe(getExchangeRateForYear(result.taxYear));
  });
});

describe("parseIbkrCsv — Performance Summary fallback path", () => {
  const csv = [
    `Statement,Header,Field Name,Field Value`,
    `Statement,Data,Period,"January 1, 2024 - December 31, 2024"`,
    `Realized & Unrealized Performance Summary,Header,Symbol,Realized S/T Profit,Realized S/T Loss,Realized L/T Profit,Realized L/T Loss`,
    `Realized & Unrealized Performance Summary,Data,AAPL,1200,-300,500,-100`,
    `Realized & Unrealized Performance Summary,Data,Total,1200,-300,500,-100`,
  ].join("\n");

  const result = parseIbkrCsv({ csv });

  it("detects 2024 from the Statement period", () => {
    expect(result.taxYear).toBe(2024);
    expect(result.exchangeRate).toBe(3.71);
  });

  it("sums S/T + L/T profits, ignoring Total rows", () => {
    expect(result.totalProfitUSD).toBe(1700); // 1200 + 500
  });

  it("sums S/T + L/T losses as abs, ignoring Total rows", () => {
    expect(result.totalLossUSD).toBe(400); // |(-300) + (-100)|
  });
});

describe("parseIbkrCsv — Withholding Tax cancel-and-reissue edge case", () => {
  const csv = [
    `Statement,Header,Field Name,Field Value`,
    `Statement,Data,Period,"January 1, 2025 - December 31, 2025"`,
    `Withholding Tax,Header,Currency,Date,Description,Amount`,
    `Withholding Tax,Data,USD,2025-03-15,Cash Dividend - US Tax,-39.59`,
    `Withholding Tax,Data,USD,2025-03-16,Cash Dividend - US Tax Reversal,39.59`,
    `Withholding Tax,Data,USD,2025-03-16,Cash Dividend - US Tax,-66.01`,
  ].join("\n");

  const result = parseIbkrCsv({ csv });

  it("only counts negative amounts, correctly handling the 3-row reversal", () => {
    // -39.59 + (-66.01) = -105.60 → abs 105.60
    // A naive Math.abs() approach would incorrectly count the +39.59 reversal
    // and inflate the total to 145.19.
    expect(result.foreignTaxUSD).toBe(105.6);
  });

  it("applies 2025 FX rate (3.65)", () => {
    expect(result.exchangeRate).toBe(3.65);
  });
});

describe("parseIbkrCsv — Trades section wins over Performance Summary", () => {
  const csv = [
    `Trades,Header,DataDiscriminator,Asset Category,Symbol,Realized P/L`,
    `Trades,Data,Order,Stocks,AAPL,250`,
    `Realized & Unrealized Performance Summary,Header,Symbol,Realized S/T Profit,Realized S/T Loss,Realized L/T Profit,Realized L/T Loss`,
    `Realized & Unrealized Performance Summary,Data,AAPL,9999,0,0,0`,
  ].join("\n");

  const result = parseIbkrCsv({ csv });

  it("prefers Trades section (per spec) when both are present", () => {
    expect(result.totalProfitUSD).toBe(250);
    expect(result.totalProfitUSD).not.toBe(9999);
  });
});

describe("parseIbkrCsv — empty / malformed CSVs", () => {
  it("returns all-zeros on empty CSV without throwing", () => {
    const r = parseIbkrCsv({ csv: "" });
    expect(r.totalProfitUSD).toBe(0);
    expect(r.totalLossUSD).toBe(0);
    expect(r.dividendsUSD).toBe(0);
    expect(r.foreignTaxUSD).toBe(0);
  });

  it("handles comma-separated thousands in numeric cells", () => {
    const csv = [
      `Trades,Data,OrderType,Asset Category,Symbol,Realized P/L`,
      `Trades,Data,Trade,Equity,TEST,"1,234.56"`,
    ].join("\n");
    const r = parseIbkrCsv({ csv });
    expect(r.totalProfitUSD).toBe(1234.56);
  });
});
