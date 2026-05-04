"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/firebase/authContext";

/**
 * AuthGate — wraps a subtree and blocks rendering until we know the user is
 * authenticated. Anonymous users are treated as authenticated so the app is
 * usable end-to-end without Google sign-in; only truly unresolved auth (e.g.
 * sign-in-anonymously failed AND the grace window expired) shows the sign-in
 * prompt.
 *
 * Why the grace window: AuthProvider sets `ready=true` immediately on
 * subscribe (before any user is known) to avoid hanging on a stuck IndexedDB
 * init. Without a grace period, AuthGate would briefly flash SignInPrompt
 * while the anonymous sign-in is still in flight — a visible regression for
 * every fresh visitor. We hold on the spinner for `GRACE_MS` after mount and
 * only fall through to the prompt if `user` is still null past that.
 */
const GRACE_MS = 4000;

export function AuthGate({
  children,
}: {
  children: ReactNode;
}) {
  const { user, ready, configured, linkGoogle } = useAuth();
  const [graceExpired, setGraceExpired] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGraceExpired(true), GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  if (!configured) return <>{children}</>;
  if (!ready || (!user && !graceExpired)) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <SignInPrompt linkGoogle={linkGoogle} />;
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
