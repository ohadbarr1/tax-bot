/**
 * lib/__tests__/api/parse-form-161-inbound.test.ts — closes 1.K (Form 161
 * inbound, employer-issued severance certificate).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Form161Inbound } from "@/lib/api/schemas/parse-form161-inbound";

const verifyIdToken = vi.fn();
vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/form-161-inbound";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setForm161InboundVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<Form161Inbound>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/form-161-inbound/route")) as unknown as RouteMod;
}

function fd(body: BlobPart, name = "form161.pdf", type = "application/pdf"): FormData {
  const form = new FormData();
  form.set("file", new Blob([body], { type }), name);
  return form;
}

describe("POST /api/parse/form-161-inbound — סעיף 9(7א) / סעיף 8(ג)", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setForm161InboundVisionForTesting(undefined);
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

  it("golden fixture — extracts inbound 161 with split severance", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: Form161Inbound = {
      employerName: "טכנולוגיות בע\"מ",
      employerTik: "939387767",
      employeeName: "מאיה ברקן",
      tz: "611223344",
      severanceTotalIls: 240000,
      taxableSeveranceIls: 80000,
      exemptSeveranceIls: 160000,
      monthsService: 60,
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setForm161InboundVisionForTesting(async () => golden);
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Form161Inbound };
    expect(body.data.severanceTotalIls).toBe(240000);
    expect(body.data.taxableSeveranceIls + body.data.exemptSeveranceIls).toBe(
      body.data.severanceTotalIls,
    );
  });
});
