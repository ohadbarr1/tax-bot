import { describe, it, expect } from "vitest";
import { idlePhase, secondsToLogout, IDLE_WARN_MS, IDLE_LOGOUT_MS } from "../idleTimeout";

describe("idlePhase", () => {
  it("active before warn, warn between, expired at/after logout", () => {
    expect(idlePhase(0)).toBe("active");
    expect(idlePhase(IDLE_WARN_MS - 1)).toBe("active");
    expect(idlePhase(IDLE_WARN_MS)).toBe("warn");
    expect(idlePhase(IDLE_LOGOUT_MS - 1)).toBe("warn");
    expect(idlePhase(IDLE_LOGOUT_MS)).toBe("expired");
  });
  it("honors custom thresholds", () => {
    expect(idlePhase(500, { warnMs: 1000, logoutMs: 2000 })).toBe("active");
    expect(idlePhase(1500, { warnMs: 1000, logoutMs: 2000 })).toBe("warn");
    expect(idlePhase(2000, { warnMs: 1000, logoutMs: 2000 })).toBe("expired");
  });
});

describe("secondsToLogout", () => {
  it("counts down, floored at 0", () => {
    expect(secondsToLogout(IDLE_LOGOUT_MS - 5000)).toBe(5);
    expect(secondsToLogout(IDLE_LOGOUT_MS)).toBe(0);
    expect(secondsToLogout(IDLE_LOGOUT_MS + 9999)).toBe(0);
  });
});
