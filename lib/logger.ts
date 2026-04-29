/**
 * lib/logger.ts — pino-backed structured server logger.
 *
 * Closes performance §1.6 ("structured logging: none — every diagnostic is
 * console.log/warn/error"). All Cloud Run / Firebase App Hosting stdout is
 * captured by Cloud Logging; if the line is JSON, every key becomes an indexed
 * field. Pino emits JSON by default in prod and pretty-prints in dev.
 *
 * Contract (Phase 0):
 *   import { logger } from "@/lib/logger";
 *   logger.info({ event: "form135_generated", uid, draftId, durationMs }, "ok");
 *   logger.error({ event: "form106_parse_failed", uid, err }, "parse failed");
 *
 * Per-request correlation (Phase 1 wiring):
 *   import { createRequestLogger, newRequestId } from "@/lib/logger";
 *   const reqId = newRequestId();
 *   const log = createRequestLogger(reqId);
 *   log.info({ event: "advisor_chat_start", uid }, "...");
 *   // every emitted record carries `request_id: <uuid>` automatically.
 *
 * 0.A's `withUser` does NOT yet inject the request id — that wiring is Phase 1
 * to avoid colliding with the in-flight wave-α handler. The module is shipped
 * now so route bodies can adopt it route-by-route.
 *
 * Release tagging: every record includes `release` so Cloud Logging can group
 * errors by deployed git SHA; matches what `instrumentation.ts` tags Sentry
 * events with.
 */

import pino, { type Logger } from "pino";

const isDev = process.env.NODE_ENV !== "production";
const release = process.env.GIT_SHA ?? "dev";

/**
 * Build the base pino instance. In dev we route through `pino-pretty` for
 * human-readable output; in prod we keep the default JSON stream so Cloud
 * Logging picks up every key as an indexed field.
 */
function buildLogger(): Logger {
  const base = {
    release,
    service: "tax-bot",
  };

  // The `transport` config makes pino spawn a worker thread that pipes JSON
  // through pino-pretty. We only enable it in dev — adding the transport in
  // prod would be a perf hit and Cloud Logging wants raw JSON.
  if (isDev) {
    try {
      return pino({
        base,
        level: process.env.LOG_LEVEL ?? "debug",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service",
          },
        },
      });
    } catch {
      // Some test runners (vitest with worker_threads disabled) blow up when
      // pino tries to spawn the pretty transport. Fall back to default JSON.
      return pino({ base, level: process.env.LOG_LEVEL ?? "debug" });
    }
  }

  return pino({
    base,
    level: process.env.LOG_LEVEL ?? "info",
    // Cloud Logging expects `severity` not `level`. Map pino numeric levels
    // back to the GCP severity vocabulary so dashboards/filters work.
    formatters: {
      level: (label) => ({ severity: gcpSeverity(label), level: label }),
    },
  });
}

function gcpSeverity(label: string): string {
  // https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
  switch (label) {
    case "trace":
    case "debug":
      return "DEBUG";
    case "info":
      return "INFO";
    case "warn":
      return "WARNING";
    case "error":
      return "ERROR";
    case "fatal":
      return "CRITICAL";
    default:
      return "DEFAULT";
  }
}

/**
 * The shared base logger. Import this in non-request-scoped contexts (module
 * init, scheduled jobs, `instrumentation.ts`).
 */
export const logger: Logger = buildLogger();

/**
 * Generate a fresh per-request UUID v4. Plain JS — no external dep — uses
 * `crypto.randomUUID()` when available, falls back to a Math.random impl for
 * environments where the global `crypto` is missing (older Node / edge).
 */
export function newRequestId(): string {
  const g: unknown = globalThis;
  const c = (g as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // Fallback — RFC 4122 v4. Not cryptographically strong but only used for
  // correlation, not security. Should rarely run on modern Node ≥ 19.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Build a child logger bound to a single request. Every emitted record will
 * include `request_id: <id>` so Cloud Logging can group all entries from one
 * incoming HTTP call.
 */
export function createRequestLogger(requestId: string): Logger {
  return logger.child({ request_id: requestId });
}

export type { Logger };
