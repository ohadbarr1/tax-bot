<!--
  Tax-Bot PR template — Phase 0 §0.G.
  Required sections; fill every block. CI gates lint / typecheck / test / build /
  axe / lighthouse / calibration-smoke / marketing-claims. See
  .github/workflows/main.yml.
-->

## Summary

<!-- 1–3 bullets describing *why* this change exists. Not a diff readout. -->

-

## Audit finding-IDs closed

<!--
  Cite the audit row(s) this PR resolves, using the canonical ID format from
  /audits/*.md. One per line. Example:
    closes architecture-F-1
    closes security-F1.2.1
    closes qa-release-CI
-->

closes <agent>-<id>

## Phase / workstream reference

<!--
  Cite UPGRADE_PLAN.md location, e.g. "Phase 0 §0.G" or "Phase 1 §1.A".
-->

Phase _ §_._

## Test plan

<!--
  How a reviewer (or CI) verifies this. Bulleted, runnable.
-->

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit -p tsconfig.json`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manual happy-path on the affected route(s)

## RTL / Hebrew check

<!--
  Hebrew/RTL is primary (coordination.md rule 4). If this PR touches UI:
-->

- [ ] CSS logical properties only (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`) — no `pl-*`/`pr-*`/`ml-*`/`mr-*`
- [ ] Hebrew copy reviewed for tone, register, gender
- [ ] No `dir="ltr"` overrides without explicit justification
- [ ] Mixed-script (Hebrew + Latin numerals/codes) renders correctly

## Filing-season freeze (Mar 15 → May 15)

<!--
  Per UPGRADE_PLAN §0.G freeze policy. Tick only if this is a P0 fix safe to
  merge during the hard freeze window. Otherwise this PR ships *before* Mar 15
  or *after* May 15.
-->

- [ ] This is a P0 fix; safe to merge during the Mar 15 → May 15 hard freeze
- [ ] OR: this PR is queued for the next non-freeze window

## Screenshots / evidence

<!--
  Optional. For UI changes, before/after screenshots in both LTR and RTL.
  For math changes, attach the failing-then-passing test names.
-->

---

<sub>CI required checks: `lint`, `typecheck`, `test`, `build`, `calibration-smoke`, `marketing-claims`, `axe`, `lighthouse`. Configure these as required in repo settings → Branches → Branch protection rules → `main`.</sub>
