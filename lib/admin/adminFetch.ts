/**
 * adminFetch.ts — thin `fetch` wrapper that injects the current Firebase ID
 * token as an `Authorization: Bearer …` header.
 *
 * Used from client components that hit server routes under `/api/admin/*`
 * or `/api/user/*` — both gated by `verifyIdToken` on the server. Callers
 * never deal with the token refresh lifecycle; this helper always calls
 * `getIdToken()` on the current user before the fetch, which refreshes
 * transparently if the cached token is expired.
 *
 * On unauth → returns a synthetic 401 Response so callers can branch on
 * `res.ok` without special-casing missing-user.
 */

import { getClientAuth } from "@/lib/firebase/client";

export interface AuthedFetchInit extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
}

export async function authedFetch(input: RequestInfo | URL, init: AuthedFetchInit = {}): Promise<Response> {
  const auth = getClientAuth();
  const user = auth?.currentUser ?? null;
  if (!user) {
    return new Response(JSON.stringify({ error: "לא מחובר" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const token = await user.getIdToken(/* forceRefresh */ false);
  const headers: Record<string, string> = {
    ...(init.headers ?? {}),
    Authorization: `Bearer ${token}`,
  };
  return fetch(input, { ...init, headers });
}

// Backward-compat alias so consumers can name-import whichever reads well.
export const adminFetch = authedFetch;
