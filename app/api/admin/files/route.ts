/**
 * GET /api/admin/files
 *
 * Query params:
 *   - uid       filter by user
 *   - kind      filter by file category (path segment after users/{uid}/)
 *   - since     ISO timestamp — only files updated >= since
 *   - until     ISO timestamp — only files updated <= until
 *   - pageSize  default 100, max 1000
 *   - pageToken opaque token from a previous response
 *
 * Response: { files, nextPageToken }
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import { listAdminFiles } from "@/lib/admin/listFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/files] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  try {
    const url = request.nextUrl;
    const uid = url.searchParams.get("uid") ?? undefined;
    const kind = url.searchParams.get("kind") ?? undefined;
    const since = url.searchParams.get("since") ?? undefined;
    const until = url.searchParams.get("until") ?? undefined;
    const pageSizeRaw = url.searchParams.get("pageSize");
    const pageSize = pageSizeRaw ? Number(pageSizeRaw) : undefined;
    const pageToken = url.searchParams.get("pageToken") ?? undefined;

    const result = await listAdminFiles({
      uid,
      kind,
      since,
      until,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
      pageToken,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/admin/files] failed:", err);
    return NextResponse.json({ error: "listFiles failed" }, { status: 500 });
  }
}
