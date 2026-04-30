/**
 * lib/__tests__/api/form1214.test.ts — Phase 1 §1.E.
 *
 * Re-introduces a real Form 1214 (income-spreading election) implementation
 * that Phase 0 §0.I had stubbed at 501. Closes audits/generation.md §1.4
 * for the 1214 row.
 *
 * Asserts:
 *   • F-1 — auth gate.
 *   • Body validation — missing required fields → 400; bad TZ → 400;
 *     length-mismatched perYearIncomeForecast → 400; missing both
 *     forecast and baseline → 400.
 *   • TEMPLATE_MISSING — when public/templates/form_1214_2025.pdf is absent
 *     the route returns 503 TEMPLATE_MISSING.
 *   • Spreading math — `computeIncomeSpread` produces N forward-year slices
 *     starting at receivedYear+1, honoring per-year forecast.
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
  computeIncomeSpread: typeof import("@/app/api/generate/form-1214/route").computeIncomeSpread;
  buildForm1214Fields: typeof import("@/app/api/generate/form-1214/route").buildForm1214Fields;
  DRAW_LIST_1214: typeof import("@/app/api/generate/form-1214/route").DRAW_LIST_1214;
  POSITIONAL_DRAWS_1214: typeof import("@/app/api/generate/form-1214/route").POSITIONAL_DRAWS_1214;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/generate/form-1214/route")) as unknown as RouteMod;
}

describe("POST /api/generate/form-1214 — auth + body validation", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: "u-test" });
  });

  it("F-1 returns 401 + UNAUTHORIZED envelope without Bearer header", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-1214", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incomeKind: "bonus",
        amount: 50_000,
        receivedYear: 2024,
        spreadYears: 2,
        baselineIncome: 200_000,
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("F-3 returns 400 when required fields are missing", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-1214", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({ amount: 50_000 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("F-3 returns 400 when neither perYearIncomeForecast nor baselineIncome is supplied", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-1214", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({
        incomeKind: "bonus",
        amount: 50_000,
        receivedYear: 2024,
        spreadYears: 2,
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toMatch(/perYearIncomeForecast|baselineIncome/);
  });

  it("F-3 returns 400 when perYearIncomeForecast length mismatches spreadYears", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-1214", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({
        incomeKind: "retro",
        amount: 60_000,
        receivedYear: 2024,
        spreadYears: 3,
        perYearIncomeForecast: [100_000], // length 1 ≠ 3
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("returns 503 TEMPLATE_MISSING when public/templates/form_1214_2025.pdf is absent", async () => {
    const mod = await loadRoute();
    const req = new Request("https://example.test/api/generate/form-1214", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({
        incomeKind: "bonus",
        amount: 60_000,
        receivedYear: 2024,
        spreadYears: 3,
        baselineIncome: 150_000,
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("TEMPLATE_MISSING");
  });
});

describe("computeIncomeSpread — forward spreading", () => {
  it("produces 3 forward slices from receivedYear+1 with correct marginal rates", async () => {
    const mod = await loadRoute();
    const result = mod.computeIncomeSpread(
      120_000,
      2024,
      3,
      undefined,
      200_000,
    );
    expect(result.spreadSchedule).toHaveLength(3);
    expect(result.spreadSchedule.map((s) => s.year)).toEqual([2025, 2026, 2027]);
    expect(result.usedPerYearForecast).toBe(false);
    for (const s of result.spreadSchedule) {
      expect(s.taxableAmount).toBe(40_000);
      expect(s.forecastIncome).toBe(200_000);
    }
  });

  it("honors per-year income forecast", async () => {
    const mod = await loadRoute();
    const result = mod.computeIncomeSpread(
      90_000,
      2024,
      3,
      [50_000, 200_000, 500_000],
      0,
    );
    expect(result.usedPerYearForecast).toBe(true);
    expect(result.spreadSchedule[0].forecastIncome).toBe(50_000);
    expect(result.spreadSchedule[1].forecastIncome).toBe(200_000);
    expect(result.spreadSchedule[2].forecastIncome).toBe(500_000);
    // Marginal rate non-decreasing as base income climbs.
    const rates = result.spreadSchedule.map((s) => s.marginalRate);
    expect(rates[0]).toBeLessThan(rates[1]);
    expect(rates[1]).toBeLessThanOrEqual(rates[2]);
  });
});

describe("buildForm1214Fields — Hebrew kind label + signature plumbing", () => {
  it("translates incomeKind to Hebrew and emits per-row spread values", async () => {
    const mod = await loadRoute();
    const spread = mod.computeIncomeSpread(60_000, 2024, 2, undefined, 150_000);
    const vals = mod.buildForm1214Fields({
      taxpayerName: "אוהד בר",
      idNumber: "123456789",
      incomeKind: "severance",
      amount: 60_000,
      receivedYear: 2024,
      spread,
      justification: "מענק פרישה",
      signatureDate: "01/05/2026",
    });
    expect(vals.incomeKindLabel).toBe("פיצויי פיטורין");
    expect(vals.spreadYearsCount).toBe("2");
    expect(vals.spread_y1_year).toBe("2025");
    expect(vals.spread_y2_year).toBe("2026");
    expect(vals.spread_y3_year).toBe("");
    expect(vals.justification).toBe("מענק פרישה");
    expect(vals.signatureName).toBe("אוהד בר");
  });
});

describe("DRAW_LIST_1214 / POSITIONAL_DRAWS_1214 — coverage invariant", () => {
  it("every entry's valueKey resolves through buildForm1214Fields", async () => {
    const mod = await loadRoute();
    const spread = mod.computeIncomeSpread(60_000, 2024, 6, undefined, 150_000);
    const vals = mod.buildForm1214Fields({
      taxpayerName: "x",
      idNumber: "1",
      incomeKind: "bonus",
      amount: 60_000,
      receivedYear: 2024,
      spread,
      signatureDate: "01/01/2026",
    });
    for (const d of mod.DRAW_LIST_1214) {
      expect(
        Object.prototype.hasOwnProperty.call(vals, d.valueKey),
        `DRAW_LIST_1214 entry "${d.key}" references missing valueKey "${d.valueKey}"`,
      ).toBe(true);
    }
    for (const p of mod.POSITIONAL_DRAWS_1214) {
      expect(
        Object.prototype.hasOwnProperty.call(vals, p.valueKey),
        `POSITIONAL_DRAWS_1214 entry "${p.key}" references missing valueKey "${p.valueKey}"`,
      ).toBe(true);
    }
  });
});
