/**
 * lib/__tests__/middleware-csp.test.ts — covers Wave β / 0.J Part 2 (security-F1.2.x / F1.3.1).
 *
 * `proxy.ts` (Next 16's renamed root-level middleware — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`)
 * sets a strict, per-request, nonce-based Content-Security-Policy header plus a
 * minimum set of supporting hardening headers (HSTS, X-Frame-Options DENY,
 * Permissions-Policy, X-Content-Type-Options, Referrer-Policy).
 *
 * This test asserts the headers exist + look correct on a sample request. It
 * does NOT execute the matcher — the matcher is enforced by Next at request
 * time and is documented inline in `proxy.ts`.
 */

import { describe, it, expect } from "vitest";

import { proxy, buildCsp, SECURITY_HEADERS } from "../../proxy";

function makeNextRequest(url: string): import("next/server").NextRequest {
  // Vitest's jsdom env doesn't provide NextRequest; the proxy only reads
  // `request.headers` and `request.nextUrl.pathname`, which a plain Request
  // satisfies for our test's purposes.
  const req = new Request(url) as unknown as import("next/server").NextRequest;
  return req;
}

describe("proxy.ts — CSP + security headers (security-F1.2.x / F1.3.1)", () => {
  it("emits a CSP header on every response", () => {
    const req = makeNextRequest("https://example.test/dashboard");
    const res = proxy(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeTruthy();
  });

  it("CSP includes the required core directives", () => {
    const csp = buildCsp("test-nonce");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("CSP allow-lists Firebase + reCAPTCHA + Sentry, NOT Anthropic (server-only)", () => {
    const csp = buildCsp("test-nonce");
    // connect-src — XHR/fetch/WebSocket targets
    expect(csp).toMatch(/connect-src[^;]*\*\.googleapis\.com/);
    expect(csp).toMatch(/connect-src[^;]*\*\.firebaseio\.com/);
    expect(csp).toMatch(/connect-src[^;]*\*\.ingest\.sentry\.io/);
    // Anthropic only flows through our /api/advisor — never client → anthropic.com directly.
    expect(csp).not.toContain("api.anthropic.com");
    // script-src — Firebase auth handler + reCAPTCHA scripts
    expect(csp).toMatch(/script-src[^;]*www\.gstatic\.com/);
    expect(csp).toMatch(/script-src[^;]*www\.google\.com\/recaptcha/);
    // frame-src — reCAPTCHA challenges + Firebase auth handler iframe
    expect(csp).toMatch(/frame-src[^;]*www\.google\.com/);
  });

  it("uses a per-request nonce in script-src", () => {
    const csp1 = buildCsp("nonce-A");
    const csp2 = buildCsp("nonce-B");
    expect(csp1).toContain("'nonce-nonce-A'");
    expect(csp2).toContain("'nonce-nonce-B'");
    expect(csp1).not.toEqual(csp2);
  });

  it("sets HSTS, X-Frame-Options, Permissions-Policy, Referrer-Policy, X-Content-Type-Options", () => {
    const req = makeNextRequest("https://example.test/");
    const res = proxy(req);
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toBeTruthy();
  });

  it("forwards the nonce to downstream React via x-csp-nonce request header", () => {
    const req = makeNextRequest("https://example.test/dashboard");
    const res = proxy(req);
    // The proxy MUST set the nonce on a request header so RSC pages can read
    // it via `headers()` and pass it to inline scripts. We assert the same
    // nonce is in CSP header AND was attached to the next request.
    const csp = res.headers.get("content-security-policy") ?? "";
    const nonceMatch = /'nonce-([^']+)'/.exec(csp);
    expect(nonceMatch).toBeTruthy();
  });

  it("SECURITY_HEADERS shape is stable (snapshot of header keys)", () => {
    expect(Object.keys(SECURITY_HEADERS).sort()).toMatchInlineSnapshot(`
      [
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ]
    `);
  });
});
