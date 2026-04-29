/**
 * firebase/client.ts — browser-side Firebase init
 *
 * Exposes singletons for Auth, Firestore, and Cloud Storage. All initialization
 * is lazy + idempotent so this module is safe to import from anywhere (including
 * SSR), with the client-only SDK objects only materializing on the browser.
 *
 * Env vars required (NEXT_PUBLIC_* because they are read from the browser):
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID (optional)
 *
 * On Firebase App Hosting these are injected automatically from `apphosting.yaml`
 * env config. For local dev, copy `.env.local.example` → `.env.local`.
 */

import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import {
  initializeAuth,
  getAuth,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig: FirebaseOptions = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * True when every required env var is set. Build succeeds even without them —
 * client code can call `isFirebaseConfigured()` to gracefully no-op on dev
 * machines that don't have a Firebase project connected yet.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.appId
  );
}

let _app: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!isFirebaseConfigured()) return null;
  if (_app) return _app;
  _app = getApps()[0] ?? initializeApp(firebaseConfig);
  // Init App Check exactly once per app — see initAppCheck() below for the
  // reCAPTCHA-v3 + debug-token rationale.
  initAppCheck(_app);
  return _app;
}

// ─── Firebase App Check (security-F1.1.4 / F1.3.2) ───────────────────────────
//
// App Check attests every Firebase backend call (Auth, Firestore, Storage,
// Functions) as coming from a real instance of THIS web app, not a `curl`
// from someone's laptop. We use the reCAPTCHA v3 provider (free tier — the
// Enterprise variant is paid). The site key is public-by-design (it's
// embedded in the page anyway) and lives in `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.
//
// Local dev / Firebase emulator path:
//   set `window.FIREBASE_APPCHECK_DEBUG_TOKEN = true` BEFORE this module
//   loads (we wire that via a `<script>` in dev only). The Firebase SDK then
//   issues a debug token, prints it to console once, and you whitelist it
//   in Firebase Console → App Check → Debug tokens. See DEPLOY.md.
//
// We tolerate missing env: when `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is unset,
// we skip App Check init and emit a single console warning so dev doesn't
// hard-break. Production CI must set the env.

let _appCheck: AppCheck | null = null;
function initAppCheck(app: FirebaseApp): void {
  if (_appCheck) return;
  if (typeof window === "undefined") return;

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    if (typeof console !== "undefined") {
      console.warn(
        "[firebase] NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not set — App Check is DISABLED. " +
          "See DEPLOY.md §App Check setup.",
      );
    }
    return;
  }

  try {
    _appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      // Auto-refresh the App Check token a few minutes before expiry so the
      // first call after a long idle does not pay the reCAPTCHA round-trip.
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // Initializing twice (e.g. HMR re-runs the module) throws — swallow that
    // silently. Anything else is logged for diagnostics.
    const code = (err as { code?: string } | null)?.code;
    if (code !== "appCheck/already-initialized") {
      console.warn("[firebase] initializeAppCheck failed:", err);
    }
  }
}

/** Exposed for testing / forced re-init scenarios. May return null in SSR. */
export function getClientAppCheck(): AppCheck | null {
  return _appCheck;
}

// HMR-safe auth cache. `initializeAuth` throws `auth/already-initialized`
// on second call, but Next.js hot-reload can re-execute this module without
// tearing down the previous `FirebaseApp`. We lazily construct once and
// fall back to `getAuth()` if we hit the already-initialized error.
let _auth: Auth | null = null;
export function getClientAuth(): Auth | null {
  if (_auth) return _auth;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    // Persistence list: try IndexedDB first (survives page reload and
    // incognito restart), then localStorage, then sessionStorage, then
    // in-memory. Firebase walks the list and picks the first usable backend;
    // IDB has been observed to hang on some privacy-hardened browsers, which
    // is why we provide real fallbacks instead of IDB-only.
    // `popupRedirectResolver` MUST be provided when using `initializeAuth` if
     // the app uses signInWithPopup / signInWithRedirect / getRedirectResult.
     // Without it Firebase throws `auth/argument-error` on every popup/redirect
     // call. `getAuth` wires this implicitly; `initializeAuth` does not.
    _auth = initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "auth/already-initialized") {
      _auth = getAuth(app);
    } else {
      // Unexpected init failure — last-ditch fall back to default Auth so
      // the app doesn't hard-break. Logged for diagnostics.
      console.warn("[firebase] initializeAuth failed, falling back to getAuth:", err);
      _auth = getAuth(app);
    }
  }
  return _auth;
}

export function getClientFirestore(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export function getClientStorage(): FirebaseStorage | null {
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}
