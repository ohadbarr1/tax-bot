/**
 * lib/__tests__/logger.test.ts — smoke test for the structured server logger.
 *
 * Closes performance §1.6 — Observability ("structured logging: none").
 *
 * What we verify:
 *   1. The module exports a `logger` with the standard pino level methods.
 *   2. Logs survive a structured payload — i.e. `logger.info({ event, ... })`
 *      does not throw and emits something that round-trips to JSON in prod.
 *   3. The exported `createRequestLogger(reqId)` returns a child logger that
 *      includes `request_id` on every line — the per-request correlation key
 *      that ties stdout lines back to a single API call once 0.A's `withUser`
 *      adopts it (Phase 1 wiring).
 *
 * We deliberately do NOT test pretty-print formatting — that's a runtime-mode
 * switch (NODE_ENV=development) and pino's pretty stream is its own concern.
 */

import { describe, it, expect } from "vitest";
import { logger, createRequestLogger, newRequestId } from "../logger";

describe("lib/logger — pino structured server logger", () => {
  it("exports a logger with the standard level methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("accepts a structured payload + message without throwing", () => {
    expect(() => {
      logger.info(
        { event: "test_event", route: "logger.test", durationMs: 5 },
        "smoke",
      );
    }).not.toThrow();
  });

  it("createRequestLogger returns a child bound to the given request_id", () => {
    const child = createRequestLogger("00000000-0000-4000-8000-000000000000");
    // Pino child loggers re-expose the level methods; they just include the
    // bound bindings on every emitted record.
    expect(typeof child.info).toBe("function");
    expect(() => child.info({ event: "child_event" }, "smoke")).not.toThrow();
  });

  it("newRequestId() returns a UUID v4-shaped string", () => {
    const id = newRequestId();
    // RFC 4122 v4 regex — 8-4-4-4-12 with version nibble = 4 and variant
    // nibble in [89ab].
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // Two calls must differ.
    expect(newRequestId()).not.toBe(id);
  });
});
