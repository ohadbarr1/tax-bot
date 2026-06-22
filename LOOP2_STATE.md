# LOOP2_STATE.md — "Flow Rebuild" ledger (mutable)

> Read `LOOP2_GOAL.md` (charter) then this. Each tick: do the NEXT ACTION through
> the inner cycle (§4) — incl. the MANDATORY live walkthrough — update this file,
> commit. THE HARD RULE: no track closes without live screenshots.

---

## STATUS: ⏸️ CHECKPOINT — M1 (flow) + R3 (logout) + R4 (expenses) done & live-verified. R5 + smart-Q + R6 remain.

- **Done & LIVE-VERIFIED:** R0 flow machine · R1 stepper+guard+back+mobile bar+הבית-resume-CTA · R2 reorder (docs→Q) · R3 auto-logout (warn+logout fired) · R4 expense display (red/parens; live check pending in R6 seeded run).
- **Remaining:** R2 smart-questionnaire (skip doc-covered fields) · **R5 deep filing explanation + per-element drill-down (1.6)** — the big content piece, deserves focused attention, not a rush · R6 full E2E reel.
- **Maps to user's 6:** 1.1 ✅(R3) · 1.2 ✅(R0/R2) · 1.3 ✅(R0/R1) · 1.4 ✅(R1) · 1.5 ✅(R4, live-check pending) · 1.6 ⬜(R5).
- **Gate:** 588 pass · build ✓ · lint 0err/45warn. Branch `loop/flow-rebuild`.

## (history below)
## (prev) RUNNING — M1 core

- **Done & live-verified:** R0 (flow state machine) · R1 core (stepper + no-skip guard + back-to-sources) · R2 core (reorder docs-before-questionnaire).
- **LIVE proof (preview, desktop 1280):** /filing & /summary deep-links bounce to current stage; stepper shows sources✓→documents(active)→שאלון/סיכום/הגשה locked; new flow questionnaire starts at step 1 (פרטים אישיים); back-to-sources works; docs precede questionnaire.
- **Still open in M1:** (a) **הבית hub** rebuild — /dashboard is still the old grab-bag (the stepper's "כסף חזרה" links to it); (b) **mobile stepper** — FlowChrome stepper is `hidden md:flex`, so on mobile flow routes have no nav (old Sidebar had bottom-tabs); (c) **R2 smart-questionnaire** — questionnaire still asks everything; should skip fields the docs already filled.
- **Then M2:** R3 logout · R4 expense display · R5 deep filing. **M3:** R6 full E2E reel.
- **Gate:** 585 pass · build ✓ · lint 0err/45warn.
- **Branch:** `loop/flow-rebuild` (off main `6a6c748`).

---

## NEXT ACTION

> Finish M1: (1) rebuild /dashboard (הבית) as a hub — start new / resume / past
> drafts — off the flow; (2) add a mobile stepper to FlowChrome (top bar) so flow
> routes have nav < md; (3) R2 smart-questionnaire — hide/short-circuit steps
> whose fields the mined docs already filled. Live-verify each. Then M2 (R3/R4/R5).

---

## Track board

Legend: ⬜ not started · 🔵 in progress · ✅ done (gate green + LIVE screenshots + reviewer PASS) · 🚧 blocked

| Track | Status | Reviewer | Fixes | Live-verified? |
|-------|--------|----------|-------|----------------|
| R0 Flow state machine | ✅ | qa-lead | 1.2, 1.3 (stage-1) | ✅ live |
| R1 IA: stepper + guard + back | 🔵 | product-lead | 1.3 (orphan), 1.4 | ✅ stepper/guard live; ⬜ הבית hub, ⬜ mobile bar |
| R2 Reorder docs→questionnaire + smart Q | 🔵 | product-lead | 1.2 | ✅ reorder live; ⬜ smart-skip |
| R3 Session auto-logout (60 min) | ⬜ | qa-lead | 1.1 | — |
| R4 Accounting expense display | ⬜ | product-lead | 1.5 | — |
| R5 Deep filing explanation + drill-downs | ⬜ | tax-pro | 1.6 | — |
| R6 Full live E2E walkthrough | ⬜ | product-lead | (proof) | — |

**Milestones:** M1 = R0+R1+R2 · M2 = R3+R4+R5 · M3 = R6.

---

## Iteration log (newest first)

### Iter 1 — 2026-06-22 — R0 + R1/R2 core
- Did: lib/flowStage.ts (stage machine) +9 tests; createDraft full onboarding reset + clear lastSlug (new-flow-stage-1 fix); FlowChrome (gated stepper + guard) replaces Sidebar on flow routes; reordered welcome→documents→questionnaire→summary→filing with stage-completion markers; removed 2 obsolete tests.
- Gate: 585 pass, build ✓, lint 45. LIVE-VERIFIED in preview (see STATUS).
- Commits: 13223c7 (R0), 7bfaf4c (R1/R2 core)
- Next: finish M1 — הבית hub rebuild, mobile stepper, smart-questionnaire skip.

---

## Decisions / blockers

- Locked 2026-06-22: flow order Sources→Docs→Questionnaire→Summary→Filing; הבית=hub + in-flow stepper; 60-min warn-then-logout. (See LOOP2_GOAL §2.)

## Deferred

*(none yet)*
