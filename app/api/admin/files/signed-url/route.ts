/**
 * POST /api/admin/files/signed-url
 *
 * Body: { path: string }  (must start with "users/")
 * Effect: issues a 5-minute V4 signed read URL for the given object.
 *
 * Gated by `requireAdmin`. The path prefix check prevents a malicious
 * admin client from signing `/etc/passwd`-style paths against the bucket
 * root.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import { getAdminStorage } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/files/signed-url] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  let body: { path?: unknown } = {};
  try {
    body = (await request.json()) as { path?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const path = body.path;
  if (typeof path !== "string" || !path.startsWith("users/")) {
    return NextResponse.json(
      { error: "'path' must be a string under users/" },
      { status: 400 },
    );
  }

  try {
    const bucket = getAdminStorage().bucket();
    const file = bucket.file(path);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + FIVE_MINUTES_MS,
    });
    return NextResponse.json({ url, expiresIn: FIVE_MINUTES_MS / 1000 });
  } catch (err) {
    console.error("[api/admin/files/signed-url] failed:", err);
    return NextResponse.json({ error: "sign failed" }, { status: 500 });
  }
}
