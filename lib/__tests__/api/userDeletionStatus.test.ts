/**
 * lib/__tests__/api/userDeletionStatus.test.ts — covers the new
 * `GET /api/user/deletion-status` endpoint that surfaces the state-machine
 * doc written by `/api/user/delete` so the UI can offer a "resume deletion"
 * CTA when a previous call failed mid-flight.
 *
 * Asserts:
 *   1. 401 without bearer token (auth gate enforced).
 *   2. 200 with `{ inProgress: false }` when no `_deletion` doc exists.
 *   3. 200 with the full state shape when a `_deletion` doc exists.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();
const firestore: Record<string, unknown> = {};

vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminFirestore: () => ({
    doc: (path: string) => ({
      path,
      get: async () => ({
        exists: firestore[path] !== undefined,
        ref: { path },
        data: () => firestore[path],
      }),
    }),
  }),
}));

describe("GET /api/user/deletion-status", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    for (const k of Object.keys(firestore)) delete firestore[k];
  });

  it("returns 401 without bearer token", async () => {
    const mod = (await import("@/app/api/user/deletion-status/route")) as unknown as {
      GET: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/deletion-status", { method: "GET" });
    const res = await mod.GET(req);
    expect(res.status).toBe(401);
  });

  it("returns inProgress=false when no _deletion doc exists", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    const mod = (await import("@/app/api/user/deletion-status/route")) as unknown as {
      GET: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/deletion-status", {
      method: "GET",
      headers: { authorization: "Bearer ok" },
    });
    const res = await mod.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ inProgress: false });
  });

  it("returns the full state shape when a partial-deletion doc exists", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    firestore["users/u1/private/_deletion"] = {
      requestedAt: "2026-04-29T12:00:00.000Z",
      firestoreDoneAt: "2026-04-29T12:00:01.000Z",
      storageDoneAt: null,
      authDoneAt: null,
      errors: [{ step: "storage", message: "outage", at: "2026-04-29T12:00:02.000Z" }],
    };
    const mod = (await import("@/app/api/user/deletion-status/route")) as unknown as {
      GET: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/deletion-status", {
      method: "GET",
      headers: { authorization: "Bearer ok" },
    });
    const res = await mod.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inProgress).toBe(true);
    expect(body.requestedAt).toBe("2026-04-29T12:00:00.000Z");
    expect(body.firestoreDoneAt).toBe("2026-04-29T12:00:01.000Z");
    expect(body.storageDoneAt).toBeFalsy();
    expect(body.authDoneAt).toBeFalsy();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0].step).toBe("storage");
  });
});
