/**
 * fx.test.ts — Bank of Israel daily FX rate loader.
 *
 * Closes audit finding F-017 (`audits/tax-domain.md` §F-017):
 *   "FX uses annual mean (law: daily Bank-of-Israel rate per transaction)".
 * Statutory anchor: סעיף 91(ג) לפקודת מס הכנסה + תקנות מס הכנסה (המרה למטבע
 * ישראלי) — conversion uses the **transaction-date** publish rate ("שער יציג"),
 * not an annual mean. The Bank of Israel does not publish on Shabbat / Friday /
 * Israeli bank holidays — for those dates the rule is to use the most-recent
 * **prior** business-day publication.
 */

import { describe, it, expect } from "vitest";
import {
  getFxRate,
  __setFxDatasetForTesting,
  __resetFxDatasetForTesting,
  type FxCurrency,
} from "../fx";

// ─── Test seed datasets ──────────────────────────────────────────────────────
//
// Mon 2024-03-11, Tue 2024-03-12, Wed 2024-03-13, Thu 2024-03-14, Fri 2024-03-15
// Sat 2024-03-16, Sun 2024-03-17, Mon 2024-03-18.
// In Israel, BoI publishes Sun–Thu (Fri/Sat closed). 2024-03-15 was a Friday —
// no publication; the prior business day is Thu 2024-03-14.

const USD_FIXTURE = {
  currency: "USD" as FxCurrency,
  base: "ILS",
  source: "test fixture",
  annualMean: { "2024": 3.71, "2025": 3.65 },
  rates: {
    "2024-03-11": 3.621,
    "2024-03-12": 3.615,
    "2024-03-13": 3.622,
    "2024-03-14": 3.640,
    // 2024-03-15 (Fri), 2024-03-16 (Sat) intentionally absent
    "2024-03-17": 3.638,
    "2024-03-18": 3.628,
  },
};

const EUR_FIXTURE = {
  currency: "EUR" as FxCurrency,
  base: "ILS",
  source: "test fixture",
  annualMean: { "2024": 4.01 },
  rates: {
    "2024-03-14": 3.985,
    "2024-03-17": 3.960,
  },
};

const GBP_FIXTURE = {
  currency: "GBP" as FxCurrency,
  base: "ILS",
  source: "test fixture",
  annualMean: { "2024": 4.74 },
  rates: {
    "2024-03-14": 4.622,
  },
};

function seedAll() {
  __setFxDatasetForTesting("USD", USD_FIXTURE);
  __setFxDatasetForTesting("EUR", EUR_FIXTURE);
  __setFxDatasetForTesting("GBP", GBP_FIXTURE);
}

// ─── F-017 / סעיף 91(ג): exact-date hit ──────────────────────────────────────

describe("F-017 / סעיף 91(ג) — getFxRate exact-date hit", () => {
  it("USD on a published date (2024-03-14) returns the exact daily rate", () => {
    seedAll();
    expect(getFxRate("USD", "2024-03-14")).toBe(3.640);
    __resetFxDatasetForTesting();
  });

  it("EUR on a published date returns the exact daily rate (independent of USD)", () => {
    seedAll();
    expect(getFxRate("EUR", "2024-03-14")).toBe(3.985);
    __resetFxDatasetForTesting();
  });

  it("GBP on a published date returns the exact daily rate (independent of USD/EUR)", () => {
    seedAll();
    expect(getFxRate("GBP", "2024-03-14")).toBe(4.622);
    __resetFxDatasetForTesting();
  });

  it("accepts a Date object as input (normalised to YYYY-MM-DD)", () => {
    seedAll();
    expect(getFxRate("USD", new Date("2024-03-13T08:00:00Z"))).toBe(3.622);
    __resetFxDatasetForTesting();
  });
});

// ─── F-017 / weekend fallback (תקנות המרה — yom ha-iska) ──────────────────────

describe("F-017 — weekend → prior-business-day fallback", () => {
  it("Friday 2024-03-15 falls back to Thursday 2024-03-14 (prior business day)", () => {
    seedAll();
    // Friday is closed in Israel → use Thu's rate
    expect(getFxRate("USD", "2024-03-15")).toBe(3.640);
    __resetFxDatasetForTesting();
  });

  it("Saturday 2024-03-16 falls back to Thursday 2024-03-14 (skips Friday)", () => {
    seedAll();
    expect(getFxRate("USD", "2024-03-16")).toBe(3.640);
    __resetFxDatasetForTesting();
  });

  it("Sunday 2024-03-17 returns its own published rate (Sun is a business day in Israel)", () => {
    seedAll();
    expect(getFxRate("USD", "2024-03-17")).toBe(3.638);
    __resetFxDatasetForTesting();
  });
});

// ─── F-017 — annual-mean fallback when daily rate missing ────────────────────

describe("F-017 — annual-mean fallback (transitional, until backfill complete)", () => {
  it("a date outside the seeded window falls back to the documented annual mean", () => {
    seedAll();
    // 2024-07-04 is far from any seeded date → annual mean for 2024 = 3.71
    expect(getFxRate("USD", "2024-07-04")).toBe(3.71);
    __resetFxDatasetForTesting();
  });

  it("a 2025 date with no daily rate uses 2025 annual mean", () => {
    seedAll();
    expect(getFxRate("USD", "2025-06-15")).toBe(3.65);
    __resetFxDatasetForTesting();
  });
});

// ─── F-017 — missing date / unsupported year throws ──────────────────────────

describe("F-017 — missing-date error", () => {
  it("throws when neither daily nor annual mean is available for the year", () => {
    seedAll();
    expect(() => getFxRate("USD", "1999-01-15")).toThrow(/no FX rate/i);
    __resetFxDatasetForTesting();
  });

  it("throws on malformed date string", () => {
    seedAll();
    expect(() => getFxRate("USD", "not-a-date")).toThrow(/invalid date/i);
    __resetFxDatasetForTesting();
  });
});

// ─── F-017 — currency-switch independence ────────────────────────────────────

describe("F-017 — currency switch returns independent rates", () => {
  it("same date returns different rates per currency", () => {
    seedAll();
    expect(getFxRate("USD", "2024-03-14")).toBe(3.640);
    expect(getFxRate("EUR", "2024-03-14")).toBe(3.985);
    expect(getFxRate("GBP", "2024-03-14")).toBe(4.622);
    __resetFxDatasetForTesting();
  });
});
