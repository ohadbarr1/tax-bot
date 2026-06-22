/**
 * idleTimeout.ts — inactivity auto-logout policy (Loop 2 / R3).
 *
 * Confidential tax data → log the user out after inactivity. Pure phase helper
 * so the thresholds + transitions are unit-testable without timers.
 */

export const IDLE_WARN_MS = 55 * 60 * 1000; // show warning at 55 min idle
export const IDLE_LOGOUT_MS = 60 * 60 * 1000; // hard logout at 60 min idle

export type IdlePhase = "active" | "warn" | "expired";

export function idlePhase(
  idleMs: number,
  opts: { warnMs?: number; logoutMs?: number } = {},
): IdlePhase {
  const warn = opts.warnMs ?? IDLE_WARN_MS;
  const logout = opts.logoutMs ?? IDLE_LOGOUT_MS;
  if (idleMs >= logout) return "expired";
  if (idleMs >= warn) return "warn";
  return "active";
}

/** Seconds remaining until logout (for the warning countdown). */
export function secondsToLogout(idleMs: number, logoutMs = IDLE_LOGOUT_MS): number {
  return Math.max(0, Math.ceil((logoutMs - idleMs) / 1000));
}
