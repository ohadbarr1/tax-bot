"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/firebase/authContext";

/**
 * AuthErrorToast — fixed-position bottom-center card that surfaces
 * auth errors in Hebrew. Reads `authError` from `useAuth()` and
 * auto-dismisses after 8 seconds. Manual close clears immediately.
 *
 * Mounted once inside `<AuthProvider>` in AppLayoutShell so every
 * protected page gets it for free.
 */
export function AuthErrorToast() {
  const { authError, dismissAuthError } = useAuth();

  useEffect(() => {
    if (!authError) return;
    const timer = setTimeout(() => dismissAuthError(), 8_000);
    return () => clearTimeout(timer);
  }, [authError, dismissAuthError]);

  if (!authError) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      dir="rtl"
      className="fixed bottom-6 start-1/2 -translate-x-1/2 z-[1000] max-w-sm w-[min(90vw,24rem)] px-4"
    >
      <div className="bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-100 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3">
        <span className="flex-1 text-sm font-medium leading-relaxed">{authError}</span>
        <button
          type="button"
          onClick={dismissAuthError}
          aria-label="סגור"
          className="shrink-0 rounded-md p-1 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
