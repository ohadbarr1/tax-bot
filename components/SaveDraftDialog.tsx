"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Save, Check } from "lucide-react";

/**
 * SaveDraftDialog -- modal for naming and saving the current draft.
 * Shows a text input, then a success confirmation on save.
 */
export function SaveDraftDialog({
  open,
  defaultName,
  onSave,
  onCancel,
}: {
  open: boolean;
  /** Pre-fill for the name input (e.g. existing name or "שנת מס 2025"). */
  defaultName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset internal state when dialog opens
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setSaved(false);
      // Focus the input after the animation settles
      setTimeout(() => inputRef.current?.select(), 120);
    }
  }, [open, defaultName]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setSaved(true);
  };

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
            aria-labelledby="save-draft-title"
            className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-6 text-right"
          >
            {!saved ? (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Save className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="save-draft-title" className="text-base font-bold text-foreground">
                      שמור תהליך
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      תן שם לתהליך כדי למצוא אותו בקלות אחר כך
                    </p>
                  </div>
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  placeholder='לדוגמה: "תיאום מס אוהד 2025"'
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
                  dir="rtl"
                />

                <div className="flex flex-col sm:flex-row-reverse gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim()}
                    className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    שמור
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 border border-border text-foreground font-semibold py-2.5 rounded-xl hover:bg-muted transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Check className="w-7 h-7" />
                </div>
                <h2 className="text-base font-bold text-foreground">התהליך נשמר בהצלחה</h2>
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  התהליך נשמר כולל כל הקבצים והפרטים
                </p>
                <button
                  type="button"
                  onClick={onCancel}
                  className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
                >
                  סגור
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
