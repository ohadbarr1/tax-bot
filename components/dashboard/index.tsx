"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { employersOverlap } from "@/lib/utils";
import { downloadGeneratedForm } from "@/lib/pdfDownload";
import type { InsightPillar, TaxInsight } from "@/types";
import { Hero } from "./Hero";
import { PillarGrid } from "./PillarGrid";
import { ActionItems } from "./ActionItems";
import { Timeline } from "./Timeline";
import { IncomeBreakdown } from "./IncomeBreakdown";
import { InsightsList } from "./InsightsList";
import { Optimizer } from "@/components/Optimizer";
import { YoYCompare } from "@/components/YoYCompare";
import { DeferredDocReminderBanner } from "@/components/DeferredDocReminderBanner";

const PILLAR_ORDER: InsightPillar[] = [
  "coordination",
  "deductions",
  "severance",
  "credit_points",
  "capital_markets",
];

export default function Dashboard() {
  const { state, updateFinancials, allDrafts } = useApp();
  const { financials, taxpayer } = state;
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadDisabled = !taxpayer.idNumber;
  const downloadDisabledReason = downloadDisabled
    ? "השלם פרטים אישיים לפני הורדה"
    : undefined;

  const handleDownloadDraft = async () => {
    if (downloadDisabled || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    const result = await downloadGeneratedForm(taxpayer, financials, {
      selectedSources: state.onboarding?.sources,
    });
    setDownloading(false);
    if (result.kind === "error") {
      setDownloadError(result.message);
    } else if (result.kind === "template_missing") {
      setDownloadError(
        `נדרש להעלות את התבנית הרשמית של טופס ${result.formType} לשרת. פנה לצוות התמיכה.`,
      );
    }
  };

  const extractedYears = new Set(
    allDrafts.filter((d) => d.financials.calculationResult).map((d) => d.taxYear)
  );
  const hasYoY = extractedYears.size > 1;

  const insightsByPillar = PILLAR_ORDER.reduce<Record<InsightPillar, TaxInsight[]>>(
    (acc, p) => {
      acc[p] = financials.insights.filter((i) => i.pillar === p);
      return acc;
    },
    {} as Record<InsightPillar, TaxInsight[]>
  );

  const activePillars = PILLAR_ORDER.filter((p) => insightsByPillar[p].length > 0);
  const completedActions = financials.actionItems.filter((a) => a.completed).length;
  const totalActions = financials.actionItems.length;
  const pendingActions = totalActions - completedActions;
  const hasOverlap = employersOverlap(taxpayer.employers);

  return (
    <div className="kc-rise max-w-[1200px] mx-auto px-6 md:px-10 py-6 space-y-8">
      <DeferredDocReminderBanner />

      <Hero
        financials={financials}
        taxpayer={taxpayer}
        hasOverlap={hasOverlap}
        completedActions={completedActions}
        totalActions={totalActions}
        pendingActions={pendingActions}
        onDownloadDraft={handleDownloadDraft}
        downloading={downloading}
        downloadDisabled={downloadDisabled}
        downloadDisabledReason={downloadDisabledReason}
        onQuestionnaire={() => router.push("/questionnaire")}
      />
      {downloadError && (
        <div
          role="alert"
          className="rounded-xl border text-sm px-4 py-3"
          style={{
            background: "rgba(231,111,81,0.08)",
            borderColor: "rgba(231,111,81,0.3)",
            color: "var(--kc-coral)",
          }}
        >
          {downloadError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8">
        <IncomeBreakdown taxpayer={taxpayer} financials={financials} />
        <Timeline completed={completedActions} total={totalActions} />
      </div>

      {activePillars.length > 0 && (
        <PillarGrid
          insightsByPillar={insightsByPillar}
          activePillars={activePillars}
          totalRefund={financials.estimatedRefund}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ActionItems
            financials={financials}
            completedActions={completedActions}
            totalActions={totalActions}
            pendingActions={pendingActions}
            updateFinancials={updateFinancials}
          />
          <Optimizer />
        </div>
        <div>
          <InsightsList
            taxpayer={taxpayer}
            financials={financials}
            hasOverlap={hasOverlap}
          />
        </div>
      </div>

      {hasYoY && <YoYCompare />}
    </div>
  );
}
