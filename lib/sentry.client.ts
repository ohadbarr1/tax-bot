/**
 * lib/sentry.client.ts — browser Sentry initialiser.
 *
 * Loaded once on first paint via `instrumentation-client.ts`. Closes
 * performance §1.6 (error-tracking gap).
 *
 * Notes:
 *   - DSN comes from `NEXT_PUBLIC_SENTRY_DSN` because the browser bundle
 *     can't read non-public env vars. If unset, we skip init silently.
 *   - The same `release` tag (`GIT_SHA ?? "dev"`) flows through so client
 *     and server errors group together in Sentry.
 *   - `replaysSessionSampleRate` / `replaysOnErrorSampleRate` left off for
 *     Phase 0 — turn on in Phase 1 once we've verified PII redaction.
 */

import * as Sentry from "@sentry/nextjs";

export function initClientSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const tracesSampleRate = parseFloat(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "1.0",
  );

  Sentry.init({
    dsn,
    release: process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
    environment: process.env.NODE_ENV ?? "production",
    tracesSampleRate: Number.isFinite(tracesSampleRate)
      ? tracesSampleRate
      : 1.0,
    // Israeli ID / TZ / refund-amount lives in form fields. PII off.
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
