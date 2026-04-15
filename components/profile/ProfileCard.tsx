"use client";

import { useState } from "react";
import { useAuth } from "@/lib/firebase/authContext";

/**
 * ProfileCard — identity tile for /profile. Shows avatar (photoURL or
 * derived initials), display name, email, and a provider badge (Google,
 * Anonymous). Anon users get a "link Google" CTA that upgrades in place.
 */
export function ProfileCard() {
  const { user, linkGoogle } = useAuth();
  const [linking, setLinking] = useState(false);

  if (!user) return null;

  const email = user.email ?? "";
  const displayName =
    user.displayName ?? (user.isAnonymous ? "אורח/ת אנונימי/ת" : "משתמש");
  const providerId = user.providerData[0]?.providerId;
  const providerLabel =
    providerId === "google.com"
      ? "Google"
      : user.isAnonymous
        ? "אנונימי"
        : providerId || "מקומי";

  const initials = getInitials(displayName, email);

  return (
    <div dir="rtl" className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          {user.photoURL ? (
            // next/image requires explicit dimensions. Using a plain <img>
            // keeps us from having to allowlist every Google avatar CDN host
            // in next.config — the tradeoff is no optimization, but avatars
            // are tiny and cached.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt={displayName}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-semibold">
              {initials}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground text-lg truncate">{displayName}</div>
          {email && <div className="text-sm text-muted-foreground truncate">{email}</div>}
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {providerLabel}
          </div>
        </div>
      </div>

      {user.isAnonymous && (
        <button
          type="button"
          onClick={() => {
            setLinking(true);
            linkGoogle().finally(() => setLinking(false));
          }}
          disabled={linking}
          className="w-full py-2.5 px-4 rounded-xl bg-brand-900 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {linking ? "מתחבר…" : "קשר חשבון Google"}
        </button>
      )}
    </div>
  );
}

function getInitials(name: string, email: string): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
