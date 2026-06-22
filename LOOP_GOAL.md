# LOOP_GOAL.md — Tax-Bot "Make It Actually Work" Remediation Loop

> **This file is the immutable charter. Do not edit it during the loop** (only the human edits it, to change scope). The loop reads this every iteration, then reads `LOOP_STATE.md`, executes the *Next Action*, and writes progress back to `LOOP_STATE.md`.

---

## 1. Mission

Take the Israeli tax-return app from "messy, buggy, fills forms wrong" to a rock-solid product that:

1. Has **one** hard, glitch-free onboarding flow (forward/back/refresh/resume — zero data loss).
2. Treats **manual user input as the source of truth** — when a user overrides a value parsed from a document (e.g. Tofes 106), the manual value wins, end-to-end into the calc **and** the PDF forms.
3. Produces **two final outputs**:
   - **Output 1 — Data Summary:** a full, well-organized, easy-to-understand read-only summary of everything the user provided, with each value's source badged; manual overrides explicitly marked.
   - **Output 2 — Calc Explanation:** a transparent, line-by-line derivation of the tax liability/refund (gross → deductions → taxable → bracket tax → each credit → withholding → net).
4. **Fills the official ITA forms correctly** (1301, 135) — right value, right ITA code, right box, Hebrew rendered readably.

## 2. Definition of Done (whole loop)

All tracks T0–T8 closed, every gate green, every persona sign-off recorded in `LOOP_STATE.md`, and a fresh user can complete the flow end-to-end producing a correct 1301 + 135 with both outputs. No `🔴 P0` open.

## 3. Locked Decisions (2026-06-22 — do not relitigate)

