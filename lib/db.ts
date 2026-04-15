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
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import type { AppState } from "@/types";
import {
  getClientAuth,
  getClientFirestore,
  isFirebaseConfigured,
} from "./firebase/client";

const SUBCOLLECTION = "private";
const DOC_ID        = "state";

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

/** Persist AppState to Firestore. No-op on SSR / unconfigured / no-user. */
export async function saveState(state: AppState): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isFirebaseConfigured()) return;

  const db  = getClientFirestore();
  const uid = currentUid();
  if (!db || !uid) return;

  try {
    const ref = doc(db, "users", uid, SUBCOLLECTION, DOC_ID);
    await setDoc(
      ref,
      {
        // Strip any `undefined` recursively — Firestore rejects them.
        state: stripUndefined(state),
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );
  } catch (err) {
    console.warn("[db] saveState failed:", err);
  }
}

/** Load AppState from Firestore. Returns null if no doc or on failure. */
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
    return (data?.state as AppState) ?? null;
  } catch (err) {
    console.warn("[db] loadState failed:", err);
    return null;
  }
}

/** Delete the persisted state for the current user. */
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
