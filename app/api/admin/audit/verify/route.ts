/**
 * GET /api/admin/audit/verify — recompute the audit_events hash chain.
 *
 * Phase 2 §2.B follow-up. Iterates the chain oldest → newest and recomputes
 * each event_hash; returns { ok: true } on a clean chain, or { ok: false,
 * brokenAtId, reason } on the first detected break.
 *
 * Admin-gated. Cost is O(N) reads — fine for current scale, but at >100k
 * events promote to a paged + memo'd verifier (Phase 3).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import { verifyAuditChain } from "@/lib/audit/auditEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/audit/verify] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  try {
    const result = await verifyAuditChain();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 409,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/admin/audit/verify] failed:", err);
    return NextResponse.json({ error: "verify failed" }, { status: 500 });
  }
}
