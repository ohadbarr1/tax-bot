/**
 * instrumentation-client.ts — Next 16 client-side observability hook.
 *
 * Per `01-app/03-api-reference/03-file-conventions/instrumentation-client.md`,
 * this file runs after the HTML document loads but BEFORE React hydration
 * begins — so any Sentry breadcrumbs / errors raised during hydration are
 * already captured.
 *
 * We just defer to `lib/sentry.client.ts`. Keep this file thin.
 */

import { initClientSentry } from "./lib/sentry.client";

initClientSentry();
