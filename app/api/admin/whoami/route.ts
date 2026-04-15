/**
 * GET /api/admin/whoami
 *
 * Cheap admin-check endpoint used by the admin portal layout to decide
 * whether to render the shell or redirect to `/`.
 *
 *   200 { isAdmin: true,  uid }         — authenticated + in admins allow-list
 *   200 { isAdmin: false }              — authenticated, not an admin
 *   401 { error }                       — missing or invalid bearer token
 *
 * Non-admin returns 200 (not 403) so the client gate can redirect silently
 * without a noisy 403 in the devtools console.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/isAdmin";
import { verifyIdToken } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const authHeader = request.headers.get("authorization");
    const decoded = await verifyIdToken(authHeader);
    if (!decoded) {
      return NextResponse.json(
        { error: "missing or invalid bearer token" },
        { status: 401 },
      );
    }
    const allowed = await isAdmin(decoded.uid);
    if (!allowed) {
      return NextResponse.json({ isAdmin: false });
    }
    return NextResponse.json({ isAdmin: true, uid: decoded.uid });
  } catch (err) {
    console.error("[api/admin/whoami] error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
