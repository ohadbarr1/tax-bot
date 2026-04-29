/**
 * lib/__tests__/api/health.test.ts — uptime probe contract.
 *
 * Closes performance §1.6 — Observability ("uptime monitoring: no probe
 * configured visibly"). UptimeRobot will hit `GET /api/health` every 5 min;
 * this test pins the response shape so the probe never silently breaks.
 *
 * Contract:
 *   - Public, unauthenticated (we do NOT wrap with `withUser` — UptimeRobot
 *     can't carry a Firebase ID token).
 *   - Returns 200.
 *   - JSON body: `{ status: "ok", commit: <git-sha-or-undefined>, ts: <ms> }`.
 *   - `ts` is a positive number (Date.now()).
 */

import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health — uptime probe (performance §1.6)", () => {
  it("returns 200 with the structured payload", async () => {
    const before = Date.now();
    const res = await GET();
    const after = Date.now();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      commit: string | undefined;
      ts: number;
    };
    expect(body.status).toBe("ok");
    // commit may be `undefined` locally / in CI without GIT_SHA; that's fine.
    expect(["string", "undefined"]).toContain(typeof body.commit);
    expect(typeof body.ts).toBe("number");
    expect(body.ts).toBeGreaterThanOrEqual(before);
    expect(body.ts).toBeLessThanOrEqual(after);
  });

  it("sets Cache-Control: no-store so probes always hit the origin", async () => {
    const res = await GET();
    // UptimeRobot needs to see the *current* status, never a CDN-cached
    // 200 from when the deployment was healthy.
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
  });
});
