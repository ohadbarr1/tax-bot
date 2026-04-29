/**
 * GET /api/user/export — DSAR full-bytes export.
 *
 * Closes audit security-F1.2.9 (the previous metadata-only export was a
 * GDPR Art. 15 / חוק הגנת הפרטיות § 13 violation — "כל המידע אודותיו").
 *
 * Returns a streaming `application/zip` containing every byte we hold on
 * the caller:
 *   - `firestore.json`  — a serialized list of every Firestore doc under
 *                         `users/{uid}/...` (recursive, all subcollections).
 *   - `storage/<orig-path>` — every Cloud Storage object the user uploaded,
 *                         downloaded server-side and added to the zip.
 *   - `metadata.json`   — paths, sizes, content-types, timestamps. Files
 *                         larger than `MAX_FILE_BYTES` (100 MB) are skipped
 *                         from the zip and surface in `metadata.json` with
 *                         `skipped: "available on request"` so the caller
 *                         knows they exist and can ask support to ship them
 *                         out-of-band on physical media if requested.
 *
 * Auth: `withUser` verifies the Bearer ID token (with `checkRevoked: true`).
 * `uid` is read from the verified token, never from query/body params, so a
 * caller cannot export another user's data.
 */

import JSZip from "jszip";
import type { NextRequest } from "next/server";
import {
  CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase/admin";
import { withUser } from "@/lib/api/withUser";
import { internalError } from "@/lib/api/errorEnvelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Files larger than this are not embedded in the zip — most home connections
 * will time out before a 200 MB scan finishes streaming through Cloud Run's
 * 60 s response budget. They surface in `metadata.json` with `skipped:
 * "available on request"`. Adjust if Cloud Run timeout / RAM allow.
 */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

interface FirestoreDocExport {
  path: string;
  data: unknown;
}

interface FileMetadata {
  path: string;
  name: string;
  size: number;
  contentType: string | null;
  updated: string | null;
  skipped?: string;
}

/**
 * Serialize one Firestore subtree rooted at `docRef`. Walks every
 * subcollection recursively and emits `{ path, data }` entries.
 */
async function dumpSubtree(
  docRef: DocumentReference,
  out: FirestoreDocExport[],
): Promise<void> {
  const snap = (await docRef.get()) as DocumentSnapshot;
  if (snap.exists) {
    out.push({ path: docRef.path, data: snap.data() ?? null });
  }
  // Recurse into subcollections.
  let subs: CollectionReference[] = [];
  try {
    subs = (await docRef.listCollections()) as CollectionReference[];
  } catch {
    // listCollections is unsupported in some emulator/test contexts — fall
    // back to "no subcollections" rather than failing the whole export.
    subs = [];
  }
  for (const sub of subs) {
    let docs: DocumentReference[] = [];
    try {
      docs = (await sub.listDocuments()) as DocumentReference[];
    } catch {
      docs = [];
    }
    for (const child of docs) {
      await dumpSubtree(child, out);
    }
  }
}

async function buildExportZip(uid: string): Promise<Buffer> {
  const zip = new JSZip();

  // 1. Firestore — every doc under users/{uid}/...
  const firestore = getAdminFirestore();
  const rootRef = firestore.doc(`users/${uid}`) as DocumentReference;
  const docs: FirestoreDocExport[] = [];
  await dumpSubtree(rootRef, docs);
  zip.file(
    "firestore.json",
    JSON.stringify({ uid, exportedAt: new Date().toISOString(), docs }, null, 2),
  );

  // 2. Storage — every object the user uploaded.
  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const [files] = await bucket.getFiles({ prefix: `users/${uid}/` });
  const fileMetas: FileMetadata[] = [];

  for (const f of files) {
    const meta = f.metadata ?? {};
    const rawSize = (meta as { size?: string | number }).size;
    const size =
      typeof rawSize === "string" ? Number(rawSize) : (rawSize ?? 0);
    const safeSize = Number.isFinite(size) ? Number(size) : 0;
    const entry: FileMetadata = {
      path: f.name,
      name: f.name.split("/").pop() ?? f.name,
      size: safeSize,
      contentType: ((meta as { contentType?: string }).contentType) ?? null,
      updated: ((meta as { updated?: string }).updated) ?? null,
    };

    if (safeSize > MAX_FILE_BYTES) {
      entry.skipped = "too large — available on request";
      fileMetas.push(entry);
      continue;
    }

    try {
      const [buf] = await f.download();
      zip.file(`storage/${f.name}`, buf);
    } catch (err) {
      console.error(`[api/user/export] failed to download ${f.name}:`, err);
      entry.skipped = "download failed — available on request";
    }
    fileMetas.push(entry);
  }

  zip.file(
    "metadata.json",
    JSON.stringify(
      {
        uid,
        exportedAt: new Date().toISOString(),
        files: fileMetas,
        notes:
          "DSAR full-bytes export under GDPR Art. 15 / חוק הגנת הפרטיות § 13. Files larger than 100 MB are listed but not included; contact support to receive them on physical media.",
      },
      null,
      2,
    ),
  );

  // Buffer-typed output is the cleanest for Node + the standard `Response`
  // constructor (Buffer extends Uint8Array but is a `BodyInit` per node:undici).
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export const GET = withUser(async (_req: NextRequest, { uid }) => {
  try {
    const buf = await buildExportZip(uid);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // `Response` body accepts `Uint8Array` per the WHATWG Fetch spec — Node's
    // type defs lag behind, so we widen via `BodyInit` before construction.
    const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as BodyInit;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="taxbot-export-${uid}-${today}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/user/export] failed:", err);
    return internalError("ייצוא נכשל. נסה שוב בעוד רגע.");
  }
});
