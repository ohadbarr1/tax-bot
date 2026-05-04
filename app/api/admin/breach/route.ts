/**
 * POST /api/admin/breach — declare a data breach.
 *
 * Phase 2 §2.A. Israel PPA תיקון 13 (Privacy Protection Authority) requires
 * notification of certain breaches within 72 hours. This endpoint:
 *
 *   (1) Writes a `data_breach_declared` event to `audit_events` with the
 *       tamper-evident hash chain — establishes the canonical declaration time.
 *   (2) Emits a critical-severity structured log line; Cloud Logging routes to
 *       a metric → alert; on-call is paged.
 *   (3) Captures a Sentry exception so the engineering team has rich context.
 *   (4) Returns the audit doc id so downstream automation (PPA portal,
 *       customer notification service, partners) can reference it.
 *
 * Admin-gated. The actual notification emails / regulatory filings are
 * triggered by an out-of-band process subscribed to the audit event (or
 * triggered manually from the breach record). This endpoint is the
 * single source of truth for "the company has acknowledged a breach".
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { AdminAuthError, requireAdmin } from "@/lib/admin/isAdmin";
import { auditLog } from "@/lib/audit/auditEvents";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BreachPayload = z.object({
  /** Short label, e.g. "ANTHROPIC_API_KEY_LEAKED" or "FIRESTORE_QUERY_OPEN_72H". */
  category: z.string().min(3).max(80),
  /** Free-form summary; goes into Sentry + log. AVOID raw PII. */
  summary: z.string().min(10).max(4000),
  /** Estimated affected user count (best-effort, may be revised). */
  affectedUsers: z.number().int().min(0).max(10_000_000).optional(),
  /** ISO timestamp the breach is believed to have started (best estimate). */
  detectedAtIso: z.string().datetime().optional(),
  /** ISO timestamp the breach is believed to have started. */
  occurredAtIso: z.string().datetime().optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  let adminUid: string;
  try {
    const ctx = await requireAdmin(request);
    adminUid = ctx.uid;
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/admin/breach] auth error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BreachPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { category, summary, affectedUsers, detectedAtIso, occurredAtIso } = parsed.data;

  // 1. Audit event — primary canonical record (tamper-evident hash chain).
  const eventId = await auditLog({
    uid: adminUid,
    action: "data_breach_declared",
    metadata: {
      category,
      summary,
      affectedUsers: affectedUsers ?? null,
      detectedAtIso: detectedAtIso ?? null,
      occurredAtIso: occurredAtIso ?? null,
    },
  });

  // 2. Structured critical log — Cloud Logging severity=CRITICAL routes to alert.
  logger.fatal(
    {
      event: "data_breach_declared",
      severity: "CRITICAL",
      breach_event_id: eventId,
      category,
      affectedUsers: affectedUsers ?? null,
      declared_by_uid: adminUid,
    },
    `BREACH DECLARED: ${category}`,
  );

  // 3. Sentry — page on-call.
  try {
    Sentry.captureException(new Error(`BREACH DECLARED: ${category}`), {
      level: "fatal",
      tags: { breach: "declared", category },
      extra: { breach_event_id: eventId, summary, affectedUsers, detectedAtIso, occurredAtIso },
    });
  } catch {
    // Never let Sentry transport failure swallow the breach acknowledgement.
  }

  return NextResponse.json(
    {
      ok: true,
      breach_event_id: eventId,
      declared_at: new Date().toISOString(),
      next_steps: [
        "PPA notification (≤ 72h, hard SLA — see runbooks/breach.md)",
        "Affected-user notification per תיקון 13 § 4ב",
        "Sub-processor downstream notification (Anthropic, Firebase, Upstash, Sentry)",
      ],
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
