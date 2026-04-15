"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users as UsersIcon,
  FolderOpen,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/firebase/authContext";
import { AuthErrorToast } from "@/components/auth/AuthErrorToast";
import { authedFetch } from "@/lib/admin/adminFetch";

/**
 * AdminShell — client-side gate + chrome for the admin portal.
 *
 * Why client-side and not a server component: authenticating a user in a
 * Next.js server component requires either a session cookie (not set up
 * in this app — Firebase Auth uses IndexedDB for tokens) or explicit
 * bearer-token cookies, neither of which exist here. The route-level
 * protection is enforced by `requireAdmin` on every API route — so the
 * browser never receives other users' data even if the shell UI renders.
 * This component adds a UX redirect for non-admins on top of that.
 *
 * Behavior:
 *   1. Wait for auth to be ready.
 *   2. If no user or anonymous → router.replace("/").
 *   3. Otherwise GET /api/admin/whoami. If 200 → render children. Any
 *      non-OK → router.replace("/").
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AdminShellInner>{children}</AdminShellInner>
      <AuthErrorToast />
    </AuthProvider>
  );
}

function AdminShellInner({ children }: { children: ReactNode }) {
  const { user, authResolved, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState<"pending" | "ok" | "denied">("pending");

  useEffect(() => {
    let cancelled = false;
    // Wait for Firebase to FINISH reading IDB persistence before making a
    // redirect decision. Using `ready` alone would false-redirect because
    // `ready` is set immediately on subscribe (to unblock the /welcome
    // spinner on IDB hangs), long before `user` has hydrated.
    if (!authResolved) return;
    if (!user || user.isAnonymous) {
      router.replace("/");
      return;
    }
    (async () => {
      try {
        const res = await authedFetch("/api/admin/whoami", { method: "GET" });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { isAdmin?: boolean };
          if (data.isAdmin === true) {
            setChecked("ok");
          } else {
            setChecked("denied");
            router.replace("/");
          }
        } else {
          setChecked("denied");
          router.replace("/");
        }
      } catch {
        if (!cancelled) {
          setChecked("denied");
          router.replace("/");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authResolved, user, router]);

  if (!authResolved || checked === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (checked !== "ok") {
    // Already navigating away; render nothing to avoid a flash of admin UI.
    return null;
  }

  const navItems = [
    { href: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
    { href: "/admin/users", label: "משתמשים", icon: UsersIcon },
    { href: "/admin/files", label: "קבצים", icon: FolderOpen },
  ];

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span>Admin</span>
            {user?.email && (
              <span className="text-sm text-muted-foreground font-normal">· {user.email}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            התנתק
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className="w-56 shrink-0 border-e border-border bg-card/50 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </aside>

        <main className="flex-1 min-w-0 p-6">{children}</main>
      </div>
    </div>
  );
}
