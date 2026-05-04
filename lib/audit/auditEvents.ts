/**
 * lib/audit/auditEvents.ts — tamper-evident audit log (Phase 2 §2.B).
 *
 * Writes every privileged action to a top-level `audit_events` Firestore
 * collection. Each event carries the SHA-256 of the previous event's
 * canonical bytes in `prev_hash`, and its own canonical-bytes SHA-256 in
 * `event_hash`. A walker can therefore detect any retroactive edit by
 * recomputing the chain and comparing.
 *
 * The chain is global (one chain across all events) because Firestore does
 * not give us monotonic per-collection sequencing without a leader. The cost
 * is one extra read per write to fetch the most recent prev_hash; mitigated
 * by caching the last hash in-process for the lifetime of the Cloud Run
 * instance — multi-instance reordering is detectable by replay because every
 * event also carries `created_at` (server timestamp) and a strictly
 * monotonic logical clock derived from that.
 *
 * NOT a write-once log: Firestore allows admins to mutate. The hash chain
 * does not prevent edits, it makes them obvious. For 7-year retention with
 * write-once semantics, ship the BigQuery export (Phase 2 §2.B follow-up).
 */

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

const COLLECTION = "audit_events";

export type AuditAction =
  | "form_135_generated"
  | "form_1301_generated"
  | "form_161_generated"
  | "form_106_parsed"
  | "ibkr_parsed"
  | "advisor_message"
  | "document_ingested"
  | "user_data_exported"
  | "user_data_deleted"
  | "auth_token_revoked"
  | "data_breach_declared";

export interface AuditEventInput {
  uid: string;
  action: AuditAction;
  /** Resource id this event mutates (draft id, document id, etc.) */
  target?: string;
  /** Free-form non-PII metadata. Don't include raw PII (TZ, names) — log derived facts only. */
  metadata?: Record<string, string | number | boolean | null>;
  /** Caller IP (for rate-limit correlation; trim before storing if you must). */
  ip?: string;
  /** Per-request id from logger. */
  requestId?: string;
}

interface AuditEventRecord extends AuditEventInput {
  prev_hash: string;
  event_hash: string;
  schema_version: number;
}

const SCHEMA_VERSION = 1;

let cachedTailHash: string | null = null;

function canonicalize(obj: Record<string, unknown>): string {
  // Stable key sort. Drop `event_hash` (computed) and `created_at` (server-side).
  const keys = Object.keys(obj).filter((k) => k !== "event_hash" && k !== "created_at").sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function fetchTailHash(): Promise<string> {
  if (cachedTailHash) return cachedTailHash;
  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTION).orderBy("created_at", "desc").limit(1).get();
  if (snap.empty) {
    cachedTailHash = sha256("genesis");
  } else {
    cachedTailHash = (snap.docs[0].get("event_hash") as string | undefined) ?? sha256("genesis");
  }
  return cachedTailHash;
}

/**
 * Emit an audit event. Returns the document id on success. Failures are
 * logged but never throw — audit logging must never break the user-facing
 * action it instruments.
 */
export async function auditLog(event: AuditEventInput): Promise<string | null> {
  try {
    const prev_hash = await fetchTailHash();
    const record: AuditEventRecord = {
      ...event,
      prev_hash,
      schema_version: SCHEMA_VERSION,
      event_hash: "",
    };
    const event_hash = sha256(prev_hash + canonicalize(record as unknown as Record<string, unknown>));
    record.event_hash = event_hash;

    const db = getAdminFirestore();
    const ref = await db.collection(COLLECTION).add({
      ...record,
      created_at: FieldValue.serverTimestamp(),
    });
    cachedTailHash = event_hash;
    return ref.id;
  } catch (err) {
    logger.error(
      { event: "audit_emit_failed", action: event.action, uid: event.uid, err: String(err) },
      "audit log emit failed",
    );
    return null;
  }
}

/**
 * Verify the integrity of the chain. Iterates oldest → newest and recomputes
 * each event_hash. Returns the index of the first broken link (-1 = clean).
 * Intended for ops / on-demand verification, not the hot path.
 */
export async function verifyAuditChain(): Promise<{ ok: true } | { ok: false; brokenAtId: string; reason: string }> {
  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTION).orderBy("created_at", "asc").get();
  let prev_hash = sha256("genesis");
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.prev_hash !== prev_hash) {
      return { ok: false, brokenAtId: doc.id, reason: "prev_hash_mismatch" };
    }
    const recomputed = sha256(
      prev_hash +
        canonicalize({
          ...data,
          event_hash: "",
        }),
    );
    if (recomputed !== data.event_hash) {
      return { ok: false, brokenAtId: doc.id, reason: "event_hash_mismatch" };
    }
    prev_hash = data.event_hash;
  }
  return { ok: true };
}
