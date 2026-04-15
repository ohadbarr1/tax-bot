"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useApp } from "@/lib/appContext";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { IncomeSourceGrid } from "@/components/onboarding/IncomeSourceGrid";
import { DocRequestPanel } from "@/components/onboarding/DocRequestPanel";
import { LiveRefundCounter } from "@/components/onboarding/LiveRefundCounter";
import type { FilingType, IncomeSourceId } from "@/types";
import { cn } from "@/lib/utils";

/**
 * WelcomeWizard — income-first onboarding.
 *
 * Step 1: pick income sources (IncomeSourceGrid).
 * Step 2: upload / defer the required docs (DocRequestPanel). Mining happens
 *         inline so when we push to /details, fields are already populated.
 *
 * We derive FilingType heuristically from the selected sources (salaried vs
 * self_employed vs mixed) so downstream code that still reads filingType keeps
 * working. The user can adjust on the details page if wrong.
 */

type Step = "sources" | "docs";

function inferFilingType(sources: IncomeSourceId[]): FilingType {
  const hasFreelance = sources.includes("freelance");
  const hasSalary = sources.includes("salary");
  if (hasFreelance && hasSalary) return "mixed";
  if (hasFreelance) return "self_employed";
  return "salaried";
}

export function WelcomeWizard() {
  const router = useRouter();
  const { createDraft, setIncomeSources, markSourcesSelected } = useApp();

  const [step, setStep] = useState<Step>("sources");
  const [sources, setSources] = useState<IncomeSourceId[]>([]);
  const [draftReady, setDraftReady] = useState(false);

  const handleContinueFromSources = () => {
    if (sources.length === 0) return;
    const filingType = inferFilingType(sources);
    createDraft(currentTaxYear(), filingType, "refund");
    setIncomeSources(sources);
    markSourcesSelected();
    setDraftReady(true);
    setStep("docs");
  };

  const handleDocsComplete = () => {
    router.push("/details");
  };

  return (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4 pt-10 sm:pt-4">
      <div className="w-full max-w-2xl">
        {step === "docs" && draftReady && <LiveRefundCounter />}

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {(["sources", "docs"] as const).map((s, i) => {
            const active = step === s || (i === 0 && step === "docs");
            return (
              <div
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  active ? "bg-primary w-12" : "bg-muted w-6"
                )}
              />
            );
          })}
        </div>

        {step === "sources" ? (
          <motion.div
            key="sources"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <IncomeSourceGrid selected={sources} onChange={setSources} />
            <button
              onClick={handleContinueFromSources}
              disabled={sources.length === 0}
              className={cn(
                "mt-6 w-full font-bold py-3 rounded-xl transition-opacity",
                sources.length === 0
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-amber-500 text-stone-950 hover:opacity-90"
              )}
            >
              המשך ←
            </button>
          </motion.div>
        ) : draftReady ? (
          <motion.div
            key="docs"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <DocRequestPanel
              sources={sources}
              onBack={() => setStep("sources")}
              onComplete={handleDocsComplete}
            />
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
