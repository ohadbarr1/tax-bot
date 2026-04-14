"use client";
import { useApp } from "@/lib/appContext";
export default function SettingsPage() {
  const { state } = useApp();
  const currentDraft = state.drafts[state.currentDraftId];
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">פרופיל</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">שם</span>
            <span className="text-foreground font-medium">{currentDraft?.taxpayer.fullName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">שנת מס נוכחית</span>
            <span className="text-foreground font-medium">{currentDraft?.taxYear}</span>
          </div>
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-muted-foreground text-sm">הגדרות מתקדמות, שפה, ואבטחה יהיו זמינות בשלב P8.</p>
      </div>
    </div>
  );
}
