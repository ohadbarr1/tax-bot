/**
 * firebase/admin.ts — server-side Firebase Admin init
 *
 * Used by API routes (`app/api/**`) that need to verify user tokens, read/write
 * Firestore from the server, or upload files to Cloud Storage under the user's
 * path. On Firebase App Hosting the Admin SDK picks up credentials automatically
 * from the runtime's Application Default Credentials — no service-account JSON
 * required. For local dev, set `GOOGLE_APPLICATION_CREDENTIALS` to a downloaded
 * service-account key or run `gcloud auth application-default login`.
 *
 * All exports are lazy: importing this module does not touch credentials. Call
 * `getAdminApp()` / `getAdminAuth()` / ... only from request handlers where
 * runtime env is guaranteed.
 */

import {
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  return initializeApp({
    credential: applicationDefault(),
    projectId:      process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:  process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}

/**
 * Verify a Firebase ID token sent in the `Authorization: Bearer <token>` header.
 * Returns the decoded token (including `uid`) or null on any verification error.
 */
export async function verifyIdToken(authHeader: string | null): Promise<{ uid: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}
