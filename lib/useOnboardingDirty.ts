"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./appContext";

/**
 * useOnboardingDirty — true when the user is mid-onboarding with unsaved
 * progress. Used by the Navbar logo click guard and a beforeunload handler
 * so we don't silently discard work when they try to leave.
 *
 * Heuristic:
 *   - Path is /welcome or /details
 *   - onboarding.sourcesSelected is true (they've advanced past step 1)
 *   - onboarding.detailsConfirmed is false (they haven't hit "save")
 *
 * Also registers a beforeunload listener that triggers the native "leave
 * site?" dialog for hard refresh / tab close.
 */
export function useOnboardingDirty(): boolean {
  const { state } = useApp();
  const pathname = usePathname() ?? "";

  const inOnboarding = pathname.startsWith("/welcome") || pathname.startsWith("/details");
  const dirty =
    inOnboarding &&
    !!state.onboarding?.sourcesSelected &&
    !state.onboarding?.detailsConfirmed;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Returning a value is required for some older browsers to trigger
      // the prompt; modern browsers ignore the string and show a generic one.
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return dirty;
}
