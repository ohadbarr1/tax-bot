"use client";
// Resume the user on the LAST questionnaire step they reached.
// Priority:
//   1. localStorage `lastSlug` — sync, survives the auth/Firestore race; the
//      [step] page writes it on every mount.
//   2. persisted `questionnaire.step` from AppContext — covers a new device or
//      cleared cache, where localStorage has no hint but Firestore has the draft
//      (the pre-loop bug bounced these users back to step 1).
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { isValidSlug, FIRST_SLUG, stepToSlug } from "@/lib/questionnaireSteps";

const LAST_STEP_KEY = "taxbot.questionnaire.lastSlug";

export default function QuestionnaireResume() {
  const router = useRouter();
  const { state, hydrated } = useApp();

  useEffect(() => {
    // 1. localStorage hint (sync).
    let slug: string | null = null;
    try {
      const stored = window.localStorage.getItem(LAST_STEP_KEY);
      if (stored && isValidSlug(stored)) slug = stored;
    } catch { /* localStorage unavailable (private mode) */ }

    // 2. Fall back to persisted state — but wait for hydration before deciding,
    //    so we don't redirect to step 1 prematurely.
    if (!slug) {
      if (!hydrated) return;
      const step = state.questionnaire?.step ?? 1;
      slug = stepToSlug(step) ?? FIRST_SLUG;
    }

    router.replace(`/questionnaire/${slug}`);
  }, [router, hydrated, state.questionnaire?.step]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
