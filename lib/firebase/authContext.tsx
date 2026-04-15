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
  linkWithPopup,
  linkWithRedirect,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  type User,
  type Auth,
  type UserCredential,
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
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  const dismissAuthError = useCallback(() => setAuthError(null), []);

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

    const tryRedirect = async (kind: "sign-in" | "link"): Promise<void> => {
      try {
        if (kind === "link" && auth.currentUser && auth.currentUser.isAnonymous) {
          await linkWithRedirect(auth.currentUser, provider);
          return;
        }
        await signInWithRedirect(auth, provider);
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        console.error("[auth] redirect fallback failed:", err);
        setAuthError(hebrewMessageFor(code));
        throw err;
      }
    };

    const runPopup = async (): Promise<UserCredential | void> => {
      // No currentUser → Firebase persistence hung before anon sign-in
      // completed. Skip the link step entirely and open the popup.
      if (!auth.currentUser) {
        return withPopupTimeout(signInWithPopup(auth, provider));
      }
      // If currently anonymous, upgrade the account in place.
      if (auth.currentUser.isAnonymous) {
        return withPopupTimeout(linkWithPopup(auth.currentUser, provider));
      }
      return withPopupTimeout(signInWithPopup(auth, provider));
    };

    try {
      await runPopup();
      setAuthError(null);
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;

      // credential-already-in-use: the Google account is already linked to a
      // different Firebase UID (usually: same user signed in previously on
      // another device, or anon→link was attempted twice). Drop the throwaway
      // anon session and sign in as the existing Google-linked user.
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        try {
          await fbSignOut(auth);
          await withPopupTimeout(signInWithPopup(auth, provider));
          setAuthError(null);
          return;
        } catch (err2) {
          const code2 = (err2 as { code?: string } | null)?.code;
          if (code2 && POPUP_FALLBACK_CODES.has(code2)) {
            setAuthError(hebrewMessageFor(code2));
            await tryRedirect("sign-in");
            return;
          }
          console.error("[auth] fallback sign-in after link-collision failed:", err2);
          setAuthError(hebrewMessageFor(code2));
          throw err2;
        }
      }

      // Popup failed in a way that redirect can recover from.
      if (code && POPUP_FALLBACK_CODES.has(code)) {
        setAuthError(hebrewMessageFor(code));
        const kind: "sign-in" | "link" =
          auth.currentUser?.isAnonymous ? "link" : "sign-in";
        // If we timed out on linkWithPopup, try linkWithRedirect first; if
        // that fails (or there's no currentUser), sign out anon and do a
        // plain signInWithRedirect so the user ends up in *some* account.
        try {
          await tryRedirect(kind);
          return;
        } catch {
          // Last-chance: drop anon, plain sign-in redirect.
          if (kind === "link") {
            try {
              await fbSignOut(auth);
              await tryRedirect("sign-in");
              return;
            } catch {
              // already reported via tryRedirect → setAuthError
              return;
            }
          }
          return;
        }
      }

      // Any other error — surface via toast and rethrow so the caller's
      // optimistic UI rollback still works.
      console.error("[auth] Google link failed:", err);
      setAuthError(hebrewMessageFor(code));
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
    <AuthContext.Provider
      value={{ user, ready, configured, linkGoogle, signOut, authError, dismissAuthError }}
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
