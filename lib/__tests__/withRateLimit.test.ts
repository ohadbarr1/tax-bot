/**
 * lib/__tests__/withRateLimit.test.ts — covers F-2 / F1.2.1.
 *
 * Mocks @upstash/ratelimit so we can assert the wrapper:
 *   - no-ops cleanly when env vars are missing (dev/test work)
 *   - blocks with 429 + Retry-After when the limiter rejects
 *   - keys on uid+ip for the authenticated wrapper
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { NextRequest } from "next/server";

// Capture the most recent Ratelimit constructor invocation so tests can
// inspect prefix / window / limit args.
const limitMock = vi.fn();
const ratelimitConstructor = vi.fn();

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow(limit: number, window: string) {
      return { kind: "slidingWindow", limit, window };
    }
    public limit: typeof limitMock;
    constructor(opts: unknown) {
      ratelimitConstructor(opts);
      this.limit = limitMock;
    }
  }
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => {
  class Redis {
    constructor(_opts: unknown) {}
  }
  return { Redis };
});

import {
  withRateLimit,
  withRateLimitForUser,
  __resetRateLimitForTests,
} from "../api/withRateLimit";

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new Request("https://example.test/api/x", {
    method: "POST",
    headers,
  }) as unknown as NextRequest;
}

describe("withRateLimit — F-2 / F1.2.1", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    limitMock.mockReset();
    ratelimitConstructor.mockReset();
    __resetRateLimitForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterAll(() => {
    if (origUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = origUrl;
    if (origToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
  });

  it("F-2 no-ops when Upstash env vars are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(handler);
    const res = await wrapped(makeReq());
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(limitMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("F-2 calls limiter with IP-only key when env is set, returns 200 if allowed", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    limitMock.mockResolvedValueOnce({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(handler, { prefix: "test-anon", limit: 10, windowMs: 60_000 });
    const res = await wrapped(makeReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(limitMock).toHaveBeenCalledWith("ip:1.2.3.4");
  });

  it("F-2 returns 429 + RATE_LIMITED envelope + Retry-After when limiter blocks", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    limitMock.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 30_000,
    });
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(handler, { prefix: "test-anon" });
    const res = await wrapped(makeReq({ "x-forwarded-for": "9.9.9.9" }));
    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toMatch(/יותר מדי בקשות/);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  it("F-2 user-keyed wrapper composes uid:<u>:ip:<ip>", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    limitMock.mockResolvedValueOnce({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
    });
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimitForUser(handler, { prefix: "user-test", limit: 30, windowMs: 60_000 });
    await wrapped(makeReq({ "x-forwarded-for": "10.0.0.1" }), { uid: "user-abc" });
    expect(limitMock).toHaveBeenCalledWith("uid:user-abc:ip:10.0.0.1");
  });

  it("F-2 falls back to 'unknown' IP bucket when no headers present", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    limitMock.mockResolvedValueOnce({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withRateLimit(handler);
    await wrapped(makeReq());
    expect(limitMock).toHaveBeenCalledWith("ip:unknown");
  });
});
