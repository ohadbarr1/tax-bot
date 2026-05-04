"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "kc_consent_v1";
type Choice = "all" | "essential";

export function readConsent(): Choice | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "all" || v === "essential") return v;
  return null;
}

/**
 * Cookie / analytics consent banner. Per the Israel PPA 2024 cookies guidance,
 * non-essential identifiers (analytics, remarketing) require opt-in. Essential
 * cookies (Firebase Auth session, App Check token) are exempt.
 *
 * Consumers gate non-essential trackers on `readConsent() === "all"`.
 */
export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setShow(true);
  }, []);

  function record(choice: Choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // localStorage may be disabled (private mode); banner just won't sticky-dismiss.
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="הגדרות עוגיות"
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md shadow-lg"
    >
      <div className="mx-auto max-w-5xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-700 leading-relaxed">
          אנחנו משתמשים בעוגיות חיוניות לצורך התחברות ואבטחה, ובעוגיות אנליטיקה
          רק אם תאשר/י. ראה{" "}
          <Link href="/privacy" className="underline">מדיניות הפרטיות</Link>.
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => record("essential")}
            className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-slate-50"
          >
            רק חיוניות
          </button>
          <button
            type="button"
            onClick={() => record("all")}
            className="px-4 py-2 rounded-xl bg-kc-ink text-white text-sm hover:bg-kc-ink/90"
          >
            אשר הכול
          </button>
        </div>
      </div>
    </div>
  );
}