- **Canonical flow = HYBRID SPINE:** income sources → smart questionnaire (asks only what's relevant) → targeted doc requests → review/summary → calc → filing. One front door. Mining preserved.
- **Forms 161 & 1214 = HIDE for v1** (they 503, no template). Focus 1301 + 135. Do not delete the routes; gate the UI.
- **Phantom refunds = KEEP BUT FIX, not remove.** The חל"ת/maternity reconciliation and multi-employer overlap add-on must only fire when income is genuinely a partial-year projection. Requires a real signal (months-worked + an "income annualized?" flag captured in onboarding). If income is actual annual (normal Tofes 106), NO synthetic reduction.
- **Tax scope v1 = single filers + married separate calc (חישוב נפרד §66) + surtax fix + capital-gains fixes.** Defer: מענק עבודה, rental tracks, mikdamot crediting, business/loss carry-forward (these become a future loop, logged in `DEFERRED_ACTIONS.md`).

## 4. The Inner Cycle (protocol — every iteration follows this)

Each iteration does **one bounded unit of work** (usually one sub-item of the current track), in this order:

1. **Orient** — read `LOOP_GOAL.md` + `LOOP_STATE.md`. Identify current track + *Next Action*.
2. **Spec** — restate the acceptance criteria for this unit. For tax items: cite the פקודת מס הכנסה section and define a worked CPA golden example with expected numbers. For form items: define the exact ITA code → value → box contract.
3. **Red** — write the failing test first at the seam (flow test, calc golden, PDF placement/RTL render test). Confirm it fails for the right reason.
4. **Fix** — implement the minimal change to make it pass. Match surrounding code style.
5. **Verify Gate** — run §5 commands. For any PDF-touching change, additionally render the PDF and prove Hebrew reads correctly (render → screenshot/OCR round-trip; "drawn N/N" is NOT sufficient).
6. **Adversarial Review** — spawn the relevant persona reviewer (§6). It must actively try to break the change and return PASS/FAIL + reasons. Record verdict.
7. **Gate Decision:**
   - All green + reviewer PASS → update `LOOP_STATE.md` (mark unit done, log iteration, set next action), **commit**, end iteration.
   - Any red / reviewer FAIL → loop step 4 (max 2 retries). On 3rd failure or any ambiguity needing a product call → set state to `🚧 BLOCKED`, write the question, **stop and escalate to human**.
8. **Track close** — when a track's units are all done, run the full gate suite once more, record track sign-off, advance to next track.

**Rule:** one commit per passing unit. Never commit red. Never skip a gate. Never edit `LOOP_GOAL.md`. If something agreed-to is skipped, log it in `DEFERRED_ACTIONS.md` per the repo rule.

## 5. Verify Gate (commands — all must pass)

```bash
cd /Users/ohadbar/tax-bot/app
npm test            # full vitest suite — must be green incl. new tests
npm run build       # must compile
npm run lint        # no new errors (warnings: don't increase count)
npm run forms:smoke # PDF generation smoke
```

PDF-render proof (T6 and any PDF change): generate the form, open/convert to image, confirm Hebrew names/cities/bank read in correct order (not reversed). Use preview tooling or a render-to-PNG + visual check. Attach evidence reference in the iteration log.

Live-flow proof (T1, T3, T4): drive the app via preview tools (anonymous-auth path passes AuthGate). Confirm the user-visible behavior, screenshot.

## 6. Persona Reviewers (adversarial sign-off)

Spawn via Agent tool, model opus, read-only:

- **tax-pro** — Israeli יועץ מס. Reviews every T5 (math) and T6 (form-fill) unit against the law + the CPA golden. Tries to find a filer for whom the output is wrong. Resumable prior audit: `aa4673e33a63f503a`.
- **qa-lead** — Reviews T0/T1/T2/T7/T8 (flow, state, override, parsing, coverage). Tries edge inputs (NaN, empty TZ, locale, refresh-mid-flow). Resumable: `a1812d3d0680b9651`.
- **product-lead** — Reviews T3/T4 (the two outputs) for clarity + the override-is-source-of-truth requirement. Resumable: `a9fdf77004feed26f`.

A unit is not done until its reviewer returns PASS.

## 7. Track Backlog (priority order — grounded in the 3-persona audit)

> Each track lists acceptance criteria. Break into units in `LOOP_STATE.md` as you go. `file:line` refs are audit-time pointers — re-verify against current code.

### T0 · Foundation *(must be first — unblocks everything)*
- Collapse the two flows (`/welcome→/details` and `/questionnaire`) into the **hybrid spine**. One entry, one source of truth.
- Questionnaire must set income sources so `/documents` is never blank (`questionnaireContext.tsx:439` never calls `setIncomeSources`; `documents/page.tsx:436` gates on `sources.length>0`).
- Define the **override contract**: a per-value provenance/`manualOverride` flag that lives on the data model and is readable by calc + PDF layers (not client-only UI state).
- Delete dead `VoiceQuestionnaire.tsx` (~570 lines, never imported).
- **Done when:** one flow reaches `/documents` with correct doc cards; override flag exists on the model; build green.

### T1 · Rock-solid onboarding
- Per-step validation gating: cannot advance/finish with invalid TZ, empty required PII, or employer overlap (`[step]/page.tsx:211-227` buttons never disabled).
- Unify resume on persisted state, not localStorage-only (cross-device/cleared-cache user currently bounced to step 1; `questionnaire/page.tsx`).
- Kill the 500ms debounce double-write race + flush on nav/blur/beforeunload (`questionnaireContext.tsx:307-441`).
- Replace redirect-in-render anti-pattern (`[step]/page.tsx:35`).
- Route guards + AuthGate on `/filing`.
- Capture **months-worked + "income annualized?" flag** (feeds T5 phantom-refund fix).
- **Done when:** forward/back/refresh/resume lose nothing; qa-lead PASS on edge inputs.

### T2 · Override rule end-to-end
- Manual edit locks the value on **every** input (mined or typed-from-scratch; today only mined-then-edited locks — `appContext.tsx:699` early-returns if no provenance).
- Lock is passed into `calculateFullRefund` and every `/api/generate/*` route (currently they receive `taxpayer`/`financials` only).
- Subsequent document upload never overwrites a manual value.
- **Done when:** test proves manual value wins in both calc result and stamped PDF after a later doc upload.

### T3 · Output 1 — Data Summary
- Read-only screen listing everything provided, grouped by section, each value badged with source (Manual / Tofes 106 / IBKR / prior-year). Manual values badged "מקור: הזנה ידנית (גובר על המסמך)".
- Serves as the pre-filing confirmation gate.
- **Done when:** product-lead PASS; override badge visible and correct.

### T4 · Output 2 — Calc Explanation (waterfall)
- Render the existing engine breakdown end-to-end: gross income → income deductions → taxable → tax-by-bracket → each credit line (points, donations §46, life-ins §45, periphery §11, foreign) → withholding → **net refund/due**. Footnote each line.
- Data already exists (`calculateTax.ts:155-159` returns `byBracket`/`creditPointsBreakdown`/`deductionsBreakdown`) — this is presentation.
- **Done when:** every number is traceable to a line; product-lead + tax-pro PASS.

### T5 · Tax correctness *(each unit = CPA golden + tax-pro PASS)*
- **Surtax (מס יסף §121ב):** single cumulative base over a per-year indexed threshold (not active+passive each getting own ₪721,560); 2% capital add-on from 2025; threshold from a year table (`calculateTax.ts:1378-1385`).
- **§66 married separate calc:** run separate vs combined, pick correct; spouse income currently absent from gross.
- **Capital gains 30%** for בעל מניות מהותי on the gain itself, not just dividends (§91(ב); `calculateTax.ts:1367`).
- **Phantom-refund FIX (keep-but-fix):** חל"ת/maternity reconciliation + multi-employer overlap only fire when months-worked < 12 AND income flagged as annualized projection; actual annual 106 income → no reduction (`calculateTax.ts:1045-1136,1230-1239,1326-1344`).
- **Done when:** golden suite covers each scenario with CPA-verified numbers; tax-pro PASS.

### T6 · Form-fill fidelity *(render+OCR proof required)*
- **Hebrew BiDi/RTL** rendered readably in non-BiDi viewers / ITA scan / print — the headline complaint (`bidi.ts`, `pdfUtils.ts:49`, inconsistent shaping `form-1301/route.ts:570`).
- **Form 135 main-vs-aggregate:** stop stuffing all-employer aggregate into "main employer" boxes (`pdfUtils.ts:343,474-476`).
- **Capital losses** stamped with correct sign/convention (`formatIlsForPdf` has no negative handling, `pdfUtils.ts:59-62`).
- **Reconcile dividend codes 117/141/055** — JSON label vs route comment contradict (`form1301_2025_fields.json:154`, `route.ts:96`); verify against a real 2025 form.
- Replace "eyeballed" page-1 coords with field-map-driven placement (`form-1301/route.ts:165-207`).
- **Hide 161/1214** UI entry points.
- **Done when:** rendered 1301 + 135 are visually correct (Hebrew readable, values in right boxes); tax-pro PASS.

### T7 · Input/parsing robustness
- TZ: reject `"000000000"`, empty, and wrong-length; real check-digit + exactly 9 digits (`validateTZ.ts:11-22`).
- NaN/locale guards on the client calc path (dashboard shows "NaN ₪" today; `Step*` number inputs).
- IBKR parser: multi-currency (EUR/GBP, currently USD-only `ibkrParser.ts:122`) + locale-aware number parsing (`ibkrParser.ts:90`).
- Tofes 106 parser: drop the `<100` filter false-negatives; fix employer-name next-line heuristic (`form106Parser.ts:163,400`).
- **Done when:** qa-lead PASS on the §"edge cases that break it" list.

### T8 · Coverage lock
- Regression tests at every seam fixed above so it can't rot: questionnaire flow tests, PDF placement/RTL tests, calc goldens, parser fuzz.
- **Done when:** coverage exists for each closed track; suite green.

## 8. Escalation

Stop and ask the human when: a gate fails 3× on one unit; the audit pointer no longer matches code and intent is ambiguous; a fix requires a product decision not in §3; or a tax treatment can't be verified against the law (flag as ASSUMPTION, never fabricate numbers).
