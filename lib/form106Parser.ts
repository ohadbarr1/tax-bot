/**
 * lib/form106Parser.ts
 *
 * Extracts fields from Israeli Form 106 (annual salary statement) PDF text.
 *
 * Israeli 106 PDFs come in two very different layouts:
 *
 *   1. **Line-per-field** (e.g. Phoenix/Hilan "תעודה על-פי תקנות מס הכנסה"):
 *      every row is a single line "VALUE DESCRIPTION FIELD_CODE". Because the
 *      text is RTL, the *numeric value* is the **first** number on the line
 *      even though it appears visually last. Example:
 *        "290,895 משכורת 172/158"  →  gross 290,895 tied to field 172/158
 *
 *   2. **Columnar** (e.g. University-of-Jerusalem "תוסף 106"):
 *      the PDF renders three vertical columns — a list of field codes, a list
 *      of descriptions, then a list of numeric values — and pdf-parse emits
 *      them as three sequential blocks of lines. Values must be mapped back to
 *      descriptions by their parallel index, and field codes mapped to
 *      descriptions by keyword. Example:
 *        codes block:     172/158, 42, 086 ,045, ...
 *        descriptions:    הכנסה חייבת רגילה, ..., מס הכנסה שנוכה במקור, ...
 *        values:          9,253, ..., 3,569, ...
 *
 * The old regex-forward-scan parser (pre-2026-04-15) only handled a *broken*
 * subset of layout #1 — it captured the first number AFTER the field code
 * instead of BEFORE, so every field on every Phoenix-style 106 was wrong.
 * Layout #2 was not handled at all.
 *
 * Fields extracted:
 *   - grossSalary      (field 172/158 — "הכנסה חייבת" / "משכורת")
 *   - taxWithheld      (field 042     — "מס הכנסה שנוכה")
 *   - pensionDeduction (field 045     — "ניכוי לקופת גמל לקצבה כ'עמית שכיר'")
 *   - employerName     (multi-label: "שם המעסיק" / "מעסיק:" / "השולח:")
 *   - monthsWorked     (Phoenix: "חודשי עבודה בשנת המס N";
 *                       TA:      count of non-zero month columns)
 *
 * When a field cannot be found we omit it (caller defaults to 0 / ""), but
 * the test suite in form106Parser.test.ts enforces exact golden values on two
 * real-world sample PDFs so regressions are caught immediately.
 */

export interface Form106Fields {
  grossSalary?: number;
  taxWithheld?: number;
  pensionDeduction?: number;
  employerName?: string;
  monthsWorked?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? undefined : n;
}

/** Match a standalone integer (allow thousands separator). */
const NUMBER_RE = /(\d{1,3}(?:,\d{3})+|\d{3,})/;

/** A line consisting *only* of a number (with optional thousands separator). */
const NUMBER_ONLY_LINE_RE = /^\d{1,3}(?:,\d{3})*$/;

/** A line that looks like a field code (possibly multiple codes separated by / , or space). */
function lineIsFieldCodeOnly(line: string): boolean {
  // Accept: "172/158", "42", "086 ,045", "086,045", "086/045", "219/218",
  // "249/248", "245/244", "סעיף 17"
  return (
    /^(?:\d{2,3}(?:[ ,/]+\d{2,3})*|סעיף\s*\d{1,3})$/.test(line.trim())
  );
}

/** Does this line contain the given field code as a *whole token*? */
function lineContainsFieldCode(line: string, code: string): boolean {
  const re = new RegExp(`(?<!\\d)${code}(?!\\d)`);
  return re.test(line);
}

// ─── Strategy 1: line-per-field (Phoenix / Hilan) ────────────────────────────

/**
 * For Phoenix-style PDFs, every line is "VALUE DESCRIPTION FIELD_CODE".
 * The value is the **first** numeric token on the line.
 *
 * We scan all lines for one containing the target field code as a whole token
 * and return the first number on that line.
 */
function findLineValue(lines: string[], fieldCode: string): number | undefined {
  for (const line of lines) {
    if (!lineContainsFieldCode(line, fieldCode)) continue;
    // Skip lines that look like pure columnar code lists (no description text)
    if (lineIsFieldCodeOnly(line)) continue;
    const m = NUMBER_RE.exec(line);
    if (!m) continue;
    const val = parseNumber(m[1]);
    // Sanity: reject tiny noise (year 2025, page 1, etc.)
    if (val !== undefined && val >= 100) return val;
  }
  return undefined;
}

// ─── Strategy 2: columnar (university "תוסף 106") ────────────────────────────

interface ColumnarLayout {
  /** Description lines in display order. */
  descriptions: string[];
  /** Parallel value lines (same length as descriptions, may have undefined gaps). */
  values: (number | undefined)[];
}

