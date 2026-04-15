"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * ConfirmDangerModal — generic two-step confirm dialog. The user must
 * type the exact `expected` string to enable the red confirm button.
 */
export function ConfirmDangerModal({
  open,
  title,
  description,
  expected,
  confirmLabel = "מחק לצמיתות",
  cancelLabel = "ביטול",
  onClose,
  onConfirm,
  pending = false,
  error = null,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  expected: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  if (!open) return null;

  const canConfirm = typed.trim() === expected && !pending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-lg font-bold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="סגור"
            className="rounded-md p-1 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed">{description}</div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            הקלד <span className="font-mono font-bold text-foreground">{expected}</span> לאישור:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={pending}
            autoFocus
            dir="ltr"
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="py-2 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="py-2 px-4 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
