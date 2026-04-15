"use client";

import { FileText, CheckCircle2, Undo2 } from "lucide-react";
import type { FieldProvenance } from "@/types";
import { cn } from "@/lib/utils";

/**
 * SourcePill — inline provenance badge shown next to a prefilled field.
 *
 * Three visual tiers, NEVER a raw percentage:
 *   - high   → neutral, "מהמסמך שלך"
 *   - medium → amber underline, "מצאנו, אנא אשרו"
 *   - low    → muted, "נחש — אנא בדקו"
 * Clicking the undo button resets the field and removes provenance — the
 * user can re-upload the doc or enter the value manually.
 */
export function SourcePill({
  provenance,
  onUndo,
  confirmed,
}: {
  provenance: FieldProvenance;
  onUndo?: () => void;
  confirmed?: boolean;
}) {
  const tone =
    confirmed
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : provenance.confidence === "high"
      ? "text-slate-700 bg-slate-50 border-slate-200"
      : provenance.confidence === "medium"
      ? "text-amber-800 bg-amber-50 border-amber-300"
      : "text-muted-foreground bg-muted border-border";

  const label = confirmed
    ? "מאושר"
    : provenance.confidence === "high"
    ? `מתוך ${provenance.sourceLabel}`
    : provenance.confidence === "medium"
    ? `נמצא ב${provenance.sourceLabel} — אשרו`
    : `ניחוש מתוך ${provenance.sourceLabel}`;

  const Icon = confirmed ? CheckCircle2 : FileText;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
        tone
      )}
    >
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-[14rem]">{label}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="opacity-60 hover:opacity-100"
          aria-label="בטל מילוי"
        >
          <Undo2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
