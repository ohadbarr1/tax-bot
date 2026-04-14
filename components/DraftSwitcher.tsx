"use client";
import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function DraftSwitcher() {
  const { state, allDrafts, switchDraft } = useApp();
  const [open, setOpen] = useState(false);
  const currentDraft = state.drafts[state.currentDraftId];

  if (!currentDraft) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80 hover:text-foreground bg-muted/60 hover:bg-muted px-3 py-1.5 rounded-xl transition-colors"
      >
        <span>{currentDraft.taxYear}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 end-0 z-50 bg-popover border border-border rounded-2xl shadow-[var(--shadow-card-hover)] min-w-[160px] overflow-hidden">
            {allDrafts.map((draft) => (
              <button
                key={draft.id}
                onClick={() => { switchDraft(draft.id); setOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors",
                  draft.id === state.currentDraftId && "font-bold text-primary"
                )}
              >
                <span>שנת מס {draft.taxYear}</span>
                {draft.id === state.currentDraftId && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">נוכחי</span>}
              </button>
            ))}
            <div className="border-t border-border">
              <Link
                href="/welcome"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף שנת מס
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
