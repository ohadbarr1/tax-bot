"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

/**
 * ConfirmLeaveDialog — modal shown when the user clicks the Navbar logo
 * (or otherwise tries to leave) mid-onboarding while the current draft is
 * dirty.
 *
 * The host decides what "dirty" means and passes three callbacks:
 *   - onSave: persist + navigate away
 *   - onDiscard: wipe the in-progress draft + navigate away
 *   - onCancel: stay on the page
 *
 * Fully controlled — no internal open/close state so parents can stack it
 * on top of the existing router guard without race conditions.
 */
export function ConfirmLeaveDialog({
  open,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            key="dialog"
            dir="rtl"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-leave-title"
            className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-6 text-right"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 id="confirm-leave-title" className="text-base font-bold text-foreground">
                  יש לך שינויים שלא נשמרו
                </h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  האם לשמור את ההתקדמות לפני שעוזבים את תהליך ההרשמה?
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row-reverse gap-2">
              <button
                type="button"
                onClick={onSave}
                className="flex-1 bg-amber-500 text-stone-950 font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              >
                שמור והמשך
              </button>
              <button
                type="button"
                onClick={onDiscard}
                className="flex-1 border border-border text-foreground font-semibold py-2.5 rounded-xl hover:bg-muted transition-colors"
              >
                מחק ועזוב
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 text-sm text-muted-foreground hover:text-foreground py-2.5"
              >
                ביטול
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
