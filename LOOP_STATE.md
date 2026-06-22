# LOOP_STATE.md — Mutable Progress Ledger

> The loop **edits this file every iteration**. `LOOP_GOAL.md` is the charter (read-only). On each `/loop` tick: read both → do the *Next Action* → update this file → commit. A fresh context with zero memory must be able to resume from this file alone.

---

## STATUS: 🔵 RUNNING — T5 tax correctness. Next milestone = end of T5.

- **Current track:** T5 · Tax correctness
- **Units:** T5.1 surtax §121ב rebuild · T5.2 §66 married separate calc · T5.3 phantom-refund keep-but-fix · T5.4 CG 30% controlling shareholder · T5.5 track gate
- **Each unit:** CPA golden test (worked example, expected numbers) + tax-pro sign-off.

## (prev) MILESTONE — T6 form-fill fidelity complete.

- **Completed this run:** T6.1 (Hebrew verified + mixed-digit fix), T6.2/3/4 (form conventions via tax skill, flagged ASSUMPTION), T6.6 (161/1214 already unreachable). T6.5 (eyeballed coords) deferred — render correctly, low value.
- **Next track:** T5 (tax correctness — surtax §121ב, §66 separate calc, phantom-refund fix), T7 (input/parsing), or T8 (coverage lock).
- **KEY FINDING:** rendered real stamping (poppler + macOS CoreGraphics) — pure-Hebrew names/cities render CORRECTLY. Audit's "all Hebrew reversed" (D7) = FALSE ALARM. Only embedded multi-digit runs were reversed (fixed). Form-fill complaint = structural (135 aggregate double-count, dividend codes) — all fixed.
- **Decisions (flagged ASSUMPTION, verify in DEFERRED_ACTIONS.md):** 135 158/068/258 = main only (removes secondary double-count); loss boxes = positive magnitude; dividends → 117/055 only, 141 empty.
- **Last measured gate:** 554 pass / build ✓ / lint 0err/45warn
- **Branch:** `loop/remediation`

**Reviews (T3/T4):** product-lead PASS-w/-concerns, tax-pro FAIL → all fixed this iteration:
- tax-pro: waterfall didn't reconcile (shift-work double-count; surtax mis-placed) → FIXED, lines now tie to netRefund (raw bracket tax + own shift line; surtax/CGT into 'סך חבות המס'; netRefund = taxPaid − totalLiability). Split taxPaid (true withholding vs flagged overlap estimate); disclosed CGT foreign credit; preview badge on fallback.
- product-lead: summary missing fields → FIXED (spouse income, alimony, life events, kibbutz, controlling-shareholder/dividend, provider names).
- **Deferred (logged below):** override badge ("ידני · גובר על מסמך") only renders in a doc-mined-THEN-edited flow; in the default questionnaire-first order manual locks before any doc so it shows plain "הזנה ידנית". Enforcement (manual wins) is correct & tested — the badge is cosmetic. Recommend inline-edit on /summary as the natural override UX. Also: `/details` orphan; facts KPI cards compute inline vs the waterfall's engine result.

**qa-lead verdict (T2.1+T1):** PASS-WITH-CONCERNS → 2 P1 fixed this iteration:
- P1 FileDropzone (live dashboard upload) + DocRequestPanel omitted `{source:"document"}` → FIXED (lock now honored on every doc-write path).
- P1 `preserveManual` restored employer leaves by index → could smear a locked salary onto the wrong employer after a doc reorder/drop → FIXED (restore by employer `id`).
- P2 deductions gating (amount 0 / missing) → FIXED.
- Accepted/deferred P2s: employers step only blocks overlap (amounts come from 106); `/filing` guard slightly leaky (download separately gated by idNumber); TZ inline hint only at 9 digits (gate is authoritative); **106 documents-page dedupes employers by docId not name → possible duplicate row** (pre-existing; logged under Deferred → fold into T6/T2 via resolveMinedFields unification).
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

