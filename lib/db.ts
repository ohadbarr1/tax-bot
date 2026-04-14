/**
 * db.ts — IndexedDB persistence layer via idb
 *
 * Wraps the idb library to provide typed get/set/clear operations for
 * the AppState. All operations are SSR-safe (no-op when window is undefined).
 *
 * Schema version history:
 *   v1 — initial: single "state" object store
 */

import { openDB, type IDBPDatabase } from "idb";
import type { AppState } from "@/types";

const DB_NAME    = "taxbot-v1";
const DB_VERSION = 1;
const STORE_NAME = "state";
const STATE_KEY  = "app";

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase | null> {
  // SSR guard — IndexedDB only exists in the browser
  if (typeof window === "undefined") return null;

  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });

  return _db;
}

/** Persist AppState to IndexedDB. No-op on SSR. */
export async function saveState(state: AppState): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put(STORE_NAME, state, STATE_KEY);
  } catch (err) {
    // Non-fatal — state lives in memory even if persistence fails
    console.warn("[db] saveState failed:", err);
  }
}

/** Load AppState from IndexedDB. Returns null if not found or on SSR. */
export async function loadState(): Promise<AppState | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const stored = await db.get(STORE_NAME, STATE_KEY);
    return stored ?? null;
  } catch (err) {
    console.warn("[db] loadState failed:", err);
    return null;
  }
}

/** Clear all persisted state (used on account delete or reset). */
export async function clearState(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete(STORE_NAME, STATE_KEY);
  } catch (err) {
    console.warn("[db] clearState failed:", err);
  }
}
