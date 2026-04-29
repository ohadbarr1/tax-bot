/**
 * lib/__tests__/api/userDelete.test.ts — closes architecture-F-15.
 *
 * Asserts that `DELETE /api/user/delete` is an idempotent state machine:
 *
 *   1. First call: writes a `users/{uid}/private/_deletion` doc with
 *      `requestedAt`, runs Firestore→Storage→Auth in order. If Storage fails,
 *      returns 207 with the in-progress state and persists `firestoreDoneAt`
 *      so a retry can pick up where we left off. Auth user is NOT yet deleted.
 *
 *   2. Second call (same uid, same token): reads the `_deletion` doc, sees
 *      that Firestore is already done, retries Storage, then Auth. On success
 *      returns 204 (no body) and removes the `_deletion` marker.
 *
 *   3. State doc shape: { requestedAt, firestoreDoneAt?, storageDoneAt?,
 *      authDoneAt?, errors: [{ step, message, at }] }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();

// In-memory firestore mock supporting `set`, `get`, `delete`, and
// `recursiveDelete` for the user root.
const firestore: Record<string, unknown> = {};
const fakeSet = vi.fn(async (path: string, data: unknown, opts?: { merge?: boolean }) => {
  if (opts?.merge && typeof firestore[path] === "object" && firestore[path] !== null) {
    firestore[path] = { ...(firestore[path] as object), ...(data as object) };
  } else {
    firestore[path] = data;
  }
});
const fakeGet = vi.fn(async (path: string) => ({
  exists: firestore[path] !== undefined,
  ref: { path },
  data: () => firestore[path],
}));
const fakeDelete = vi.fn(async (path: string) => {
  delete firestore[path];
});
const fakeRecursiveDelete = vi.fn(async (rootPath: string) => {
  for (const k of Object.keys(firestore)) {
    if (k === rootPath || k.startsWith(rootPath + "/")) {
      delete firestore[k];
    }
  }
});

const fakeDeleteFiles = vi.fn(async () => undefined);
const fakeAuthDeleteUser = vi.fn(async (_uid: string) => undefined);

vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({
    verifyIdToken,
    deleteUser: fakeAuthDeleteUser,
  }),
  getAdminFirestore: () => ({
    doc: (path: string) => ({
      path,
      get: () => fakeGet(path),
      set: (data: unknown, opts?: { merge?: boolean }) => fakeSet(path, data, opts),
      delete: () => fakeDelete(path),
    }),
    recursiveDelete: (ref: { path: string }) => fakeRecursiveDelete(ref.path),
  }),
  getAdminStorage: () => ({
    bucket: () => ({ deleteFiles: fakeDeleteFiles }),
  }),
}));

const VALID = { authorization: "Bearer ok", "Content-Type": "application/json" };

describe("DELETE /api/user/delete — idempotent reconciler (architecture-F-15)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    for (const k of Object.keys(firestore)) delete firestore[k];
    fakeSet.mockClear();
    fakeGet.mockClear();
    fakeDelete.mockClear();
    fakeRecursiveDelete.mockClear();
    fakeDeleteFiles.mockReset();
    fakeDeleteFiles.mockResolvedValue(undefined);
    fakeAuthDeleteUser.mockReset();
    fakeAuthDeleteUser.mockResolvedValue(undefined);
  });

  it("returns 401 without bearer token", async () => {
    verifyIdToken.mockReset();
    const mod = (await import("@/app/api/user/delete/route")) as unknown as {
      DELETE: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "מחק" }),
    });
    const res = await mod.DELETE(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when confirm word missing", async () => {
    const mod = (await import("@/app/api/user/delete/route")) as unknown as {
      DELETE: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/delete", {
      method: "DELETE",
      headers: VALID,
      body: JSON.stringify({ confirm: "wrong" }),
    });
    const res = await mod.DELETE(req);
    expect(res.status).toBe(400);
  });

  it("first call: storage fails → 207 + persists state-machine doc; second call resumes; eventually 204", async () => {
    // Prime: Storage will fail on the first invocation, succeed on retry.
    let storageCalls = 0;
    fakeDeleteFiles.mockImplementation(async () => {
      storageCalls += 1;
      if (storageCalls === 1) throw new Error("simulated storage outage");
      return undefined;
    });

    const mod = (await import("@/app/api/user/delete/route")) as unknown as {
      DELETE: (req: Request) => Promise<Response>;
    };

    // 1️⃣ First call — Firestore deletes succeed, Storage fails.
    const req1 = new Request("https://example.test/api/user/delete", {
      method: "DELETE",
      headers: VALID,
      body: JSON.stringify({ confirm: "מחק" }),
    });
    const res1 = await mod.DELETE(req1);
    expect(res1.status).toBe(207);
    const body1 = await res1.json();
    expect(body1).toHaveProperty("partial", true);
    expect(body1.failed).toContain("storage");

    // State-machine doc must exist with firestore done, storage NOT done, auth NOT done.
    const state = firestore["users/u1/private/_deletion"] as
      | {
          requestedAt: string;
          firestoreDoneAt?: string;
          storageDoneAt?: string;
          authDoneAt?: string;
          errors: Array<{ step: string }>;
        }
      | undefined;
    expect(state, "_deletion doc must be persisted on first call").toBeTruthy();
    expect(state!.requestedAt).toBeTruthy();
    expect(state!.firestoreDoneAt).toBeTruthy();
    expect(state!.storageDoneAt).toBeFalsy();
    expect(state!.authDoneAt).toBeFalsy();
    expect(state!.errors.some((e) => e.step === "storage")).toBe(true);
    // Auth user MUST NOT be deleted yet — partial-state retry is still possible.
    expect(fakeAuthDeleteUser).not.toHaveBeenCalled();

    // 2️⃣ Second call — same uid, retry. This time storage succeeds.
    const req2 = new Request("https://example.test/api/user/delete", {
      method: "DELETE",
      headers: VALID,
      body: JSON.stringify({ confirm: "מחק" }),
    });
    const res2 = await mod.DELETE(req2);
    expect(res2.status).toBe(204);

    // State-machine doc gone; auth user deleted.
    expect(firestore["users/u1/private/_deletion"]).toBeUndefined();
    expect(fakeAuthDeleteUser).toHaveBeenCalledWith("u1");
  });

  it("clean run: all three steps succeed in one call → 204 + no _deletion doc left", async () => {
    const mod = (await import("@/app/api/user/delete/route")) as unknown as {
      DELETE: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/delete", {
      method: "DELETE",
      headers: VALID,
      body: JSON.stringify({ confirm: "מחק" }),
    });
    const res = await mod.DELETE(req);
    expect(res.status).toBe(204);
    expect(firestore["users/u1/private/_deletion"]).toBeUndefined();
    expect(fakeAuthDeleteUser).toHaveBeenCalledWith("u1");
  });
});
