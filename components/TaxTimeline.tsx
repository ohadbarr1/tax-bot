"use client";
import { cn } from "@/lib/utils";
import type { TaxYearDraft } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "טיוטה",
  submitted: "הוגש",
  filed: "בתהליך",
  refunded: "הוחזר",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-800",
  filed: "bg-emerald-100 text-emerald-800",
  refunded: "bg-emerald-100 text-emerald-700",
};

interface TaxTimelineProps {
  drafts: TaxYearDraft[];
  currentDraftId: string;
  onSelect: (draftId: string) => void;
}

export function TaxTimeline({ drafts, currentDraftId, onSelect }: TaxTimelineProps) {
  const sorted = [...drafts].sort((a, b) => a.taxYear - b.taxYear);
  return (
    <div className="relative flex items-center gap-0 overflow-x-auto pb-2">
      {sorted.map((draft, idx) => {
        const active = draft.id === currentDraftId;
        return (
          <div key={draft.id} className="flex items-center">
            <button
              onClick={() => onSelect(draft.id)}
              className={cn(
                "flex flex-col items-center gap-2 px-4 py-3 rounded-2xl border transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-card-hover)]"
                  : "bg-card text-foreground border-border hover:border-primary/40 hover:shadow-[var(--shadow-card)]"
              )}
            >
              <span className="text-lg font-extrabold tabular-nums">{draft.taxYear}</span>
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                active ? "bg-white/20 text-white" : STATUS_COLOR[draft.status]
              )}>
                {STATUS_LABEL[draft.status]}
              </span>
              {draft.financials.estimatedRefund > 0 && (
                <span className={cn("text-xs font-bold tabular-nums", active ? "text-amber-300" : "text-amber-600")}>
                  ₪{draft.financials.estimatedRefund.toLocaleString()}
                </span>
              )}
            </button>
            {idx < sorted.length - 1 && (
              <div className="w-8 h-px bg-border mx-1 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
