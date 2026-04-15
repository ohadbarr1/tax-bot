"use client";

/**
 * authContext.tsx — React context wrapping Firebase Auth
 *
 * Strategy:
 *   1. On mount, subscribe to `onAuthStateChanged`.
 *   2. If Firebase is unconfigured (missing env), set `user = null` and
 *      `ready = true` — the app keeps working in an unauthenticated fallback
 *      mode, and `db.ts` degrades to an in-memory no-op. This keeps local dev
 *      and the test suite functional without a live Firebase project.
 *   3. If configured and no user exists, sign in anonymously so every session
 *      gets a persistent `uid` that Firestore/Storage can scope by. Users can
 *      later link Google / email credentials to the same anonymous account,
 *      preserving all their data.
 *
 * Consumers use `useAuth()` to read `{ user, ready, linkGoogle, signOut }`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getClientAuth, isFirebaseConfigured } from "./client";

interface AuthContextValue {
  /** Current Firebase user (anonymous or linked). `null` before ready or when unconfigured. */
  user: User | null;
  /** True once the initial auth state has been resolved. */
  ready: boolean;
  /** True when Firebase env is set. When false the app runs in local-only mode. */
  configured: boolean;
  /** Link the current anonymous account to a Google account, or sign in with Google. */
  linkGoogle: () => Promise<void>;
  /** Sign out and immediately re-anon-sign-in so the uid churns. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    const auth = getClientAuth();
    if (!auth) {
      // Unconfigured → finish hydration so UI can render
      setReady(true);
      return;
    }

    // Resolve `ready` immediately on subscribe — not inside the callback.
    // Firebase Auth blocks its first `onAuthStateChanged` emit on IndexedDB
    // persistence init, which can hang indefinitely (observed: stuck-open
    // `firebaseLocalStorageDb` after hot reload / rollout). Setting ready
    // here means AuthGate falls through to SignInPrompt; when/if the
    // callback eventually fires, setUser re-renders into the real content.
    setReady(true);

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.warn("[auth] anonymous sign-in failed:", err);
        }
      }
    });

    return () => unsub();
  }, []);

  const linkGoogle = useCallback(async () => {
    const auth = getClientAuth();
    if (!auth || !auth.currentUser) return;
    const provider = new GoogleAuthProvider();
    try {
      // If currently anonymous, upgrade the account in place.
      if (auth.currentUser.isAnonymous) {
        await linkWithPopup(auth.currentUser, provider);
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      // credential-already-in-use: the Google account is already linked to a
      // different Firebase UID (usually: same user signed in previously on
      // another device, or anon→link was attempted twice). Drop the throwaway
      // anon session and sign in as the existing Google-linked user.
      const code = (err as { code?: string } | null)?.code;
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        try {
          await fbSignOut(auth);
          await signInWithPopup(auth, provider);
          return;
        } catch (err2) {
          console.error("[auth] fallback sign-in after link-collision failed:", err2);
          throw err2;
        }
      }
      // auth/cancelled-popup-request / popup-closed-by-user: benign, don't log.
      if (code !== "auth/cancelled-popup-request" && code !== "auth/popup-closed-by-user") {
        console.error("[auth] Google link failed:", err);
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getClientAuth();
    if (!auth) return;
    await fbSignOut(auth);
    // onAuthStateChanged will trigger a fresh anonymous sign-in
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, configured, linkGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
