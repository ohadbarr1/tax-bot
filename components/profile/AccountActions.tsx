"use client";

import { useEffect, useState } from "react";
import { LogOut, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/firebase/authContext";
import { authedFetch } from "@/lib/admin/adminFetch";
import { DeleteAccountModal } from "./DeleteAccountModal";

interface DeletionState {
  inProgress: boolean;
  firestoreDoneAt?: string | null;
  storageDoneAt?: string | null;
  authDoneAt?: string | null;
}

/**
 * AccountActions — sign-out button and destructive "delete account" CTA.
 * Sign-out signs back in anonymously (onAuthStateChanged handles that in
 * authContext), so the UI settles on a fresh anon session.
 *
 * Resume affordance (architecture-F-15): on mount we GET
 * `/api/user/deletion-status`. If a previous deletion call was interrupted
 * mid-flight, surface a Hebrew banner + a "המשך מחיקה" CTA that opens the
 * delete modal pre-acknowledged so the user can resume without re-typing.
 */
export function AccountActions() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [partial, setPartial] = useState<DeletionState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/user/deletion-status", { method: "GET" });
        if (!res.ok) return;
        const body = (await res.json()) as DeletionState;
        if (!cancelled && body.inProgress) {
          setPartial(body);
        }
      } catch {
        /* offline or unauth — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  const totalSteps = 3;
  const doneSteps = partial
    ? [partial.firestoreDoneAt, partial.storageDoneAt, partial.authDoneAt].filter(Boolean).length
    : 0;

  return (
    <div dir="rtl" className="bg-card border border-border rounded-2xl p-6 space-y-3">
      <h2 className="font-semibold text-foreground">ניהול חשבון</h2>

      {partial && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="w-full flex items-start justify-between gap-3 py-3 px-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors text-start"
        >
          <span className="flex items-start gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              המחיקה בעיצומה — נמחקו {doneSteps} מתוך {totalSteps}. לחץ להמשך.
            </span>
          </span>
        </button>
      )}

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
