# LOOP_STATE.md — Mutable Progress Ledger

> The loop **edits this file every iteration**. `LOOP_GOAL.md` is the charter (read-only). On each `/loop` tick: read both → do the *Next Action* → update this file → commit. A fresh context with zero memory must be able to resume from this file alone.

---

## STATUS: 🚧 BLOCKED — pre-existing uncommitted work discovered; awaiting human decision

- **Current track:** T0 · Foundation
- **Current unit:** T0.2 — override contract (CODE DONE, gate green, not yet committed)
- **Cycle step:** 7 (Gate — blocked on git-hygiene decision)
- **Open blockers:** working tree had 15 modified files of prior "Phase 2 §2.B" work (controlling-shareholder/dividend codes, surtax, Form 867, docs page) uncommitted at loop start. Intermixed with T0.2 only in `appContext.tsx`. Need decision on how to commit. See Decisions section.
- **Last commit:** T0.1 (plan + baseline)

T0.2 status: `lib/provenance.ts` + `lib/__tests__/provenance.test.ts` (4 tests) created; `appContext.tsx` wired (resolveMinedFields + create-if-missing markFieldUserConfirmed + commitManual choke point). Gate: 526 pass / build ✓ / lint 0err 46warn. Awaiting commit pending decision.

---

## NEXT ACTION (what the next iteration does — keep this concrete)

> Implement T0.2 override contract (provenance-map based, per the plan in Iter 1 log):
> 1. Guard `markFieldUserConfirmed` to create a `{source:'manual', userConfirmed:true}` entry when none exists (`appContext.tsx:697-701`).
> 2. Add a `commitManual(patch, paths)` choke point used by the questionnaire (handleFinish + debounced sync) so questionnaire/employer/deduction edits stamp manual provenance.
> 3. Confirm `applyMiningResult` already skips `userConfirmed` (it does, `:647`) → manual wins.
> 4. Red test first: mine a 106 value → edit it manually → mine again → assert manual value survives in `taxpayer` AND provenance.source==='manual'.

---

## Baseline (fill on first iteration, then treat as the regression floor)

| Gate | Expected (audit, 2026-06-22) | Last measured | When |
|------|------------------------------|---------------|------|
| `npm test` | 522 pass / 2 skip / 45 files | 522 pass / 2 skip | Iter 1 |
| `npm run build` | pass | pass | Iter 1 |
| `npm run lint` | 0 err / 46 warn | 0 err / 46 warn | Iter 1 |
| `npm run forms:smoke` | 135: 14/14, 1301: 21/21 | 135 14/14, 1301 21/21 | Iter 1 |

Rule: test count must never drop; lint warnings must never increase.

---

## Track Board

Legend: ⬜ not started · 🔵 in progress · ✅ done (gate green + reviewer PASS) · 🚧 blocked

| Track | Status | Reviewer | Sign-off | Notes |
|-------|--------|----------|----------|-------|
| T0 Foundation (hybrid spine, override contract, kill dead flow) | 🔵 | qa-lead | — | current |
| T1 Rock-solid onboarding | ⬜ | qa-lead | — | |
| T2 Override end-to-end | ⬜ | qa-lead | — | |
| T3 Output 1 — data summary | ⬜ | product-lead | — | |
| T4 Output 2 — calc waterfall | ⬜ | product-lead + tax-pro | — | |
| T5 Tax correctness | ⬜ | tax-pro | — | surtax, §66, CG 30%, phantom-refund fix |
| T6 Form-fill fidelity | ⬜ | tax-pro | — | RTL headline, 135 aggregate, loss sign, hide 161/1214 |
| T7 Input/parsing robustness | ⬜ | qa-lead | — | TZ, NaN, locale, IBKR multi-ccy |
| T8 Coverage lock | ⬜ | qa-lead | — | |

### Current track unit checklist — T0
- ✅ T0.1 Baseline confirmed + single-spine wiring plan logged
- ⬜ T0.2 Override-contract shape defined on the data model (`manualOverride` per value, readable by calc + PDF)
- ⬜ T0.3 Hybrid spine wired: one entry → questionnaire sets income sources → `/documents` shows correct cards (no blank page)
- ⬜ T0.4 Delete `VoiceQuestionnaire.tsx`; reconcile sidebar to the single flow
- ⬜ T0.5 Track gate + qa-lead PASS

---

## Iteration Log (append newest at top; one entry per iteration)

> Template:
> ```
> ### Iter N — <date> — <track.unit>
> - Did: <one bounded unit>
> - Tests: <red→green, names> | Gate: <pass/fail counts>
> - PDF/flow proof: <evidence ref, if applicable>
> - Reviewer: <persona> → PASS/FAIL (<reason>)
> - Commit: <sha / message>
> - Next: <set NEXT ACTION above>
> ```

### Iter 1 — 2026-06-22 — T0.1
- Did: confirmed gate baseline (all match audit); mapped navigation; produced single-spine wiring plan + override-contract design.
- Tests: n/a (no code change) | Gate: 522 pass, build ✓, lint 0err/46warn, smoke 14/14+21/21
- **Single-spine wiring plan (hybrid):**
  - Entry = `/welcome` IncomeSourceGrid ONLY. After sources → `createDraft`+`setIncomeSources`+`markSourcesSelected` → `router.push('/questionnaire')`. Remove inline docs step from `WelcomeWizard` (mining moves to `/documents`).
  - `/questionnaire` = smart (hide steps irrelevant to selected sources; capital step only if investments source, etc.). `handleFinish` → `/documents` (unchanged target, now sources are set so page isn't blank).
  - `/documents` = source+answer-driven doc cards (`docsForSources` exists) WITH inline mining (relocate `DocRequestPanel` mining here). → `/summary`.
  - `/summary` (NEW, = T3 Output 1) = read-only review with source badges; absorbs `DetailsForm` edit-with-provenance. → `/filing`.
  - `/filing` = T4 calc waterfall + form download.
  - Retire `/details` as a door → redirect to `/summary`. Delete dead `VoiceQuestionnaire.tsx`. Dashboard stays as hub.
- **Override contract decision:** provenance-map based (no new per-value model field). (a) `markFieldUserConfirmed` creates a `manual` entry if none exists; (b) single `commitManual` choke point so questionnaire/employer/deduction edits stamp it (today only `details/Field.tsx` does); (c) `applyMiningResult` already skips `userConfirmed` → manual wins; (d) calc/PDF read canonical `taxpayer`/`financials` which already hold the manual value — no route plumbing needed; provenance passed only to `/summary` for badging.
- Reviewer: n/a (planning unit)
- Commit: pending
- Next: implement T0.2 (see NEXT ACTION)

---

## Decisions / Questions raised during the loop

*(none yet — log here when escalating to human, with the exact question and options)*

---

## Deferred during the loop

Anything skipped with correctness/UX impact goes to `DEFERRED_ACTIONS.md` (repo rule) AND a one-line pointer here.

*(none yet)*
