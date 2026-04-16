"use client";
import { useState } from "react";
import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { SaveDraftDialog } from "./SaveDraftDialog";

export function DraftSwitcher() {
  const { state, allDrafts, switchDraft, saveDraft, deleteDraft } = useApp();
  const [open, setOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const currentDraft = state.drafts[state.currentDraftId];

  if (!currentDraft) return null;

  const currentLabel = currentDraft.name ?? `שנת מס ${currentDraft.taxYear}`;

  return (
    <>
      <div className="relative flex items-center gap-1.5">
        {/* Save button */}
        <button
          onClick={() => setSaveDialogOpen(true)}
          title="שמור תהליך"
          className={cn(
            "flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl transition-colors",
            currentDraft.saved
              ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60"
              : "text-foreground/80 hover:text-foreground bg-muted/60 hover:bg-muted"
          )}
        >
          <Save className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{currentDraft.saved ? "נשמר" : "שמור תהליך"}</span>
        </button>

        {/* Draft switcher dropdown trigger */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80 hover:text-foreground bg-muted/60 hover:bg-muted px-3 py-1.5 rounded-xl transition-colors"
        >
          <span className="max-w-[180px] truncate">{currentLabel}</span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full mt-1 end-0 z-50 bg-popover border border-border rounded-2xl shadow-[var(--shadow-card-hover)] min-w-[220px] overflow-hidden">
              {allDrafts.map((draft) => {
                const label = draft.name ?? `שנת מס ${draft.taxYear}`;
                const isCurrent = draft.id === state.currentDraftId;
                const canDelete = !isCurrent;

                return (
                  <div
                    key={draft.id}
                    className={cn(
                      "flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors group",
                      isCurrent && "font-bold text-primary"
                    )}
                  >
                    <button
                      onClick={() => { switchDraft(draft.id); setOpen(false); }}
                      className="flex-1 text-start flex items-center gap-2 min-w-0"
                    >
                      <span className="truncate">{label}</span>
                      {isCurrent && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                          נוכחי
                        </span>
                      )}
                      {draft.saved && !isCurrent && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">
                          נשמר
                        </span>
                      )}
                      {!draft.saved && (
                        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full shrink-0">
                          טיוטה
                        </span>
                      )}
                    </button>
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDraft(draft.id);
                        }}
                        title="מחק תהליך"
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
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

      <SaveDraftDialog
        open={saveDialogOpen}
        defaultName={currentDraft.name ?? `תיאום מס ${currentDraft.taxYear}`}
        onSave={(name) => saveDraft(name)}
        onCancel={() => setSaveDialogOpen(false)}
      />
    </>
  );
}
