"use client";
// Lands users on the LAST questionnaire step they visited, not always step 1.
// state.questionnaire.step is mirrored from the [step] page on every mount;
// when the user clicks "שאלון" in the sidebar from anywhere, we resume.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { STEP_CONFIG, FIRST_SLUG } from "@/lib/questionnaireSteps";

export default function QuestionnaireResume() {
  const { state, hydrated } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    const step = state.questionnaire?.step ?? 1;
    const slug =
      STEP_CONFIG.find((s) => s.id === step)?.slug ?? FIRST_SLUG;
    router.replace(`/questionnaire/${slug}`);
  }, [hydrated, state.questionnaire?.step, router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
