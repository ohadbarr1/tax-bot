"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Clock, ArrowLeft, X } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { evaluateDeferredReminders, hebrewDocLabel } from "@/lib/deferredDocReminders";
import { useState } from "react";

/**
 * DeferredDocReminderBanner — dashboard chrome.
 *
 * Renders a single banner summarizing deferred documents the user hasn't
 * gotten back to. "due" = friendly gray, "overdue" = amber warn. A Dismiss
 * (X) button hides the banner for the rest of the session (not persisted
 * — we want the user to see it again next time so the refund actually gets
 * claimed).
 */
export function DeferredDocReminderBanner() {
  const { state } = useApp();
  const [dismissed, setDismissed] = useState(false);

  const summary = useMemo(
    () => evaluateDeferredReminders(state.documents),
    [state.documents]
  );

  if (dismissed || !summary.headline) return null;

  const tone =
    summary.headline === "overdue"
      ? "border-amber-300 bg-amber-50/70 text-amber-900"
      : "border-border bg-card text-foreground";

  const Icon = summary.headline === "overdue" ? AlertCircle : Clock;

  const total = summary.reminders.length;
  const titleHe =
    summary.headline === "overdue"
      ? `נותרו ${total} מסמכים שלא העלית`
      : `יש ${total} מסמכים שדחית`;

  const firstFew = summary.reminders.slice(0, 3);

  return (
    <AnimatePresence>
      <motion.div
        dir="rtl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`rounded-2xl border p-4 mb-6 ${tone}`}
      >
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{titleHe}</p>
            <p className="text-xs mt-1 opacity-80">
              העלאה עכשיו = מילוי פרטים אוטומטי וסיכוי להחזר גבוה יותר.
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {firstFew.map((r) => (
                <li key={r.doc.id} className="flex items-center gap-2">
                  <span className="font-semibold">{hebrewDocLabel(r.doc.type)}</span>
                  <span className="opacity-70">· נדחה לפני {r.ageDays} ימים</span>
                </li>
              ))}
              {total > firstFew.length && (
                <li className="opacity-70">ו-{total - firstFew.length} נוספים…</li>
              )}
            </ul>
            <Link
              href="/welcome"
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:opacity-80"
            >
              חזרה להעלאת מסמכים
              <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground/80 hover:text-foreground"
            aria-label="הסתר הודעה"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
