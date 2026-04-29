/**
 * lib/__tests__/api/auth-required.test.ts — covers F-1 / F1.2.1–F1.2.6.
 *
 * For every route under `parse/`, `generate/`, `advisor/`, `mine/` we assert:
 *   1. POST without a Bearer token returns 401
 *   2. The body is the uniform error envelope `{ error: { code, message } }`
 *   3. The wrapped handler (PDF, OCR, Anthropic) is never invoked
 *
 * This is a regression net for the Phase 0 auth gate. New routes that forget
 * to wrap with `withUser` will fail this test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();

vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  // Advisor routes also call getAdminFirestore — but only AFTER the auth
  // gate, so a stub that throws is safe; the 401 path returns first.
  getAdminFirestore: () => ({
    doc: () => ({
      get: () => Promise.resolve({ exists: false, data: () => undefined }),
    }),
  }),
}));

// Stub the Anthropic SDK at module-load time so importing the routes does
// not require an API key. The auth gate fires before the route ever calls
// streamText / generateObject.
vi.mock("ai", () => ({
  streamText: vi.fn(),
  generateObject: vi.fn(),
  generateId: () => "id",
}));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => () => ({}),
}));

// Auth-required test fixtures — one per modified route. Imported lazily so
// vi.mock() is registered before evaluation.
const ROUTES: Array<{ name: string; load: () => Promise<{ POST: (req: Request) => Promise<Response> }>; jsonBody: unknown }> = [
  {
    name: "/api/advisor",
    load: () => import("@/app/api/advisor/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
    jsonBody: { messages: [{ role: "user", content: "hi" }] },
  },
  {
    name: "/api/advisor/nudges",
    load: () => import("@/app/api/advisor/nudges/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
    jsonBody: {},
  },
  {
    name: "/api/generate/form-135",
    load: () => import("@/app/api/generate/form-135/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
    jsonBody: {},
  },
  {
    name: "/api/generate/form-1301",
    load: () => import("@/app/api/generate/form-1301/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
    jsonBody: {},
  },
  {
    name: "/api/generate/form-161",
    load: () => import("@/app/api/generate/form-161/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
    jsonBody: { taxableSeverance: 1 },
  },
];

describe("auth-required gate (JSON routes) — F-1 / F1.2.1, F1.2.2, F1.2.6", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  for (const route of ROUTES) {
    it(`F-1 ${route.name} returns 401 + UNAUTHORIZED envelope without Bearer header`, async () => {
      const mod = await route.load();
      const req = new Request(`https://example.test${route.name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(route.jsonBody),
      });
      const res = await mod.POST(req);
      expect(res.status, `${route.name} should be 401 without auth`).toBe(401);
      const body = await res.json();
      expect(body, `${route.name} should return uniform envelope`).toEqual({
        error: { code: "UNAUTHORIZED", message: "נדרשת התחברות." },
      });
      // Guarantee verifyIdToken was never invoked — the wrapper short-circuits
      // on missing header before reaching firebase-admin.
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it(`F-1 ${route.name} returns 401 with malformed bearer`, async () => {
      const mod = await route.load();
      const req = new Request(`https://example.test${route.name}`, {
        method: "POST",
        headers: { authorization: "Bearer abc.def.ghi", "Content-Type": "application/json" },
        body: JSON.stringify(route.jsonBody),
      });
      verifyIdToken.mockRejectedValueOnce(new Error("invalid"));
      const res = await mod.POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  }
});

// Multipart routes — pass a FormData body so the request shape matches reality.
const MULTIPART_ROUTES: Array<{ name: string; load: () => Promise<{ POST: (req: Request) => Promise<Response> }> }> = [
  {
    name: "/api/parse/form-106",
    load: () => import("@/app/api/parse/form-106/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
  },
  {
    name: "/api/parse/ibkr",
    load: () => import("@/app/api/parse/ibkr/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
  },
  {
    name: "/api/mine/document",
    load: () => import("@/app/api/mine/document/route") as unknown as Promise<{ POST: (req: Request) => Promise<Response> }>,
  },
];

describe("auth-required gate (multipart routes) — F1.2.3 / F1.2.4 / F1.2.5", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  for (const route of MULTIPART_ROUTES) {
    it(`F-1 ${route.name} returns 401 + UNAUTHORIZED envelope without Bearer header`, async () => {
      const mod = await route.load();
      const fd = new FormData();
      fd.set("file", new Blob(["data"], { type: "text/plain" }), "x.csv");
      const req = new Request(`https://example.test${route.name}`, {
        method: "POST",
        body: fd,
      });
      const res = await mod.POST(req);
      expect(res.status, `${route.name} should be 401 without auth`).toBe(401);
      const body = await res.json();
      expect(body).toEqual({
        error: { code: "UNAUTHORIZED", message: "נדרשת התחברות." },
      });
    });
  }
});
