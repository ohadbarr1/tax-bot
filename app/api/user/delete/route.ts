/**
 * DELETE /api/user/delete — idempotent account-deletion reconciler.
 *
 * Closes audit architecture-F-15. The previous implementation returned 207
 * Multi-Status with `failed: ["storage"]` on partial failure and left the
 * user stuck in a half-deleted state with no resume path.
 *
 * The new flow is a state machine:
 *
 *   1. On first call we write a marker doc at
 *      `users/{uid}/private/_deletion` with `{ requestedAt }`.
 *      *We write this BEFORE we begin destructive work* so a retry can
 *      always find the marker even if step 1 partially completes — the
 *      `_deletion` doc lives at a stable path that survives recursiveDelete
 *      because we re-create it after each successful step.
 *   2. Step Firestore: `recursiveDelete(users/{uid})` then re-write the
 *      `_deletion` doc with `firestoreDoneAt`. Idempotent — running it
 *      again on an already-empty subtree is a no-op.
 *   3. Step Storage: `bucket.deleteFiles({ prefix: users/{uid}/ })`. On
 *      success persist `storageDoneAt`. Idempotent — re-running on an
 *      empty prefix is a no-op.
 *   4. Step Auth: `getAuth().deleteUser(uid)`. Idempotent under the firebase
 *      Admin SDK — `auth/user-not-found` is treated as success.
 *   5. Once all three steps complete we delete the `_deletion` marker and
 *      return 204.
 *   6. If any step errors we persist the error in `errors[]` on the marker
 *      and return 207 with the in-progress shape so the client can offer
 *      "המחיקה בעיצומה — לחץ להמשך."
 *
 * Auth: `withUser` verifies the Bearer ID token (with `checkRevoked: true`).
 * Confirm word: body must contain `{ confirm: "מחק" }`.
 */

import type { NextRequest } from "next/server";
import {
  getAdminAuth,
  getAdminFirestore,
  getAdminStorage,
} from "@/lib/firebase/admin";
import { withUser } from "@/lib/api/withUser";
import { auditLog } from "@/lib/audit/auditEvents";
import { invalidInput, unauthorized } from "@/lib/api/errorEnvelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_WORD = "מחק";

interface DeletionStateError {
  step: "firestore" | "storage" | "auth";
  message: string;
  at: string;
}

export interface DeletionState {
  requestedAt: string;
  firestoreDoneAt?: string | null;
  storageDoneAt?: string | null;
  authDoneAt?: string | null;
  errors: DeletionStateError[];
}

function deletionDocPath(uid: string): string {
  return `users/${uid}/private/_deletion`;
}

async function readState(uid: string): Promise<DeletionState | null> {
  const firestore = getAdminFirestore();
  const snap = await firestore.doc(deletionDocPath(uid)).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<DeletionState> | undefined;
  if (!data?.requestedAt) return null;
  return {
    requestedAt: data.requestedAt,
    firestoreDoneAt: data.firestoreDoneAt ?? null,
    storageDoneAt: data.storageDoneAt ?? null,
    authDoneAt: data.authDoneAt ?? null,
    errors: Array.isArray(data.errors) ? data.errors : [],
  };
}

async function writeState(uid: string, patch: Partial<DeletionState>): Promise<void> {
  const firestore = getAdminFirestore();
  await firestore.doc(deletionDocPath(uid)).set(patch, { merge: true });
}

async function clearState(uid: string): Promise<void> {
  const firestore = getAdminFirestore();
  try {
    await firestore.doc(deletionDocPath(uid)).delete();
  } catch (err) {
    // The doc lives under `users/{uid}` which we recursively deleted — it
    // may already be gone. Best-effort.
    console.warn("[api/user/delete] clearState noop:", err);
  }
}

async function appendError(uid: string, err: DeletionStateError): Promise<void> {
  // Read-modify-write — `errors` is always a small array (≤ a handful), so
  // we don't need arrayUnion semantics, and avoiding `FieldValue.arrayUnion`
  // keeps the route trivially testable without a Firestore-emulator-aware
  // mock layer.
  const cur = await readState(uid);
  const errors = [...(cur?.errors ?? []), err];
  await writeState(uid, { errors });
}

