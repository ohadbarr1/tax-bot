/**
 * lib/admin/isAdmin.ts — server-only admin gate.
 *
 * A user is an admin iff a document exists at `admins/{uid}` in Firestore.
 * The `admins` collection is writable only from the Firebase Console / Admin
 * SDK — see `firestore.rules` for the `allow read, write: if false` rule on
 * that collection.
 *
 * Exports:
 *   - isAdmin(uid)       → boolean. Pure Firestore lookup.
 *   - requireAdmin(req)  → { uid } | throws AdminAuthError with a status hint
 *                          (401/403). API routes catch and surface as HTTP.
 *
 * NEVER import this file from a client component — it pulls in firebase-admin.
 */

import { getAdminFirestore, verifyIdToken } from "@/lib/firebase/admin";

/** Thrown by `requireAdmin` — carries an HTTP status hint for the caller. */
export class AdminAuthError extends Error {
  readonly status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

/**
 * Check whether a uid is in the `admins` collection. Returns `false` on
 * lookup errors so a transient Firestore hiccup can't elevate an anon user.
 */
export async function isAdmin(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const firestore = getAdminFirestore();
    const snap = await firestore.doc(`admins/${uid}`).get();
    return snap.exists;
  } catch (err) {
    console.warn("[admin] isAdmin lookup failed:", err);
    return false;
  }
}

/**
 * Verify the bearer token on an incoming request AND confirm the user is in
 * the admin allow-list. Throws `AdminAuthError` with `status: 401` if the
 * token is missing/invalid, `403` if the user is not an admin.
 *
 * Accepts either a `Request`/`NextRequest` OR the raw Authorization header
 * value so route handlers can call it with either shape.
 */
export async function requireAdmin(
  reqOrHeader: Request | string | null,
): Promise<{ uid: string }> {
  const authHeader = typeof reqOrHeader === "string" || reqOrHeader === null
    ? reqOrHeader
    : reqOrHeader.headers.get("authorization");

  const decoded = await verifyIdToken(authHeader);
  if (!decoded) {
    throw new AdminAuthError("missing or invalid bearer token", 401);
  }
  const allowed = await isAdmin(decoded.uid);
  if (!allowed) {
    throw new AdminAuthError("not an admin", 403);
  }
  return { uid: decoded.uid };
}
