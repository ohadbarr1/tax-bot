/**
 * lib/__tests__/form1301Coverage.test.ts — Phase 1 §1.D coverage assertion.
 *
 * Mirror of `form135Coverage.test.ts` for Form 1301: enforce that EVERY
 * 3-digit field code (or column-qualified key) in
 * `templates/maps/1301_2025.json` is either drawn at runtime
 * (`DRAW_LIST_1301` or `POSITIONAL_DRAWS_1301`) or explicitly excluded
 * with a justification (`EXCLUDED_CODES_1301`).
 *
 * The 1301 template is much larger than the 135 (~236 keys vs ~116) and
 * has many more ITA-derived computation rows; the EXCLUDED_CODES_1301
 * map carries one-line justifications for each so future agents can
 * promote a code to `DRAW_LIST_1301` when its source data lands in the
 * TaxPayer / FinancialData model.
 *
 * Closes audits/generation.md §1.3 (1301 coverage gap + p1↔p3 cross-check
 * regression net).
 */

import { describe, it, expect } from "vitest";
import {
  DRAW_LIST_1301,
  POSITIONAL_DRAWS_1301,
  EXCLUDED_CODES_1301,
} from "@/app/api/generate/form-1301/route";
import { loadFieldMap, findField } from "../fieldMap";

describe("Form 1301 — draw-list ↔ field-map coverage", () => {
  it("every code in templates/maps/1301_2025.json is drawn or explicitly excluded", () => {
    const map = loadFieldMap("1301_2025");
    const drawnCodes = new Set<string>(DRAW_LIST_1301.map((d) => d.code));
    const positionalCodes = new Set<string>(POSITIONAL_DRAWS_1301.map((p) => p.code));
    const excludedCodes = new Set<string>(Object.keys(EXCLUDED_CODES_1301));

    const orphaned: string[] = [];
    for (const key of Object.keys(map.fields)) {
      // Map keys can be either "<code>" or "<code>_<column>". Both forms
      // are accepted as exclusions so spouse-column variants can be exempted
      // independently of their root code.
      const entry = map.fields[key];
      const root = entry.code;

      if (drawnCodes.has(root) || drawnCodes.has(key)) continue;
      if (positionalCodes.has(root) || positionalCodes.has(key)) continue;
      if (excludedCodes.has(root) || excludedCodes.has(key)) continue;

      orphaned.push(key);
    }

    expect(
      orphaned,
      `Orphaned codes in 1301_2025.json — add to DRAW_LIST_1301 or EXCLUDED_CODES_1301 with a justification:\n${orphaned.join(
        ", ",
      )}`,
    ).toEqual([]);
  });

  it("every coordinate-anchored draw resolves in the field map", () => {
    const map = loadFieldMap("1301_2025");
    const unresolved: string[] = [];
    for (const d of DRAW_LIST_1301) {
      const entry = findField(map, d.code, d.column);
      if (!entry) unresolved.push(`${d.key}(${d.code}${d.column ? `:${d.column}` : ""})`);
    }
    expect(
      unresolved,
      `These coordinate-anchored draws cannot resolve a field-map entry — either the map regenerated without these codes or DRAW_LIST_1301 references a non-existent code:\n${unresolved.join(
        ", ",
      )}`,
    ).toEqual([]);
  });

  it("every excluded code's value is a non-empty justification string", () => {
    for (const [code, reason] of Object.entries(EXCLUDED_CODES_1301)) {
      expect(reason.length, `Code ${code} has empty justification`).toBeGreaterThan(0);
    }
  });

  // ── Audit table P0 enforcement ──────────────────────────────────────────────
  // Audits/generation.md §1.3 lists the P0 fields the 1301 must stamp. We
  // require each to appear in either DRAW_LIST_1301 or POSITIONAL_DRAWS_1301
  // — being in the EXCLUDED list is NOT acceptable for these.
  const P0_CODES_FROM_AUDIT = [
    // Personal section (page 1 + page 3 ID duplicates).
    "012", // taxpayer ID (page 2 / 3)
    "032", // last name
    "022", // city
    "023", // street
    "024", // house number
    "277", // page-3 spouse ID duplicate
    "278", // page-3 taxpayer ID duplicate
    // Employment (multi-employer split).
    "158", // gross — main
    "172", // gross — secondary
    "068", // tax withheld — main
    "069", // tax withheld — secondary
    "258", // pension — main
    "272", // severance
    // Business income.
    "201", // main business
    "301", // secondary business
    // Capital gains + foreign-tax (Form 1301's headline-vs-135 differentiator).
    "060", // capital gain right column
    "067", // capital loss
    "157", // foreign tax — code 157
    "055", // foreign tax — code 055 (page 3 cross-check)
    "141", // other income
    // Deductions on page 1 + page 3 cross-check (assertForm1301Consistency).
    "078", // donations p1
    "126", // life insurance p1
    "142", // ind. pension p1
    "335", // total deductions p1
    "036", // life insurance p3 cross-check
    "045", // pension p3 cross-check
    "037", // donations p3 cross-check
    // Bank details on page 3 footer.
    "274", // bank number
    "273", // branch number
    "044", // account number
    // Page-4 signature block + declaration mark (positional).
    "signature-block",
    "declaration-checkbox",
  ];

  for (const code of P0_CODES_FROM_AUDIT) {
    it(`P0 audit code ${code} is present in DRAW_LIST_1301 or POSITIONAL_DRAWS_1301`, () => {
      const inDraw = DRAW_LIST_1301.some((d) => d.code === code);
      const inPositional = POSITIONAL_DRAWS_1301.some((p) => p.code === code);
      expect(inDraw || inPositional).toBe(true);
    });
  }

  it("DRAW_LIST_1301 + POSITIONAL_DRAWS_1301 covers ≥35 entries combined", () => {
    expect(DRAW_LIST_1301.length + POSITIONAL_DRAWS_1301.length).toBeGreaterThanOrEqual(35);
  });
});
