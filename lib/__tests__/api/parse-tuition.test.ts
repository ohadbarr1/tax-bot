/**
 * lib/__tests__/api/parse-tuition.test.ts — closes 1.K (tuition cert).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TuitionReceipt } from "@/lib/api/schemas/parse-tuition";

const verifyIdToken = vi.fn();

vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const VALID_BEARER = { authorization: "Bearer ok" };
const ROUTE_PATH = "/api/parse/tuition";

interface RouteMod {
  POST: (req: Request) => Promise<Response>;
  __setTuitionVisionForTesting: (
    fn: ((file: { fileName: string }) => Promise<TuitionReceipt>) | undefined,
  ) => void;
}

async function loadRoute(): Promise<RouteMod> {
  return (await import("@/app/api/parse/tuition/route")) as unknown as RouteMod;
}

function buildMultipart(body: BlobPart, name = "tuition.pdf", type = "application/pdf"): FormData {
  const fd = new FormData();
  fd.set("file", new Blob([body], { type }), name);
  return fd;
}

describe("POST /api/parse/tuition — אישור על שכר לימוד", () => {
  beforeEach(() => verifyIdToken.mockReset());
  afterEach(async () => {
    const mod = await loadRoute();
    mod.__setTuitionVisionForTesting(undefined);
  });

  it("F-1 returns 401 without Bearer", async () => {
    const mod = await loadRoute();
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      body: buildMultipart("x"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 400 on missing file", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const mod = await loadRoute();
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: new FormData(),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on bad extension + bad MIME", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const mod = await loadRoute();
    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: buildMultipart("x", "x.txt", "text/plain"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("golden fixture — extracts BA tuition cert", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const golden: TuitionReceipt = {
      studentName: "דנה כהן",
      institutionName: "האוניברסיטה העברית בירושלים",
      programName: "מדעי המחשב",
      degreeLevel: "BA",
      completionYear: 2024,
      amountIls: 14500,
      overallConfidence: "high",
    };
    const mod = await loadRoute();
    mod.__setTuitionVisionForTesting(async () => golden);

    const req = new Request(`https://example.test${ROUTE_PATH}`, {
      method: "POST",
      headers: VALID_BEARER,
      body: buildMultipart("%PDF-1.4"),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: TuitionReceipt;
      provenance: { fileName: string };
    };
    expect(body.data).toEqual(golden);
  });
});
