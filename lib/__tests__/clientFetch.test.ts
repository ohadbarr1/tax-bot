/**
 * lib/__tests__/clientFetch.test.ts — covers Wave β / 0.J Part 4.
 *
 * `lib/api/clientFetch.ts` is the single helper every client-side fetch to a
 * `/api/...` route must use. It refreshes the current Firebase ID token via
 * `getIdToken()` and attaches `Authorization: Bearer <token>` so the routes
 * wrapped by 0.A's `withUser` accept the call.
 *
 * Without this helper, every advisor / parse / generate / mine call from the
 * browser 401s after Wave α landed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock state — Vitest's `vi.mock` factory cannot reference outer
// scope variables, but it CAN reference `vi.hoisted(...)` values.
const mocks = vi.hoisted(() => {
  return {
    currentUser: null as null | { getIdToken: (force?: boolean) => Promise<string> },
  };
});

vi.mock("../firebase/client", () => ({
  getClientAuth: () => ({
    get currentUser() {
      return mocks.currentUser;
    },
  }),
  isFirebaseConfigured: () => true,
}));

import { clientFetch, ClientFetchUnauthenticatedError } from "../api/clientFetch";

describe("clientFetch — attaches Bearer token to /api/* calls (Wave β / 0.J Part 4)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.currentUser = null;
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("attaches Authorization: Bearer <token> from getIdToken()", async () => {
    mocks.currentUser = {
      getIdToken: vi.fn(async () => "id-token-abc"),
    };

    await clientFetch("/api/advisor", { method: "POST", body: JSON.stringify({ x: 1 }) });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer id-token-abc");
  });

  it("preserves caller-supplied Content-Type and other headers", async () => {
    mocks.currentUser = {
      getIdToken: vi.fn(async () => "tok"),
    };

    await clientFetch("/api/advisor", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Custom": "1" },
      body: JSON.stringify({}),
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-custom")).toBe("1");
    expect(headers.get("authorization")).toBe("Bearer tok");
  });

  it("does NOT set Content-Type when body is FormData (lets browser set boundary)", async () => {
    mocks.currentUser = {
      getIdToken: vi.fn(async () => "tok"),
    };

    const form = new FormData();
    form.append("file", new Blob(["x"]), "f.pdf");

    await clientFetch("/api/parse/form-106", { method: "POST", body: form });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("content-type")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer tok");
  });

  it("throws ClientFetchUnauthenticatedError when no Firebase user", async () => {
    mocks.currentUser = null;
    await expect(clientFetch("/api/advisor", { method: "POST" })).rejects.toBeInstanceOf(
      ClientFetchUnauthenticatedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards non-401 responses untouched", async () => {
    mocks.currentUser = {
      getIdToken: vi.fn(async () => "tok"),
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    const res = await clientFetch("/api/advisor", { method: "POST" });
    expect(res.status).toBe(500);
  });

  it("forces token refresh when forceRefresh=true is passed", async () => {
    const getIdToken = vi.fn(async () => "fresh");
    mocks.currentUser = { getIdToken };

    await clientFetch("/api/advisor", { method: "POST", forceRefreshToken: true });

    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it("does NOT force-refresh by default", async () => {
    const getIdToken = vi.fn(async () => "cached");
    mocks.currentUser = { getIdToken };

    await clientFetch("/api/advisor", { method: "POST" });

    expect(getIdToken).toHaveBeenCalledWith(false);
  });

  it("supports URL/Request/string inputs uniformly", async () => {
    mocks.currentUser = {
      getIdToken: vi.fn(async () => "tok"),
    };
    await clientFetch("/api/advisor");
    await clientFetch(new URL("https://example.test/api/advisor"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
