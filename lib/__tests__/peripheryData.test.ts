/**
 * peripheryData.test.ts — schema + content sanity for the periphery dataset.
 *
 * Statutory anchor:
 *   הודעת מס הכנסה (רשימת יישובים מוטבים) — annual notice per סעיף 11(ב)(2).
 *   Each settlement has a year-specific (rate_pct, ceiling) pair set by the
 *   Director of the Tax Authority. Rates 7%-20%, ceilings ₪146,640-₪267,840
 *   (2025). NOT credit-points, NOT a flat tier system. The pre-2026-05-04
 *   tier1=13%/tier2=11% model never matched the statute and was scrapped.
 */

import { describe, it, expect } from "vitest";
import peripheryRaw from "@/data/periphery_postcodes.json";
import { calculatePeripheryDiscount } from "@/lib/calculateTax";

const periphery = peripheryRaw as {
  description: string;
  source: string;
  source_urls?: string[];
  last_updated: string;
  model: "per_settlement_rate_and_ceiling";
  years: Record<
    string,
    {
      settlements: Record<
        string,
        { rate_pct: number; ceiling: number; score?: number | null }
      >;
      _meta: { count: number; rates: number[] };
    }
  >;
  postcodes: Record<string, string>;
};

describe("F-007 — periphery dataset SHAPE", () => {
  it("declares the per-settlement model (not credit-points, not tiered)", () => {
    expect(periphery.model).toBe("per_settlement_rate_and_ceiling");
  });

  it("cites הודעת מס הכנסה / רשימת יישובים מוטבים as source", () => {
    expect(periphery.source).toMatch(/יישובים מוטבים/);
  });

  it("publishes 2024, 2025, and 2026 statute years", () => {
    expect(periphery.years["2024"]).toBeDefined();
    expect(periphery.years["2025"]).toBeDefined();
    expect(periphery.years["2026"]).toBeDefined();
  });

  it("each year has 400+ settlements (statute-grade coverage)", () => {
    for (const yr of ["2024", "2025", "2026"]) {
      expect(periphery.years[yr]._meta.count).toBeGreaterThanOrEqual(400);
    }
  });

  it("settlement rates fall in [0.07, 0.20]", () => {
    for (const yr of Object.values(periphery.years)) {
      for (const s of Object.values(yr.settlements)) {
        expect(s.rate_pct).toBeGreaterThanOrEqual(0.07);
        expect(s.rate_pct).toBeLessThanOrEqual(0.20);
        expect(s.ceiling).toBeGreaterThan(0);
      }
    }
  });

  it("postcode → settlement mapping resolves only to statute settlements (no false positives)", () => {
    const stat2025 = periphery.years["2025"].settlements;
    for (const [pc, name] of Object.entries(periphery.postcodes)) {
      expect(pc).toMatch(/^\d{5,7}$/);
      expect(stat2025[name]).toBeDefined();
    }
  });

  it("known center cities are NOT in any year's statute (regression guard)", () => {
    const blocked = ["נתניה", "חולון", "ראשון לציון", "רעננה", "כפר סבא", "רחובות", "חדרה", "אשדוד", "באר שבע", "אילת", "ירושלים"];
    for (const yr of Object.values(periphery.years)) {
      for (const name of blocked) {
        expect(yr.settlements[name]).toBeUndefined();
      }
    }
  });
});

describe("F-007 — sample statute lookups", () => {
  it("דימונה 2025 → 18%, ceiling ₪245,400", () => {
    const e = periphery.years["2025"].settlements["דימונה"];
    expect(e).toBeDefined();
    expect(e.rate_pct).toBeCloseTo(0.18, 5);
    expect(e.ceiling).toBe(245_400);
  });

  it("שדרות 2025 → 20%, ceiling ₪267,840", () => {
    const e = periphery.years["2025"].settlements["שדרות"];
    expect(e.rate_pct).toBeCloseTo(0.20, 5);
    expect(e.ceiling).toBe(267_840);
  });

  it("צפת 2025 → 12%, ceiling ₪213,240", () => {
    const e = periphery.years["2025"].settlements["צפת"];
    expect(e.rate_pct).toBeCloseTo(0.12, 5);
    expect(e.ceiling).toBe(213_240);
  });

  it("postcode 86100 resolves to דימונה", () => {
    expect(periphery.postcodes["86100"]).toBe("דימונה");
  });

  it("non-eligible postcode (e.g. תל אביב 61000) is not in the table", () => {
    expect(periphery.postcodes["61000"]).toBeUndefined();
  });
});

describe("F-007 — engine integration end-to-end", () => {
  it("דימונה resident, ₪200K income, 2025 → 18% × ₪200K = ₪36,000", () => {
    expect(calculatePeripheryDiscount(200_000, "דימונה", 2025)).toBe(36_000);
  });

  it("שדרות resident, ₪200K income, 2025 → 20% × ₪200K = ₪40,000", () => {
    expect(calculatePeripheryDiscount(200_000, "שדרות", 2025)).toBe(40_000);
  });

  it("דימונה resident, ₪400K income, 2025 → capped at 18% × ₪245,400 = ₪44,172", () => {
    expect(calculatePeripheryDiscount(400_000, "דימונה", 2025)).toBe(Math.round(245_400 * 0.18));
  });

  it("non-statute settlement (תל אביב) → 0", () => {
    expect(calculatePeripheryDiscount(200_000, "תל אביב", 2025)).toBe(0);
  });

  it("pre-2024 year (no published list) → 0", () => {
    expect(calculatePeripheryDiscount(200_000, "דימונה", 2023)).toBe(0);
  });
});
