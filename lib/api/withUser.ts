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
import * as Sentry from "@sentry/nextjs";
import { getAdminAuth } from "@/lib/firebase/admin";
import { unauthorized } from "./errorEnvelope";
import {
  createRequestLogger,
  newRequestId,
  type Logger,
} from "@/lib/logger";

export interface WithUserContext {
  uid: string;
  /** Per-request id (uuid) — injected into every log line via `log`. */
  requestId: string;
  /** Pino logger pre-bound with `request_id`, `uid`, `release`. */
  log: Logger;
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
): (req: NextRequest, ctx?: NextRouteContext) => Promise<Response> {
  return async (req: NextRequest, ctx?: NextRouteContext) => {
    // Honour an inbound trace id if a load-balancer / OTel sidecar set one;
    // otherwise mint our own uuid. Standard headers checked: `x-request-id`
    // (most LBs), `traceparent` (W3C). Single allocation, fall through.
    const headerRid =
      req.headers.get("x-request-id") ??
      req.headers.get("traceparent")?.split("-")[1] ??
      null;
    const requestId = headerRid ?? newRequestId();

    const decoded = await verifyBearerOrNull(req);
    if (!decoded) {
      // Auth failure — still emit a structured trace so we can correlate
      // 401 spikes with deploys / Firebase outages.
      createRequestLogger(requestId).warn(
        { event: "auth_unauthorized", path: req.nextUrl?.pathname ?? "" },
        "401",
      );
      return unauthorized();
    }
    const log = createRequestLogger(requestId).child({ uid: decoded.uid });

    // Sentry isolation: tag every captured event from this request with the
    // request_id and uid. Scope is request-local; no cross-request leakage.
    return await Sentry.withScope((scope) => {
      scope.setTag("request_id", requestId);
      scope.setUser({ id: decoded.uid });
      return handler(req, { uid: decoded.uid, requestId, log, params: ctx?.params });
    });
  };
}
