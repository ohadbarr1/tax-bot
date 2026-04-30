/**
 * lib/__tests__/api/parse-form-867-inbound.test.ts — closes 1.K (Form 867
 * inbound, Israeli broker / bank annual securities tax certificate).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Form867Inbound } from "@/lib/api/schemas/parse-form867-inbound";

const verifyIdToken = vi.fn();
vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/form-867-inbound";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setForm867InboundVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<Form867Inbound>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/form-867-inbound/route")) as unknown as RouteMod;
}

function fd(body: BlobPart, name = "form867.pdf", type = "application/pdf"): FormData {
  const form = new FormData();
  form.set("file", new Blob([body], { type }), name);
  return form;
}

describe("POST /api/parse/form-867-inbound — אישור שנתי לבעל ני״ע", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setForm867InboundVisionForTesting(undefined);
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

  it("golden fixture — extracts Israeli broker 867 with mixed flows", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: Form867Inbound = {
      brokerName: "בנק הפועלים",
      accountHolderName: "שירה אזולאי",
      tz: "045678901",
      year: 2024,
      realizedGainsIls: 35000,
      realizedLossesIls: 12000,
      dividendsIls: 4500,
      interestIls: 1200,
      foreignWithholdingIls: 750,
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setForm867InboundVisionForTesting(async () => golden);
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Form867Inbound };
    expect(body.data).toEqual(golden);
    // Sanity: realizedLosses should be POSITIVE per schema contract.
    expect(body.data.realizedLossesIls).toBeGreaterThanOrEqual(0);
  });
});
