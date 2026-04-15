/**
 * DELETE /api/user/delete
 *
 * Permanently wipes the caller's account:
 *   1. Recursively deletes `users/{uid}/**` in Firestore.
 *   2. Deletes every Cloud Storage object under `users/{uid}/`.
 *   3. Calls `deleteUser(uid)` in Firebase Auth.
 *
 * Body must contain `{ confirm: "מחק" }`. Returns 400 on mismatch so a
 * renegade client can't silently wipe the user.
 *
 * Auth: Bearer ID token. Never accepts a target uid from the body — only
 * the token's uid is honored.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAdminAuth,
  getAdminFirestore,
  getAdminStorage,
  verifyIdToken,
} from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_WORD = "מחק";

export async function DELETE(request: NextRequest): Promise<Response> {
  const decoded = await verifyIdToken(request.headers.get("authorization"));
  if (!decoded) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { uid } = decoded;

  let parsed: { confirm?: unknown } = {};
  try {
    parsed = (await request.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (parsed.confirm !== CONFIRM_WORD) {
    return NextResponse.json(
      { error: `confirm must equal "${CONFIRM_WORD}"` },
      { status: 400 },
    );
  }

  const errors: string[] = [];

  // 1. Firestore — recursive delete under users/{uid}.
  try {
    const firestore = getAdminFirestore();
    await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
  } catch (err) {
    console.error("[api/user/delete] firestore delete failed:", err);
    errors.push("firestore");
  }

  // 2. Cloud Storage — delete every object under users/{uid}/.
  try {
    const bucket = getAdminStorage().bucket();
    await bucket.deleteFiles({ prefix: `users/${uid}/`, force: true });
  } catch (err) {
    console.error("[api/user/delete] storage delete failed:", err);
    errors.push("storage");
  }

  // 3. Auth — delete the user record last so the token stops working only
  // after their data is already gone.
  try {
    await getAdminAuth().deleteUser(uid);
  } catch (err) {
    console.error("[api/user/delete] auth delete failed:", err);
    errors.push("auth");
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, error: "partial", partial: true, failed: errors },
      { status: 207 },
    );
  }
  return NextResponse.json({ ok: true });
}
