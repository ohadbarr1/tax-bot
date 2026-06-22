# LOOP2_STATE.md — "Flow Rebuild" ledger (mutable)

> Read `LOOP2_GOAL.md` (charter) then this. Each tick: do the NEXT ACTION through
> the inner cycle (§4) — incl. the MANDATORY live walkthrough — update this file,
> commit. THE HARD RULE: no track closes without live screenshots.

---

## STATUS: ⏸️ DESIGNED — awaiting human "go"

- **Current track:** R0 · Flow state machine
- **Cycle step:** 1 (Spec)
- **Baseline (from Loop 1 / current main):** 580 tests pass · build ✓ · lint 0err/45warn
- **Branch:** will work on `loop/flow-rebuild` (off current main `6a6c748`)

---

## NEXT ACTION

> Start R0. First, run a baseline LIVE walkthrough of the CURRENT flow in preview
> and screenshot the actual glitches (new-flow-starts-mid-questionnaire; /documents
> orphan; can't return to income sources) — capture the "before" so the fix is
> provable. Then spec the flow state machine: enumerate the 5 stages, their
> completion criteria, and the resume/guard rules; write a failing test for
> "new draft → stage ①" and "cannot deep-link to an incomplete stage".

---

## Track board

Legend: ⬜ not started · 🔵 in progress · ✅ done (gate green + LIVE screenshots + reviewer PASS) · 🚧 blocked

| Track | Status | Reviewer | Fixes | Live-verified? |
|-------|--------|----------|-------|----------------|
| R0 Flow state machine | ⬜ | qa-lead | 1.2, 1.3 (stage-1) | — |
| R1 IA rebuild (stepper + הבית + docs-in-flow) | ⬜ | product-lead | 1.3 (orphan), 1.4 | — |
| R2 Reorder docs→questionnaire + smart Q | ⬜ | product-lead | 1.2 | — |
| R3 Session auto-logout (60 min) | ⬜ | qa-lead | 1.1 | — |
| R4 Accounting expense display | ⬜ | product-lead | 1.5 | — |
| R5 Deep filing explanation + drill-downs | ⬜ | tax-pro | 1.6 | — |
| R6 Full live E2E walkthrough | ⬜ | product-lead | (proof) | — |

**Milestones:** M1 = R0+R1+R2 · M2 = R3+R4+R5 · M3 = R6.

---

## Iteration log (newest first)

*(empty — awaiting go)*

---

## Decisions / blockers

- Locked 2026-06-22: flow order Sources→Docs→Questionnaire→Summary→Filing; הבית=hub + in-flow stepper; 60-min warn-then-logout. (See LOOP2_GOAL §2.)

## Deferred

*(none yet)*
