"use client";

import { type ReactNode } from "react";
import { useAuth } from "@/lib/firebase/authContext";

/**
 * AuthGate — wraps a subtree and blocks rendering until we know the user is
 * authenticated. Used on onboarding pages (/welcome, /details) so strangers
 * can't land in the middle of a wizard.
 *
 * Behavior:
 *   - Firebase unconfigured (local dev / tests)  → no-op, render children.
 *   - Auth not ready yet                          → render a small spinner.
 *   - Ready + no user                             → render a sign-in prompt
 *                                                   (the anonymous sign-in
 *                                                   path is kept for the
 *                                                   Firestore scope, but the
 *                                                   gate forces a real Google
 *                                                   identity before onboarding).
 *   - Ready + anonymous user                      → render a sign-in prompt.
 *   - Ready + linked user                         → render children.
 *
 * The landing page and marketing routes remain open to anon users; only
 * onboarding/vault routes use this gate.
 */
export function AuthGate({
  children,
}: {
  children: ReactNode;
}) {
  const { user, ready, configured, linkGoogle } = useAuth();

  if (!configured) return <>{children}</>;
  if (!ready) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!user || user.isAnonymous) return <SignInPrompt linkGoogle={linkGoogle} />;
  return <>{children}</>;
}

function SignInPrompt({ linkGoogle }: { linkGoogle: () => Promise<void> }) {
  return (
    <div dir="rtl" className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">התחברות נדרשת</h1>
        <p className="text-sm text-muted-foreground mb-6">
          כדי להשתמש בדשבורד המס, נא להתחבר עם חשבון Google. המסמכים שלך יישמרו בצורה מאובטחת
          ויהיו זמינים בהתחברות הבאה.
        </p>
        <button
          onClick={() => linkGoogle().catch(() => { /* user cancelled popup */ })}
          className="w-full py-3 px-4 rounded-xl bg-brand-900 text-white font-semibold hover:opacity-90 transition-opacity"
        >
          התחבר עם Google
        </button>
      </div>
    </div>
  );
}
