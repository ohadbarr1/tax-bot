"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/firebase/authContext";
import { idlePhase, secondsToLogout, IDLE_WARN_MS, IDLE_LOGOUT_MS } from "@/lib/idleTimeout";

/**
 * IdleLogout (Loop 2 / R3) — logs the user out after inactivity, since the app
 * holds confidential tax data. Warns at 55 min with a countdown; hard logout at
 * 60 min. Any real activity resets the timer.
 *
 * Live-verify in preview by setting `window.__IDLE_MS__ = { warnMs, logoutMs }`
 * (e.g. {warnMs:2000, logoutMs:4000}) to fast-forward the thresholds.
 */
const ACTIVITY = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

export function IdleLogout() {
  const { user, signOut } = useAuth();
  const lastActivity = useRef<number>(Date.now());
  const [phase, setPhase] = useState<"active" | "warn" | "expired">("active");
  const [secs, setSecs] = useState(0);

  const reset = useCallback(() => {
    lastActivity.current = Date.now();
    setPhase("active");
  }, []);

  useEffect(() => {
    if (!user) return; // only guard an authenticated session
    for (const e of ACTIVITY) window.addEventListener(e, reset, { passive: true });
    const tick = setInterval(() => {
      const override = (window as unknown as { __IDLE_MS__?: { warnMs: number; logoutMs: number } }).__IDLE_MS__;
      const warnMs = override?.warnMs ?? IDLE_WARN_MS;
      const logoutMs = override?.logoutMs ?? IDLE_LOGOUT_MS;
      const idleMs = Date.now() - lastActivity.current;
      const p = idlePhase(idleMs, { warnMs, logoutMs });
      setPhase(p);
      if (p === "warn") setSecs(secondsToLogout(idleMs, logoutMs));
      if (p === "expired") {
        clearInterval(tick);
        void signOut();
      }
    }, 1000);
    return () => {
      clearInterval(tick);
      for (const e of ACTIVITY) window.removeEventListener(e, reset);
    };
  }, [user, reset, signOut]);

  if (!user || phase !== "warn") return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl border border-border shadow-xl p-6 max-w-sm mx-4 text-center space-y-3">
        <h2 className="text-lg font-bold text-foreground">עדיין כאן?</h2>
        <p className="text-sm text-muted-foreground">
          מטעמי אבטחה ננתק אותך עוד <strong>{secs}</strong> שניות עקב חוסר פעילות.
          הנתונים שלך נשמרו.
        </p>
        <button
          onClick={reset}
          className="w-full px-5 py-2.5 rounded-xl bg-kc-ink text-white text-sm font-semibold hover:bg-slate-800 transition-all"
        >
          אני כאן — המשך
        </button>
      </div>
    </div>
  );
}
