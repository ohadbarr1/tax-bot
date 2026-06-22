# LOOP2_STATE.md — "Flow Rebuild" ledger (mutable)

> Read `LOOP2_GOAL.md` (charter) then this. Each tick: do the NEXT ACTION through
> the inner cycle (§4) — incl. the MANDATORY live walkthrough — update this file,
> commit. THE HARD RULE: no track closes without live screenshots.

---

## STATUS: ✅ LOOP 2 COMPLETE — all 6 user points fixed & live-verified (smart-Q deferred as enhancement). Awaiting human: merge `loop/flow-rebuild`.

- **All 6 done & LIVE-VERIFIED in a full E2E run:** 1.1 auto-logout (R3) · 1.2 gated flow (R0/R2) · 1.3 new-flow-stage-1 + docs-in-flow (R0/R1) · 1.4 stepper+back-to-sources+hub (R1) · 1.5 expenses red/parens — מס שנוכה (₪70,000) shown red live (R4) · 1.6 detailed filing explanation with § + capital-gains drill-down (R5).
- **R6 E2E (live, desktop):** sources(salary)→documents→questionnaire(8 steps, started at 1)→summary→filing; gating + stepper correct; waterfall reconciles to ₪16,604; per-line § explanations present.
- **Questionnaire resume bug FIXED** (user clarified: empty flow jumped to advanced steps): `firstIncompleteStepSlug` resumes at the first incomplete step → empty data opens at step 1. "Smart questionnaire" was a misread — NOT needed.
- **CG drill-down verified vs REAL 2025 IBKR statement** (account U14867394): profit ₪91,141 / loss ₪31,262 / div ₪963 / WHT ₪312 → net ₪59,879 → CG tax ₪14,899 (`lib/__tests__/ibkrRealData.test.ts`). Live on-screen render with this data still pending an IBKR upload.
- **Deferred (non-blocking):** foreign-credit §200-vs-engine-§67א naming reconcile; 867 PDF cross-check not wired. See HANDOFF.md + DEFERRED_ACTIONS.md.
- **Gate:** 589 pass · build ✓ · 0 lint errors. **8 commits on `loop/flow-rebuild`** (off main `6a6c748`); main untouched.

## R7/R8/R9 — ✅ DONE & LIVE-VERIFIED (2026-06-22, branch `loop/r7-r9` off main `7902d29`)

Commit `441c1b6`. Gate: 597 tests pass · build ✓ · 0 lint errors. All three driven live in preview.

- **R7 · Delete employers (bug) — ✅.** Root cause: `app/api/mine/document/route.ts:146` stamps `isMainEmployer:true` on every emitted employer; `resolveMinedFields` appends each mis-classified doc (הפניקס/הייבריד) as a NEW row → multiple undeletable "ראשי". Fix: (a) `resolveMinedFields` forces `isMainEmployer=false` for appended rows (idx>0); (b) `removeEmployer` (questionnaire + DetailsForm) deletes ANY row, keeps ≥1, promotes first remaining to main when the main is removed; (c) `Step4Employers` shows trash on every row when >1. **Live:** 3 rows → trash on all incl. main; delete main → promotion (1 "ראשי" kept); delete to 1 → trash hidden.
- **R8 · Broker-tax page — ✅.** New route `/filing/capital-gains` lists realized trades trade-by-trade (symbol, date, qty, proceeds, basis, realized P/L in $, per-date BoI FX, ILS P/L) + §92(א) loss-offset total + the aggregate `CapitalGainsDetail` build below. `ibkrParser` now retains `trades[]`+`baseCurrency`, threaded through `IbkrParseResponse` + parse route → persists on `financials.ibkrData.trades`. Filing page links to it when trades>0. **Live:** uploaded a CSV → real `/api/parse/ibkr` returned 4 trades → page rendered NVDA +₪26,463 / AAPL (₪9,490) / MSFT +₪4,928 / AMD (₪27), total ₪21,874 reconciling to aggregate net ₪21,873.
- **R9 · Filing copy — ✅.** `app/(app)/filing/page.tsx` no longer hardcodes "טופס 135" — label via `determineFormType` (showed **טופס 1301** live for the broker case). Removed false-submission copy ("נשלח את הטופס ישירות למחשב של מס הכנסה", "שולח ל-135"); "חתימה והגשה" step reframed "הורדה והגשה עצמית"; header "אתה במרחק חתימה"→"הורדה". FilingKit.tsx + marketing pages were already correct.

### Notes / deferred
- `POST /api/mine/document → 500` observed when a `.csv` is also routed through the generic doc-miner (two file inputs on /documents). Pre-existing; IBKR `/api/parse/ibkr` path works. Worth a look (R10?).
- Branch is `loop/r7-r9` (main already had the Loop-2 merge + the R7/R8/R9 queue commit `7902d29`); awaiting human merge.

## (history below)
## (prev) CHECKPOINT

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
