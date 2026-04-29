/**
 * lib/__tests__/api/body-validation.test.ts — covers F-3 / F1.2.6.
 *
 * For every modified route, asserts that with a valid bearer token but a
 * malformed JSON body (or wrong-typed multipart) the route returns 400 +
 * the uniform `{ error: { code, message } }` envelope. This protects against
 * the historical pattern of `await request.json() as T` casts that let
 * arbitrary 50 MB blobs reach Anthropic / pdf-lib.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();
const firestoreGet = vi.fn();

vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminFirestore: () => ({
    doc: () => ({ get: firestoreGet }),
  }),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
  generateObject: vi.fn(),
  generateId: () => "id",
}));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => () => ({}),
}));

const VALID_BEARER = { authorization: "Bearer good-token", "Content-Type": "application/json" };

describe("body validation — F-3 / F1.2.6 (uniform 400 envelope)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    firestoreGet.mockReset();
    firestoreGet.mockResolvedValue({
      exists: true,
      data: () => ({
        state: {
          taxpayer: {
            id: "tp",
            fullName: "ישראלי",
            profession: "x",
            maritalStatus: "single",
            children: [],
            degrees: [],
            employers: [],
            personalDeductions: [],
            lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false },
          },
          financials: {
            taxYears: [2024],
            employersCount: 0,
            hasForeignBroker: false,
            estimatedRefund: 0,
            insights: [],
            actionItems: [],
          },
        },
      }),
    });
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("F-3 /api/advisor returns 400 + INVALID_INPUT on malformed body", async () => {
    const mod = await import("@/app/api/advisor/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/advisor", {
      method: "POST",
      headers: VALID_BEARER,
      body: "not-json",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("F-3 /api/advisor returns 400 when messages is missing", async () => {
    const mod = await import("@/app/api/advisor/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/advisor", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({ taxYear: 2024 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("F-3 /api/generate/form-135 returns 400 on missing taxpayer/financials", async () => {
    const mod = await import("@/app/api/generate/form-135/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/generate/form-135", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("F-3 /api/generate/form-1301 returns 400 on missing taxpayer/financials", async () => {
    const mod = await import("@/app/api/generate/form-1301/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/generate/form-1301", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("F-3 /api/generate/form-161 returns 400 when taxableSeverance missing", async () => {
    const mod = await import("@/app/api/generate/form-161/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
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

  it("F-3 /api/generate/form-161 returns 400 when employers count exceeds limit", async () => {
    const mod = await import("@/app/api/generate/form-135/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
    const tooManyEmployers = Array.from({ length: 25 }, (_, i) => ({
      id: `e${i}`,
      name: `n${i}`,
      isMainEmployer: i === 0,
      monthsWorked: 12,
    }));
    const req = new Request("https://example.test/api/generate/form-135", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({
        taxpayer: {
          id: "tp",
          fullName: "x",
          profession: "x",
          maritalStatus: "single",
          children: [],
          degrees: [],
          employers: tooManyEmployers,
          personalDeductions: [],
          lifeEvents: { changedJobs: false, pulledSeverancePay: false, hasForm161: false },
        },
        financials: {
          taxYears: [2024],
          employersCount: 25,
          hasForeignBroker: false,
          estimatedRefund: 0,
          insights: [],
          actionItems: [],
        },
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });
});

describe("PII flow — F-6 (advisor reads from Firestore, not body)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    firestoreGet.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("F-6 /api/advisor returns 404 when no draft exists for the uid", async () => {
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const mod = await import("@/app/api/advisor/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/advisor", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        // F-6: even if the client sends taxpayer/financials, the route MUST
        // ignore them. Below is a fabricated record for a different user.
        taxpayer: { idNumber: "999999999" },
        financials: { estimatedRefund: 1_000_000 },
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("F-6 /api/advisor/nudges returns empty list (200) when no draft for uid", async () => {
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const mod = await import("@/app/api/advisor/nudges/route") as unknown as {
      POST: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/advisor/nudges", {
      method: "POST",
      headers: VALID_BEARER,
      body: JSON.stringify({}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ nudges: [] });
  });
});
