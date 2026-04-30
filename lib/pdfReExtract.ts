/**
 * lib/pdfReExtract.ts — Phase 1 §1.J semantic golden helper.
 *
 * Re-extract a rendered PDF (Form 135 or 1301) back to a `Map<code, value>`
 * dictionary so a regression in the stamper that produces VALID PDF bytes but
 * paints values at the wrong y-coordinate / wrong code is caught by the
 * semantic-golden test (`lib/__tests__/semanticGolden.test.ts`).
 *
 * Why this exists (audits/qa-release.md §3.1.3, audits/generation.md §1.13):
 *   The legacy `pdfGolden.test.ts` snapshots only the input dictionary that
 *   `buildForm135Fields` returns — a coordinate-shift, code-swap, or
 *   `hebrewForPdf` regression slips through because the actual rendered text
 *   is never inspected. This helper closes that loop: feed real PDF bytes,
 *   get back the dict the stamper actually painted.
 *
 * Strategy (constrained by pdf-parse 2.x emitting joined text without per-
 * item coordinates — see audit-finding §3.1.3 in qa-release.md):
 *
 *   1. Run pdf-parse → joined text + per-page text.
 *   2. Within each page, the rendered PDF concatenates the TEMPLATE's static
 *      text first (in stream order — that's where every printed 3-digit code
 *      lives) and the STAMPED values last (drawn after the template was
 *      loaded, so they emit at the tail of each page's text stream).
 *   3. We use two complementary extraction passes:
 *      a. `dict`: a brief-spec proximity scan around 3-digit codes
 *         (`/\b(\d{3})\s*[\n\s]*([\d,\.]+|[א-ת ]+)/g`-equivalent). On the
 *         current PDF, the next neighbour of most codes is ANOTHER code (the
 *         column header to its left), so this dict is dominated by
 *         code-to-code pairs — useful for checking which codes the template
 *         prints, but NOT for verifying stamped values.
 *      b. `stampedPerPage`: the tail of each page's text stream, after the
 *         last template-text line. This contains the route's drawn values in
 *         the SAME ORDER as `DRAW_LIST_135 → POSITIONAL_DRAWS_135` for that
 *         page. A code-swap reorders those values; a y-shift moves them to a
 *         different page; a `hebrewForPdf` rewrite changes their reversed
 *         glyph form. All three regression classes surface as a fixture diff.
 *      c. `codesSeen`: every 3-digit code that appears anywhere in the
 *         rendered text — this covers "is the field-code label still printed
 *         where we expect" so a template-shift between annual revisions
 *         shows up.
 *
 * Hebrew-glyph caveat (1.J brief, audits/generation.md §1.6):
 *   The current `hebrewForPdf()` reverses Unicode codepoints because pdf-lib
 *   has no BiDi. Re-extraction therefore returns REVERSED Hebrew strings
 *   ("דהוא" instead of "אוהד"). Per the 1.J brief we choose strategy (a) —
 *   the expected fixture stores the REVERSED form, marked with a TODO that
 *   1.D will retire when the BiDi rewrite lands. This helper is BiDi-naive
 *   on purpose: we record what pdf-parse emits, no normalization.
 */

import { loadFieldMap, type FieldMap } from "./fieldMap";

// ── pdf-parse DOM shims ──────────────────────────────────────────────────────
// pdf-parse uses pdfjs-dist under the hood, which expects browser globals.
// `lib/__tests__/form106Parser.test.ts` already does the same dance; the
// helper centralizes it so callers don't repeat it.
function installPdfjsDomStubs(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = class {};
  if (typeof g.ImageData === "undefined") g.ImageData = class {};
  if (typeof g.Path2D === "undefined") g.Path2D = class {};
}

/**
 * Parse PDF bytes via pdf-parse and return both the joined text and the
 * per-page text. The per-page slice is what the stamped-values extractor
 * needs (the joined text loses the page boundary needed to attribute a
 * stamped value to a page).
 */
export async function extractPdfPages(
  bytes: Uint8Array | Buffer,
): Promise<{ text: string; pages: string[] }> {
  installPdfjsDomStubs();
  const { PDFParse } = await import("pdf-parse");
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parser = new PDFParse({ data: u8 });
  try {
    const result = await parser.getText();
    const pages: string[] = result.pages.map((p) => p.text);
    return { text: result.text, pages };
  } finally {
    await parser.destroy();
  }
}

/** Convenience: joined text only, for callers that don't care about pages. */
export async function extractPdfText(bytes: Uint8Array | Buffer): Promise<string> {
  const { text } = await extractPdfPages(bytes);
  return text;
}

/**
 * Result of a re-extraction. See file-header for the meaning of each field.
 */
export interface ReExtractResult {
  /** Code → adjacent-token (mostly template artifacts; useful for codesSeen). */
  dict: Map<string, string>;
  /** Joined raw text. */
  text: string;
  /** Per-page text (1-based index → page text). pages[0] is page 1. */
  pages: string[];
  /** Every 3-digit code observed in the rendered text. */
  codesSeen: Set<string>;
  /**
   * Per-page list of STAMPED values (the route's draws), in stream order.
   * Tail-of-page extraction — see file-header step 3b. Index 0 = page 1.
   *
   * The "tail" boundary heuristic: take the LAST contiguous block of lines
   * after the last line that contains either a 3-digit code or a Hebrew
   * letter, and tokenize those lines into stamped values. In practice the
   * route emits 1-2 lines of values per page so this is robust.
   */
  stampedPerPage: string[][];
}

