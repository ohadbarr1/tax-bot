/**
 * GET /api/user/export
 *
 * Returns a JSON download of the caller's full data:
 *   - Full persisted AppState (from `users/{uid}/private/state`)
 *   - Metadata for every file under `users/{uid}/` in Cloud Storage
 *     (path, name, size, contentType, updated) — NOT the raw bytes
 *
 * Auth: Bearer ID token (same as every other user-scoped API). Returns 401
 * if missing / invalid. Never returns another user's data — `uid` is read
 * from the verified token, never from query params.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportedDocument {
  path: string;
  name: string;
  size: number;
  contentType: string | null;
  updated: string | null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const decoded = await verifyIdToken(request.headers.get("authorization"));
  if (!decoded) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { uid } = decoded;

  try {
    const firestore = getAdminFirestore();
    const snap = await firestore.doc(`users/${uid}/private/state`).get();
    const state = snap.exists ? (snap.data()?.state ?? null) : null;

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const [files] = await bucket.getFiles({ prefix: `users/${uid}/` });
    const documents: ExportedDocument[] = files.map((f) => {
      const meta = f.metadata;
      const rawSize = meta?.size;
      const size = typeof rawSize === "string" ? Number(rawSize) : (rawSize ?? 0);
      return {
        path: f.name,
        name: f.name.split("/").pop() ?? f.name,
        size: Number.isFinite(size) ? size : 0,
        contentType: (meta?.contentType as string | undefined) ?? null,
        updated: (meta?.updated as string | undefined) ?? null,
      };
    });

    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        uid,
        state,
        documents,
      },
      null,
      2,
    );

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="taxback-export-${uid}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/user/export] failed:", err);
    return NextResponse.json({ error: "ייצוא נכשל. נסה שוב בעוד רגע." }, { status: 500 });
  }
}
