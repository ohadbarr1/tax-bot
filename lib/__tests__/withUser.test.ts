/**
 * lib/__tests__/withUser.test.ts — covers F-1 / F1.2.1–F1.2.6.
 *
 * Verifies that `withUser` rejects malformed/missing/expired bearer tokens
 * with a uniform 401 envelope and forwards the verified `uid` to the wrapped
 * handler on success.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();

vi.mock("../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

import { withUser, verifyBearerOrNull } from "../api/withUser";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/x", {
    method: "POST",
    headers,
  });
}

describe("withUser — F-1 auth gate", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("F-1 returns 401 + UNAUTHORIZED envelope when Authorization header missing", async () => {
    const handler = vi.fn();
    const wrapped = withUser(handler);
    const res = await wrapped(makeReq() as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "UNAUTHORIZED", message: "נדרשת התחברות." },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("F-1 returns 401 when header is malformed (no Bearer scheme)", async () => {
    const handler = vi.fn();
    const wrapped = withUser(handler);
    const res = await wrapped(makeReq({ authorization: "Basic foo" }) as never);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("F-1 returns 401 when Bearer token is empty", async () => {
    const handler = vi.fn();
    const wrapped = withUser(handler);
    const res = await wrapped(makeReq({ authorization: "Bearer  " }) as never);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("F-1 returns 401 when verifyIdToken throws (expired/revoked/invalid)", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("token expired"));
    const handler = vi.fn();
    const wrapped = withUser(handler);
    const res = await wrapped(makeReq({ authorization: "Bearer abc.def.ghi" }) as never);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    // checkRevoked must be true so 0.J's revokeRefreshTokens() takes effect.
    expect(verifyIdToken).toHaveBeenCalledWith("abc.def.ghi", true);
  });

  it("F-1 returns 401 when decoded token has no uid", async () => {
    verifyIdToken.mockResolvedValueOnce({});
    const handler = vi.fn();
    const wrapped = withUser(handler);
    const res = await wrapped(makeReq({ authorization: "Bearer abc.def.ghi" }) as never);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("F-1 forwards verified uid to wrapped handler on success", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "user-123" });
    const handler = vi.fn(async (_req: Request, ctx: { uid: string }) =>
      new Response(JSON.stringify({ ok: true, uid: ctx.uid }), { status: 200 }),
    );
    const wrapped = withUser(handler as never);
    const res = await wrapped(makeReq({ authorization: "Bearer good-token" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, uid: "user-123" });
    expect(handler).toHaveBeenCalledOnce();
    expect(verifyIdToken).toHaveBeenCalledWith("good-token", true);
  });

  it("F-1 accepts case-insensitive Bearer scheme (RFC 6750)", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "u" });
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withUser(handler as never);
    const res = await wrapped(makeReq({ authorization: "bearer t" }) as never);
    expect(res.status).toBe(200);
  });

  it("verifyBearerOrNull returns null on missing header", async () => {
    const out = await verifyBearerOrNull(makeReq());
    expect(out).toBeNull();
  });

  it("verifyBearerOrNull returns { uid } on valid token", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "abc" });
    const out = await verifyBearerOrNull(makeReq({ authorization: "Bearer t" }));
    expect(out).toEqual({ uid: "abc" });
  });
});
