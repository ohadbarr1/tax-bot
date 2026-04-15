"use client";
import { useApp } from "@/lib/appContext";
import Dashboard from "@/components/Dashboard";
import { FileDropzone } from "@/components/FileDropzone";
import IbkrAnalysisDashboard from "@/components/IbkrAnalysisDashboard";

export default function DashboardPage() {
  const { state, hydrated } = useApp();

  if (!hydrated) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Dashboard is the single post-questionnaire landing surface. Once the
  // questionnaire is complete we render it unconditionally — even with zero
  // uploaded documents the estimated refund and insights are already computed
  // from the questionnaire answers and the user should see them immediately.
  // Pre-completion only, we respect `currentView` so /dashboard can still be
  // used as a hosting page for the upload/ibkr flows if the user lands here
  // early.
  if (state.questionnaire.completed) {
    return <Dashboard />;
  }

  return (
    <>
      {state.currentView === "upload" && <FileDropzone />}
      {state.currentView === "dashboard" && <Dashboard />}
      {state.currentView === "ibkr" && <IbkrAnalysisDashboard />}
    </>
  );
}
