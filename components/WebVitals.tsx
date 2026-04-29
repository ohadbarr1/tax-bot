"use client";

/**
 * components/WebVitals.tsx — client-side Core Web Vitals reporter.
 *
 * Closes performance §1.6 ("RUM / Web Vitals collection on the client: none").
 *
 * Mounts in the root layout; `useReportWebVitals` (re-exported from
 * `next/web-vitals`) wires up CLS, FCP, INP, LCP, TTFB on the underlying
 * `web-vitals` library and fires our callback once per metric.
 *
 * Each metric is shipped to `/api/_metrics` via `navigator.sendBeacon` (so it
 * survives page-unload mid-flight), with `fetch+keepalive` as a fallback. The
 * server endpoint just logs to stdout — Cloud Logging will pick up the
 * structured-JSON line. We deliberately keep it dumb: no PII, no userId, no
 * URL query string. Just the page path and the metric.
 *
 * Phase 1 wiring: pipe these to Sentry via `Sentry.captureMeasurement` or to
 * Firebase Performance Monitoring (`firebase/performance`). For Phase 0 we
 * just collect them server-side so ops can see SOMETHING; the dashboarding
 * is a Phase 1 concern.
 */

import { useReportWebVitals } from "next/web-vitals";

interface WebVitalMetric {
  id: string;
  name: string;
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  delta?: number;
  label?: "web-vital" | "custom";
  navigationType?: string;
}

const METRICS_ENDPOINT = "/api/metrics";

function send(metric: WebVitalMetric): void {
  if (typeof window === "undefined") return;

  // Strip query string + hash so the path field doesn't blow up cardinality
  // in Cloud Logging.
  const path = window.location.pathname;
  const body = JSON.stringify({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    path,
    ts: Date.now(),
  });

  // Prefer sendBeacon — fire-and-forget, survives unload. Falls back to
  // fetch+keepalive for browsers / contexts where sendBeacon is unavailable.
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(METRICS_ENDPOINT, blob);
      if (ok) return;
    }
    void fetch(METRICS_ENDPOINT, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {
      // Swallow — RUM data loss is acceptable; user-facing flow must not
      // fail because of an analytics POST.
    });
  } catch {
    // Same — never break the page.
  }
}

export function WebVitals(): null {
  useReportWebVitals((metric) => {
    send(metric as WebVitalMetric);
  });
  return null;
}

export default WebVitals;
