/**
 * POST /api/admin/users/[uid]/disable
 *
 * Body: { disabled: boolean }
 * Effect: `updateUser(uid, { disabled })` in Firebase Auth.
 *
 * Gated by `requireAdmin`.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import { getAdminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ uid: string }>;
}

export async function POST(request: NextRequest, ctx: Params): Promise<Response> {
  let caller: { uid: string };
  try {
    caller = await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/users/:uid/disable] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const { uid } = await ctx.params;
  if (!uid) {
    return NextResponse.json({ error: "missing uid" }, { status: 400 });
  }
  if (uid === caller.uid) {
    return NextResponse.json(
      { error: "cannot disable your own account from the admin portal" },
      { status: 400 },
    );
  }

  let body: { disabled?: unknown } = {};
  try {
    body = (await request.json()) as { disabled?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "'disabled' must be boolean" }, { status: 400 });
  }

  try {
    const updated = await getAdminAuth().updateUser(uid, { disabled: body.disabled });
    return NextResponse.json({ ok: true, disabled: updated.disabled });
  } catch (err) {
    console.error("[api/admin/users/:uid/disable] failed:", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
