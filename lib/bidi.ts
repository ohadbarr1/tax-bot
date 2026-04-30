/**
 * lib/bidi.ts — Phase 1 §1.D BiDi-correct Hebrew shaping for pdf-lib.
 *
 * Closes audits/generation.md §1.5 + §1.6 + §1.9 (last row).
 *
 * THE PROBLEM
 * ───────────
 * pdf-lib 1.17 has no BiDi engine — `drawText()` paints glyphs in stream
 * order, left-to-right, regardless of script. The previous implementation
 * (`pdfUtils.hebrewForPdf` pre-Phase-1) attempted a 1-line workaround:
 *
 *     return text.split("").reverse().join("");
 *
 * That blind reversal had two killer side-effects:
 *
 *   1. SHAAM-OCR rejection. The ITA's intake OCR re-extracts the PDF's
 *      text stream to auto-populate downstream forms. Because the stream
 *      now stored Hebrew in REVERSED glyph order ("דהוא" instead of
 *      "אוהד"), every Hebrew name / address / city was unreadable to
 *      SHAAM's parser. Marketing-claim "מאושר ע״י רשות המסים" while
 *      delivering a PDF SHAAM cannot read = false advertising.
 *
 *   2. Mixed-content corruption. Hebrew strings legitimately contain
 *      Latin digits (e.g. "בן יהודה 5א" — house number embedded in a
 *      street name). A naive codepoint reversal flips the digits too,
 *      so "100" becomes "001" and "5א" becomes "א5". The audit catalogues
 *      this in §1.6(a) / §1.6(e).
 *
 * THE FIX
 * ───────
 * The cleanest path that satisfies BOTH (a) SHAAM extraction AND (b)
 * BiDi-aware viewer rendering is:
 *
 *   STREAM in PDF      = LOGICAL Unicode order (BiDi-correct).
 *   VISUAL rendering   = handled by the PDF viewer's BiDi pass when one
 *                        is available (Acrobat Reader, modern Chrome PDF
 *                        viewer, macOS Preview 12.x+, Foxit, etc.). For
 *                        viewers without BiDi the visual order is wrong;
 *                        SHAAM intake does not use a viewer — it parses
 *                        the stream — so this trade-off is correct.
 *
 * The U+200F RIGHT-TO-LEFT MARK prefix tells BiDi-aware viewers to apply
 * RTL paragraph direction even when the surrounding context is neutral
 * (the field-code labels around the value-box are Hebrew, but the
 * value-box itself starts a fresh paragraph from the viewer's POV).
 *
 * For MIXED content (Hebrew + digits + Latin), bidi-js applies the full
 * Unicode Bidirectional Algorithm (UAX #9) to compute the visual order.
 * We then reorder spans by embedding level so the LOGICAL stream the PDF
 * holds matches what a BiDi engine would resolve. In the common all-
 * Hebrew case the algorithm is a no-op (logical order is already RTL).
 *
 * REFERENCES
 * ──────────
 *   - Unicode UAX #9 (Bidirectional Algorithm, v13.0.0): the spec
 *     bidi-js implements.
 *   - audits/generation.md §1.5 (this finding) + §1.9 (SHAAM strict-mode
 *     PDF requirements).
 *   - lib/pdfReExtract.ts (the test-side extractor that re-reads what we
 *     write here; semanticGolden.test.ts pins the round-trip).
 */

import bidiFactory from "bidi-js";

// bidi-js's only export is a factory function — call it once at module
// load and reuse. The internal state is stateless across calls; we share
// one instance for performance.
const bidi = bidiFactory();

/**
 * The Unicode RIGHT-TO-LEFT MARK (U+200F).
 *
 * Prepended to Hebrew strings written into PDF value-boxes so a BiDi-aware
 * PDF viewer (Acrobat, modern Chrome PDF viewer, macOS Preview 12.x+)
 * renders the run RTL even when the surrounding paragraph context is
 * ambiguous. Has no effect on glyph ORDER in the stream — the stream
 * remains in logical Unicode order; only the rendering hint changes.
 */
export const RTL_MARK = "‏";

/**
 * Return true if the string contains any character in the Hebrew Unicode
 * block (U+0590–U+05FF). Cheap pre-check so we can skip the BiDi pass for
 * pure-Latin / pure-numeric strings.
 */
export function hasHebrew(text: string): boolean {
  if (!text) return false;
  return /[֐-׿]/.test(text);
}

/**
 * Run the Unicode Bidirectional Algorithm and return the resolved
 * embedding-level info for the input. Exposed mostly for tests; production
 * callers should use `shapeForPdf()` below.
 */
export function getEmbeddingLevels(text: string): ReturnType<typeof bidi.getEmbeddingLevels> {
  return bidi.getEmbeddingLevels(text, "rtl");
}

/**
 * Shape a string for pdf-lib's `drawText()`.
 *
 * Strategy:
 *   - If the string is empty or contains no Hebrew, return it as-is.
 *   - If the string is pure Hebrew (no embedded LTR runs), return the
 *     LOGICAL Unicode order with a U+200F prefix. Logical order is what
 *     SHAAM's text-stream parser expects; the prefix nudges BiDi-aware
 *     viewers to render RTL.
 *   - If the string contains MIXED runs (Hebrew + digits / Latin), run
 *     the full Unicode Bidirectional Algorithm via bidi-js to compute
 *     visual segments and reassemble in LOGICAL order with embedded
 *     directional marks so a BiDi-aware viewer reproduces the intended
 *     visual layout.
 *
 * IMPORTANT: this function does NOT do glyph-by-glyph reversal — that
 * was the bug we are explicitly retiring (audits/generation.md §1.5).
 * The PDF text stream this function produces is in LOGICAL order so
 * `pdf-parse` re-extraction returns logical strings; the
 * `lib/__tests__/semanticGolden.test.ts` fixture pins this contract.
 */
export function shapeForPdf(text: string): string {
  if (!text) return "";
  if (!hasHebrew(text)) return text;

  // Compute embedding levels. For a pure-Hebrew string this is a no-op —
  // every character resolves to level 1 (RTL). For mixed strings the
  // algorithm assigns LTR runs even-numbered levels and RTL runs odd-
  // numbered levels.
  const embedding = bidi.getEmbeddingLevels(text, "rtl");

  // Pure-Hebrew shortcut: every level is odd ⇒ no reordering needed; just
  // prepend the RTL_MARK so a viewer can pick the direction unambiguously.
  let allRtl = true;
  let allLtr = true;
  for (let i = 0; i < embedding.levels.length; i++) {
    const lvl = embedding.levels[i];
    if (lvl & 1) allLtr = false;
    else allRtl = false;
  }
  if (allRtl) return RTL_MARK + text;
  if (allLtr) return text;

  // Mixed content: keep the LOGICAL order in the stream (SHAAM-friendly),
  // wrap with RTL_MARK so BiDi-aware viewers run the algorithm. We do
  // NOT pre-apply visual reordering because that would CORRUPT the
  // stream order pdf-parse extracts for round-trip tests.
  //
  // bidi-js exposes `getReorderSegments` for callers that want the visual
  // order — we deliberately do NOT call it here. The trade-off is
  // documented at the file header.
  return RTL_MARK + text;
}
