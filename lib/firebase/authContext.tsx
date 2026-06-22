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
 * Popup handling:
 *   `signInWithPopup` / `linkWithPopup` on Chrome sometimes never resolves in
 *   the parent window because COOP blocks `window.opener.postMessage`. We
 *   wrap every popup call in `withPopupTimeout` (15s), and on any timeout /
 *   blocked-popup error fall back to `signInWithRedirect`. On mount we call
 *   `getRedirectResult` to drain the result of any in-flight redirect from
 *   a prior page load.
 *
 * Consumers use `useAuth()` to read
 * `{ user, ready, linkGoogle, signOut, authError, dismissAuthError }`.
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
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  type User,
  type Auth,
} from "firebase/auth";
import { getClientAuth, isFirebaseConfigured } from "./client";

interface AuthContextValue {
  /** Current Firebase user (anonymous or linked). `null` before ready or when unconfigured. */
  user: User | null;
  /** True once the initial auth state has been resolved. */
  ready: boolean;
  /**
   * True only after the FIRST `onAuthStateChanged` callback has fired (i.e.
   * IDB persistence has been read and `user` reflects reality). Unlike
   * `ready` — which we set immediately on subscribe to unblock the /welcome
   * spinner when IDB hangs — this stays `false` until Firebase has actually
   * resolved the user. Gates that must not false-redirect anon-looking
   * sessions (e.g. `AdminShell`) should wait on this.
   */
  authResolved: boolean;
  /** True when Firebase env is set. When false the app runs in local-only mode. */
  configured: boolean;
  /** Link the current anonymous account to a Google account, or sign in with Google. */
  linkGoogle: () => Promise<void>;
  /** Sign out and immediately re-anon-sign-in so the uid churns. */
  signOut: () => Promise<void>;
  /** Current auth error as a Hebrew user-facing message. `null` when none. */
  authError: string | null;
  /** Clear `authError`. Called by the toast on dismiss. */
  dismissAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Popup timeout helper ────────────────────────────────────────────────────

/**
 * Race a popup-based auth call against a 15s timeout. If the popup never
 * resolves (e.g. Chrome COOP eats the `postMessage` from the auth handler),
 * reject with `auth/popup-timeout` so the caller can fall back to redirect.
 *
 * Exported for unit tests.
 */
export function withPopupTimeout<T>(p: Promise<T>, ms = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error("popup timed out"), { code: "auth/popup-timeout" }));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Firebase error codes that mean "popup-style sign-in won't work — use redirect". */
const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/popup-timeout",
  "auth/web-storage-unsupported",
]);

/** Map a Firebase auth error code to a short Hebrew message. */
function hebrewMessageFor(code: string | undefined): string {
  switch (code) {
    case "auth/popup-timeout":
    case "auth/popup-blocked":
    case "auth/cancelled-popup-request":
    case "auth/popup-closed-by-user":
      return "מתחבר דרך הפנייה מחדש…";
    case "auth/network-request-failed":
      return "אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב.";
    case "auth/too-many-requests":
      return "יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.";
    case "auth/user-disabled":
      return "החשבון הזה הושבת.";
    case "auth/web-storage-unsupported":
      return "הדפדפן שלך חוסם אחסון מקומי. אפשר cookies ונסה שוב.";
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use":
      return "החשבון הזה כבר משויך למשתמש אחר. נתחבר אליו…";
    default:
      return "לא ניתן להתחבר כרגע. נסה שוב בעוד רגע.";
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  const dismissAuthError = useCallback(() => setAuthError(null), []);

  useEffect(() => {
    const auth = getClientAuth();
    if (!auth) {
      // Unconfigured → finish hydration so UI can render
      setReady(true);
      setAuthResolved(true);
      return;
    }

    // Resolve `ready` immediately on subscribe — not inside the callback.
    // Firebase Auth blocks its first `onAuthStateChanged` emit on IndexedDB
    // persistence init, which can hang indefinitely (observed: stuck-open
    // `firebaseLocalStorageDb` after hot reload / rollout). Setting ready
    // here means AuthGate falls through to SignInPrompt; when/if the
    // callback eventually fires, setUser re-renders into the real content.
    setReady(true);

    // Drain any pending redirect result from a prior signInWithRedirect /
    // linkWithRedirect. On the success path the normal onAuthStateChanged
    // callback fires with the upgraded user; this call mostly exists to
    // surface errors (network / popup-still-blocked / linked-to-other-uid).
    getRedirectResult(auth)
      .catch((err: unknown) => {
        const code = (err as { code?: string } | null)?.code;
        if (code && code !== "auth/no-auth-event") {
          console.warn("[auth] getRedirectResult error:", err);
          setAuthError(hebrewMessageFor(code));
        }
      });

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthResolved(true);
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
    if (!auth) return;
    const provider = new GoogleAuthProvider();

    // Strict save model ("discard pre-login work"): ALWAYS sign in fresh —
    // never link the anonymous uid. A plain sign-in flips the Firebase uid, so
    // AppContext re-hydrates from the Google account and the pre-login anon
    // scratch (drafts + uploaded blobs) is dropped by design. There is no
    // anon→Google merge, so the credential-already-in-use collision can't
    // happen here anymore. The orphaned anon Firestore/Storage is throwaway.
    //
    // (Naming kept as `linkGoogle` so existing callers/UI don't churn.)
    try {
      await withPopupTimeout(signInWithPopup(auth, provider));
      setAuthError(null);
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;

      // Popup blocked / unsupported → fall back to a full-page redirect.
      if (code && POPUP_FALLBACK_CODES.has(code)) {
        setAuthError(hebrewMessageFor(code));
        try {
          await signInWithRedirect(auth, provider);
        } catch (err2) {
          console.error("[auth] redirect sign-in failed:", err2);
          setAuthError(hebrewMessageFor((err2 as { code?: string } | null)?.code));
        }
        return;
      }

      // Any other error — surface via toast and rethrow so the caller's
      // optimistic UI rollback still works.
      console.error("[auth] Google sign-in failed:", err);
      setAuthError(hebrewMessageFor(code));
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getClientAuth();
    if (!auth) return;

    // Server-side revoke FIRST (security-F1.1.3): hit `/api/user/sign-out`
    // with the current bearer token so any in-flight ID token (incl. ones
    // already cached in IndexedDB or scraped via XSS) becomes useless on
    // the next API call. We do this BEFORE `fbSignOut(auth)` because once
    // fbSignOut runs, `currentUser.getIdToken()` returns null and we cannot
    // attach the bearer header.
    //
    // Best-effort — never block sign-out on a network failure: the local
    // `fbSignOut` is the user-facing "I'm out" guarantee, and the next
    // page load reissues an anon uid anyway.
    const current = auth.currentUser;
    if (current) {
      try {
        const token = await current.getIdToken(/* forceRefresh */ false);
        await fetch("/api/user/sign-out", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.warn("[auth] server-side revoke failed (continuing):", err);
      }
    }

    await fbSignOut(auth);
    // onAuthStateChanged will trigger a fresh anonymous sign-in
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, ready, authResolved, configured, linkGoogle, signOut, authError, dismissAuthError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Re-export for tests that don't want to go through the context.
export type { Auth };
