/**
 * R0 — onboarding flow state machine. New flow starts at ①; can't skip ahead;
 * can step back. Fixes the Loop-1 bug where a new flow resumed mid-questionnaire.
 */
import { describe, it, expect } from "vitest";
import { currentStage, canAccess, stageForPath, FLOW_STAGES } from "../flowStage";
import type { AppState } from "@/types";

type Slice = Pick<AppState, "onboarding" | "questionnaire">;
const make = (o: Partial<Slice["onboarding"]> = {}, completed = false): Slice => ({
  onboarding: { sources: [], sourcesSelected: false, detailsConfirmed: false, ...o },
  questionnaire: { step: 1, completed },
});

describe("currentStage", () => {
  it("brand-new flow → stage ① sources", () => {
    expect(currentStage(make())).toBe("sources");
  });
  it("sources picked → documents", () => {
    expect(currentStage(make({ sourcesSelected: true }))).toBe("documents");
  });
  it("docs confirmed → questionnaire", () => {
    expect(currentStage(make({ sourcesSelected: true, documentsConfirmed: true }))).toBe("questionnaire");
  });
  it("questionnaire done → summary", () => {
    expect(currentStage(make({ sourcesSelected: true, documentsConfirmed: true }, true))).toBe("summary");
  });
  it("summary confirmed → filing", () => {
    expect(
      currentStage(make({ sourcesSelected: true, documentsConfirmed: true, summaryConfirmed: true }, true)),
    ).toBe("filing");
  });
});

describe("canAccess (gating)", () => {
  const fresh = make();
  it("new flow: can access sources, cannot skip to questionnaire/summary/filing", () => {
    expect(canAccess(fresh, "sources")).toBe(true);
    expect(canAccess(fresh, "documents")).toBe(false);
    expect(canAccess(fresh, "questionnaire")).toBe(false);
    expect(canAccess(fresh, "filing")).toBe(false);
  });
  it("mid-flow: can step BACK to completed stages, not forward past current", () => {
    const atQuestionnaire = make({ sourcesSelected: true, documentsConfirmed: true });
    expect(canAccess(atQuestionnaire, "sources")).toBe(true); // back
    expect(canAccess(atQuestionnaire, "documents")).toBe(true); // back
    expect(canAccess(atQuestionnaire, "questionnaire")).toBe(true); // current
    expect(canAccess(atQuestionnaire, "summary")).toBe(false); // ahead
  });
});

describe("stageForPath", () => {
  it("maps flow routes; null for non-flow", () => {
    expect(stageForPath("/welcome")).toBe("sources");
    expect(stageForPath("/questionnaire/family")).toBe("questionnaire");
    expect(stageForPath("/filing")).toBe("filing");
    expect(stageForPath("/dashboard")).toBeNull();
  });
  it("FLOW_STAGES is the canonical 5-step order", () => {
    expect(FLOW_STAGES).toEqual(["sources", "documents", "questionnaire", "summary", "filing"]);
  });
});
