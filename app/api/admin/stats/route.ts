/**
 * GET /api/admin/stats
 *
 * Returns aggregate metrics for the admin dashboard. Gated by `requireAdmin`.
 * See `lib/admin/stats.ts` for the data contract.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import { computeAdminStats } from "@/lib/admin/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/stats] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  try {
    const stats = await computeAdminStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[api/admin/stats] failed:", err);
    return NextResponse.json({ error: "stats failed" }, { status: 500 });
  }
}
