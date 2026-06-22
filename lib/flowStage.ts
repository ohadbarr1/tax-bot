/**
 * flowStage.ts — the onboarding flow state machine (Loop 2 / R0).
 *
 * ONE source of truth for "where is the user in the flow". The flow is strictly
 * ordered and gated:
 *
 *   ① sources → ② documents → ③ questionnaire → ④ summary → ⑤ filing
 *
 * `currentStage` is the first stage whose completion predicate is false — the
 * furthest the user is allowed to be. You may navigate BACK to any completed
 * stage, but never FORWARD past `currentStage` (no deep-linking ahead). A brand
 * new draft has every predicate false → currentStage = "sources" (stage ①),
 * fixing the Loop-1 bug where a new flow resumed mid-questionnaire.
 *
 * Pure + testable; the route guard and stepper (R1) consume these.
 */

import type { AppState } from "@/types";

export type FlowStage =
  | "sources"
  | "documents"
  | "questionnaire"
  | "summary"
  | "filing";

export const FLOW_STAGES: FlowStage[] = [
  "sources",
  "documents",
  "questionnaire",
  "summary",
  "filing",
];

export const STAGE_PATH: Record<FlowStage, string> = {
  sources: "/welcome",
  documents: "/documents",
  questionnaire: "/questionnaire",
  summary: "/summary",
  filing: "/filing",
};

export const STAGE_LABEL: Record<FlowStage, string> = {
  sources: "מקורות הכנסה",
  documents: "מסמכים",
  questionnaire: "שאלון",
  summary: "סיכום",
  filing: "הגשה",
};

/** Minimal slice of AppState the stage machine reads. */
type FlowSlice = Pick<AppState, "onboarding" | "questionnaire">;

/** Per-stage completion flags (does NOT include "filing" — it's terminal). */
export function stageCompletion(s: FlowSlice): Record<FlowStage, boolean> {
  return {
    sources: !!s.onboarding?.sourcesSelected,
    documents: !!s.onboarding?.documentsConfirmed,
    questionnaire: !!s.questionnaire?.completed,
    summary: !!s.onboarding?.summaryConfirmed,
    filing: false, // never "complete" until actually filed
  };
}

/** The furthest stage the user may be on = first incomplete stage. */
export function currentStage(s: FlowSlice): FlowStage {
  const done = stageCompletion(s);
  for (const stage of FLOW_STAGES) {
    if (!done[stage]) return stage;
  }
  return "filing";
}

export const stageIndex = (stage: FlowStage): number =>
  FLOW_STAGES.indexOf(stage);

/** May the user access `target`? Only stages at or before currentStage. */
export function canAccess(s: FlowSlice, target: FlowStage): boolean {
  return stageIndex(target) <= stageIndex(currentStage(s));
}

/** Resolve a pathname to its flow stage, or null if it's not a flow route. */
export function stageForPath(pathname: string): FlowStage | null {
  for (const stage of FLOW_STAGES) {
    const base = STAGE_PATH[stage];
    if (pathname === base || pathname.startsWith(base + "/")) return stage;
  }
  return null;
}
