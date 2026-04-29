/**
 * /api/metrics — Web Vitals beacon sink.
 *
 * Closes performance §1.6 — Observability ("RUM / Web Vitals collection on
 * the client: none"). The browser's `<WebVitals />` component (mounted in the
 * root layout) POSTs CLS / FCP / INP / LCP / TTFB here once per metric per
 * page-view via `navigator.sendBeacon`.
 *
 * Storage: stdout via the structured pino logger. Cloud Run / Firebase App
 * Hosting captures stdout into Cloud Logging where each JSON field is indexed
 * — so ops can `severity=INFO event=web_vital name=LCP` straight off the
 * deployed instance with zero extra infra.
 *
 * Public, unauthenticated. The browser fires this BEFORE the user signs in
 * on first paint, so we cannot require a Firebase ID token. There's no PII
 * in the payload (we strip query strings client-side). Rate-limiting is left
 * to App Hosting's per-instance concurrency cap; if abuse shows up later, add
 * `withRateLimit` keyed on IP.
 *
 * Naming: an `_metrics` folder would be treated by Next 16 as a "private
 * folder" (colocation pattern, NOT a route — see
 * `01-app/01-getting-started/02-project-structure.md`), so we use plain
 * `metrics`. The browser's beacon path matches.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface WebVitalPayload {
  id?: string;
  name?: string;
  value?: number;
  rating?: string;
  delta?: number;
  navigationType?: string;
  path?: string;
  ts?: number;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request): Promise<NextResponse> {
  let payload: WebVitalPayload | null = null;
  try {
    // sendBeacon submits a Blob with type=application/json; req.json() works.
    payload = (await req.json()) as WebVitalPayload;
  } catch {
    // Malformed body — accept-and-drop. We do not want to alert on this:
    // browsers occasionally send empty beacons on unload.
    return NextResponse.json({ ok: true }, { status: 204 });
  }

  if (!payload || typeof payload.name !== "string") {
    return NextResponse.json({ ok: true }, { status: 204 });
  }

  // Pino emits structured JSON in prod; Cloud Logging indexes every key.
  logger.info(
    {
      event: "web_vital",
      name: payload.name,
      value: typeof payload.value === "number" ? payload.value : null,
      rating: payload.rating,
      delta: payload.delta,
      navigationType: payload.navigationType,
      path: payload.path,
      // Echo client ts AND server-receive ts so we can spot clock-skew /
      // queueing pathologies.
      clientTs: payload.ts,
      serverTs: Date.now(),
    },
    "web-vitals beacon",
  );

  // sendBeacon ignores the response body; respond minimally.
  return NextResponse.json({ ok: true }, { status: 200 });
}
