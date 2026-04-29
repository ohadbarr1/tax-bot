/**
 * lib/sentry.server.ts — server (Node runtime) Sentry initialiser.
 *
 * Loaded once on server boot via `instrumentation.ts → register()`. Closes
 * performance §1.6 ("error tracking: SENTRY_HOOK comment but no init").
 *
 * Notes:
 *   - DSN comes from `SENTRY_DSN`. If the env var is unset (local dev / CI
 *     without secrets), we skip init silently. The build must succeed in
 *     this state.
 *   - Every event is tagged with `release: GIT_SHA ?? "dev"` so Cloud
 *     Logging / Sentry can group errors by deployed SHA.
 *   - 100% trace sampling in production matches §1.6 spec for the March–
 *     April crunch ("Sample at 100% in March–April, 20% off-season"). We
 *     keep 100% for now and revisit when traffic justifies sampling.
 *   - `tracesSampleRate` honours `SENTRY_TRACES_SAMPLE_RATE` for ops to
 *     dial down without redeploy.
 */

import * as Sentry from "@sentry/nextjs";

export function initServerSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Silent in test / local-dev. Surfacing a warn in production would be
    // alarming and noisy on every cold start; the absence is itself the
    // signal (no events arrive in Sentry).
    return;
  }

  const tracesSampleRate = parseFloat(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? "1.0",
  );

  Sentry.init({
    dsn,
    release: process.env.GIT_SHA ?? "dev",
    environment: process.env.NODE_ENV ?? "production",
    tracesSampleRate: Number.isFinite(tracesSampleRate)
      ? tracesSampleRate
      : 1.0,
    // Don't ship PII — Israeli IDs / tax-payer names must never leak.
    sendDefaultPii: false,
  });
}
