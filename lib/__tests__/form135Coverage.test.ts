/**
 * lib/__tests__/form135Coverage.test.ts — Phase 0 §0.D coverage assertion.
 *
 * Closes audits/generation.md §1.1: enforce that EVERY 3-digit field code
 * in `templates/maps/135_2025.json` is either drawn at runtime
 * (`DRAW_LIST_135` or `POSITIONAL_DRAWS_135`) or explicitly excluded with a
 * justification (`EXCLUDED_CODES_135`). A code being silently dropped from
 * the route was the original P0 — this test prevents regression.
 *
 * Also covers:
 *   - Every P0 code from audits/generation.md §1.1's mandatory table is
 *     drawn (013, 020, 014, 015, 016, 069, 086, 117, 124, 119, 245,
 *     signature-block, declaration-checkbox).
 *   - Every coordinate-anchored draw resolves to a real entry in the field
 *     map (no silent miss when the map is regenerated).
 */

import { describe, it, expect } from "vitest";
import {
  DRAW_LIST_135,
  POSITIONAL_DRAWS_135,
  EXCLUDED_CODES_135,
} from "@/app/api/generate/form-135/route";
import { loadFieldMap, findField } from "../fieldMap";

describe("Form 135 — draw-list ↔ field-map coverage", () => {
  it("every code in templates/maps/135_2025.json is drawn or explicitly excluded", () => {
    const map = loadFieldMap("135_2025");
    const drawnCodes = new Set<string>(DRAW_LIST_135.map((d) => d.code));
    const positionalCodes = new Set<string>(POSITIONAL_DRAWS_135.map((p) => p.code));
    const excludedCodes = new Set<string>(Object.keys(EXCLUDED_CODES_135));

    const orphaned: string[] = [];
    for (const key of Object.keys(map.fields)) {
      // The map keys can be either "<code>" or "<code>_<column>". The
      // EXCLUDED_CODES list is keyed by the full map key so that spouse
      // columns can be exempted independently of their root code.
      const entry = map.fields[key];
      const root = entry.code;

      if (drawnCodes.has(root) || drawnCodes.has(key)) continue;
      if (positionalCodes.has(root) || positionalCodes.has(key)) continue;
      if (excludedCodes.has(root) || excludedCodes.has(key)) continue;

      orphaned.push(key);
    }

    expect(
      orphaned,
      `Orphaned codes in 135_2025.json — add to DRAW_LIST_135 or EXCLUDED_CODES_135 with a justification:\n${orphaned.join(
        ", ",
      )}`,
    ).toEqual([]);
  });

  it("every coordinate-anchored draw resolves in the field map", () => {
    const map = loadFieldMap("135_2025");
    const unresolved: string[] = [];
    for (const d of DRAW_LIST_135) {
      const entry = findField(map, d.code, d.column);
      if (!entry) unresolved.push(`${d.key}(${d.code}${d.column ? `:${d.column}` : ""})`);
    }
    expect(
      unresolved,
      `These coordinate-anchored draws cannot resolve a field-map entry — either the map regenerated without these codes or DRAW_LIST_135 references a non-existent code:\n${unresolved.join(
        ", ",
      )}`,
    ).toEqual([]);
  });

  it("every excluded code's value is a non-empty justification string", () => {
    for (const [code, reason] of Object.entries(EXCLUDED_CODES_135)) {
      expect(reason.length, `Code ${code} has empty justification`).toBeGreaterThan(0);
    }
  });

  // ── Audit table P0 enforcement ──────────────────────────────────────────────
  // Every P0 code from audits/generation.md §1.1 MUST be present in either
  // DRAW_LIST_135 or POSITIONAL_DRAWS_135. Phase 0 §0.D scope.
  const P0_CODES_FROM_AUDIT = [
    "013", // מספר זהות בן/בת זוג
    "020", // מצב משפחתי checkbox row
    "014", // תושב ישראל לכל השנה (כן/לא)
    "015", // עלית בשנת המס (תאריך/חודש עליה)
    "016", // תושב ישוב מזכה (פריפריה)
    "069", // מס שנוכה — מעסיק שני
    "086", // מענק פטור (Sec. 9(7a))
    "117", // דיבידנד
    "124", // ריבית ני"ע סחירים
    "119", // זיכוי בגין בן/בת זוג
    "245", // זיכוי בגין ילדים (נקודות זיכוי)
    "signature-block",
    "declaration-checkbox",
  ];

  for (const code of P0_CODES_FROM_AUDIT) {
    it(`P0 audit code ${code} is present in DRAW_LIST_135 or POSITIONAL_DRAWS_135`, () => {
      const inDraw = DRAW_LIST_135.some((d) => d.code === code);
      const inPositional = POSITIONAL_DRAWS_135.some((p) => p.code === code);
      expect(inDraw || inPositional).toBe(true);
    });
  }

  it("DRAW_LIST_135 + POSITIONAL_DRAWS_135 covers ≥35 entries combined (was 24 before Phase 0 §0.D)", () => {
    expect(DRAW_LIST_135.length + POSITIONAL_DRAWS_135.length).toBeGreaterThanOrEqual(35);
  });
});
