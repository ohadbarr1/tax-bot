import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the admin-SDK wrappers before importing the module under test.
const mockExists = vi.fn<(id: string) => Promise<boolean>>();
const mockDoc = vi.fn((path: string) => ({
  async get() {
    const id = path.split("/")[1]!;
    return { exists: await mockExists(id) };
  },
}));
const mockVerifyIdToken = vi.fn<(h: string | null) => Promise<{ uid: string } | null>>();

vi.mock("../firebase/admin", () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => mockDoc(path),
  }),
  verifyIdToken: (h: string | null) => mockVerifyIdToken(h),
}));

import { isAdmin, requireAdmin, AdminAuthError } from "../admin/isAdmin";

describe("isAdmin", () => {
  beforeEach(() => {
    mockExists.mockReset();
    mockDoc.mockClear();
    mockVerifyIdToken.mockReset();
  });

  it("returns false for empty uid without hitting firestore", async () => {
    await expect(isAdmin("")).resolves.toBe(false);
    expect(mockDoc).not.toHaveBeenCalled();
  });

  it("returns true when the admins/{uid} doc exists", async () => {
    mockExists.mockResolvedValue(true);
    await expect(isAdmin("u1")).resolves.toBe(true);
    expect(mockDoc).toHaveBeenCalledWith("admins/u1");
  });

  it("returns false when the admins/{uid} doc does not exist", async () => {
    mockExists.mockResolvedValue(false);
    await expect(isAdmin("u2")).resolves.toBe(false);
  });

  it("returns false on lookup errors (never elevates)", async () => {
    mockExists.mockRejectedValue(new Error("boom"));
    await expect(isAdmin("u3")).resolves.toBe(false);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    mockExists.mockReset();
    mockDoc.mockClear();
    mockVerifyIdToken.mockReset();
  });

  it("throws AdminAuthError 401 on missing/invalid token", async () => {
    mockVerifyIdToken.mockResolvedValue(null);
    const err = await requireAdmin("Bearer bogus").then(
      () => null,
      (e) => e as AdminAuthError,
    );
    expect(err).toBeInstanceOf(AdminAuthError);
    expect(err?.status).toBe(401);
  });

  it("throws AdminAuthError 403 when the user is not in admins/{uid}", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "alice" });
    mockExists.mockResolvedValue(false);
    const err = await requireAdmin("Bearer ok").then(
      () => null,
      (e) => e as AdminAuthError,
    );
    expect(err?.status).toBe(403);
  });

  it("resolves with { uid } when the user is an admin", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "bob" });
    mockExists.mockResolvedValue(true);
    await expect(requireAdmin("Bearer ok")).resolves.toEqual({ uid: "bob" });
  });

  it("accepts a Request object and reads the authorization header from it", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "carol" });
    mockExists.mockResolvedValue(true);
    const req = new Request("https://example.com", {
      headers: { authorization: "Bearer t" },
    });
    await expect(requireAdmin(req)).resolves.toEqual({ uid: "carol" });
    expect(mockVerifyIdToken).toHaveBeenCalledWith("Bearer t");
  });
});
