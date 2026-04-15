"use client";

import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/firebase/authContext";
import { DeleteAccountModal } from "./DeleteAccountModal";

/**
 * AccountActions — sign-out button and destructive "delete account" CTA.
 * Sign-out signs back in anonymously (onAuthStateChanged handles that in
 * authContext), so the UI settles on a fresh anon session.
 */
export function AccountActions() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div dir="rtl" className="bg-card border border-border rounded-2xl p-6 space-y-3">
      <h2 className="font-semibold text-foreground">ניהול חשבון</h2>

      <button
        type="button"
        onClick={async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        }}
        disabled={signingOut}
        className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors disabled:opacity-60"
      >
        <span className="flex items-center gap-2 text-foreground font-medium">
          <LogOut className="w-4 h-4" />
          התנתק
        </span>
        <span className="text-xs text-muted-foreground">{signingOut ? "…" : ""}</span>
      </button>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          <Trash2 className="w-4 h-4" />
          מחק חשבון
        </span>
      </button>

      <DeleteAccountModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
