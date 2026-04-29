/**
 * Programmatic guard against the false marketing claims that Phase 0 §0.B struck.
 *
 * Each forbidden substring corresponds to one of the audit findings:
 *   - "MyGov"               — user-flow §1.2, security F1.1.1, i18n F-8/F-41
 *   - "12 דקות" / "60 שניות" / "3 דקות" — user-flow §1.1, i18n F-41
 *   - "43 תרחישים" / "43 סעיפי" — user-flow §1.12, i18n F-41
 *   - "8811-2024"           — i18n §1.1.7, security F1.4.8
 *   - "מאושרים ע״י רשות האבטחה" — security §F1, i18n F-13
 *
 * If the marketing-vs-reality gap reopens (someone reintroduces a forbidden
 * claim) this test fails. Restoring any of these strings requires landing
 * the underlying capability first AND removing this test entry deliberately.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const FORBIDDEN_STRINGS: readonly string[] = [
  "MyGov",
  "12 דקות",
  "60 שניות",
  "3 דקות",
  "43 תרחישים",
  "43 סעיפי",
  "8811-2024",
  // The fake license uses U+00B7 (·) between digits in the original; cover both:
  "8811·2024",
  "מאושרים ע״י רשות האבטחה",
];

const MARKETING_DIR = join(__dirname, "..", "..", "app", "(marketing)");

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (st.isFile() && (entry.endsWith(".tsx") || entry.endsWith(".ts"))) {
      out.push(full);
    }
  }
  return out;
}

describe("marketingClaims forbidden-strings lint", () => {
  const files = listFilesRecursive(MARKETING_DIR);

  it("scans at least one .tsx file in app/(marketing)/**", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const needle of FORBIDDEN_STRINGS) {
    it(`forbidden: "${needle}" must not appear in any (marketing) file`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        if (text.includes(needle)) {
          offenders.push(file);
        }
      }
      expect(
        offenders,
        `Forbidden string "${needle}" found in:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});
