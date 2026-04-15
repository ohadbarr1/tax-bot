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
  initializeAuth,
  getAuth,
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
  return _app;
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
    _auth = initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
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
