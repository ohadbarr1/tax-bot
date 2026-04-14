"use client";
import { useApp } from "@/lib/appContext";
import { TaxTimeline } from "@/components/TaxTimeline";
import { useRouter } from "next/navigation";

export default function HistoryPage() {
  const { state, allDrafts, switchDraft } = useApp();
  const router = useRouter();

  const handleSelect = (draftId: string) => {
    switchDraft(draftId);
    router.push("/dashboard");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">היסטוריית הגשות</h1>
        <p className="text-muted-foreground text-sm mt-1">כל שנות המס שלכם במקום אחד</p>
      </div>
      <TaxTimeline drafts={allDrafts} currentDraftId={state.currentDraftId} onSelect={handleSelect} />
      {/* Draft cards */}
      <div className="grid gap-4">
        {allDrafts.map((draft) => (
          <div key={draft.id} className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between shadow-[var(--shadow-card)]">
            <div>
              <p className="font-bold text-foreground">שנת מס {draft.taxYear}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {draft.questionnaire.completed ? "שאלון הושלם" : "שאלון לא הושלם"} ·{" "}
                {draft.financials.estimatedRefund > 0 ? `החזר משוער: ₪${draft.financials.estimatedRefund.toLocaleString()}` : "החזר לא חושב"}
              </p>
            </div>
            <button
              onClick={() => handleSelect(draft.id)}
              className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
            >
              {draft.id === state.currentDraftId ? "נוכחי" : "עבור לשנה"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
