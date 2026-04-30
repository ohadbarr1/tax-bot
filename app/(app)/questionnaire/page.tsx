"use client";
// Resume the user on the LAST questionnaire step they visited.
// Source of truth is localStorage (sync, no auth race). The [step]
// page writes there on every mount; we read here before any auth /
// Firestore round-trip.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isValidSlug, FIRST_SLUG } from "@/lib/questionnaireSteps";

const LAST_STEP_KEY = "taxbot.questionnaire.lastSlug";

export default function QuestionnaireResume() {
  const router = useRouter();
  useEffect(() => {
    let slug = FIRST_SLUG;
    try {
      const stored = window.localStorage.getItem(LAST_STEP_KEY);
      if (stored && isValidSlug(stored)) slug = stored;
    } catch { /* localStorage unavailable (private mode) — fall through */ }
    router.replace(`/questionnaire/${slug}`);
  }, [router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
