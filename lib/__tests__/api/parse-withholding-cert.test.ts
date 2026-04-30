/**
 * lib/__tests__/api/parse-withholding-cert.test.ts — closes 1.K (ניכוי במקור).
 *
 * NOTE: dependency on 1.L (encrypted-PDF support). The ITA gov.il portal
 * emits these certificates encrypted with the recipient's ת.ז. as password.
 * Until 1.L lands, this route refuses encrypted PDFs (the upstream
 * preprocessor errors out). Test asserts only the unencrypted happy path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WithholdingCert } from "@/lib/api/schemas/parse-withholding";

const verifyIdToken = vi.fn();
vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/withholding-cert";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setWithholdingVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<WithholdingCert>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/withholding-cert/route")) as unknown as RouteMod;
}

function fd(body: BlobPart, name = "nikui.pdf", type = "application/pdf"): FormData {
  const form = new FormData();
  form.set("file", new Blob([body], { type }), name);
  return form;
}

describe("POST /api/parse/withholding-cert — ניכוי במקור", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setWithholdingVisionForTesting(undefined);
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

  it("golden fixture — extracts withholding-at-source cert", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: WithholdingCert = {
      payerName: "חברה לדוגמה בע\"מ",
      payerTz: "514321987",
      recipientName: "אריאל מור",
      recipientTz: "456789012",
      grossAmountIls: 80000,
      withheldIls: 24000,
      year: 2024,
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setWithholdingVisionForTesting(async () => golden);
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: fd("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: WithholdingCert };
    expect(body.data).toEqual(golden);
  });
});
