/**
 * lib/__tests__/api/parse-pension-fund.test.ts — closes 1.K (קופ״ג / סעיף 47).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PensionFund } from "@/lib/api/schemas/parse-pensionfund";

const verifyIdToken = vi.fn();
vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/pension-fund";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setPensionFundVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<PensionFund>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/pension-fund/route")) as unknown as RouteMod;
}

function fd(body: BlobPart, name = "pension.pdf", type = "application/pdf"): FormData {
  const form = new FormData();
  form.set("file", new Blob([body], { type }), name);
  return form;
}

describe("POST /api/parse/pension-fund — סעיף 47", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setPensionFundVisionForTesting(undefined);
  });

  it("F-1 returns 401 without Bearer", async () => {
    const mod = await loadRoute();
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      body: fd("x"),
    });
    expect((await mod.POST(req)).status).toBe(401);
  });

  it("returns 400 on bad extension", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const mod = await loadRoute();
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("x", "x.txt", "text/plain"),
    });
    expect((await mod.POST(req)).status).toBe(400);
  });

  it("golden fixture — extracts pension fund statement", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: PensionFund = {
      accountHolderName: "מירי גולן",
      tz: "111223344",
      fundName: "מנורה מבטחים פנסיה",
      fundType: "pension",
      employerContributionIls: 18000,
      employeeContributionIls: 12000,
      selfContributionIls: 0,
      year: 2024,
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setPensionFundVisionForTesting(async () => golden);
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: PensionFund };
    expect(body.data).toEqual(golden);
  });
});