async function runFirestoreStep(uid: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const firestore = getAdminFirestore();
    // Recursively delete users/{uid} — this also deletes the `_deletion`
    // marker we just wrote at users/{uid}/private/_deletion. We re-write
    // the marker immediately after so subsequent steps still have state.
    await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
    // Re-establish the marker (now with firestoreDoneAt) so retries see
    // progress.
    const now = new Date().toISOString();
    await writeState(uid, {
      requestedAt: now,
      firestoreDoneAt: now,
      errors: [],
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "firestore delete failed";
    console.error("[api/user/delete] firestore step failed:", err);
    return { ok: false, message };
  }
}

async function runStorageStep(uid: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const bucket = getAdminStorage().bucket();
    await bucket.deleteFiles({ prefix: `users/${uid}/`, force: true });
    await writeState(uid, { storageDoneAt: new Date().toISOString() });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "storage delete failed";
    console.error("[api/user/delete] storage step failed:", err);
    return { ok: false, message };
  }
}

async function runAuthStep(uid: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await getAdminAuth().deleteUser(uid);
    await writeState(uid, { authDoneAt: new Date().toISOString() });
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "auth/user-not-found") {
      await writeState(uid, { authDoneAt: new Date().toISOString() });
      return { ok: true };
    }
    const message = err instanceof Error ? err.message : "auth delete failed";
    console.error("[api/user/delete] auth step failed:", err);
    return { ok: false, message };
  }
}

export const DELETE = withUser(async (request: NextRequest, { uid, requestId }) => {
  if (!uid) return unauthorized();

  let parsed: { confirm?: unknown } = {};
  try {
    parsed = (await request.json()) as { confirm?: unknown };
  } catch {
    return invalidInput("invalid JSON body");
  }
  if (parsed.confirm !== CONFIRM_WORD) {
    return invalidInput(`confirm must equal "${CONFIRM_WORD}"`);
  }

  // Establish (or read-through) the state-machine doc.
  let state = await readState(uid);
  if (!state) {
    const requestedAt = new Date().toISOString();
    await writeState(uid, { requestedAt, errors: [] });
    state = { requestedAt, errors: [] };
  }

  const failed: string[] = [];

  // 1. Firestore — only run if not already done.
  if (!state.firestoreDoneAt) {
    const r = await runFirestoreStep(uid);
    if (!r.ok) {
      await appendError(uid, {
        step: "firestore",
        message: r.message,
        at: new Date().toISOString(),
      });
      failed.push("firestore");
    } else {
      state = (await readState(uid)) ?? state;
    }
  }

  // 2. Storage — only attempt if Firestore succeeded.
  if (state.firestoreDoneAt && !state.storageDoneAt) {
    const r = await runStorageStep(uid);
    if (!r.ok) {
      await appendError(uid, {
        step: "storage",
        message: r.message,
        at: new Date().toISOString(),
      });
      failed.push("storage");
    } else {
      state = (await readState(uid)) ?? state;
    }
  }

  // 3. Auth — last, only if Firestore + Storage are both done. If we delete
  //    Auth before everything else is confirmed clean, the user can never
  //    sign back in to retry.
  if (state.firestoreDoneAt && state.storageDoneAt && !state.authDoneAt) {
    const r = await runAuthStep(uid);
    if (!r.ok) {
      await appendError(uid, {
        step: "auth",
        message: r.message,
        at: new Date().toISOString(),
      });
      failed.push("auth");
    } else {
      state = (await readState(uid)) ?? state;
    }
  }

  const allDone =
    !!state.firestoreDoneAt && !!state.storageDoneAt && !!state.authDoneAt;

  if (allDone) {
    await clearState(uid);
    void auditLog({ uid, requestId, action: "user_data_deleted" });
    return new Response(null, { status: 204 });
  }

  // Partial — surface the in-progress shape so the UI can offer "resume".
  const body = JSON.stringify({
    ok: false,
    partial: true,
    failed,
    state: {
      requestedAt: state.requestedAt,
      firestoreDoneAt: state.firestoreDoneAt ?? null,
      storageDoneAt: state.storageDoneAt ?? null,
      authDoneAt: state.authDoneAt ?? null,
      errors: state.errors,
    },
  });
  return new Response(body, {
    status: 207,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});
