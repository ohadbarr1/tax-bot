/**
 * proxy.ts — Next 16 root-level "proxy" (renamed from `middleware.ts` in v16).
 *
 * Source of truth: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
 * In Next 16, `middleware.ts` is deprecated and renamed to `proxy.ts`. The
 * exported symbol is `proxy(request)` (default or named). A `config.matcher`
 * still gates which paths the proxy runs on.
 *
 * Closes:
 *   - security-F1.3.1 (no Content-Security-Policy / no security headers)
 *   - security-F1.2.x (clickjacking, mixed-content downgrades)
 *   - security-F1.1.4 (the IDB-token-exfil concern is materially mitigated by
 *     a strict script-src / connect-src CSP)
 *
 * Design:
 *   1. Generate a fresh per-request nonce.
 *   2. Build a strict CSP that allow-lists `'self'`, Firebase backends,
 *      reCAPTCHA (App Check), Sentry, gstatic — and explicitly does NOT
 *      allow `api.anthropic.com` (the advisor goes through our `/api/advisor`
 *      route on the server; the client never talks to Anthropic directly).
 *   3. Use `frame-ancestors 'none'` (clickjacking) + `object-src 'none'`.
 *   4. Forward the nonce to downstream RSC via `x-csp-nonce` request header so
 *      pages can read it from `headers()` and stamp it on inline scripts.
 *   5. Add HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff,
 *      Permissions-Policy (lock down camera/microphone/geolocation/payment),
 *      Referrer-Policy strict-origin-when-cross-origin.
 *
 * Note: API routes that stream binary PDFs (Form 135 / 1301) MUST set their
 * own Content-Type — this proxy doesn't intervene with body content.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─── CSP allow-lists ─────────────────────────────────────────────────────────
//
// Keep these in sync with `audits/security.md` §F1.3.1 and DEPLOY.md.

const FIREBASE_HOSTS = [
  "https://*.firebaseio.com",
  "https://*.firebaseapp.com",
  "https://*.firebasestorage.app",
  "https://*.googleusercontent.com",
  "https://*.gstatic.com",
  "https://*.googleapis.com",
  "https://identitytoolkit.googleapis.com",
  "https://firestore.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
  "https://firebaseappcheck.googleapis.com",
];

// reCAPTCHA v3 (free tier) — used by Firebase App Check provider.
const RECAPTCHA_HOSTS = [
  "https://www.google.com/recaptcha/",
  "https://www.gstatic.com/recaptcha/",
  "https://recaptcha.net/recaptcha/",
];

// Sentry browser SDK reports errors and traces to *.ingest.sentry.io.
const SENTRY_HOSTS = ["https://*.ingest.sentry.io", "https://*.sentry.io"];

/**
 * Build the per-request CSP string. Exposed for the test suite.
 *
 * `nonce` is a base64-encoded random value; the same nonce is also set on the
 * `x-csp-nonce` request header so server components can stamp it on inline
 * `<script>` / `<style>` tags they emit.
 */
export function buildCsp(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    // 'unsafe-inline' for styles — Tailwind v4 + framer-motion inject inline
    // <style> tags at runtime that we cannot nonce. This is acceptable per
    // OWASP CSP cheatsheet because style injection has limited XSS power vs
    // script injection.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      // 'strict-dynamic' lets the nonce'd loader pull arbitrary scripts
      // without re-nonce'ing every chunk emitted by Next's bundler.
      "'strict-dynamic'",
      // Next.js ships a dev-only eval shim. In production this is dropped,
      // but we keep 'unsafe-eval' OFF — modern bundles don't require it.
      ...FIREBASE_HOSTS,
      ...RECAPTCHA_HOSTS,
    ],
    "connect-src": [
      "'self'",
      ...FIREBASE_HOSTS,
      ...SENTRY_HOSTS,
      // App Check token exchange + reCAPTCHA verify endpoints.
      "https://www.google.com/recaptcha/",
      "https://recaptcha.net/recaptcha/",
      // NOTE: api.anthropic.com is NOT here — advisor traffic goes through
      // our /api/advisor route on the server. Adding it here would expose
      // the API key path to the client.
    ],
    "frame-src": [
      "'self'",
      "https://*.firebaseapp.com",
      "https://accounts.google.com",
      "https://www.google.com/recaptcha/",
      "https://recaptcha.net/recaptcha/",
    ],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

// ─── Static security headers (no nonce dependency) ──────────────────────────

export const SECURITY_HEADERS: Record<string, string> = {
  // 2 years, includeSubDomains, preload-eligible. Production is HTTPS-only on
  // Firebase App Hosting, so HSTS is safe even for first visits.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Disable powerful Web APIs we don't use. Add to this list before using a
  // new API rather than the other way around.
  "Permissions-Policy": [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "magnetometer=()",
    "gyroscope=()",
    "accelerometer=()",
    "interest-cohort=()",
  ].join(", "),
};

// ─── Nonce generation ────────────────────────────────────────────────────────

function generateNonce(): string {
  // Web Crypto is available in both Edge Runtime and Node.js 19+.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 — replace +/ with URL-safe variants, strip padding.
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return (typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64"))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Proxy entrypoint ────────────────────────────────────────────────────────

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Forward the nonce to RSC via a request header so pages/layouts can read
  // it via `headers()` and stamp it on inline `<script nonce>` tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(k, v);
  }

  return response;
}

export default proxy;

// ─── Matcher: every path EXCEPT static assets / image-opt / Next internals ──
//
// `_next/static` and `_next/image` are pre-cached on the CDN; pushing a CSP
// per response there is wasted bandwidth and adds latency. We DO run the
// proxy on `/api/*` so API responses also carry the security headers.

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
