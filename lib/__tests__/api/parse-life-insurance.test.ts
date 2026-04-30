/**
 * lib/__tests__/api/parse-life-insurance.test.ts — closes 1.K (סעיף 45א).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LifeInsurance } from "@/lib/api/schemas/parse-lifeins";

const verifyIdToken = vi.fn();
vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/life-insurance";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setLifeInsuranceVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<LifeInsurance>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/life-insurance/route")) as unknown as RouteMod;
}

function fd(body: BlobPart, name = "lifeins.pdf", type = "application/pdf"): FormData {
  const form = new FormData();
  form.set("file", new Blob([body], { type }), name);
  return form;
}

describe("POST /api/parse/life-insurance — סעיף 45א", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setLifeInsuranceVisionForTesting(undefined);
  });

  it("F-1 returns 401 without Bearer", async () => {
    const mod = await loadRoute();
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      body: fd("x"),
    });
    expect((await mod.POST(req)).status).toBe(401);
  });

  it("returns 400 on missing file", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const mod = await loadRoute();
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: new FormData(),
    });
    expect((await mod.POST(req)).status).toBe(400);
  });

  it("golden fixture — extracts life-insurance cert", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: LifeInsurance = {
      policyholderName: "אורי לוי",
      tz: "987654321",
      insurerName: "הראל",
      policyNumber: "P-2024-7788",
      policyType: "life",
      annualPremiumIls: 4200,
      policyYear: 2024,
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setLifeInsuranceVisionForTesting(async () => golden);
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: LifeInsurance };
    expect(body.data).toEqual(golden);
  });
});
