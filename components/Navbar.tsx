"use client";

import { useState } from "react";
import { Lock, ChevronDown } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DraftSwitcher } from "@/components/DraftSwitcher";
import { AuthButton } from "@/components/AuthButton";
import { useAuth } from "@/lib/firebase/authContext";
import { useOnboardingDirty } from "@/lib/useOnboardingDirty";
import { ConfirmLeaveDialog } from "@/components/onboarding/ConfirmLeaveDialog";

export function Navbar() {
  const { state, setView, discardCurrentDraft } = useApp();
  const { taxpayer } = state;
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { configured } = useAuth();
  const dirty = useOnboardingDirty();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const initials = taxpayer.fullName
    .split(" ")
    .filter((w) => /[\u0590-\u05FF]/.test(w) || /[A-Z]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo (right side in RTL) — always routes home, but guards dirty onboarding */}
        <button
          onClick={() => {
            if (dirty) {
              setLeaveDialogOpen(true);
              return;
            }
            router.push("/");
          }}
          className="flex items-center gap-2 group"
        >
          <Logo />
        </button>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-1">
          <DraftSwitcher />
          {[
            { label: "פרטים", view: "details" as const, href: "/details" },
            { label: "מסמכים", view: "upload" as const, href: null },
            { label: "לוח בקרה", view: "dashboard" as const, href: null },
            { label: "מחשבון מס", view: null, href: "/tax-calculator" },
          ].map((item) => {
            const isActive = item.href
              ? pathname.startsWith(item.href)
              : item.view !== null && state.currentView === item.view;
            const key = item.view ?? item.href!;
            return (
              <button
                key={key}
                onClick={() => item.href ? router.push(item.href) : item.view && setView(item.view)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-900 text-white"
                    : "text-slate-600 hover:text-brand-900 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Left side actions (left in RTL = visually on the left) */}
        <div className="flex items-center gap-2">
          {/* Security badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border"
            style={{ color: "var(--success-500)", backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }}>
            <Lock className="w-3 h-3" />
            <span>חיבור מאובטח</span>
          </div>

          {/* Language toggle placeholder */}
          <button
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-slate-100 transition-colors"
            aria-label="Language toggle"
          >
            🇮🇱<span className="text-[10px]">/EN</span>
          </button>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Auth — Firebase-backed sign-in when configured, else local profile */}
          {configured ? (
            <AuthButton />
          ) : (
            <button className="flex items-center gap-2 ps-3 border-s border-border">
              <div className="w-8 h-8 rounded-full bg-brand-900 flex items-center justify-center">
                <span className="text-white text-xs font-semibold">{initials || "OB"}</span>
              </div>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-xs font-medium text-foreground leading-tight">
                  {taxpayer.fullName.split(" - ")[1] || taxpayer.fullName}
                </span>
                <span className="text-xs text-slate-500">{taxpayer.profession}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      <ConfirmLeaveDialog
        open={leaveDialogOpen}
        onSave={() => {
          // State already auto-persists on every setState via the db.ts
          // debounce (see appContext.tsx); "save" here is purely the UX
          // confirmation that yes, the user wants to leave with the draft
          // preserved. Close dialog and navigate.
          setLeaveDialogOpen(false);
          router.push("/");
        }}
        onDiscard={() => {
          discardCurrentDraft();
          setLeaveDialogOpen(false);
          router.push("/");
        }}
        onCancel={() => setLeaveDialogOpen(false)}
      />
    </header>
  );
}