/**
 * Detect and extract the columnar description+value lists from a 106 PDF.
 *
 * Layout:
 *   - A run of field-code-only lines (ignored for this strategy — just a marker).
 *   - A run of description lines (mixed Hebrew text, may include spaces).
 *   - A run of number-only lines (values).
 *
 * We look for the longest run of number-only lines (≥ 3) and zip it with the
 * preceding run of non-number lines that immediately follows a field-code
 * block. Values are extracted in the same order they appear.
 */
function extractColumnarLayout(lines: string[]): ColumnarLayout | undefined {
  // Find all runs of ≥3 consecutive number-only lines.
  const valueRuns: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (NUMBER_ONLY_LINE_RE.test(lines[i])) {
      if (runStart === -1) runStart = i;
    } else {
      if (runStart !== -1 && i - runStart >= 3) {
        valueRuns.push({ start: runStart, end: i - 1 });
      }
      runStart = -1;
    }
  }
  if (runStart !== -1 && lines.length - runStart >= 3) {
    valueRuns.push({ start: runStart, end: lines.length - 1 });
  }

  // Pick the longest run — columnar 106 has 15-20 values in one block.
  if (valueRuns.length === 0) return undefined;
  valueRuns.sort((a, b) => b.end - b.start - (a.end - a.start));
  const longest = valueRuns[0];
  const runLen = longest.end - longest.start + 1;
  if (runLen < 5) return undefined; // too short to be meaningful

  const values: number[] = [];
  for (let i = longest.start; i <= longest.end; i++) {
    const v = parseNumber(lines[i]);
    if (v !== undefined) values.push(v);
  }

  // Walk backwards from longest.start to collect the description block:
  // keep going while lines are non-numeric, non-field-code, non-empty.
  const descriptions: string[] = [];
  for (let i = longest.start - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l) break;
    if (NUMBER_ONLY_LINE_RE.test(l)) break;
    if (lineIsFieldCodeOnly(l)) break;
    descriptions.unshift(l);
    if (descriptions.length >= values.length) break;
  }

  if (descriptions.length === 0) return undefined;

  // Zip: truncate to matching length.
  const n = Math.min(descriptions.length, values.length);
  return {
    descriptions: descriptions.slice(0, n),
    values: values.slice(0, n),
  };
}

/**
 * Given a columnar layout and a list of keyword alternatives, return the value
 * of the first description whose text contains any keyword.
 */
function findColumnarValue(
  layout: ColumnarLayout | undefined,
  keywords: string[]
): number | undefined {
  if (!layout) return undefined;
  for (let i = 0; i < layout.descriptions.length; i++) {
    const d = layout.descriptions[i];
    if (keywords.some((kw) => d.includes(kw))) {
      return layout.values[i];
    }
  }
  return undefined;
}

// ─── Months worked ────────────────────────────────────────────────────────────

function extractMonthsWorked(
  text: string,
  lines: string[]
): number | undefined {
  // Phoenix pattern: "סה\"כ חודשי עבודה בשנת המס 11"
  const phoenix = /חודשי\s+עבודה\s+בשנת\s+המס\s+(\d{1,2})/.exec(text);
  if (phoenix) {
    const m = parseInt(phoenix[1], 10);
    if (m >= 1 && m <= 12) return m;
  }

  // Legacy pattern: "012: 11" or "חודשי עבודה: 11"
  const legacy = /(?:\b012\b|חודשי\s+עבודה)[:\s]+(\d{1,2})\b/.exec(text);
  if (legacy) {
    const m = parseInt(legacy[1], 10);
    if (m >= 1 && m <= 12) return m;
  }

  // TA pattern: "חודשי עבודה לפי תאום" is a label line; the actual 12-column
  // values row ("25 25 25 0 0 0 0 0 0 0 0 0") sits nearby but may be ABOVE or
  // BELOW the label. A header row ("1 2 3 4 5 6 7 8 9 10 11 12") also has 12
  // numbers but contains NO zeros — so we skip rows without any zero.
  for (let i = 0; i < lines.length; i++) {
    if (!/חודשי\s+עבודה/.test(lines[i])) continue;
    // Search a window of ±6 lines around the label.
    const lo = Math.max(0, i - 6);
    const hi = Math.min(lines.length, i + 6);
    let best: number | undefined;
    let bestZeros = -1;
    for (let j = lo; j < hi; j++) {
      if (j === i) continue;
      const nums = lines[j].match(/\d+/g);
      if (!nums || nums.length < 12) continue;
      const first12 = nums.slice(0, 12).map((n) => parseInt(n, 10));
      const zeros = first12.filter((n) => n === 0).length;
      // Must contain at least one zero to be a values row (not a header row).
      if (zeros === 0) continue;
      if (zeros > bestZeros) {
        bestZeros = zeros;
        best = first12.filter((n) => n > 0).length;
      }
    }
    if (best !== undefined && best >= 1 && best <= 12) return best;
  }

  return undefined;
}

