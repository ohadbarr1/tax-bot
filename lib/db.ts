/**
 * db.ts — persistent state layer, backed by Cloud Firestore
 *
 * Single Firestore document per user at: `users/{uid}/private/state`. The
 * entire `AppState` (taxpayer profile, financials, draft forms, etc.) is
 * serialized into one document — small, atomic, no relational joins needed.
 *
 * Public API (unchanged from the prior IndexedDB implementation, so
 * `lib/appContext.tsx` needs zero changes):
 *
 *   saveState(state)   — write the current AppState to the active user's doc
 *   loadState()        — read it back (returns null if no doc exists yet)
 *   clearState()       — delete the doc (used by "reset account")
 *
 * Graceful degradation:
 *   • SSR              → no-op (Firestore client is browser-only here)
 *   • Unconfigured env → no-op (in-memory fallback so local dev + tests work
 *                        without a live Firebase project)
 *   • No signed-in user → no-op (waits for AuthProvider to finish hydration)
 *
 * IMPORTANT: auth is anonymous-by-default (see lib/firebase/authContext.tsx).
 * That means every visitor gets a stable `uid` automatically, so `saveState`
 * always has a path to write to — no login wall on the questionnaire flow.
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import type { AppState, AdvisorMessage } from "@/types";
import {
  getClientAuth,
  getClientFirestore,
  isFirebaseConfigured,
} from "./firebase/client";

const SUBCOLLECTION = "private";
const DOC_ID        = "state";
const ADVISOR_SUBCOLLECTION = "advisor"; // users/{uid}/advisor/{draftId}
const SCHEMA_VERSION = 2;

/** Current signed-in user's uid, or null if auth not ready / unconfigured. */
function currentUid(): string | null {
  const auth = getClientAuth();
  return auth?.currentUser?.uid ?? null;
}

/**
 * Wait for the Firebase auth state to resolve to a non-null user (our
 * AuthProvider signs in anonymously on mount, so every session eventually
 * has a uid). Resolves to `null` if Firebase isn't configured or auth is
 * still pending after the timeout — callers treat null as "no-op".
 */
function waitForUser(timeoutMs = 5000): Promise<User | null> {
  const auth = getClientAuth();
  if (!auth) return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(null);
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        clearTimeout(timer);
        unsub();
        resolve(u);
      }
    });
  });
}

/** Persist AppState to Firestore. No-op on SSR / unconfigured / no-user.
 *
 * Schema v2 (Phase 2 §2.E partial): advisorHistory is split into a
 * subcollection at users/{uid}/advisor/{draftId} so the main state doc stays
 * comfortably under the 1 MiB Firestore cap regardless of message count.
 * Other fields stay in the single doc — they're bounded by user inputs.
 */
export async function saveState(state: AppState): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isFirebaseConfigured()) return;

  const db  = getClientFirestore();
  const uid = currentUid();
  if (!db || !uid) return;

  try {
    // Split advisorHistory off — written separately under /advisor/{draftId}.
    const { advisorHistory, ...rest } = state;
    const ref = doc(db, "users", uid, SUBCOLLECTION, DOC_ID);
    await setDoc(
      ref,
      {
        // Strip any `undefined` recursively — Firestore rejects them.
        state: stripUndefined(rest as AppState),
        schema_version: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );

    // Fan advisor history into per-draft subcollection docs. Each draft is
    // its own doc → still atomic-per-draft, scoped well under the 1 MiB cap.
    if (advisorHistory && Object.keys(advisorHistory).length > 0) {
      const batch = writeBatch(db);
      for (const [draftId, messages] of Object.entries(advisorHistory)) {
        const advisorRef = doc(db, "users", uid, ADVISOR_SUBCOLLECTION, draftId);
        batch.set(advisorRef, {
          messages: stripUndefined(messages),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn("[db] saveState failed:", err);
  }
}

/** Load AppState from Firestore. Returns null if no doc or on failure.
 *
 * Schema v2: merges the main state doc with advisor history loaded from the
 * /advisor subcollection. Falls back to legacy state.advisorHistory for
 * users that haven't yet been re-saved under v2 — they migrate transparently
 * on their next save.
 */
export async function loadState(): Promise<AppState | null> {
  if (typeof window === "undefined") return null;
  if (!isFirebaseConfigured()) return null;

  const db   = getClientFirestore();
  const user = await waitForUser();
  const uid  = user?.uid ?? null;
  if (!db || !uid) return null;

  try {
    const ref  = doc(db, "users", uid, SUBCOLLECTION, DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    const baseState = (data?.state as AppState) ?? null;
    if (!baseState) return null;

    // Pull advisor history from subcollection. Per-draft doc; missing → empty.
    const advisorHistory: Record<string, AdvisorMessage[]> = {};
    try {
      const advisorSnap = await getDocs(
        collection(db, "users", uid, ADVISOR_SUBCOLLECTION),
      );
      for (const d of advisorSnap.docs) {
        const docData = d.data() as { messages?: AdvisorMessage[] };
        if (Array.isArray(docData.messages)) {
          advisorHistory[d.id] = docData.messages;
        }
      }
    } catch (err) {
      // Advisor split is non-fatal — keep loading even if subcollection read fails.
      console.warn("[db] advisor subcollection read failed:", err);
    }

    // Backwards-compat: pre-v2 docs stored advisorHistory inside `state`.
    // Prefer subcollection (v2 truth); fall back to legacy field.
    const merged: AppState = {
      ...baseState,
      advisorHistory:
        Object.keys(advisorHistory).length > 0
          ? advisorHistory
          : baseState.advisorHistory ?? {},
    };
    return merged;
  } catch (err) {
    console.warn("[db] loadState failed:", err);
    return null;
  }
}

/** Delete the persisted state for the current user, including the advisor
 * subcollection (Schema v2). Best-effort — partial failures are logged. */
export async function clearState(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isFirebaseConfigured()) return;

  const db  = getClientFirestore();
  const uid = currentUid();
  if (!db || !uid) return;

  try {
    const ref = doc(db, "users", uid, SUBCOLLECTION, DOC_ID);
    await deleteDoc(ref);
  } catch (err) {
    console.warn("[db] clearState failed:", err);
  }

  try {
    const advisorSnap = await getDocs(
      collection(db, "users", uid, ADVISOR_SUBCOLLECTION),
    );
    if (!advisorSnap.empty) {
      const batch = writeBatch(db);
      for (const d of advisorSnap.docs) batch.delete(d.ref);
      await batch.commit();
    }
  } catch (err) {
    console.warn("[db] clearState advisor cleanup failed:", err);
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Firestore throws on any `undefined` field value. Recursively strip them from
 * the serialized state. `null` is allowed and preserved.
 */
function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefined(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out as T;
}
