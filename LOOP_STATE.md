# LOOP_STATE.md — Mutable Progress Ledger

> The loop **edits this file every iteration**. `LOOP_GOAL.md` is the charter (read-only). On each `/loop` tick: read both → do the *Next Action* → update this file → commit. A fresh context with zero memory must be able to resume from this file alone.

---

## STATUS: ⏸️ MILESTONE REACHED — T0 Foundation complete (paused for human review)

- **Current track:** T0 · Foundation — DONE (with one documented carryover → T2.1)
- **Next track:** T1 · Rock-solid onboarding (or T2.1 first — see below)
- **Cycle step:** milestone stop
- **Open blockers:** none (qa-lead FAIL on T0.5 resolved: cheap P0/P1 fixed; deep P0-2 reclassified as T2.1)
- **Last measured gate:** 529 pass / 2 skip · build ✓ · lint 0err/45warn
- **Branch:** `loop/remediation` (main reset clean to 8ccafd5)

**qa-lead verdict on T0:** initially FAIL (2 P0). Resolved this iteration:
- P0-1 (questionnaire never locked manual entries) — FIXED: `handleFinish` now `commitManual`s every non-empty user field (tested).
- P1 destructive nav (AdvisorNudgeRail + DetailsForm → `/welcome` which resets draft) — FIXED → `/documents`.
- P1 empty questionnaire → blank `/documents` — FIXED: defaults sources to `["salary"]`, always `markSourcesSelected`.
- **P0-2 (structured Tofes-106 / IBKR / 867 parsers write via blind `updateTaxpayerAndRecalculate`, ignoring provenance → can overwrite locked values)** — RECLASSIFIED as **T2.1** (it is T2's defining task: make every doc-write path honor the lock). Logged below.

---

## NEXT ACTION (what the next iteration does — keep this concrete)

> **HUMAN REVIEW POINT — T0 milestone.** When approved to continue, start **T2.1** (closes the last T0 carryover P0) then the rest of the chosen next track:
> - **T2.1**: route the structured-doc parsers (Tofes 106 at `documents/page.tsx:~186`, IBKR `:~228`, 867 `:~311`) through a lock-honoring write — convert their parsed payloads to `MinedField[]` and call `applyMiningResult` (reuses `resolveMinedFields` + employer dedup), OR make `updateTaxpayerAndRecalculate` provenance-aware. Red test: type salary in questionnaire → upload 106 with a different salary → assert manual value survives end-to-end through live appContext.
> - Then proceed with T1 (validation gating, resume unification, debounce race) or continue T2 per the charter.

---

## Baseline (fill on first iteration, then treat as the regression floor)

| Gate | Expected (audit, 2026-06-22) | Last measured | When |
|------|------------------------------|---------------|------|
| `npm test` | 522 pass / 2 skip / 45 files | 529 pass / 2 skip / 46 files | Iter 4 |
| `npm run build` | pass | pass | Iter 4 |
| `npm run lint` | 0 err / 46 warn | 0 err / 45 warn | Iter 4 |
| `npm run forms:smoke` | 135: 14/14, 1301: 21/21 | 135 14/14, 1301 21/21 | Iter 1 |

Rule: test count must never drop; lint warnings must never increase.

---

## Track Board

Legend: ⬜ not started · 🔵 in progress · ✅ done (gate green + reviewer PASS) · 🚧 blocked

| Track | Status | Reviewer | Sign-off | Notes |
|-------|--------|----------|----------|-------|
| T0 Foundation (hybrid spine, override contract, kill dead flow) | ✅* | qa-lead | PASS w/ carryover→T2.1 | *one P0 deferred to T2.1 |
| T1 Rock-solid onboarding | ⬜ | qa-lead | — | |
| T2 Override end-to-end | ⬜ | qa-lead | — | T2.1 = structured parsers honor the lock (carried from T0) |
| T3 Output 1 — data summary | ⬜ | product-lead | — | |
| T4 Output 2 — calc waterfall | ⬜ | product-lead + tax-pro | — | |
| T5 Tax correctness | ⬜ | tax-pro | — | surtax, §66, CG 30%, phantom-refund fix |
| T6 Form-fill fidelity | ⬜ | tax-pro | — | RTL headline, 135 aggregate, loss sign, hide 161/1214 |
| T7 Input/parsing robustness | ⬜ | qa-lead | — | TZ, NaN, locale, IBKR multi-ccy |
| T8 Coverage lock | ⬜ | qa-lead | — | |

### Current track unit checklist — T0  (COMPLETE)
- ✅ T0.1 Baseline confirmed + single-spine wiring plan logged
- ✅ T0.2 Override contract — pure `lib/provenance.ts` (resolveMinedFields/markManualPaths/makeManualEntry), create-if-missing lock, `commitManual`; 4 tests
- ✅ T0.3 Hybrid spine wired: `/welcome` source-picker → `/questionnaire` → finish sets+merges income sources (+locks manual entries) → `/documents` (not blank)
- ✅ T0.4 Deleted `VoiceQuestionnaire.tsx`; sidebar reordered to spine
- ✅ T0.5 Track gate + qa-lead review (FAIL→fixed; P0-2→T2.1)

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
- Commit: bb94c66
- Next: implement T0.2

### Iter 2 — 2026-06-22 — T0.2 (+ git hygiene)
- Did: extracted override logic to pure `lib/provenance.ts`; wired appContext (resolveMinedFields, create-if-missing lock, commitManual). Discovered 15 files of uncommitted prior "Phase 2 §2.B" work → human chose "commit as baseline"; split cleanly by file (all appContext hunks were mine).
- Tests: +4 (provenance.test.ts) | Gate: 526 pass, build ✓, lint 46
- Reviewer: deferred to T0.5 track gate
- Commits: d352073 (recover Phase-2 wip), 19d21ed (loop T0.2)

### Iter 3 — 2026-06-22 — T0.3 / T0.4
- Did: WelcomeWizard → single source-picker → `/questionnaire`; handleFinish derives+merges income sources; deleted VoiceQuestionnaire; sidebar reordered.
- Tests: +1 (sources set on finish) | Gate: 527 pass, build ✓, lint 45
- Reviewer: (T0.5)

### Iter 4 — 2026-06-22 — T0.5 track gate (qa-lead) + fixes
- Did: spawned qa-lead adversarial review → FAIL (2 P0). Fixed P0-1 (lock manual questionnaire entries via commitManual), P1 destructive nav (×2 → /documents), P1 empty-page (default ["salary"]). Reclassified P0-2 (structured parsers bypass lock) → T2.1.
- Tests: +2 (lock paths; never source-less) | Gate: 529 pass, build ✓, lint 45
- Reviewer: qa-lead a0fc704b7480e35f2 → FAIL→resolved (carryover T2.1 acknowledged)
- Commit: pending (this iteration)
- Next: HUMAN REVIEW (T0 milestone). Then T2.1.

---

## Decisions / Questions raised during the loop

- **Iter 2:** Found 15 files of uncommitted prior "Phase 2 §2.B" work at loop start. Human chose: commit as baseline (d352073), keep loop commits separate. Resolved.
- **Iter 4 (open for human):** T0 qa-lead FAIL surfaced that the spine (questionnaire→docs) and the override contract are entangled with T2. P0-2 reclassified to T2.1. **Recommend: continue into T2.1 next** to close the last live overwrite path before moving to T1 — otherwise a 106/IBKR upload can still clobber locked values.

---

## Deferred during the loop

Anything skipped with correctness/UX impact goes to `DEFERRED_ACTIONS.md` (repo rule) AND a one-line pointer here.

*(none yet)*
