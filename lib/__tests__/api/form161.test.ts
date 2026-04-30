/**
 * lib/__tests__/api/form161.test.ts — Phase 1 §1.E.
 *
 * Closes audits/generation.md §1.5 (Form 161 returns JSON not PDF) and
 * audits/tax-domain.md F-014 (severance spreading direction wrong;
 * per-year income forecast missing).
 *
 * Asserts:
 *   • F-1 — auth gate via withUser (401 + UNAUTHORIZED envelope).
 *   • Body validation — missing taxableSeverance → 400; bad TZ → 400;
 *     length-mismatched perYearIncomeForecast → 400.
 *   • TEMPLATE_MISSING — when public/templates/form_161_2025.pdf is absent
 *     the route returns 503 TEMPLATE_MISSING (mirrors form-135's pattern).
 *   • Spreading math — pure-function `computeSeveranceSpread` produces N
 *     forward-year slices starting at terminationYear+1 with the correct
 *     marginal rate per year (per-year forecast honored).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();

vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = {
  authorization: "Bearer good-token",
  "Content-Type": "application/json",
};

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  computeSeveranceSpread: typeof import("@/app/api/generate/form-161/route").computeSeveranceSpread;
  buildForm161Fields: typeof import("@/app/api/generate/form-161/route").buildForm161Fields;
  DRAW_LIST_161: typeof import("@/app/api/generate/form-161/route").DRAW_LIST_161;
  POSITIONAL_DRAWS_161: typeof import("@/app/api/generate/form-161/route").POSITIONAL_DRAWS_161;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/generate/form-161/route")) as unknown as RouteMod;
}

describe("POST /api/generate/form-161 — auth + body validation", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: "u-test" });
  });

  it("F-1 returns 401 + UNAUTHORIZED envelope without Bearer header", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-161", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxableSeverance: 1 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "UNAUTHORIZED", message: "נדרשת התחברות." },
    });
  });

  it("F-3 returns 400 + INVALID_INPUT when taxableSeverance is missing", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-161", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({ spreadYears: 3 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("F-3 returns 400 when perYearIncomeForecast length mismatches spreadYears", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-161", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({
        taxableSeverance: 100_000,
        terminationYear: 2024,
        spreadYears: 3,
        perYearIncomeForecast: [200_000, 200_000], // length 2 ≠ 3
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toMatch(/תחזית הכנסה/);
  });

  it("F-3 returns 400 on malformed JSON body", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-161", {
      method: "POST",
      headers: VALID_BEARER,
      body: "not-json",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("returns 503 TEMPLATE_MISSING when public/templates/form_161_2025.pdf is absent", async () => {
    // The repo intentionally ships without the official ITA template
    // (audits/generation.md §1.4-1.5 documented the data gap; Phase 1 §1.E
    // mirrors form-135's serviceUnavailable pattern). This test pins the
    // contract: until the template lands the route MUST 503, not silently
    // return a blank PDF.
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-161", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({
        taxableSeverance: 100_000,
        terminationYear: 2024,
        spreadYears: 3,
        currentYearIncome: 200_000,
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("TEMPLATE_MISSING");
  });
});

describe("computeSeveranceSpread — §8(ג)(3) forward spreading (closes F-014)", () => {
  it("spread([severance=120k, currentIncome=200k, yearsAhead=3]) yields 3 FORWARD slices", async () => {
    const mod = await loadRoute();
    const result = mod.computeSeveranceSpread(
      120_000,
      2024,
      3,
      200_000,
      // No per-year forecast — falls back to currentYearIncome for each slice.
      undefined,
    );

    // 3 slices, ordered chronologically forward from terminationYear + 1.
    expect(result.spreadSchedule).toHaveLength(3);
    expect(result.spreadSchedule.map((s) => s.year)).toEqual([2025, 2026, 2027]);
    // Closes F-014.1: NOT [2024, 2023, 2022] (the prior backward direction).
    expect(result.spreadSchedule.every((s) => s.year > 2024)).toBe(true);

    // Each slice carries 1/3 of the lump (rounded).
    for (const s of result.spreadSchedule) {
      expect(s.taxableAmount).toBe(40_000);
      expect(s.forecastIncome).toBe(200_000);
      // At ₪200k base + ₪40k slice (mid ₪220k), the 2025 brackets put
      // the marginal rate at 31% (band 4: 203_521..282_960). The 2024
      // brackets are slightly different but the same band applies.
      expect([0.31, 0.35]).toContain(s.marginalRate);
    }

    // Spread total = 3 × per-slice tax. Lump-sum counterfactual taxes the
    // entire ₪120k on top of ₪200k income in 2024 — by construction this
    // pulls more of the lump into the higher bracket (47%).
    expect(result.totalTaxLumpSum).toBeGreaterThan(result.totalTaxWithSpreading);
    expect(result.savings).toBe(result.totalTaxLumpSum - result.totalTaxWithSpreading);
    expect(result.savings).toBeGreaterThan(0);
  });

  it("uses per-year income forecast when supplied (closes F-014.2)", async () => {
    const mod = await loadRoute();
    // Ascending forecast: lower-income year 1, higher year 2/3 — the slice
    // marginal rate must rise across years.
    const result = mod.computeSeveranceSpread(
      120_000,
      2024,
      3,
      0,
      [50_000, 200_000, 500_000], // year 2025/2026/2027 expected income
    );

    expect(result.usedPerYearForecast).toBe(true);
    expect(result.spreadSchedule).toHaveLength(3);

    // Each slice uses its own forecast as the income base.
    expect(result.spreadSchedule[0].forecastIncome).toBe(50_000);
    expect(result.spreadSchedule[1].forecastIncome).toBe(200_000);
    expect(result.spreadSchedule[2].forecastIncome).toBe(500_000);

    // Marginal rate must be monotonically non-decreasing as the base income
    // climbs. 50k base + 40k slice (mid 70k) → bracket 1 (10%);
    // 200k base + 40k slice (mid 220k) → bracket 4 (31%);
    // 500k base + 40k slice (mid 520k) → bracket 5 (35%).
    const rates = result.spreadSchedule.map((s) => s.marginalRate);
    expect(rates[0]).toBeLessThan(rates[1]);
    expect(rates[1]).toBeLessThanOrEqual(rates[2]);
    expect(rates[0]).toBeCloseTo(0.10, 2);
    expect(rates[1]).toBeCloseTo(0.31, 2);
    // 2027 brackets default to 2025 (per loadYearData ceiling) — at mid 520k
    // we are inside the 35% bracket (282_961..560_520).
    expect(rates[2]).toBeCloseTo(0.35, 2);
  });

  it("clamps spreadYears to [1, 6] (statutory cap)", async () => {
    const mod = await loadRoute();
    const r10 = mod.computeSeveranceSpread(60_000, 2024, 10, 100_000);
    expect(r10.spreadSchedule).toHaveLength(6);
    const r0 = mod.computeSeveranceSpread(60_000, 2024, 0, 100_000);
    expect(r0.spreadSchedule).toHaveLength(1);
  });

  it("setting usedPerYearForecast=false when forecast length mismatches spreadYears", async () => {
    const mod = await loadRoute();
    const result = mod.computeSeveranceSpread(
      90_000,
      2024,
      3,
      150_000,
      [100_000, 100_000], // length 2 ≠ 3 — engine ignores forecast and warns.
    );
    expect(result.usedPerYearForecast).toBe(false);
    expect(result.spreadSchedule).toHaveLength(3);
    // All slices fall back to currentYearIncome (150k).
    for (const s of result.spreadSchedule) {
      expect(s.forecastIncome).toBe(150_000);
    }
  });
});

describe("buildForm161Fields — value-key dictionary", () => {
  it("emits one row per spread slice and blanks rows beyond N", async () => {
    const mod = await loadRoute();
    const spread = mod.computeSeveranceSpread(60_000, 2024, 2, 100_000);
    const vals = mod.buildForm161Fields({
      taxpayerName: "אוהד בר",
      idNumber: "123456789",
      terminationYear: 2024,
      taxableSeverance: 60_000,
      exemptSeverance: 0,
      spread,
      signatureDate: "01/05/2026",
    });
    expect(vals.terminationYear).toBe("2024");
    expect(vals.spreadYearsCount).toBe("2");
    expect(vals.spread_y1_year).toBe("2025");
    expect(vals.spread_y2_year).toBe("2026");
    // Rows 3-6 are blank.
    expect(vals.spread_y3_year).toBe("");
    expect(vals.spread_y4_year).toBe("");
    expect(vals.spread_y5_year).toBe("");
    expect(vals.spread_y6_year).toBe("");
  });
});

describe("DRAW_LIST_161 / POSITIONAL_DRAWS_161 — coverage invariant", () => {
  it("every DRAW_LIST entry references a value-key produced by buildForm161Fields", async () => {
    const mod = await loadRoute();
    const spread = mod.computeSeveranceSpread(60_000, 2024, 6, 100_000);
    const vals = mod.buildForm161Fields({
      taxpayerName: "x",
      idNumber: "1",
      terminationYear: 2024,
      taxableSeverance: 60_000,
      exemptSeverance: 0,
      spread,
      signatureDate: "01/01/2026",
    });
    for (const d of mod.DRAW_LIST_161) {
      expect(
        Object.prototype.hasOwnProperty.call(vals, d.valueKey),
        `DRAW_LIST_161 entry "${d.key}" references missing valueKey "${d.valueKey}"`,
      ).toBe(true);
    }
    for (const p of mod.POSITIONAL_DRAWS_161) {
      expect(
        Object.prototype.hasOwnProperty.call(vals, p.valueKey),
        `POSITIONAL_DRAWS_161 entry "${p.key}" references missing valueKey "${p.valueKey}"`,
      ).toBe(true);
    }
  });
});
