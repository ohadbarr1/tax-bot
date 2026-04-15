/**
 * GET /api/admin/users
 *
 * Query params:
 *   - q          substring filter on email / displayName / uid (in-memory)
 *   - pageSize   default 50, max 1000
 *   - pageToken  opaque page token from a previous response
 *
 * Response: { users, nextPageToken }
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import { listAdminUsers } from "@/lib/admin/listUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/users] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  try {
    const url = request.nextUrl;
    const q = url.searchParams.get("q") ?? undefined;
    const pageSizeRaw = url.searchParams.get("pageSize");
    const pageSize = pageSizeRaw ? Number(pageSizeRaw) : undefined;
    const pageToken = url.searchParams.get("pageToken") ?? undefined;

    const result = await listAdminUsers({
      q,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
      pageToken,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/admin/users] failed:", err);
    return NextResponse.json({ error: "listUsers failed" }, { status: 500 });
  }
}
