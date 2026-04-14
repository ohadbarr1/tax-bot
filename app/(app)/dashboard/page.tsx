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

  return (
    <>
      {state.currentView === "upload" && <FileDropzone />}
      {(state.currentView === "dashboard" || state.currentView === "questionnaire") && <Dashboard />}
      {state.currentView === "ibkr" && <IbkrAnalysisDashboard />}
    </>
  );
}