> **HUMAN REVIEW POINT — T6 milestone.** Form-fill done (Hebrew was a false alarm; structural bugs fixed, conventions flagged for CPA verification). When approved, recommended next: **T5 (tax correctness)** — surtax §121ב rebuild (single cumulative threshold), §66 married separate calc, fix the phantom חל"ת/maternity + multi-employer-overlap refunds (keep-but-fix per locked decision §3), CG 30% for controlling shareholder. This makes the calc-waterfall numbers themselves correct. Then T7 (input/parsing robustness) and T8 (coverage lock) to finish.

---

## Baseline (fill on first iteration, then treat as the regression floor)

| Gate | Expected (audit, 2026-06-22) | Last measured | When |
|------|------------------------------|---------------|------|
| `npm test` | 522 pass / 2 skip / 45 files | 554 pass / 2 skip / 51 files | Iter 15 |
| `npm run build` | pass | pass | Iter 15 |
| `npm run lint` | 0 err / 46 warn | 0 err / 45 warn | Iter 15 |
| `npm run forms:smoke` | 135: 14/14, 1301: 21/21 | 135 14/14, 1301 21/21 | Iter 1 |

Rule: test count must never drop; lint warnings must never increase.

---

## Track Board

Legend: ⬜ not started · 🔵 in progress · ✅ done (gate green + reviewer PASS) · 🚧 blocked

| Track | Status | Reviewer | Sign-off | Notes |
|-------|--------|----------|----------|-------|
| T0 Foundation (hybrid spine, override contract, kill dead flow) | ✅* | qa-lead | PASS w/ carryover→T2.1 | *one P0 deferred to T2.1 |
| T1 Rock-solid onboarding | ✅ | qa-lead | PASS (P1s fixed) | gating verified live in preview |
| T2 Override end-to-end | 🔵 | qa-lead | T2.1 ✅ | T2.1 done (all doc-write paths honor lock); remaining: inline-edit override UX, dedupe-by-name |
| T3 Output 1 — data summary | ✅ | product-lead | PASS (fields added) | verified live; override badge cosmetic-only in spine order |
| T4 Output 2 — calc waterfall | ✅ | product-lead + tax-pro | PASS (reconciles) | verified live: ₪300k→refund ₪16,604 |
| T5 Tax correctness | ⬜ | tax-pro | — | surtax §121ב, §66 separate, phantom-refund, CG 30% |
| T6 Form-fill fidelity | ✅ | (CPA/user to verify) | conventions flagged ASSUMPTION | Hebrew=false-alarm; 135 double-count + dividend codes fixed; T6.5 coords deferred |
| T5 Tax correctness | ⬜ | tax-pro | — | surtax, §66, CG 30%, phantom-refund fix |
| T6 Form-fill fidelity | ⬜ | tax-pro | — | RTL headline, 135 aggregate, loss sign, hide 161/1214 |
| T7 Input/parsing robustness | ⬜ | qa-lead | — | TZ, NaN, locale, IBKR multi-ccy |
| T8 Coverage lock | ⬜ | qa-lead | — | |

### Track checklist — T6  (COMPLETE)
- ✅ T6.1 Hebrew rendering: verified pure-Hebrew correct via poppler + CoreGraphics (D7 false alarm); fixed embedded multi-digit reversal (reverseDigitRuns) +5 tests
- ✅ T6.2 Form 135 158/068/258 → main employer only (removes secondary double-count vs 069); goldens updated; +regression test
- ✅ T6.3 Loss boxes 166/067 = positive magnitude (correct; +defensive abs)
- ✅ T6.4 Dividends → 117/055 only; 141 left empty (disputed meaning)
- ✅ T6.6 161/1214 already unreachable from active UI (no 503 exposure)
- ⤳ T6.5 eyeballed page-1 coords → deferred (render correctly; replace with field-map later)
- ⚠️ T6.2/3/4 flagged ASSUMPTION — verify vs real 2025 forms (DEFERRED_ACTIONS.md). The CPA user is the right reviewer.

