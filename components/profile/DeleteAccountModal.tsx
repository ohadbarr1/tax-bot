"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle } from "lucide-react";
import { authedFetch } from "@/lib/admin/adminFetch";
import { useAuth } from "@/lib/firebase/authContext";

const CONFIRM_WORD = "מחק";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * DeleteAccountModal — two-step confirm dialog. The user must type the
 * literal word "מחק" to enable the red confirm button. On confirm:
 *   1. DELETE /api/user/delete (Admin SDK wipes everything + Auth user)
 *   2. signOut() on the client — the Auth user is already gone; the
 *      onAuthStateChanged listener will try to re-anon-sign-in which
 *      gives the user a fresh session on /.
 *   3. Navigate to "/".
 */
export function DeleteAccountModal({ open, onClose }: Props) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const canConfirm = typed.trim() === CONFIRM_WORD && !submitting;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        const msg = (body as { error?: string } | null)?.error ?? "מחיקה נכשלה";
        throw new Error(msg);
      }
      try {
        await signOut();
      } catch {
        /* auth user already deleted — signOut may no-op */
      }
      router.push("/");
    } catch (err) {
      console.error("[delete-account] failed:", err);
      setError(err instanceof Error ? err.message : "מחיקה נכשלה. נסה שוב.");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-lg font-bold">מחיקת חשבון</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="סגור"
            className="rounded-md p-1 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          פעולה זו תמחק לצמיתות את כל הנתונים, המסמכים, והטיוטות שלך. לא ניתן לבטל.
          כדי להמשיך, הקלד <span className="font-mono font-bold text-foreground">{CONFIRM_WORD}</span> בתיבה למטה.
        </p>

        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={submitting}
          autoFocus
          dir="rtl"
          placeholder={CONFIRM_WORD}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-400"
        />

        {error && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="py-2 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors disabled:opacity-60"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="py-2 px-4 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "מוחק…" : "מחק לצמיתות"}
          </button>
        </div>
      </div>
    </div>
  );
}
