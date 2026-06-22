# LOOP2_GOAL.md — "Flow Rebuild" Remediation Loop (charter, read-only)

> Loop 1 (`LOOP_GOAL.md`) fixed logic but I over-claimed "rock-solid onboarding"
> after verifying only ONE slice live. The user re-tested and the flow still
> glitches. This loop rebuilds the onboarding structure and is governed by one
> hard rule below.

## 0. THE HARD RULE (why Loop 1 failed)

**A track is DONE only after I have driven the REAL running app through it in the
browser (preview tools) and captured screenshots proving it works — including
forward, back, refresh, resume, and the failure paths.** "npm test passes" is
necessary but NOT sufficient and never closes a track on its own. Every track's
gate includes a live walkthrough. If I can't drive it live, the track is BLOCKED,
not done.

## 1. Mission

Rebuild onboarding as ONE strictly-gated linear flow the user cannot get lost in,
and fix all six reported defects — each live-verified end to end.

## 2. Locked decisions (2026-06-22)

- **Flow order:** ① Income sources → ② Documents (upload the forms the sources
  imply + mine them) → ③ Questionnaire (asks ONLY what the docs didn't cover) →
  ④ Summary → ⑤ Filing. (Docs BEFORE questionnaire — reverses Loop 1.)
- **IA:** `הבית` = a hub (start new / resume / past drafts), OUTSIDE the flow.
  During the flow the sidebar is replaced by a 5-step **progress stepper**. No
  off-flow nav. `/documents` is NOT a standalone page — it IS stage ②.
- **Gating:** can't jump ahead to an incomplete stage; CAN step back to any
  completed stage, including re-picking income sources. New flow → stage ①.
  In-progress flow → resumes at its current stage.
- **Auto-logout:** 60 min idle → warning at ~55 min with a countdown → hard
  logout + clear sensitive in-memory state at 60. (Drafts persist.)

## 3. The six defects to fix (user's words → track)

1.1 User never logs out → **R3** session auto-logout.
1.2 Flow too liberal; must be sources→docs→questionnaire→summary → **R0 + R2**.
1.3 Questionnaire doesn't start at stage 1 on a new flow; `/documents` orphaned
    from the flow → **R0 + R1**.
1.4 Sidebar + onboarding incoherent; can't return to income sources; `הבית`
    off-process → **R1**.
1.5 Expenses (e.g. מס שנוכה) must display as expenses — red, in parentheses
    `(₪1,234)` → **R4**.
1.6 `הגשה` explanation too concise; needs full per-line detail + a drill-down
    sub-page per element (e.g. broker capital gains) → **R5**.

## 4. Inner cycle (every track)

1. **Spec** — acceptance criteria + the live-walkthrough script (what I'll click).
2. **Red** — failing test at the seam (flow-state machine, guard, logout timer, formatter).
3. **Fix** — minimal, matches surrounding code.
4. **Verify gate:** `npm test` + `build` + `lint` + `forms:smoke`, THEN the
   **mandatory live walkthrough**: drive the real app through this track in
   preview, screenshot each step incl. back/refresh/resume; for R6 the whole flow.
5. **Adversarial review** — product-lead (flow/IA/filing-clarity), qa-lead
   (state machine, logout, edge nav), tax-pro (R5 calc detail correctness).
6. **Gate:** all green + live screenshots + reviewer PASS → commit. Else loop step 3.

## 5. Tracks (priority order; R0 unblocks R1/R2)

### R0 · Flow state machine (the spine)
Single gated controller: 5 ordered stages, one source of truth for "current
stage", completion criteria per stage, forward-only-to-next-incomplete, back to
any completed stage, new-flow=①, resume=current. Replaces the ad-hoc routing +
the localStorage/last-slug resume that lets a new flow start mid-questionnaire.
**Done when:** a fresh draft starts at ①; you can't deep-link past an incomplete
stage; back works; live-verified.

### R1 · IA rebuild — stepper + הבית hub + documents-in-flow
Replace the sidebar with the 5-step stepper during the flow; build `הבית` as the
hub (start/resume/drafts); make `/documents` stage ②; income-sources reachable
via stepper-back; delete/relocate off-flow nav. **Done when:** no orphan pages,
sidebar matches the flow, live-verified incl. returning to income sources.

### R2 · Reorder to Docs-before-Questionnaire + smart questionnaire
Move docs to stage ②; questionnaire (stage ③) reads mined-doc state and skips
fields already covered, asking only gaps. **Done when:** uploading a 106 pre-fills
the questionnaire and the covered steps are hidden/short; live-verified.

### R3 · Session auto-logout (60 min)
Idle timer (reset on activity), warning modal at ~55 min with countdown, hard
logout + clear sensitive state at 60. **Done when:** live-verified (fast-forward
the timer) — warning shows, logout fires, state cleared.

### R4 · Accounting-style expense display
A shared formatter: expenses / withholding / losses render red + parenthesized
`(₪1,234)`; income/refunds normal. Applied across summary, calc waterfall, filing.
**Done when:** מס שנוכה etc. show red-in-parens everywhere; live-verified.

### R5 · Deep filing explanation + per-element drill-down
Expand `הגשה` to explain every calculation line AND *why* (the rule/§). Add a
drill-down sub-page per element (capital gains/losses first: every sub-step —
proceeds, basis, FX per-lot, loss offset, rate, foreign credit). **Done when:**
a CPA-literate user can trace every number; live-verified; tax-pro PASS.

### R6 · Full live end-to-end walkthrough (the proof)
Drive the whole flow as a brand-new user: sources→docs→questionnaire→summary→
filing, plus back/refresh/resume/logout. Screenshot every stage. **Done when:**
a clean reel shows no glitches — this is the deliverable I owe from Loop 1.

## 6. Milestones (human review stops)

- **M1 = R0 + R1 + R2** — the rebuilt flow, live-verified. (Stop; user reviews.)
- **M2 = R3 + R4 + R5** — logout, expense display, deep filing.
- **M3 = R6** — final full E2E walkthrough reel.

## 7. Escalation

Stop and ask when a gate fails 3×, a flow decision isn't covered by §2, or the
live walkthrough can't be run (auth/env) — never substitute a passing test for a
missing live verification.
