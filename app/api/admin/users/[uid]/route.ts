/**
 * GET /api/admin/users/[uid]    — user detail (profile + state + files)
 * DELETE /api/admin/users/[uid] — wipe firestore + storage + auth user
 *
 * Both gated by `requireAdmin`. DELETE requires body `{ confirm: uid }` to
 * prevent accidental one-click nukes from the portal.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import {
  getAdminAuth,
  getAdminFirestore,
  getAdminStorage,
} from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ uid: string }>;
}

export async function GET(request: NextRequest, ctx: Params): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/users/:uid] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const { uid } = await ctx.params;
  if (!uid) {
    return NextResponse.json({ error: "missing uid" }, { status: 400 });
  }

  try {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const bucket = getAdminStorage().bucket();

    const [userRecord, stateSnap, filesTuple] = await Promise.all([
      auth.getUser(uid).catch(() => null),
      firestore.doc(`users/${uid}/private/state`).get(),
      bucket.getFiles({ prefix: `users/${uid}/` }),
    ]);

    if (!userRecord) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const [files] = filesTuple;
    const fileRows = files.map((f) => {
      const rawSize = f.metadata?.size;
      const size = typeof rawSize === "string" ? Number(rawSize) : (rawSize ?? 0);
      const name = f.name.split("/").pop() ?? f.name;
      const kind = f.name.split("/")[2] ?? "";
      return {
        path: f.name,
        kind,
        name,
        size: Number.isFinite(size) ? size : 0,
        contentType: (f.metadata?.contentType as string | undefined) ?? null,
        updated: (f.metadata?.updated as string | undefined) ?? null,
      };
    });

    const state = stateSnap.exists ? (stateSnap.data()?.state ?? null) : null;

    return NextResponse.json({
      user: {
        uid: userRecord.uid,
        email: userRecord.email ?? null,
        displayName: userRecord.displayName ?? null,
        photoURL: userRecord.photoURL ?? null,
        providers: userRecord.providerData.map((p) => p.providerId),
        disabled: userRecord.disabled,
        createdAt: userRecord.metadata.creationTime ?? null,
        lastSignInAt: userRecord.metadata.lastSignInTime ?? null,
      },
      state,
      files: fileRows,
    });
  } catch (err) {
    console.error("[api/admin/users/:uid] GET failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: Params): Promise<Response> {
  let caller: { uid: string };
  try {
    caller = await requireAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/users/:uid] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const { uid } = await ctx.params;
  if (!uid) {
    return NextResponse.json({ error: "missing uid" }, { status: 400 });
  }
  if (uid === caller.uid) {
    return NextResponse.json(
      { error: "cannot delete your own account from the admin portal" },
      { status: 400 },
    );
  }

  let body: { confirm?: unknown } = {};
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (body.confirm !== uid) {
    return NextResponse.json(
      { error: "confirm must equal uid" },
      { status: 400 },
    );
  }

  const errors: string[] = [];

  try {
    const firestore = getAdminFirestore();
    await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
  } catch (err) {
    console.error("[api/admin/users/:uid] firestore delete failed:", err);
    errors.push("firestore");
  }

  try {
    const bucket = getAdminStorage().bucket();
    await bucket.deleteFiles({ prefix: `users/${uid}/`, force: true });
  } catch (err) {
    console.error("[api/admin/users/:uid] storage delete failed:", err);
    errors.push("storage");
  }

  try {
    await getAdminAuth().deleteUser(uid);
  } catch (err) {
    console.error("[api/admin/users/:uid] auth delete failed:", err);
    errors.push("auth");
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, partial: true, errors },
      { status: 207 },
    );
  }
  return NextResponse.json({ ok: true });
}
