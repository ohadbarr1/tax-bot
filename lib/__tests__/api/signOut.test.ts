/**
 * lib/__tests__/api/signOut.test.ts — covers Wave β / 0.J Part 3 (security-F1.1.3).
 *
 * `POST /api/user/sign-out` revokes the caller's refresh tokens server-side so
 * that any in-flight ID token still cached in IndexedDB / by an attacker who
 * scraped it via XSS becomes useless on the next API call (next call hits
 * `verifyIdToken(token, true)` — second arg is `checkRevoked` — and 401s).
 *
 * Asserted contract:
 *   - 401 without bearer token (handled by `withUser` wrapper).
 *   - 200 + `{ ok: true }` on success.
 *   - Calls `getAdminAuth().revokeRefreshTokens(uid)` exactly once.
 *   - Returns 500 INTERNAL_ERROR if Admin SDK throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();
const revokeRefreshTokens = vi.fn();

vi.mock("../../firebase/admin", () => ({
  getAdminAuth: () => ({
    verifyIdToken,
    revokeRefreshTokens,
  }),
}));

import { POST } from "@/app/api/user/sign-out/route";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/user/sign-out", {
    method: "POST",
    headers,
  });
}

describe("POST /api/user/sign-out — revoke refresh tokens (security-F1.1.3)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    revokeRefreshTokens.mockReset();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(makeReq() as never, {} as never);
    expect(res.status).toBe(401);
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("returns 401 when token verification fails", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("expired"));
    const res = await POST(makeReq({ authorization: "Bearer bad" }) as never, {} as never);
    expect(res.status).toBe(401);
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("revokes tokens for the verified uid and returns 200", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "user-123" });
    revokeRefreshTokens.mockResolvedValueOnce(undefined);

    const res = await POST(
      makeReq({ authorization: "Bearer good" }) as never,
      {} as never,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(revokeRefreshTokens).toHaveBeenCalledOnce();
    expect(revokeRefreshTokens).toHaveBeenCalledWith("user-123");
  });

  it("returns 500 INTERNAL_ERROR when revokeRefreshTokens throws", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "user-123" });
    revokeRefreshTokens.mockRejectedValueOnce(new Error("admin sdk down"));

    const res = await POST(
      makeReq({ authorization: "Bearer good" }) as never,
      {} as never,
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error?.code).toBe("INTERNAL_ERROR");
  });
});
