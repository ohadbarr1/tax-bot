/**
 * /api/health — public, unauthenticated uptime probe.
 *
 * Closes performance §1.6 ("uptime monitoring: no probe configured visibly").
 * UptimeRobot / Better Uptime / Cloud Monitoring uptime checks point here
 * every 5 minutes. See DEPLOY.md.
 *
 * Contract:
 *   - 200 OK on every request (the existence of the route IS the signal — if
 *     the Next.js server can't route, the probe fails). We do not poke
 *     Firestore / Anthropic here — those are dependency-checks for a
 *     separate, deeper `/api/health/deep` (Phase 1 if needed).
 *   - JSON `{ status: "ok", commit: process.env.GIT_SHA, ts: Date.now() }`.
 *   - `Cache-Control: no-store` so no CDN ever serves a stale 200 from a
 *     previously-healthy deployment.
 *
 * Public: deliberately does NOT wrap with `withUser`. UptimeRobot can't
 * carry a Firebase ID token. There's no PII / state in the response so this
 * is safe.
 */

import { NextResponse } from "next/server";
import { publicSloSnapshot } from "@/lib/observability/slos";

// Force the route to be dynamically evaluated on every hit — never cached at
// the Next.js / Edge layer.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  const body = {
    status: "ok",
    commit: process.env.GIT_SHA,
    ts: Date.now(),
    slo: publicSloSnapshot(),
  };
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