// ─── Employer name ────────────────────────────────────────────────────────────

/** Boilerplate/noise phrases that show up near these labels but aren't names. */
const EMPLOYER_NAME_BLOCKLIST = [
  "מספר ת.ז",
  "תיק ניכויים",
  "בר אוהד", // sample-specific — but this is "employee name", never "employer"
  "מס'",
  "שם עובד",
];

function extractEmployerName(
  text: string,
  lines: string[]
): string | undefined {
  // CRITICAL: each pattern MUST require a ':' after the label. Without the
  // colon anchor, "/מעסיק\s+(...)/" matches on "שניתנו ע\"י המעסיק\n" in the
  // middle of the document and captures the NEXT line ("פירוט קופות"), which
  // is what the pre-fix parser returned for Phoenix.
  const patterns: RegExp[] = [
    /שם\s+המעסיק\s*:\s*([^\n\r\t]{2,80})/,
    /מעסיק\s*:\s*([^\n\r\t]{2,80})/,
    /השולח\s*:\s*([^\n\r\t]{2,80})/,
  ];

  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const raw = m[1].trim();
    if (raw.length < 2) continue;
    // Reject if it hits a blocklist phrase — we probably matched a different label.
    if (EMPLOYER_NAME_BLOCKLIST.some((b) => raw.startsWith(b))) continue;
    // Reject if it's all digits (we grabbed an ID number).
    if (/^\d+$/.test(raw)) continue;
    return raw;
  }

  // Line-by-line fallback: look for "מעסיק:" or "שם המעסיק:" followed by the
  // name either on the same line after a tab or on the next non-empty line.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/(?:שם\s+המעסיק|מעסיק|השולח)\s*[:]/.test(l)) continue;
    // Split on tabs / multiple spaces and take the last non-trivial segment.
    const segments = l.split(/[\t]+|\s{2,}/).filter((s) => s.trim().length > 0);
    for (let j = segments.length - 1; j >= 0; j--) {
      const s = segments[j].trim();
      if (s.length < 2) continue;
      if (/^\d+$/.test(s)) continue;
      if (EMPLOYER_NAME_BLOCKLIST.some((b) => s.startsWith(b))) continue;
      if (/^(?:שם\s+המעסיק|מעסיק|השולח)\s*:?$/.test(s)) continue;
      return s;
    }
    // Next-line fallback
    const next = lines[i + 1]?.trim();
    if (next && next.length >= 2 && !NUMBER_ONLY_LINE_RE.test(next)) {
      return next;
    }
  }

  return undefined;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Parse a Form 106 PDF text blob and return the extracted fields.
 *
 * @param text — raw text output from pdf-parse (for digital PDFs) or
 *               Tesseract (for scanned PDFs/images).
 */
export function extractForm106Fields(text: string): Form106Fields {
  // Normalize RTL marks and split into non-empty lines.
  const normalized = text.replace(/[\u200F\u200E\u202A-\u202E]/g, " ");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: Form106Fields = {};

  // Strategy 1: single-line per field (Phoenix).
  // Field 158 / 172 — gross salary
  result.grossSalary =
    findLineValue(lines, "158") ??
    findLineValue(lines, "172");

  // Field 042 — tax withheld (try both 042 and 42)
  result.taxWithheld =
    findLineValue(lines, "042") ?? findLineValue(lines, "42");

  // Field 045 — pension deduction (try 045, 045, 086/045)
  result.pensionDeduction =
    findLineValue(lines, "045") ?? findLineValue(lines, "45");

  // Strategy 2: columnar fallback for fields still missing.
  if (
    result.grossSalary === undefined ||
    result.taxWithheld === undefined ||
    result.pensionDeduction === undefined
  ) {
    const layout = extractColumnarLayout(lines);

    result.grossSalary =
      result.grossSalary ??
      findColumnarValue(layout, [
        "הכנסה חייבת רגילה",
        "הכנסה חייבת",
        "משכורת חייבת",
      ]);

    result.taxWithheld =
      result.taxWithheld ??
      findColumnarValue(layout, ["מס הכנסה שנוכה", "מס הכנסה"]);

    result.pensionDeduction =
      result.pensionDeduction ??
      findColumnarValue(layout, [
        "ניכוי לקופת גמל לקצבה",
        "ניכוי לקופת גמל",
      ]);
  }

  // Months worked
  result.monthsWorked = extractMonthsWorked(normalized, lines);

  // Employer name
  result.employerName = extractEmployerName(normalized, lines);

  return result;
}