### Track checklist — T3 + T4  (COMPLETE)
- ✅ T3 Output 1: /summary route + SummaryView + pure lib/summary.ts; source badges; full field coverage; verified live
- ✅ T4 Output 2: CalcExplanation waterfall on /facts + /filing; reconciles to netRefund; bracket detail; verified live
- ✅ Recalc-on-finish so headline figures match the waterfall
- ✅ T3/T4 gate: product-lead + tax-pro reviewed; all blocking findings fixed
- ⤳ Deferred: inline-edit override UX on /summary; /details orphan; facts KPI vs engine result

### Track checklist — T2.1 + T1  (COMPLETE)
- ✅ T2.1 All doc-write paths (`documents/page`, `SourceDrivenDocCards`, `FileDropzone`, `DocRequestPanel`) pass `{source:"document"}`; `preserveManual` (id-aware) restores locked leaves
- ✅ T1.1 Per-step validation gating (`validateStep` + disabled buttons + error list)
- ✅ T1.2 redirect-in-render / hook-order fix
- ✅ T1.3 Resume unification (localStorage → persisted `questionnaire.step`)
- ✅ T1.4 Debounce flush on unmount (no sub-500ms edit loss)
- ✅ T1.5 `/filing` AuthGate + completion guard
- ⤳ T1.6 months-worked + "income annualized?" flag → folded into T5 (logic lives there)
- ✅ T1 gate: qa-lead PASS (P1s fixed), live preview verified

### Track checklist — T0  (COMPLETE)
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
- Commit: ea96d89
- Next: T2.1

### Iter 5 — 2026-06-22 — T2.1
- Did: added pure getPath + preserveManual (provenance.ts); updateTaxpayerAndRecalculate gained {source:'document'} → restores locked leaves; wired documents page (106/IBKR/867) + SourceDrivenDocCards.
- Tests: +2 | Gate: 531 pass, build ✓, lint 45 | Commit: 3551b72

### Iter 6 — 2026-06-22 — T1.1/T1.2
- Did: validateStep module + gating UI; hardened isValidTZ; fixed hook-order/redirect.
- Tests: +9 | Gate: 540 pass | Commit: 068c2cc

### Iter 7 — 2026-06-22 — T1.3/T1.4/T1.5
- Did: resume fallback to persisted step; unmount debounce flush; /filing AuthGate + completion guard.
- Gate: 540 pass | Commit: 3f09d50

### Iter 8 — 2026-06-22 — T1 track gate (qa-lead) + fixes + live verify
- Did: qa-lead review (PASS-w/-concerns). Fixed 2 P1 (FileDropzone/DocRequestPanel {source:document}; preserveManual id-aware) + P2 deductions gating. Verified gating live in preview (empty→3 errors+disabled המשך; valid→clears+enables); screenshot captured.
- Tests: +2 | Gate: 542 pass, build ✓, lint 45
- Reviewer: qa-lead a3c9cd0876da654d0 → PASS (P1s fixed)
- Commit: 9f5b0b2
- Next: T3 → T4

### Iter 9 — 2026-06-22 — T3 (Output 1)
- Did: pure lib/summary.ts (buildSummary + sourceBadge) + SummaryView + /summary route; sidebar /details→/summary; route-manifest snapshot updated.
- Tests: +5 | Gate: 547 pass | Commit: b3803df

### Iter 10 — 2026-06-22 — T4 (Output 2)
- Did: CalcExplanation waterfall mounted on /facts + /filing.
- Gate: 547 pass | Commit: 3607fd5

### Iter 11 — 2026-06-22 — T4 consistency + live verify
- Did: recalc on handleFinish + live-compute fallback; verified both outputs in preview (summary all-manual badges; facts waterfall ₪300k→₪16,604 refund).
- Gate: 547 pass | Commit: 02ef392

