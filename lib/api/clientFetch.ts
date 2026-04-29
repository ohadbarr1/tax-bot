/**
 * lib/api/clientFetch.ts — single helper every client-side `/api/*` call must
 * use after Wave α landed.
 *
 * Why this exists:
 *   0.A's `withUser` wraps every `/api/{advisor,parse,generate,mine,user}/*`
 *   route with `verifyIdToken(token, true)` (the second arg is `checkRevoked`).
 *   A plain
 *   `fetch("/api/advisor", ...)` from the browser never carries the
 *   `Authorization: Bearer <id-token>` header → 401. This helper:
 *
 *   1. Reads the current Firebase user via `getClientAuth()`.
 *   2. Calls `user.getIdToken(forceRefresh)` (which transparently refreshes
 *      expired tokens via the Firebase SDK).
 *   3. Attaches `Authorization: Bearer <token>` to the outgoing fetch.
 *   4. Throws `ClientFetchUnauthenticatedError` when no user is signed in
 *      (caller can choose to redirect to /welcome / surface a Hebrew toast).
 *
 * For multipart/FormData uploads, we deliberately do NOT set Content-Type so
 * the browser auto-fills it with the correct `multipart/form-data; boundary=…`.
 *
 * Closes:
 *   - architecture-F-1 client-side: routes return 200 instead of 401.
 *   - audit follow-up flagged by 0.A: AdvisorChat.tsx:64-77 etc. break post-
 *     Wave α without this helper.
 */

import { getClientAuth } from "@/lib/firebase/client";

export interface ClientFetchInit extends Omit<RequestInit, "headers"> {
  /** Headers — clientFetch merges these with `Authorization`. */
  headers?: HeadersInit;
  /**
   * When `true`, force the Firebase SDK to refresh the cached ID token before
   * the call. Use this only when you've just hit a 401 you suspect is due to
   * a stale cached token — every refresh costs a network round-trip.
   */
  forceRefreshToken?: boolean;
}

/**
 * Thrown when no Firebase user is currently signed in. Callers typically
 * catch this and redirect to the welcome screen / sign-in flow.
 */
export class ClientFetchUnauthenticatedError extends Error {
  constructor() {
    super("לא מחובר. נא להתחבר ולנסות שוב.");
    this.name = "ClientFetchUnauthenticatedError";
  }
}

/**
 * Authenticated `fetch` wrapper. Drop-in replacement for global `fetch` in
 * client components that hit `/api/*` routes.
 *
 *   const res = await clientFetch("/api/advisor", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify(payload),
 *   });
 */
export async function clientFetch(
  input: RequestInfo | URL,
  init: ClientFetchInit = {},
): Promise<Response> {
  const auth = getClientAuth();
  const user = auth?.currentUser ?? null;
  if (!user) {
    throw new ClientFetchUnauthenticatedError();
  }
  const token = await user.getIdToken(init.forceRefreshToken === true);

  const headers = new Headers(init.headers ?? undefined);
  headers.set("Authorization", `Bearer ${token}`);

  const { forceRefreshToken: _drop, ...restInit } = init;
  void _drop;
  return fetch(input, { ...restInit, headers });
}
