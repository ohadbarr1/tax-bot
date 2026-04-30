/**
 * lib/__tests__/api/parse-disability-cert.test.ts — closes 1.K (סעיף 9(5)).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DisabilityCert } from "@/lib/api/schemas/parse-disability";

const verifyIdToken = vi.fn();
vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/disability-cert";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setDisabilityVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<DisabilityCert>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/disability-cert/route")) as unknown as RouteMod;
}

function fd(body: BlobPart, name = "nechut.pdf", type = "application/pdf"): FormData {
  const form = new FormData();
  form.set("file", new Blob([body], { type }), name);
  return form;
}

describe("POST /api/parse/disability-cert — סעיף 9(5)", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setDisabilityVisionForTesting(undefined);
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

  it("golden fixture — extracts 100% ITA-recognized disability", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: DisabilityCert = {
      personName: "אבי כהן",
      tz: "300400500",
      disabilityPercent: 100,
      cause: "ita_recognized",
      effectiveFrom: "2022-03-01",
      effectiveTo: "",
      issuingAuthority: "רשות המסים",
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setDisabilityVisionForTesting(async () => golden);
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: DisabilityCert };
    expect(body.data.disabilityPercent).toBe(100);
    expect(body.data.cause).toBe("ita_recognized");
  });
});
