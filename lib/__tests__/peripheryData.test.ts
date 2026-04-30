/**
 * peripheryData.test.ts — schema + content sanity for the periphery dataset.
 *
 * Closes the data-half assertions for audit F-007 (`audits/tax-domain.md`
 * §F-007): "פריפריה — שיטת חישוב שגויה לחלוטין". The math model itself was
 * fixed in Phase 0 §0.C (`lib/calculateTax.ts:calculatePeripheryDiscount`);
 * this test pins the data-shape contract that the engine relies on, plus
 * a handful of widely-known sample lookups and tier classifications from
 * צו 2024.
 *
 * Statutory anchor:
 *   צו מס הכנסה (קביעת ישובים מזכים) (תיקון), התשפ"ד-2024
 *   סעיף 11 לפקודת מס הכנסה — tier 1 = 13%, tier 2 = 11%, cap ₪241,920 (2025).
 */

import { describe, it, expect } from "vitest";
import peripheryRaw from "@/data/periphery_postcodes.json";
import {
  calculatePeripheryDiscount,
} from "@/lib/calculateTax";

// Re-typed to surface the runtime shape the engine + pdfUtils + optimizer
// actually consume. If anyone changes the JSON shape, this assignment fails
// at compile-time.
const periphery = peripheryRaw as {
  description: string;
  source: string;
  source_url?: string;
  last_updated: string;
  model: "percentage_discount";
  effective_year: number;
  tiers: {
    tier1: { discount_pct: number; cap_2024: number; cap_2025: number };
    tier2: { discount_pct: number; cap_2024: number; cap_2025: number };
  };
  data_gap?: string;
  _meta: {
    community_count: number;
    tier1_count: number;
    tier2_count: number;
    postcode_count: number;
    expected_full_count: number;
  };
  postcodes: Record<
    string,
    { city: string; tier: 1 | 2; region?: string }
  >;
  communities: Array<{
    name: string;
    tier: 1 | 2;
    postcodes: string[];
    region?: string;
  }>;
};

