/**
 * instrumentation.ts — Next 16 server-side observability hook.
 *
 * Per Next 16 file-convention (`01-app/03-api-reference/03-file-conventions/
 * instrumentation.md`), this file lives at the project ROOT (next to
 * `package.json`), exports `register()` (called once per server-instance
 * boot), and optionally exports `onRequestError` (called on every server-side
 * exception). NOT inside `app/`.
 *
 * Closes performance §1.6 — Observability:
 *   - Initialises Sentry on the server, conditionally per runtime
 *     (`NEXT_RUNTIME=nodejs|edge`). Edge runtime currently no-ops because the
 *     project's API routes are all Node — we'll wire Edge if/when the
 *     middleware (0.J) needs error reporting.
 *   - Wires `onRequestError` to Sentry's `captureRequestError`, which is the
 *     v15+ hook for catching errors thrown inside Server Components, Route
 *     Handlers and Server Actions before Next renders the error UI. This is
 *     the SSR/RSC analogue to the client-side `<ErrorBoundary>`.
 *
 * Companion files:
 *   - `instrumentation-client.ts` — browser Sentry init.
 *   - `lib/sentry.server.ts` — the actual `Sentry.init` call (kept separate
 *     so it can be unit-tested without the Next harness).
 *   - `lib/sentry.client.ts` — same on the browser side.
 */

import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerSentry } = await import("./lib/sentry.server");
    initServerSentry();
  }
  // Edge runtime: no-op for Phase 0. When 0.J adds middleware that throws,
  // wire `lib/sentry.edge.ts` here under `NEXT_RUNTIME === "edge"`.
}

export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context,
) => {
  // Forward to Sentry. If `Sentry.init()` was never called (no DSN), this is
  // a cheap no-op — the SDK swallows the call.
  Sentry.captureRequestError(err, request, context);
};
