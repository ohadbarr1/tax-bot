# HANDOFF — tax-bot (context-reset continuity)

Last updated: 2026-06-22. Read this first after a context reset, then `LOOP2_STATE.md`
(current loop) and `LOOP_GOAL.md`/`LOOP2_GOAL.md` (charters). Memory index:
`~/.claude/projects/-Users-ohadbar-tax-bot/memory/MEMORY.md`.

## Where things stand

- **Repo:** git lives in `/Users/ohadbar/tax-bot/app` (NOT the parent). Remote
  `origin` = github.com/ohadbarr1/tax-bot. Deploy = Firebase App Hosting on push
  to `main`.
- **Two remediation loops shipped:**
  - **Loop 1** (`LOOP_GOAL.md`/`LOOP_STATE.md`) — workflow/override/2-outputs/tax/
    forms. Merged to `main` + deployed (commit `6a6c748`).
  - **Loop 2 "Flow Rebuild"** (`LOOP2_GOAL.md`/`LOOP2_STATE.md`) — onboarding
    structure rebuild + 6 user-reported fixes. On branch **`loop/flow-rebuild`**.
- **Gate now:** 593 tests pass / build ✓ / 0 lint errors (45–46 warnings, all
  pre-existing React-19 advisories).

## Loop 2 — what's done (all live-verified in preview)

1. Auto-logout 60min/warn-55 (R3) · 2. Gated linear flow sources→**docs→
questionnaire**→summary→filing (R0/R2) · 3. New flow starts at step 1 +
`/documents` in-flow (R0/R1) · 4. Stepper (desktop rail + mobile bottom bar) +
back-to-sources + הבית hub CTA (R1) · 5. Expenses red/parens — מס שנוכה shows
`(₪70,000)` (R4) · 6. Deep filing explanation w/ § citations + capital-gains
drill-down (R5), verified against the user's REAL 2025 IBKR statement.
Questionnaire resume bug (jumped to advanced step when empty) — FIXED
(`firstIncompleteStepSlug`, data-driven resume).

Key new files: `lib/flowStage.ts` (stage machine), `components/FlowChrome.tsx`
(stepper+guard), `components/IdleLogout.tsx` + `lib/idleTimeout.ts`,
`components/CapitalGainsDetail.tsx`, `lib/summary.ts`, `lib/provenance.ts`,
`lib/questionnaireValidation.ts`. Engine: `lib/calculateTax.ts`
(capitalGainsBreakdown, surtax §121ב, §66, phantom-refund gate, CG 30%).

## Open / next

- **R7/R8/R9 — ✅ DONE & live-verified** on branch **`loop/r7-r9`** (commit
  `441c1b6`, off main `7902d29`). 597 tests / build ✓ / 0 lint errors. Awaiting
  human merge. Details in `LOOP2_STATE.md`. Summary: R7 employer-delete (mine
  route forced every mined employer to "ראשי" → undeletable; fixed + delete-any
  row w/ main-promotion); R8 new `/filing/capital-gains` per-trade page (parser
  now retains `trades[]`); R9 filing copy (dynamic 135-vs-1301, no false "we
  submit to ITA" copy).
- **NEXT UP (R10?):** `POST /api/mine/document → 500` when a `.csv` is routed
  through the generic doc-miner (two file inputs on /documents). Pre-existing;
  the IBKR parse path is unaffected.


- **"smart questionnaire" is NOT needed** — the user clarified it was the
  resume-jump bug (now fixed), not skip-the-filled-steps. Don't build skip logic.
- **CG drill-down live render** with real data not yet eyeballed on-screen
  (proven by `lib/__tests__/ibkrRealData.test.ts`; needs an IBKR upload to render
  live). The 867 PDF the user gave (`IBKR statement/U14867394_867.pdf`) is a
  cross-check source, not yet wired.
- **`DEFERRED_ACTIONS.md`** (repo root, OUTSIDE app/ git — edits aren't committed):
  🔴 rotate the leaked Anthropic API key (now public); verify 3 ITA form
  conventions vs real forms (135 main-vs-total, loss sign, dividend 141); §66
  credit-point split; foreign-credit §200-vs-engine-§67א naming.

## How to resume the loop

`cd /Users/ohadbar/tax-bot/app && git checkout loop/flow-rebuild`. Read
`LOOP2_STATE.md` NEXT ACTION. Every change: `npm test` + `npm run build` +
**drive it live in preview and screenshot** before claiming done (the Loop-1
lesson — tests passing is necessary, not sufficient).
