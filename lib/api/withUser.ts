/**
 * lib/api/withUser.ts — auth gate for non-admin API routes.
 *
 * Wraps a route handler so that every request must carry a valid Firebase
 * ID token in the `Authorization: Bearer <token>` header. Verification runs
 * via `firebase-admin` (`getAdminAuth().verifyIdToken(token, true)`).
 *
 *   - `checkRevoked: true` is mandatory — once 0.J wires up
 *     `revokeRefreshTokens()` on sign-out / delete, this is what makes the
 *     revocation actually take effect on subsequent API calls.
 *   - On missing / malformed / expired / revoked token: returns the uniform
 *     401 UNAUTHORIZED error envelope (Hebrew). The wrapped handler is never
 *     invoked.
 *   - On success: invokes `handler(req, { uid })`.
 *
 * Closes audit findings F-1 (every non-admin route was unauthenticated) and
 * F1.2.1–F1.2.6 (the corresponding security audit IDs).
 */

import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { unauthorized } from "./errorEnvelope";

export interface WithUserContext {
  uid: string;
}

/**
 * Next.js route handler context shape — `params` is a Promise of the dynamic
 * route segments (Next 15+ change). We don't introspect it; we forward it so
 * dynamic-segment routes can `await ctx.params`.
 */
export interface NextRouteContext {
  params?: Promise<unknown>;
}

export type WithUserHandler = (
  req: NextRequest,
  ctx: WithUserContext & NextRouteContext,
) => Promise<Response> | Response;

/**
 * Verify the bearer token on `request` with `checkRevoked: true`.
 * Returns the decoded uid on success, or `null` on any verification failure
 * (missing header, malformed token, expired, revoked, signature mismatch, …).
 *
 * Exported for tests and direct route use; most callers should prefer
 * `withUser(handler)` below.
 */
export async function verifyBearerOrNull(
  request: Request | NextRequest,
): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  // RFC 6750 — case-insensitive scheme.
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  try {
    // checkRevoked = true is required so 0.J's sign-out / token-revoke flow
    // actually invalidates in-flight ID tokens.
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (!decoded?.uid) return null;
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

/**
 * Wrap a route handler with bearer-token verification. Use as:
 *
 *   export const POST = withUser(async (req, { uid }) => { … });
 *
 * The wrapped handler MUST be `async` — its return value is awaited.
 */
export function withUser(
  handler: WithUserHandler,
): (req: NextRequest, ctx: NextRouteContext) => Promise<Response> {
  return async (req: NextRequest, ctx: NextRouteContext) => {
    const decoded = await verifyBearerOrNull(req);
    if (!decoded) return unauthorized();
    return await handler(req, { uid: decoded.uid, params: ctx?.params });
  };
}