### Iter 13 — 2026-06-22 — T6.1 Hebrew (verify + fix)
- Did: rendered actual stamping via pdftoppm (poppler) + sips (macOS CoreGraphics). Pure Hebrew correct → D7 false alarm. Fixed embedded multi-digit reversal in bidi.ts (reverseDigitRuns). +5 tests.
- Gate: 552 pass | Commit: 1792be2

### Iter 14 — 2026-06-22 — T6.6 / investigation
- Did: confirmed 161/1214 unreachable (determineFormType only 135/1301; SeveranceWizard unmounted). Investigated 135 aggregate + dividend codes; invoked israeli-tax-returns skill (confirms rules, not box codes). Escalated 3 conventions → user delegated back ("use the skill, decide").

### Iter 15 — 2026-06-22 — T6.2/3/4 form conventions
- Did: decided via skill + field-map labels; 135 main-only (fix double-count), loss=positive, dividends 117/055 only (141 empty). Goldens updated; +regression test; ASSUMPTIONs logged in DEFERRED_ACTIONS.md.
- Gate: 554 pass, build ✓, lint 45 | Commit: 0b0684e
- Next: HUMAN REVIEW (T6 milestone). Then T5 (tax correctness) recommended.

### Iter 12 — 2026-06-22 — T3/T4 gate (product-lead + tax-pro) + fixes
- Did: reviews → tax-pro FAIL (waterfall didn't reconcile) + product-lead concerns. Fixed waterfall arithmetic (shift-work, surtax placement, taxPaid split, disclosures) so lines tie to netRefund; expanded summary fields.
- Reviewers: product-lead a3ed1e522b5b306e1, tax-pro af1444a7638f7003c → resolved
- Gate: 547 pass, build ✓, lint 45 | Commit: 3377097
- Next: HUMAN REVIEW (T3/T4 milestone). Then T5 (tax correctness) or T6 (form-fill / Hebrew RTL).

---

## Decisions / Questions raised during the loop

- **Iter 2:** Found 15 files of uncommitted prior "Phase 2 §2.B" work at loop start. Human chose: commit as baseline (d352073), keep loop commits separate. Resolved.
- **Iter 4 (open for human):** T0 qa-lead FAIL surfaced that the spine (questionnaire→docs) and the override contract are entangled with T2. P0-2 reclassified to T2.1. **Recommend: continue into T2.1 next** to close the last live overwrite path before moving to T1 — otherwise a 106/IBKR upload can still clobber locked values.

---

## Deferred during the loop

Anything skipped with correctness/UX impact goes to `DEFERRED_ACTIONS.md` (repo rule) AND a one-line pointer here.

- **106 employer dedupe by name** (documents/page.tsx ~182): the documents-page 106 write dedupes employers by `emp-${docId}` only, so a 106 for an employer the user typed manually appends a DUPLICATE row → double-counted salary. Pre-existing. Plan: route the 106 write through `resolveMinedFields` (name-match + lock-skip) to unify with the generic miner. Fold into T6 or a T2 follow-up. Verify: enter employer "X" manually, upload X's 106, assert one row.
- **T1.6 income-annualized flag** → folded into T5 (captured + consumed with the חל"ת/maternity reconciliation fix).
- **Override badge reachability / inline-edit** (T3): the "ידני · גובר על מסמך" badge only renders when a field was mined from a doc THEN edited. In the spine's questionnaire-first order, manual locks before any doc, so it shows plain "הזנה ידנית". Enforcement is correct; badge is cosmetic. Fix: add inline-edit on /summary (edit a mined value there → markFieldUserConfirmed keeps doc lineage) — the natural review-then-correct override UX. Decide /details fate at the same time (orphaned).
- **Facts KPI vs engine** (T4): /facts hero cards compute annualIncome/taxPaid inline; can diverge from the waterfall's engine result. Drive them off calculationResult.
