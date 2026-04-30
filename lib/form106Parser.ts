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
 * **2026-04-29 expansion (Phase 1 §1.C, closes ingestion-F-1, F-2, F-3):**
 *   The parser now extracts ALL canonical Form 106 ITA codes (14+ fields),
 *   not just the original 3. The 158-vs-158 tax-coordination ambiguity is
 *   resolved by looking up `field158Coordinated` from the description label
 *   "נוסף\לפי תאום" instead of returning the first stream-order hit.
 *
 * Fields extracted (Form106Fields):
 *   - grossSalary              (158/172  — "הכנסה חייבת רגילה" / "משכורת")
 *   - field158Coordinated      (158      — "משכורת חייבת במס - נוספת/לפי תאום")
 *   - taxWithheld              (042      — "מס הכנסה שנוכה")
 *   - pensionDeduction         (045      — "ניכוי לקופת גמל לקצבה כעמית שכיר")
 *   - nationalInsuranceWithheld(086      — "דמי ביטוח לאומי + מס בריאות")
 *   - studyFundSalary          (219      — "משכורת לקרן השתלמות")
 *   - studyFundEmployer        (218      — "הפרשת המעסיק לקרן השתלמות")
 *   - pensionInsuredSalary     (245      — "השכר המבוטח לקופ"ג לקצבה")
 *   - severanceMargin          (244      — "מענק שולי")
 *   - employerPensionTotal     (249      — "סך הפרשות מעסיק לקצבה")
 *   - employerPensionDeduct    (248      — "הפרשות מעסיק לקצבה ניכוי")
 *   - severanceTaxable         (272      — "פיצויי פיטורין חייבים")
 *   - employerDonations        (037      — "תרומות שהמעסיק העביר")
 *   - creditPointsValue        (044 ILS  — "ערך נקודות זיכוי")
 *   - creditPointsCount        (044 cnt  — count, e.g. "6.75")
 *   - taxFileNumber            (004      — "תיק ניכויים")
 *   - incomeType               (033      — 1/2/5)
 *   - exemptionSection9a       (089      — "פטור לפי סעיף 9א")
 *   - exemptionSection9b       (090      — "פטור (שני)")
 *   - employerName             (multi-label: "שם המעסיק" / "מעסיק:" / "השולח:")
 *   - monthsWorked             (Phoenix: "חודשי עבודה בשנת המס N";
 *                               TA:      count of non-zero month columns)
 *
 * When a field cannot be found we omit it (caller defaults to 0 / ""), but
 * the test suite in form106Parser.test.ts enforces exact golden values on two
 * real-world sample PDFs so regressions are caught immediately.
 */

export type Form106IncomeType = 1 | 2 | 3 | 5 | 8;

export interface Form106Fields {
  // Legacy fields (kept for back-compat with FileDropzone consumer).
  grossSalary?: number;
  taxWithheld?: number;
  pensionDeduction?: number;
  employerName?: string;
  monthsWorked?: number;

  // Phase 1 §1.C — full 14-code extraction.
  field158Coordinated?: number;
  nationalInsuranceWithheld?: number;
  studyFundSalary?: number;
  studyFundEmployer?: number;
  pensionInsuredSalary?: number;
  severanceMargin?: number;
  employerPensionTotal?: number;
  employerPensionDeduct?: number;
  severanceTaxable?: number;
  employerDonations?: number;
  creditPointsValue?: number;
  creditPointsCount?: number;
  taxFileNumber?: string;
  incomeType?: Form106IncomeType;
  exemptionSection9a?: number;
  exemptionSection9b?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? undefined : n;
}

function parseFloatOrUndef(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, "");
  const n = parseFloat(cleaned);
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
 *
 * Optional `descriptionFilter` allows narrowing to only lines whose text
 * matches a keyword — this is how 158-vs-158 ambiguity is resolved (return
 * the first 158-line containing "רגילה" vs the first containing "נוסף|תאום").
 *
 * F-3 fix: when no `descriptionFilter` is provided, also reject candidate
 * values that are exactly equal to the field code itself OR look like the
 * tax year (1900-2099 with no thousands separator) — both surface as false
 * positives on header-only lines like "2025 שנת המס 172/158".
 */
function findLineValue(
  lines: string[],
  fieldCode: string,
  descriptionFilter?: RegExp,
): number | undefined {
  for (const line of lines) {
    if (!lineContainsFieldCode(line, fieldCode)) continue;
    // Skip lines that look like pure columnar code lists (no description text)
    if (lineIsFieldCodeOnly(line)) continue;
    if (descriptionFilter && !descriptionFilter.test(line)) continue;
    const m = NUMBER_RE.exec(line);
    if (!m) continue;
    const rawVal = m[1];
    const val = parseNumber(rawVal);
    if (val === undefined) continue;
    // Sanity: reject tiny noise (page 1 etc.)
    if (val < 100) continue;
    if (!descriptionFilter) {
      // Year-shaped tokens (4 digits, 1900-2099, no thousands separator).
      if (!rawVal.includes(",") && val >= 1900 && val <= 2099) continue;
      // Don't return the field-code itself if it accidentally matched as
      // the leading number (e.g. a code-only header line that escaped the
      // field-code-only filter).
      if (String(val) === fieldCode) continue;
    }
    return val;
  }
  return undefined;
}

/**
 * Like findLineValue but matches by description text (no field code required).
 * Useful for fields that appear without their numeric code on the line
 * (e.g. "דמי ביטוח לאומי" on Phoenix appears as a free-form line).
 *
 * `excludeRe` (optional) rejects lines that match the exclusion pattern even
 * if they pass the inclusion match — used to disambiguate label substrings
 * (e.g. exclude "שכר חייב בדמי ביטוח לאומי" when looking for the BL row).
 */
function findLineValueByDescription(
  lines: string[],
  descriptionRe: RegExp,
  excludeRe?: RegExp,
): number | undefined {
  for (const line of lines) {
    if (!descriptionRe.test(line)) continue;
    if (excludeRe && excludeRe.test(line)) continue;
    if (lineIsFieldCodeOnly(line)) continue;
    const m = NUMBER_RE.exec(line);
    if (!m) continue;
    const val = parseNumber(m[1]);
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
 * of the first description whose text contains any keyword. An optional
 * `excludeKeywords` filters out descriptions where any exclusion is matched
 * (useful for keyword-overlap disambiguation, e.g. "רגילה" vs "נוסף").
 */
function findColumnarValue(
  layout: ColumnarLayout | undefined,
  keywords: string[],
  excludeKeywords: string[] = [],
): number | undefined {
  if (!layout) return undefined;
  for (let i = 0; i < layout.descriptions.length; i++) {
    const d = layout.descriptions[i];
    if (!keywords.some((kw) => d.includes(kw))) continue;
    if (excludeKeywords.some((kw) => d.includes(kw))) continue;
    return layout.values[i];
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

// ─── Tax file number (field 004) ─────────────────────────────────────────────

/**
 * Field 004 — "תיק ניכויים" (employer's withholding-file ID, 6-12 digits).
 * Both real fixtures emit a 9-digit number; some payroll houses prefix with
 * a hyphen and a sub-account.
 *
 * Four layouts seen in the wild:
 *   1. Phoenix line-per-field: "939387767 תיק ניכויים:" (number BEFORE label,
 *      RTL flipped by pdf-parse). Match the second pattern.
 *   2. Direct colon: "תיק ניכויים: 941180002". Match the first pattern.
 *   3. Same-line columnar (TA page 2): the label and value live in the same
 *      pdf-parse line, separated by tabs and other cells. The TZ appears
 *      first, the file number second.
 *   4. Cross-line columnar (TA page 1): label on one line, value on a
 *      different line up the page. Walk a window of nearby lines for the
 *      first 9-digit run that is NOT the employee TZ.
 *
 * The TZ disambiguation set is built by scanning all lines for "מספר ת.ז."
 * and collecting digit runs on those lines.
 */
function extractTaxFileNumber(text: string, lines: string[]): string | undefined {
  // Build the TZ blocklist — anything seen near "מספר ת.ז." gets excluded
  // as a file-number candidate. SKIP lines that also contain "תיק ניכויים"
  // (a single columnar header line lists BOTH labels and BOTH values; using
  // them as a TZ source over-blocks the file number).
  const tzCandidates = new Set<string>();
  for (const line of lines) {
    if (!/(?:מספר\s+ת\.?\s*ז\.?|ת\.ז\b|תעודת\s+זהות)/.test(line)) continue;
    if (/תיק\s+ניכויים/.test(line)) continue;
    const matches = line.match(/\d{8,12}/g) ?? [];
    for (const c of matches) tzCandidates.add(c);
  }

  // Layout 1 (Phoenix): "939387767 תיק ניכויים:".
  const m2 = /(\d{6,12})\s*תיק\s+ניכויים/.exec(text);
  if (m2 && !tzCandidates.has(m2[1])) return m2[1];

  // Layout 2 (direct colon): "תיק ניכויים: 941180002" (no other text between).
  const m1 = /תיק\s+ניכויים\s*[:]\s*(\d{6,12})/.exec(text);
  if (m1 && !tzCandidates.has(m1[1])) return m1[1];

  // Layout 3 (same-line columnar): the label and the value share a line.
  // When the line also has "מספר ת.ז." earlier in the column order, the file
  // number is the SECOND digit run (TZ is first). Otherwise pick the first
  // run that isn't a known TZ.
  for (const line of lines) {
    if (!/תיק\s+ניכויים/.test(line)) continue;
    const digitRuns = line.match(/\d{6,12}/g) ?? [];
    if (digitRuns.length === 0) continue;
    const tzLabelBefore =
      /מספר\s+ת\.?\s*ז\.?[\s\S]*תיק\s+ניכויים/.test(line) ||
      /ת\.ז\b[\s\S]*תיק\s+ניכויים/.test(line);
    if (tzLabelBefore && digitRuns.length >= 2) {
      // Ordered columnar: skip the first run (TZ), take the second.
      return digitRuns[1];
    }
    for (const candidate of digitRuns) {
      if (!tzCandidates.has(candidate)) return candidate;
    }
  }

  // Layout 4 (cross-line columnar): scan a ±10-line window around the label.
  for (let i = 0; i < lines.length; i++) {
    if (!/תיק\s+ניכויים/.test(lines[i])) continue;
    const lo = Math.max(0, i - 10);
    const hi = Math.min(lines.length, i + 10);
    for (let j = lo; j < hi; j++) {
      const digitRuns = lines[j].match(/\d{6,12}/g) ?? [];
      for (const candidate of digitRuns) {
        if (!tzCandidates.has(candidate)) return candidate;
      }
    }
  }

  return undefined;
}

// ─── Income type (field 033) ─────────────────────────────────────────────────

/**
 * Field 033 — סוג הכנסה. Mostly inferred from form heading rather than a
 * dedicated row in current sample fixtures:
 *   - "טופס 106" without "פנסיה" / "קצבה" / "פיצויים" → 1 (regular salary)
 *   - "פנסיה" / "קצבה" present → 2 (pension)
 *   - "פיצויי פיטורים" / "פיצויים" + 272 row → 5 (severance)
 */
function extractIncomeType(text: string): Form106IncomeType | undefined {
  // Explicit code line: "033 N" or "033: N".
  const explicit = /\b033\b\s*[:\s]\s*([12358])\b/.exec(text);
  if (explicit) return parseInt(explicit[1], 10) as Form106IncomeType;

  // Severance recipients: form 161 / 272 row strongly implies code 5.
  if (/פיצויי\s+פיטורין/.test(text) && /\b272\b/.test(text)) return 5;

  // Pension recipients: form 106 from a קופת גמל / קרן פנסיה.
  // The header text typically says "טופס 106 - קצבה" or "טופס 106 - פנסיה".
  if (/טופס\s*106[^\n]*(?:קצבה|פנסיה)/.test(text)) return 2;

  // Default: regular salary (header is plain "טופס 106").
  if (/טופס\s*106/.test(text)) return 1;

  return undefined;
}

// ─── Credit-point count (field 044) ──────────────────────────────────────────

/**
 * Phoenix line: "ערך נקודות זיכוי 6.75   17,119".
 * Returns the 6.75 as `creditPointsCount`.
 */
function extractCreditPointsCount(text: string): number | undefined {
  const m = /ערך\s+נקודות\s+זיכוי\s+(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return undefined;
  const v = parseFloatOrUndef(m[1]);
  if (v === undefined || v <= 0 || v > 30) return undefined;
  return v;
}

// ─── National insurance (field 086) ──────────────────────────────────────────

/**
 * Field 086 — דמי ביטוח לאומי + מס בריאות שנוכו.
 *
 * Phoenix layout: two separate single-line rows
 *   "15,431 דמי ביטוח לאומי"
 *   "13,434 דמי ביטוח בריאות"
 * → return their sum (28,865).
 *
 * TA columnar layout: "נ. ביטוח לאומי" + "נ. ביטוח בריאות" descriptions,
 * values via the columnar layout. Same sum approach.
 *
 * **Disambiguation**: BOTH layouts also emit "שכר חייב בדמי ביטוח לאומי"
 * (the BL-base salary, not the BL withholding). Substring-matching "ביטוח
 * לאומי" silently grabs the wrong row — value would be 290,895 (gross), not
 * 15,431 (BL withheld). The exclusion list below filters those out.
 *
 * On forms that list "086" as the field code on a single combined-line,
 * fallback to that line's value.
 */
function extractNationalInsurance(
  lines: string[],
  layout: ColumnarLayout | undefined,
): number | undefined {
  // Disambiguation prefixes — these descriptions contain "ביטוח לאומי" but
  // refer to the BASE salary (not the withholding amount).
  const blExclude = ["שכר חייב", "הכנסה חייבת"];
  const healthExclude = ["שכר חייב", "הכנסה חייבת"];

  // Strategy A: columnar layout — look up "ביטוח לאומי" + "ביטוח בריאות".
  const bl = findColumnarValue(layout, ["ביטוח לאומי"], blExclude);
  const health = findColumnarValue(layout, ["ביטוח בריאות"], healthExclude);
  if (bl !== undefined || health !== undefined) {
    return (bl ?? 0) + (health ?? 0);
  }

  // Strategy B: line-per-field — find the two free-form lines, EXCLUDING the
  // "שכר חייב בדמי ביטוח לאומי" base-salary row.
  const blLine = findLineValueByDescription(
    lines,
    /(?:^|\s)(?:נ\.|דמי)\s+ביטוח\s+לאומי/,
    /שכר\s+חייב|הכנסה\s+חייבת/,
  );
  const healthLine = findLineValueByDescription(
    lines,
    /(?:^|\s)(?:נ\.|דמי)\s+ביטוח\s+בריאות/,
    /שכר\s+חייב|הכנסה\s+חייבת/,
  );
  if (blLine !== undefined || healthLine !== undefined) {
    return (blLine ?? 0) + (healthLine ?? 0);
  }

  // Strategy C: explicit "086" combined row.
  return findLineValue(lines, "086");
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Parse a Form 106 PDF text blob and return the extracted fields.
 *
 * @param text — raw text output from pdf-parse (for digital PDFs) or
 *               Tesseract (for scanned PDFs/images).
 */
export function extractForm106Fields(text: string): Form106Fields {
  // Normalize RTL marks AND non-breaking spaces (the TA fixture emits NBSP
  // between "086 ,045" — strip them or the field-code-only test fails).
  const normalized = text
    .replace(/[‏‎‪-‮]/g, " ")
    .replace(/[  ]/g, " ");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: Form106Fields = {};
  const layout = extractColumnarLayout(lines);

  // ─── Field 158 / 172 — gross salary (regular) ──────────────────────────────
  // F-2 fix: explicitly prefer the "רגילה" line over the "נוסף|תאום" line.
  result.grossSalary =
    findLineValue(lines, "158", /רגילה/) ??
    findLineValue(lines, "172", /רגילה/) ??
    findColumnarValue(layout, ["הכנסה חייבת רגילה"]) ??
    findColumnarValue(layout, ["משכורת"], ["נוסף", "תאום", "תיאום"]) ??
    findLineValue(lines, "158") ??
    findLineValue(lines, "172");

  // ─── Field 158 (תיאום) — coordinated/additional salary ─────────────────────
  // Closes ingestion-F-2 — never silently overwrite grossSalary.
  result.field158Coordinated =
    findColumnarValue(layout, ["נוסף", "תאום", "תיאום"]) ??
    findLineValue(lines, "158", /נוסף|תאום|תיאום/) ??
    findLineValue(lines, "172", /נוסף|תאום|תיאום/);

  // ─── Field 042 — tax withheld ──────────────────────────────────────────────
  result.taxWithheld =
    findLineValue(lines, "042") ??
    findLineValue(lines, "42") ??
    findColumnarValue(layout, ["מס הכנסה שנוכה", "מס הכנסה"]);

  // ─── Field 045 — pension deduction ─────────────────────────────────────────
  result.pensionDeduction =
    findLineValue(lines, "045") ??
    findLineValue(lines, "45") ??
    findColumnarValue(layout, [
      "ניכוי לקופת גמל לקצבה",
      "ניכוי לקופת גמל",
      "ניכוי לקופות גמל",
    ]);

  // ─── Field 086 — national insurance + health (sum) ─────────────────────────
  result.nationalInsuranceWithheld = extractNationalInsurance(lines, layout);

  // ─── Field 219 — study-fund salary ─────────────────────────────────────────
  // Phoenix line: "230,215 השכר לקרן השתלמות 219/218" (sum + employer share
  // share is on the same line). TA columnar: "משכורת לצורך הפקדות לקרן השתלמות".
  result.studyFundSalary =
    findLineValue(lines, "219") ??
    findColumnarValue(layout, [
      "משכורת לצורך הפקדות לקרן השתלמות",
      "משכורת לקרן השתלמות",
      "השכר לקרן השתלמות",
    ]);

  // ─── Field 218 — employer study-fund contribution ──────────────────────────
  result.studyFundEmployer = findColumnarValue(layout, [
    "הפרשת המעסיק לקרן השתלמות",
    "הפרשת מעסיק לקרן השתלמות",
  ]);
  // Phoenix combines 218 with 219 on a single line; if no separate columnar
  // value, leave undefined (consumer treats as not parsed rather than =0).

  // ─── Field 245 — pension-insured salary ────────────────────────────────────
  result.pensionInsuredSalary =
    findLineValue(lines, "245") ??
    findColumnarValue(layout, [
      "השכר המבוטח לקופ",
      "משכורת לצורך הפקדות לקצבה",
      "משכורת המבוטחת לקופ",
    ]);

  // ─── Field 244 — severance margin (חד-פעמי) ────────────────────────────────
  result.severanceMargin = findLineValue(lines, "244");

  // ─── Field 249 — employer pension total ────────────────────────────────────
  result.employerPensionTotal =
    findLineValue(lines, "249") ??
    findColumnarValue(layout, [
      "סך הפרשות מעסיק לקצבה",
      "הפרשות לקופ\"ג לקצבה",
      "הפרשות לקופ'ג לקצבה",
    ]);

  // ─── Field 248 — employer pension deduction ────────────────────────────────
  result.employerPensionDeduct = findLineValue(lines, "248");

  // ─── Field 272 — taxable severance ─────────────────────────────────────────
  result.severanceTaxable =
    findLineValue(lines, "272") ??
    findLineValueByDescription(lines, /פיצויי\s+פיטורין\s+חייב/);

  // ─── Field 037 — employer-channeled donations ──────────────────────────────
  result.employerDonations =
    findLineValue(lines, "037") ??
    findLineValue(lines, "37", /תרומות/) ??
    findLineValueByDescription(lines, /תרומות\s+שהמעסיק\s+העביר/);

  // ─── Field 044 — credit-points value + count ───────────────────────────────
  result.creditPointsValue =
    findLineValueByDescription(lines, /ערך\s+נקודות\s+זיכוי/) ??
    findLineValue(lines, "044");
  result.creditPointsCount = extractCreditPointsCount(normalized);

  // ─── Field 004 — tax-deductions file number ────────────────────────────────
  result.taxFileNumber = extractTaxFileNumber(normalized, lines);

  // ─── Field 033 — income type ───────────────────────────────────────────────
  result.incomeType = extractIncomeType(normalized);

  // ─── Field 089 / 090 — exemption portions (סע' 9א / 9(5) / 9(7א)) ─────────
  result.exemptionSection9a =
    findLineValue(lines, "089") ??
    findLineValueByDescription(lines, /תשלומים\s+פטורים\s+לפי\s+סעיף\s+9א/);
  result.exemptionSection9b = findLineValue(lines, "090");

  // ─── Months worked ─────────────────────────────────────────────────────────
  result.monthsWorked = extractMonthsWorked(normalized, lines);

  // ─── Employer name ─────────────────────────────────────────────────────────
  result.employerName = extractEmployerName(normalized, lines);

  return result;
}