describe("F-007 / צו 2024 — periphery dataset SHAPE", () => {
  it("declares the percentage-discount model (not credit-points)", () => {
    expect(periphery.model).toBe("percentage_discount");
  });

  it("cites צו 2024 as source", () => {
    expect(periphery.source).toMatch(/ישובים מזכים/);
    expect(periphery.source).toMatch(/2024|תשפ"ד/);
  });

  it("declares tier1=13% and tier2=11% (per צו 2023 §3)", () => {
    expect(periphery.tiers.tier1.discount_pct).toBeCloseTo(0.13, 5);
    expect(periphery.tiers.tier2.discount_pct).toBeCloseTo(0.11, 5);
  });

  it("declares 2024/2025 income caps that match the engine constants", () => {
    // Mirror PERIPHERY_INCOME_CAP in lib/calculateTax.ts (147-154).
    expect(periphery.tiers.tier1.cap_2024).toBe(236_520);
    expect(periphery.tiers.tier1.cap_2025).toBe(241_920);
    expect(periphery.tiers.tier2.cap_2024).toBe(236_520);
    expect(periphery.tiers.tier2.cap_2025).toBe(241_920);
  });

  it("postcodes map: every entry has city + tier∈{1,2}", () => {
    const entries = Object.entries(periphery.postcodes);
    expect(entries.length).toBeGreaterThan(0);
    for (const [pc, e] of entries) {
      expect(pc).toMatch(/^\d{5,7}$/);
      expect(typeof e.city).toBe("string");
      expect(e.city.length).toBeGreaterThan(0);
      expect([1, 2]).toContain(e.tier);
    }
  });

  it("communities array: every entry has name + tier∈{1,2} + postcodes[]", () => {
    expect(periphery.communities.length).toBeGreaterThan(0);
    for (const c of periphery.communities) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect([1, 2]).toContain(c.tier);
      expect(Array.isArray(c.postcodes)).toBe(true);
    }
  });

  it("communities are unique by name", () => {
    const names = periphery.communities.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("_meta tier counts match the actual communities array", () => {
    const t1 = periphery.communities.filter((c) => c.tier === 1).length;
    const t2 = periphery.communities.filter((c) => c.tier === 2).length;
    expect(periphery._meta.tier1_count).toBe(t1);
    expect(periphery._meta.tier2_count).toBe(t2);
    expect(periphery._meta.community_count).toBe(t1 + t2);
  });

  it("_meta postcode_count matches the actual postcodes map size", () => {
    expect(periphery._meta.postcode_count).toBe(
      Object.keys(periphery.postcodes).length
    );
  });

  it("data_gap is documented while community_count < expected (408)", () => {
    if (periphery._meta.community_count < periphery._meta.expected_full_count) {
      expect(periphery.data_gap).toBeTruthy();
      expect(periphery.data_gap).toMatch(/build-periphery-list/);
    }
  });
});

describe("F-007 / צו 2024 — sample community lookups", () => {
  // These are widely-published, long-standing classifications that have
  // appeared in every recent revision of צו ישובים מזכים. Used as a
  // canary against silent regressions.

  it("דימונה (postcode 86100) is tier 1 (south)", () => {
    const e = periphery.postcodes["86100"];
    expect(e).toBeDefined();
    expect(e.city).toBe("דימונה");
    expect(e.tier).toBe(1);
  });

  it("אילת (postcode 82100) is tier 1 (south)", () => {
    const e = periphery.postcodes["82100"];
    expect(e).toBeDefined();
    expect(e.city).toBe("אילת");
    expect(e.tier).toBe(1);
  });

  it("קריית שמונה (postcode 12000) is tier 1 (north)", () => {
    const e = periphery.postcodes["12000"];
    expect(e).toBeDefined();
    expect(e.city).toBe("קריית שמונה");
    expect(e.tier).toBe(1);
  });

  it("אשדוד (postcode 80100) is tier 2 (south)", () => {
    const e = periphery.postcodes["80100"];
    expect(e).toBeDefined();
    expect(e.city).toBe("אשדוד");
    expect(e.tier).toBe(2);
  });

  it("נתניה (postcode 42000) is tier 2 (center)", () => {
    const e = periphery.postcodes["42000"];
    expect(e).toBeDefined();
    expect(e.city).toBe("נתניה");
    expect(e.tier).toBe(2);
  });

  it("a non-eligible postcode (e.g. תל אביב 61000) returns undefined", () => {
    expect(periphery.postcodes["61000"]).toBeUndefined();
  });
});

describe("F-007 / סעיף 11 — engine integration end-to-end", () => {
  // End-to-end: lookup → calculatePeripheryDiscount → ILS-correct discount.

  it("דימונה resident, ₪200K income, 2025 → tier-1 13% × ₪200K = ₪26,000", () => {
    const entry = periphery.postcodes["86100"]; // דימונה, tier 1
    expect(entry.tier).toBe(1);
    const discount = calculatePeripheryDiscount(200_000, 1, 2025);
    expect(discount).toBe(26_000); // 0.13 × 200_000
  });

  it("אשקלון resident, ₪200K income, 2025 → tier-2 11% × ₪200K = ₪22,000", () => {
    const entry = periphery.postcodes["85100"]; // אשקלון, tier 2
    expect(entry.tier).toBe(2);
    const discount = calculatePeripheryDiscount(200_000, 2, 2025);
    expect(discount).toBe(22_000); // 0.11 × 200_000
  });

  it("דימונה resident, ₪400K income, 2025 → capped at 13% × ₪241,920 = ₪31,449.6 → ₪31,450", () => {
    const discount = calculatePeripheryDiscount(400_000, 1, 2025);
    // 0.13 × 241_920 = 31_449.6, rounded to 31_450
    expect(discount).toBe(Math.round(0.13 * 241_920));
  });
});
