/**
 * GET /api/user/deletion-status — read-only view on the deletion state machine.
 *
 * Companion to `/api/user/delete` (architecture-F-15). When a previous
 * delete call partially failed (e.g. Firestore done, Storage failed) the
 * delete handler persists a `users/{uid}/private/_deletion` doc tracking
 * which steps completed and which errored. This route surfaces that state
 * so the UI can offer a "המחיקה בעיצומה — לחץ להמשך." resume CTA.
 *
 * Auth: `withUser` verifies the Bearer ID token (with `checkRevoked: true`).
 * `uid` is taken from the verified token, never from query params.
 *
 * Response shape:
 *   - 200 `{ inProgress: false }` when no state-machine doc exists.
 *   - 200 `{ inProgress: true, requestedAt, firestoreDoneAt, storageDoneAt,
 *           authDoneAt, errors: [{ step, message, at }] }` otherwise.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { withUser } from "@/lib/api/withUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DeletionStateError {
  step: "firestore" | "storage" | "auth";
  message: string;
  at: string;
}

interface PersistedDeletionState {
  requestedAt?: string;
  firestoreDoneAt?: string | null;
  storageDoneAt?: string | null;
  authDoneAt?: string | null;
  errors?: DeletionStateError[];
}

export const GET = withUser(async (_req: NextRequest, { uid }) => {
  const firestore = getAdminFirestore();
  const snap = await firestore.doc(`users/${uid}/private/_deletion`).get();
  if (!snap.exists) {
    return NextResponse.json({ inProgress: false });
  }
  const data = (snap.data() as PersistedDeletionState | undefined) ?? {};
  if (!data.requestedAt) {
    // Doc exists but is malformed — treat as no in-progress deletion.
    return NextResponse.json({ inProgress: false });
  }
  return NextResponse.json({
    inProgress: true,
    requestedAt: data.requestedAt,
    firestoreDoneAt: data.firestoreDoneAt ?? null,
    storageDoneAt: data.storageDoneAt ?? null,
    authDoneAt: data.authDoneAt ?? null,
    errors: Array.isArray(data.errors) ? data.errors : [],
  });
});
