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

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setReady(true);
      } else {
        // No user yet — sign in anonymously for a stable uid
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.warn("[auth] anonymous sign-in failed:", err);
          setReady(true);
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
      // If currently anonymous, upgrade the account in place
      if (auth.currentUser.isAnonymous) {
        await linkWithPopup(auth.currentUser, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      console.error("[auth] Google link failed:", err);
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
