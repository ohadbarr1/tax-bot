"use client";
// Resume the questionnaire at the FIRST INCOMPLETE step (data-driven), so an
// empty/new flow always opens at step 1 instead of jumping to an advanced step
// (the user-reported bug). Replaces the old localStorage `lastSlug` resume,
// which could land on a later step even when earlier ones were blank.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { firstIncompleteStepSlug } from "@/lib/questionnaireValidation";

export default function QuestionnaireResume() {
  const router = useRouter();
  const { state, hydrated } = useApp();

  useEffect(() => {
    if (!hydrated) return; // wait for saved data before deciding the resume point
    const slug = firstIncompleteStepSlug(state.taxpayer, state.financials);
    router.replace(`/questionnaire/${slug}`);
  }, [router, hydrated, state.taxpayer, state.financials]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
