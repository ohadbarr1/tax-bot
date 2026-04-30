/**
 * lib/__tests__/api/parse-mil-service.test.ts — closes 1.K (תעודת שחרור).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MilService } from "@/lib/api/schemas/parse-milservice";

const verifyIdToken = vi.fn();
vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/mil-service";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setMilServiceVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<MilService>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/mil-service/route")) as unknown as RouteMod;
}

function fd(body: BlobPart, name = "shichrur.pdf", type = "application/pdf"): FormData {
  const form = new FormData();
  form.set("file", new Blob([body], { type }), name);
  return form;
}

describe("POST /api/parse/mil-service — תעודת שחרור", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setMilServiceVisionForTesting(undefined);
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

  it("golden fixture — extracts 32-month male regular discharge", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: MilService = {
      personName: "ניר רגב",
      tz: "200300400",
      serviceStart: "2018-08-15",
      serviceEnd: "2021-04-15",
      serviceMonths: 32,
      gender: "m",
      serviceType: "regular",
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setMilServiceVisionForTesting(async () => golden);
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: MilService };
    expect(body.data).toEqual(golden);
  });
});
