/**
 * firebase/storage.ts — Cloud Storage helpers
 *
 * All uploaded tax documents live under:
 *   gs://<bucket>/users/{uid}/documents/{docKind}/{timestamp}_{filename}
 *
 * `uploadUserDocument` is the single entry point — it grabs the current uid
 * from auth, builds a scoped path, uploads the file, and returns both the
 * storage path (for Firestore references) and a download URL (for UI preview).
 *
 * Gracefully no-ops when Firebase isn't configured — caller can proceed with
 * in-memory parsing only.
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getClientAuth, getClientStorage, isFirebaseConfigured } from "./client";

export type DocKind =
  | "form-106"
  | "form-161"
  | "form-867"
  | "form-1301"
  | "form-1322"
  | "ibkr"
  | "other";

export interface UploadResult {
  /** Firebase Storage path (e.g. "users/abc/documents/form-106/1700000000_slip.pdf"). */
  path: string;
  /** Signed download URL usable in <a href> / <img src>. */
  url: string;
}

/**
 * Upload a File/Blob to Cloud Storage under the current user's folder.
 * Returns `null` when Firebase is unconfigured or auth hasn't resolved yet.
 */
export async function uploadUserDocument(
  file: File | Blob,
  kind: DocKind,
  originalName?: string
): Promise<UploadResult | null> {
  if (typeof window === "undefined") return null;
  if (!isFirebaseConfigured()) return null;

  const storage = getClientStorage();
  const auth    = getClientAuth();
  const uid     = auth?.currentUser?.uid;
  if (!storage || !uid) return null;

  const safeName = sanitizeFilename(originalName ?? (file instanceof File ? file.name : "upload"));
  const path     = `users/${uid}/documents/${kind}/${Date.now()}_${safeName}`;
  const fileRef  = ref(storage, path);

  try {
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    return { path, url };
  } catch (err) {
    console.warn("[storage] upload failed:", err);
    return null;
  }
}

/** Strip path separators and control chars from a filename. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\/\\]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .slice(0, 200);
}
