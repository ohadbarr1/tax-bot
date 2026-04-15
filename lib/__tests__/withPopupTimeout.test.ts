import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub `firebase/auth` before importing the module under test — the auth
// context drags in a lot of real SDK surface on module load and we only
// care about the pure `withPopupTimeout` helper here.
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
  GoogleAuthProvider: class {},
  linkWithPopup: vi.fn(),
  linkWithRedirect: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../firebase/client", () => ({
  getClientAuth: () => null,
  isFirebaseConfigured: () => false,
}));

import { withPopupTimeout } from "../firebase/authContext";

describe("withPopupTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the inner promise when it settles before the timeout", async () => {
    const inner = Promise.resolve("ok");
    const out = withPopupTimeout(inner, 100);
    await expect(out).resolves.toBe("ok");
  });

  it("rejects with auth/popup-timeout when the inner promise never settles", async () => {
    const inner = new Promise<string>(() => { /* never settles */ });
    const out = withPopupTimeout(inner, 1_000);
    // Attach the failure assertion BEFORE advancing time — otherwise the
    // unhandled rejection escapes.
    const p = expect(out).rejects.toMatchObject({ code: "auth/popup-timeout" });
    await vi.advanceTimersByTimeAsync(1_001);
    await p;
  });

  it("propagates inner rejection verbatim", async () => {
    const err = Object.assign(new Error("nope"), { code: "auth/popup-blocked" });
    const out = withPopupTimeout(Promise.reject(err), 1_000);
    await expect(out).rejects.toMatchObject({ code: "auth/popup-blocked" });
  });

  it("uses the default 15s timeout when none is provided", async () => {
    const inner = new Promise<string>(() => { /* never settles */ });
    const out = withPopupTimeout(inner);
    const p = expect(out).rejects.toMatchObject({ code: "auth/popup-timeout" });
    await vi.advanceTimersByTimeAsync(15_001);
    await p;
  });
});