/** Numeric value pattern: 1-9 digit groups with optional thousand-separators. */
const NUMERIC_VALUE_RE = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+$/;

/** Hebrew-only run (allow spaces, slash, hyphen, parens common in labels). */
const HEBREW_VALUE_RE = /^[֐-׿][֐-׿\s\-\/()״׳']*$/;

/** Tokenize a line into atomic units we can scan with proximity rules. */
function tokenize(line: string): string[] {
  return line
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Brief-spec proximity scan — kept for callers who want to assert that the
 * template still prints expected codes near expected anchors. The actual
 * stamped-value verification uses `extractStampedValuesPerPage` below.
 */
function buildProximityDict(
  pdfText: string,
  knownCodes: Set<string>,
): { dict: Map<string, string>; codesSeen: Set<string> } {
  const dict = new Map<string, string>();
  const codesSeen = new Set<string>();
  const pages = pdfText.split(/\f+/);

  for (const page of pages) {
    const lines = page.split(/\r?\n/);
    for (const line of lines) {
      const tokens = tokenize(line);
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!/^\d{3}$/.test(tok)) continue;
        if (!knownCodes.has(tok)) continue;
        codesSeen.add(tok);

        const candidates: { delta: number; value: string }[] = [];
        for (let d = 1; d <= 2; d++) {
          const left = i - d >= 0 ? tokens[i - d] : null;
          const right = i + d < tokens.length ? tokens[i + d] : null;
          if (left && (NUMERIC_VALUE_RE.test(left) || HEBREW_VALUE_RE.test(left))) {
            candidates.push({ delta: d - 0.5, value: left });
          }
          if (right && (NUMERIC_VALUE_RE.test(right) || HEBREW_VALUE_RE.test(right))) {
            candidates.push({ delta: d, value: right });
          }
        }
        if (candidates.length === 0) continue;
        candidates.sort((a, b) => a.delta - b.delta);
        if (!dict.has(tok)) {
          dict.set(tok, candidates[0].value);
        }
      }
    }
  }

  return { dict, codesSeen };
}

/**
 * Tail-of-page stamped-value extractor. The form's static template emits
 * many lines of code labels and Hebrew descriptions; the route's `drawText`
 * calls land in the PDF stream AFTER the template, so pdf-parse sees them at
 * the end of each page's text block.
 *
 * Heuristic: walk the page's lines from bottom up. A line is "stamped" if it
 * contains ONLY tokens that are either:
 *   - numeric (with optional commas / sign / decimal)
 *   - reversed-Hebrew (any Hebrew run; the route's `hebrewForPdf` produces
 *     these)
 *   - a date (DD/MM/YYYY)
 *   - the literal "X" (declaration mark)
 *   - whitespace
 * As soon as we hit a line with template tokens (a 3-digit code, a Hebrew
 * label longer than one word AND containing punctuation, etc.) we stop.
 *
 * The returned tokens preserve their stream order (top-to-bottom within the
 * tail block).
 */
function extractStampedValuesFromPage(pageText: string): string[] {
  const allLines = pageText.split(/\r?\n/);
  // Walk from bottom up, collecting lines that look stamped.
  const stamped: string[] = [];
  for (let i = allLines.length - 1; i >= 0; i--) {
    const line = allLines[i].trim();
    if (line === "") continue;
    if (isStampedLine(line)) {
      stamped.unshift(line);
    } else {
      break;
    }
  }
  // Tokenize each stamped line into individual values.
  const values: string[] = [];
  for (const line of stamped) {
    for (const tok of tokenize(line)) {
      values.push(tok);
    }
  }
  return values;
}

function isStampedLine(line: string): boolean {
  // A stamped line must NOT contain any template signals.
  // Template signals (any one of these means we've hit the body):
  //   - punctuation outside Hebrew (parentheses, dots, commas EXCEPT in
  //     numeric values, slashes outside dates, asterisks, "%" sign).
  // We allow:
  //   - bare numerics (with commas, decimals)
  //   - DD/MM/YYYY dates
  //   - reversed-Hebrew runs (no punctuation other than spaces)
  //   - the literal "X"
  //   - the literal "כן" / "לא" (residency yes/no)
  //   - tax-year string (e.g. "2025")
  const tokens = tokenize(line);
  if (tokens.length === 0) return false;
  for (const tok of tokens) {
    if (NUMERIC_VALUE_RE.test(tok)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(tok)) continue;
    if (tok === "X" || tok === "x") continue;
    // Hebrew-only token (letters + optional internal apostrophes / slashes).
    if (/^[֐-׿]+$/.test(tok)) continue;
    return false;
  }
  return true;
}

/**
 * Build the full re-extract result. Loads the form's field-map to constrain
 * the codes-seen set to what the template should print.
 */
export function reExtractFromText(
  joinedText: string,
  pages: string[],
  formId: string,
): ReExtractResult {
  const map: FieldMap = loadFieldMap(formId);
  const knownCodes = new Set<string>();
  for (const key of Object.keys(map.fields)) {
    knownCodes.add(map.fields[key].code);
  }

  const { dict, codesSeen } = buildProximityDict(joinedText, knownCodes);

  const stampedPerPage = pages.map(extractStampedValuesFromPage);

  return { dict, text: joinedText, pages, codesSeen, stampedPerPage };
}

/**
 * Convenience: parse PDF bytes AND build the full result in one call.
 */
export async function reExtractFormPdf(
  bytes: Uint8Array | Buffer,
  formId: string,
): Promise<ReExtractResult> {
  const { text, pages } = await extractPdfPages(bytes);
  return reExtractFromText(text, pages, formId);
}
