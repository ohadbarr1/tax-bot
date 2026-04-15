"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/authContext";

/**
 * AuthGate — wraps a subtree and blocks rendering until we know the user is
 * authenticated. Used on onboarding pages (/welcome, /details) so strangers
 * can't land in the middle of a wizard.
 *
 * Behavior:
 *   - Firebase unconfigured (local dev / tests)  → no-op, render children.
 *   - Auth not ready yet                          → render a small spinner.
 *   - Ready + no user                             → redirect to `redirectTo`
 *                                                   (default `/`) and render
 *                                                   null while the router swap
 *                                                   is in flight.
 *   - Ready + user                                → render children.
 *
 * Note: the app signs visitors in anonymously automatically, so in practice
 * the "no user" path only fires if anonymous sign-in failed or the user
 * explicitly signed out. Still a real gate — anonymous accounts are
 * first-class users with a stable uid for Firestore/Storage scoping.
 */
export function AuthGate({
  children,
  redirectTo = "/",
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { user, ready, configured } = useAuth();

  useEffect(() => {
    if (!configured) return;
    if (ready && !user) router.replace(redirectTo);
  }, [configured, ready, user, redirectTo, router]);

  if (!configured) return <>{children}</>;
  if (!ready) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
