/**
 * lib/api/withRateLimit.ts — Upstash-Redis sliding-window rate limit.
 *
 * Two compositions are supported:
 *
 *   • `withRateLimit(handler)` — anonymous limit, keyed on client IP only.
 *     Use for endpoints that have not yet authenticated.
 *
 *   • `withRateLimitForUser(handler)` — authenticated limit, keyed on
 *     `uid + ip` so a single uid behind a botnet still gets throttled and
 *     a single IP behind a NAT can serve many users. Use *after*
 *     `withUser(...)` — it expects `{ uid }` in the context.
 *
 * Configuration:
 *   UPSTASH_REDIS_REST_URL     — REST endpoint
 *   UPSTASH_REDIS_REST_TOKEN   — bearer token for the endpoint
 *
 * If either env var is missing, the wrapper logs a warning once and behaves
 * as a no-op pass-through. This keeps `npm test` and `npm run dev` working
 * in environments that have not provisioned Upstash. PRODUCTION must set
 * both — see `apphosting.yaml`.
 *
 * Defaults — chosen conservatively because every wrapped route is either
 * I/O-heavy (PDF stamping, Tesseract) or bills our Anthropic key per call:
 *
 *   user limit  : 30 requests / 60 s
 *   anon limit  : 10 requests / 60 s
 *
 * Closes audit findings F-2 and F1.2.1 (cost-DoS surface).
 */

import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { rateLimited, type RateLimitMeta } from "./errorEnvelope";

export interface RateLimitOptions {
  /**
   * Logical name for this limiter — surfaces in Upstash analytics + key
   * prefixes. Defaults to "global". Use distinct names per route family
   * (e.g. "advisor", "generate", "parse") so analytics are separable.
   */
  prefix?: string;
  /** Max requests in the window. */
  limit?: number;
  /** Window length in milliseconds. Default 60_000 (1 minute). */
  windowMs?: number;
}

interface UpstashEnv {
  url: string;
  token: string;
}

let warned = false;

/**
 * Read Upstash env. Returns null (and warns once) when not configured —
 * the wrapper falls through as a no-op so dev/test environments work.
 */
function readUpstashEnv(): UpstashEnv | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned) {
      warned = true;
      console.warn(
        "[withRateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting disabled. Set them in production (see apphosting.yaml).",
      );
    }
    return null;
  }
  return { url, token };
}

// Lazy cache so multiple wrapped routes share the same Redis client.
let redisSingleton: Redis | null = null;
function getRedis(env: UpstashEnv): Redis {
  if (redisSingleton) return redisSingleton;
  redisSingleton = new Redis({ url: env.url, token: env.token });
  return redisSingleton;
}

const limiterCache = new Map<string, Ratelimit>();

function buildLimiter(
  env: UpstashEnv,
  prefix: string,
  limit: number,
  windowMs: number,
): Ratelimit {
  const cacheKey = `${prefix}:${limit}:${windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const limiter = new Ratelimit({
    redis: getRedis(env),
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    analytics: true,
    prefix: `tax-bot:rl:${prefix}`,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

/**
 * Best-effort client-IP extractor. Honors `x-forwarded-for` first (App Hosting
 * sets it), falls back to `x-real-ip`, and finally to the literal string
 * "unknown" so a missing header still produces a stable bucket.
 */
function clientIp(req: NextRequest | Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

interface ConsumeResult {
  ok: boolean;
  meta: RateLimitMeta;
}

async function consume(
  limiter: Ratelimit,
  key: string,
): Promise<ConsumeResult> {
  const r = await limiter.limit(key);
  const now = Date.now();
  const meta: RateLimitMeta = {
    remaining: r.remaining,
    limit: r.limit,
    resetAt: r.reset,
    retryAfterSeconds: Math.max(0, Math.ceil((r.reset - now) / 1000)),
  };
  return { ok: r.success, meta };
}

// ─── Anonymous (IP-only) wrapper ──────────────────────────────────────────────

export function withRateLimit<H extends (req: NextRequest, ctx?: unknown) => Promise<Response> | Response>(
  handler: H,
  opts: RateLimitOptions = {},
): (req: NextRequest, ctx?: Parameters<H>[1]) => Promise<Response> {
  const prefix = opts.prefix ?? "anon";
  const limit = opts.limit ?? 10;
  const windowMs = opts.windowMs ?? 60_000;

  return async (req, ctx) => {
    const env = readUpstashEnv();
    if (env) {
      const limiter = buildLimiter(env, prefix, limit, windowMs);
      const ip = clientIp(req);
      const { ok, meta } = await consume(limiter, `ip:${ip}`);
      if (!ok) return rateLimited(meta);
    }
    return await handler(req, ctx);
  };
}

// ─── Authenticated (uid+ip) wrapper ───────────────────────────────────────────

interface UserCtx {
  uid: string;
}

export function withRateLimitForUser<C extends UserCtx>(
  handler: (req: NextRequest, ctx: C) => Promise<Response> | Response,
  opts: RateLimitOptions = {},
): (req: NextRequest, ctx: C) => Promise<Response> {
  const prefix = opts.prefix ?? "user";
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60_000;

  return async (req, ctx) => {
    const env = readUpstashEnv();
    if (env) {
      const limiter = buildLimiter(env, prefix, limit, windowMs);
      const ip = clientIp(req);
      // Compose uid+ip so a single uid behind many IPs is throttled, AND
      // a single IP behind a NAT cluster doesn't rate-limit unrelated users.
      const key = `uid:${ctx.uid}:ip:${ip}`;
      const { ok, meta } = await consume(limiter, key);
      if (!ok) return rateLimited(meta);
    }
    return await handler(req, ctx);
  };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Reset internal singleton + cache. ONLY for use from `lib/__tests__/`.
 * Production code should never call this.
 */
export function __resetRateLimitForTests(): void {
  redisSingleton = null;
  limiterCache.clear();
  warned = false;
}

export const __internals = { clientIp, readUpstashEnv };
