/**
 * POST /api/user/sign-out
 *
 * Server-side companion to `signOut()` in `lib/firebase/authContext.tsx`.
 * Calls `getAdminAuth().revokeRefreshTokens(uid)` so any in-flight ID token
 * (including ones an attacker may have scraped from IndexedDB before the
 * user clicked "התנתק") becomes useless on the very next API call —
 * `withUser` verifies tokens with `checkRevoked: true`.
 *
 * Closes:
 *   - security-F1.1.3 (sign-out does not revoke ID tokens).
 *   - the F1.1.4 IDB-token-exfil window: even if an attacker has the bearer
 *     token, the sign-out makes it 401 immediately.
 *
 * Auth: required (via `withUser`). The body is ignored — only the verified
 * token's uid is honored.
 */

import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/withUser";
import { getAdminAuth } from "@/lib/firebase/admin";
import { internalError } from "@/lib/api/errorEnvelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withUser(async (_req: NextRequest, { uid }) => {
  try {
    await getAdminAuth().revokeRefreshTokens(uid);
  } catch (err) {
    console.error("[api/user/sign-out] revokeRefreshTokens failed:", err);
    return internalError("שגיאה בהתנתקות. נסה שוב.");
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});
