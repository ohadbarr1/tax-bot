"use client";

/**
 * AuthButton — dropdown in the Navbar that exposes the Firebase auth state
 *
 * Three UI states:
 *   1. Unconfigured (no Firebase env)  → hidden entirely. The app runs in
 *      local-only mode and showing a fake auth control would be misleading.
 *   2. Anonymous (signed in as anon)   → "התחבר עם Google" button that links
 *      the anonymous uid to a Google credential, preserving all existing data.
 *   3. Signed in (email or Google)     → avatar + email, click to sign out.
 */

import { useState } from "react";
import { LogIn, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/firebase/authContext";

export function AuthButton() {
  const { user, ready, configured, linkGoogle, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!configured) return null;
  if (!ready) return null;

  // Anonymous user → show "sign in with Google" button
  if (!user || user.isAnonymous) {
    return (
      <button
        onClick={async () => {
          setBusy(true);
          try { await linkGoogle(); } catch { /* user cancelled */ }
          finally { setBusy(false); }
        }}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                   text-brand-900 bg-brand-50 border border-brand-200
                   hover:bg-brand-100 transition-colors disabled:opacity-50"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>התחבר עם Google</span>
      </button>
    );
  }

  // Linked user → show email + signout dropdown
  const displayName = user.displayName ?? user.email ?? "משתמש";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 ps-3 border-s border-border"
      >
        <div className="w-8 h-8 rounded-full bg-brand-900 flex items-center justify-center overflow-hidden">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-xs font-semibold">{initials}</span>
          )}
        </div>
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-xs font-medium text-foreground leading-tight">{displayName}</span>
          <span className="text-xs text-slate-500">{user.email}</span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 end-0 min-w-[180px] bg-card border border-border
                     rounded-xl shadow-lg py-1 z-50"
        >
          <button
            onClick={async () => { setOpen(false); await signOut(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground
                       hover:bg-muted/60 text-start"
          >
            <LogOut className="w-4 h-4" />
            <span>התנתק</span>
          </button>
        </div>
      )}
    </div>
  );
}
