"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useApp } from "@/lib/appContext";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { IncomeSourceGrid } from "@/components/onboarding/IncomeSourceGrid";
import type { FilingType, IncomeSourceId } from "@/types";
import { cn } from "@/lib/utils";

/**
 * WelcomeWizard — the single entry of the canonical spine.
 *
 *   income sources → questionnaire → documents → summary → filing
 *
 * Step 1 (here): pick income sources. We create the draft, record the sources,
 * and hand off to the questionnaire. Document upload + mining happens later at
 * /documents (driven by these sources + the questionnaire answers), so manual
 * answers are captured first and the manual-wins override rule (T0.2) protects
 * them from any conflicting mined value.
 *
 * FilingType is inferred heuristically from the sources so downstream code that
 * still reads filingType keeps working; the user can adjust later.
 */

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

  const [sources, setSources] = useState<IncomeSourceId[]>([]);

  const handleContinue = () => {
    if (sources.length === 0) return;
    createDraft(currentTaxYear(), inferFilingType(sources), "refund");
    setIncomeSources(sources);
    markSourcesSelected();
    router.push("/questionnaire");
  };

  return (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4 pt-10 sm:pt-4">
      <div className="w-full max-w-2xl">
        <motion.div
          key="sources"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <IncomeSourceGrid selected={sources} onChange={setSources} />
          <button
            onClick={handleContinue}
            disabled={sources.length === 0}
            className={cn(
              "mt-6 w-full font-bold py-3 rounded-xl transition-opacity",
              sources.length === 0
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-amber-500 text-stone-950 hover:opacity-90",
            )}
          >
            המשך ←
          </button>
        </motion.div>
      </div>
    </div>
  );
}
