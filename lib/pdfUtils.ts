/**
 * pdfUtils.ts — PDF Utilities for Form 135 / 1301 stampers.
 *
 * RTL STRATEGY (Phase 1 §1.D rewrite — closes audits/generation.md §1.5)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Pre-Phase-1, hebrewForPdf() did `text.split("").reverse()` — a blind
 * codepoint reversal. That broke (a) SHAAM intake OCR (every Hebrew name
 * stored as "דהוא" instead of "אוהד") and (b) mixed-content strings (a
 * house-number embedded in a street name had its digits flipped: "100"
 * became "001"). See `lib/bidi.ts` for the full rationale.
 *
 * Now hebrewForPdf() delegates to shapeForPdf() from `lib/bidi.ts`,
 * which runs the proper Unicode Bidirectional Algorithm (UAX #9) via
 * bidi-js and emits LOGICAL-ORDER text with an RTL_MARK hint for
 * BiDi-aware viewers. The PDF stream now matches what pdf-parse
 * re-extracts, so `lib/__tests__/semanticGolden.test.ts` can assert the
 * round-trip against logical Hebrew strings.
 *
 * Numeric / Latin content still routes through StandardFonts.Helvetica
 * (the @fontsource/assistant Hebrew-only subset has no digit glyphs).
 *
 * The legacy prepareHebrewTextForPdf no-op shim was retired in this
 * rewrite (audit F-25); no in-repo callers remained.
 */

import type { TaxPayer, FinancialData } from "@/types";
import peripheryData from "@/data/periphery_postcodes.json";
import { shapeForPdf } from "@/lib/bidi";

// ─── 1. RTL Text Helpers ──────────────────────────────────────────────────────

/**
 * Shape a Hebrew (or mixed Hebrew + Latin) string for pdf-lib's
 * drawText(). Replaces the pre-Phase-1 codepoint-reversal hack with the
 * proper Unicode Bidirectional Algorithm (UAX #9, via bidi-js). The
 * function NAME and SIGNATURE are preserved for caller-site backward
 * compatibility — only the implementation changes. See `lib/bidi.ts`.
 *
 * Output is in LOGICAL Unicode order with an optional RTL_MARK prefix —
 * SHAAM intake parses the PDF text stream and now sees Hebrew names
 * "אוהד" rather than the previously-reversed "דהוא". BiDi-aware PDF
 * viewers (Acrobat, modern Chrome, macOS Preview 12+) render the visual
 * RTL ordering correctly.
 *
 * The legacy `prepareHebrewTextForPdf` no-op shim was retired in this
 * rewrite (audit F-25); no in-repo callers remained.
 */
export function hebrewForPdf(text: string): string {
  if (!text) return "";
  return shapeForPdf(text);
}

/**
 * Format a number for PDF injection using en-US locale so commas render
 * correctly with StandardFonts.Helvetica.
 * Numbers are NEVER reversed — they are always LTR.
 */
export function formatIlsForPdf(n: number | undefined | null): string {
  if (n == null) return "0";
  return Math.round(n).toLocaleString("en-US");
}

// ─── 2. Form-135 Field Value Extractor ───────────────────────────────────────
//
// Maps the full AppState to the flat field IDs defined in form_135_mapping.json.
// Hebrew strings are returned in logical Unicode order (no reversal).
// Numeric strings are formatted with en-US commas for Helvetica rendering.

export interface Form135Fields {
  // §1 Personal details
  "012": string;
  "013": string;
  "031": string; // First name — raw Hebrew (logical order)
  "032": string; // Last name  — raw Hebrew
  "022": string; // City       — raw Hebrew
  "023": string; // Street     — raw Hebrew
  "024": string; // House number — numeric string
  maritalStatusLabel: string; // Hebrew label (raw)

  // §1b Residency / aliyah / periphery (Phase 0 §0.D — audits/generation.md §1.1)
  /**
   * Code 020 — מצב משפחתי. The 2025 form uses an X-mark on a grouped row
   * (single / married / divorced / widowed). We render the Hebrew label in
   * that single value-box. Audit table: P0.
   */
  "020": string;
  /** Code 014 — תושב ישראל לכל השנה (כן / לא). Hebrew "כן" or "לא". P0. */
  "014": string;
  /**
   * Code 015 — תאריך עליה (DD/MM/YYYY). NOT present in the auto-generated
   * field-map (the value-box label was filtered as a section reference);
   * positional draw planned in route. P0 for olim.
   */
  aliyahDate: string;
  /**
   * Code 016 — תושב יישוב מזכה (X mark + tier). NOT present in the
   * auto-generated field-map; positional draw planned in route. P0.
   */
  peripheryFlag: string;

  // §2 Employment income
  "158": string; // Total gross salary
  "042": string; // Total income tax withheld
  "045": string; // Total pension deduction
  "272": string; // Taxable severance pay
  /** Code 069 — מס שנוכה — מעסיק שני (left column). P0 (multi-employer). */
  "069": string;
  /** Code 086 — מענק פטור (סעיף 9(7א)). P0 (severance). */
  "086": string;

  // §3 Capital gains & foreign income
  "256": string;
  "166": string;
  "055": string;
  /** Code 117 — דיבידנד מסיכום ני"ע סחירים. P0 (broker users). */
  "117": string;
  /** Code 124 — ריבית ני"ע סחירים. P0 (broker users). */
  "124": string;

  // §4 Personal deductions
  "037": string;
  "036": string;
  "135": string;

  // §4b Credit-points printed on the form (Phase 0 §0.D)
  /**
   * Code 119 — זיכוי בגין בן/בת זוג (married/non-working spouse).
   * NOT present in the auto-generated field-map; positional draw planned
   * in route, derived from `creditPointsValue`. P0 (married filers).
   */
  spouseCreditPoints: string;
  /**
   * Code 245 — נקודות זיכוי בגין ילדים (count, NOT ILS). The credit-points
   * box on the 135 expects the numeric count; the engine returns total
   * `creditPointsCount` so we surface it here for printing. P0.
   */
  "245": string;

  // §5 Bank details
  bank_number:    string;
  bank_name:      string; // Raw Hebrew bank name
  branch_number:  string;
  account_number: string;

  // §6 Summary
  estimatedRefund: string;
  taxYear:         string;

  // §7 Extended (Phase 3 — currently not rendered to PDF; emitted so callers can
  // validate / cross-check and so future overlay positions can pull them.)
  pensionFundName: string;
  pensionFundId: string;
  carriedForwardLoss: string;
  foreignSourceCountry: string;
  spouseGrossSalary: string;

  // §8 Signature block (Phase 0 §0.D — text only, NOT a digital signature)
  /** Taxpayer printed name — printed on the signature line on page 4. */
  signatureName: string;
  /** Today's date in DD/MM/YYYY — printed next to the signature line. */
  signatureDate: string;
  /** Declaration X-mark — "אני מצהיר שכל הפרטים נכונים…" checkbox on page 4. */
  declarationMark: string;
}

// ─── 3. Form-1301 Field Value Extractor ──────────────────────────────────────
//
// The 1301 form is more comprehensive than 135 — it has 4 pages and covers
// business income, multi-column capital gains, deductions on multiple pages,
// and bank details on the final page.

export interface Form1301Fields extends Form135Fields {
  // §2 Employment (multi-employer split)
  "158_main": string; // Gross salary — main employer
  "172_2nd": string;  // Gross salary — 2nd employer
  "068_main": string; // Tax withheld — main employer
  "069_2nd": string;  // Tax withheld — 2nd employer
  "258_main": string; // Pension — main employer
  "272": string;      // Severance

  // §3 Business income
  "201": string; // Business income — main
  "301": string; // Business income — 2nd

  // §4 Capital gains (expanded)
  "060": string; // Capital gain right column
  "211": string; // Capital gain center column
  "067": string; // Capital loss
  "157": string; // Foreign tax withheld
  "141": string; // Other income
  "055_1301": string; // Field 055

  // §5 Deductions (page 1)
  "078": string; // Donations
  "126": string; // Life insurance
  "142": string; // Individual pension
  "335": string; // Total deductions

  // §6 Page 3 deduction fields (duplicated for ITA cross-check)
  "036_p3": string; // Life insurance (page 3)
  "045_p3": string; // Pension deduction (page 3)
  "037_p3": string; // Donations (page 3)
  "042_p3": string; // Tax code / total tax (page 3)

  // §7 Bank details (page 3)
  "274": string; // Bank number
  "273": string; // Branch number
  "044": string; // Account number
}

export function buildForm1301Fields(
  taxpayer: TaxPayer,
  financials: FinancialData
): Form1301Fields {
  // Start with the same base as form 135
  const base = buildForm135Fields(taxpayer, financials);

  // ── Split employer figures for multi-column layout ─────────────────────
  const mainEmployer = taxpayer.employers?.find((e) => e.isMainEmployer);
  const secondaryEmployers = taxpayer.employers?.filter((e) => !e.isMainEmployer) ?? [];
  const secondaryGross   = secondaryEmployers.reduce((s, e) => s + (e.grossSalary ?? 0), 0);
  const secondaryTax     = secondaryEmployers.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);

  // ── Deduction totals ──────────────────────────────────────────────────
  const donations  = taxpayer.personalDeductions
    ?.filter((d) => d.type === "donation_sec46")
    .reduce((s, d) => s + d.amount, 0) ?? 0;
  const lifeIns    = taxpayer.personalDeductions
    ?.filter((d) => d.type === "life_insurance_sec45a")
    .reduce((s, d) => s + d.amount, 0) ?? 0;
  const indPension = taxpayer.personalDeductions
    ?.filter((d) => d.type === "pension_sec47")
    .reduce((s, d) => s + d.amount, 0) ?? 0;

  const totalDeductions = donations + lifeIns + indPension;

  // ── Aggregate pension ─────────────────────────────────────────────────
  const mainPension = mainEmployer?.pensionDeduction ?? 0;
  const totalPension = taxpayer.employers?.reduce((s, e) => s + (e.pensionDeduction ?? 0), 0) ?? 0;
  const totalTax     = taxpayer.employers?.reduce((s, e) => s + (e.taxWithheld ?? 0), 0) ?? 0;

  // ── Capital gains ─────────────────────────────────────────────────────
  const cg = taxpayer.capitalGains;

  return {
    ...base,

    // Employment — split by employer column
    "158_main": formatIlsForPdf(mainEmployer?.grossSalary),
    "172_2nd":  formatIlsForPdf(secondaryGross || undefined),
    "068_main": formatIlsForPdf(mainEmployer?.taxWithheld),
    "069_2nd":  formatIlsForPdf(secondaryTax || undefined),
    "258_main": formatIlsForPdf(mainPension || undefined),
    "272":      formatIlsForPdf(taxpayer.lifeEvents?.taxableSeverancePay),

    // Business income (net = revenue − expenses, floored at 0)
    "201": formatIlsForPdf(
      Math.max(
        0,
        (taxpayer.businessIncome?.mainRevenue ?? 0) -
          (taxpayer.businessIncome?.mainExpenses ?? 0),
      ) || undefined,
    ),
    "301": formatIlsForPdf(
      Math.max(
        0,
        (taxpayer.businessIncome?.secondaryRevenue ?? 0) -
          (taxpayer.businessIncome?.secondaryExpenses ?? 0),
      ) || undefined,
    ),

    // Capital gains — expanded
    "060": formatIlsForPdf(cg?.totalRealizedProfit),
    "211": "0", // center column — reserved for future use
    "067": formatIlsForPdf(cg?.totalRealizedLoss),
    "157": formatIlsForPdf(cg?.foreignTaxWithheld),
    "141": formatIlsForPdf(cg?.dividends),
    "055_1301": formatIlsForPdf(cg?.foreignTaxWithheld),

    // Deductions (page 1)
    "078": formatIlsForPdf(donations),
    "126": formatIlsForPdf(lifeIns),
    "142": formatIlsForPdf(indPension),
    "335": formatIlsForPdf(totalDeductions),

    // Page 3 deduction fields (same values, different positions)
    "036_p3": formatIlsForPdf(lifeIns),
    "045_p3": formatIlsForPdf(totalPension),
    "037_p3": formatIlsForPdf(donations),
    "042_p3": formatIlsForPdf(totalTax),

    // Bank details (page 3)
    "274": taxpayer.bank?.bankId   ?? "",
    "273": taxpayer.bank?.branch   ?? "",
    "044": taxpayer.bank?.account  ?? "",
  };
}

/**
 * Cross-check that Form 1301 page-3 deduction totals match page-1 sums.
 * ITA scans both pages; a mismatch is rejected at intake. Returns a list of
 * mismatches (empty when OK) so callers can fail loud in calibration mode.
 */
export function assertForm1301Consistency(
  fields: Form1301Fields,
): { field: string; p1: string; p3: string }[] {
  const issues: { field: string; p1: string; p3: string }[] = [];
  if (fields["126"] !== fields["036_p3"]) {
    issues.push({ field: "life_insurance", p1: fields["126"], p3: fields["036_p3"] });
  }
  if (fields["078"] !== fields["037_p3"]) {
    issues.push({ field: "donations", p1: fields["078"], p3: fields["037_p3"] });
  }
  return issues;
}

export function buildForm135Fields(
  taxpayer: TaxPayer,
  financials: FinancialData
): Form135Fields {
  // ── Aggregate employer figures (field 158/042/045) ────────────────────────
  const totalGross    = taxpayer.employers?.reduce((s, e) => s + (e.grossSalary     ?? 0), 0) ?? 0;
  const totalTax      = taxpayer.employers?.reduce((s, e) => s + (e.taxWithheld     ?? 0), 0) ?? 0;
  const totalPension  = taxpayer.employers?.reduce((s, e) => s + (e.pensionDeduction ?? 0), 0) ?? 0;

  // ── Multi-employer split (codes 069 = secondary tax-withheld; 086 = exempt grant) ──
  // Audit table §1.1: code 069 prints withholding for the 2nd (left-column)
  // employer. Aggregating ALL non-main into one column matches the form's
  // single "מעסיק נוסף" slot; if the taxpayer has 3+ employers the user has
  // already been routed to Form 1301 by `formTypeSelector`.
  const secondaryEmployers = taxpayer.employers?.filter((e) => !e.isMainEmployer) ?? [];
  const secondaryTax = secondaryEmployers.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);

  // ── Deduction buckets ─────────────────────────────────────────────────────
  const donations  = taxpayer.personalDeductions
    ?.filter((d) => d.type === "donation_sec46")
    .reduce((s, d) => s + d.amount, 0) ?? 0;
  const lifeIns    = taxpayer.personalDeductions
    ?.filter((d) => d.type === "life_insurance_sec45a")
    .reduce((s, d) => s + d.amount, 0) ?? 0;
  const indPension = taxpayer.personalDeductions
    ?.filter((d) => d.type === "pension_sec47")
    .reduce((s, d) => s + d.amount, 0) ?? 0;

  // ── Capital gains ─────────────────────────────────────────────────────────
  const cg = taxpayer.capitalGains;

  // ── Marital status Hebrew label (logical Unicode order) ───────────────────
  const maritalMap: Record<TaxPayer["maritalStatus"], string> = {
    single:   "רווק/ה",
    married:  "נשוי/נשואה",
    divorced: "גרוש/ה",
    widowed:  "אלמן/אלמנה",
  };

  // Derive first/last from fullName if not set explicitly
  const hebrewPart = taxpayer.fullName?.split(" - ")[1] ?? "";
  const nameParts  = hebrewPart.trim().split(/\s+/);

  // ── Children credit-points count (code 245) ───────────────────────────────
  // The form expects the *count* of children-derived credit-points, not their
  // ILS value. Without re-running the calc engine, approximate as: each child
  // under 18 = 1 nq baseline + daycare (0–3) = 1 nq. This is a conservative
  // mirror of `calculateCreditPoints` (F-010 corrected). Phase 1 §1.A will
  // pipe the canonical count through CalculationResult to retire this mirror.
  const childCreditPointsCount = (taxpayer.children ?? []).reduce((acc, child) => {
    let pts = 1; // under-18 default
    if (child.inDaycare) pts += 1; // F-010 — ages 0-3 daycare bonus
    return acc + pts;
  }, 0);

  // ── Spouse credit-points indicator (code 119) ─────────────────────────────
  // 1.0 nq for non-working spouse (married && !spouseHasIncome) per
  // calculateCreditPoints. Engine-source-of-truth would be ideal; stamp the
  // value here so the form aligns with the engine's printed refund total.
  const spouseCreditPoints =
    taxpayer.maritalStatus === "married" && taxpayer.spouseHasIncome === false
      ? "1.0"
      : "";

  // ── Aliyah date (code 015) — DD/MM/YYYY ───────────────────────────────────
  let aliyahFormatted = "";
  if (taxpayer.aliyahDate) {
    const d = new Date(taxpayer.aliyahDate);
    if (!Number.isNaN(d.getTime())) {
      aliyahFormatted =
        `${String(d.getDate()).padStart(2, "0")}/` +
        `${String(d.getMonth() + 1).padStart(2, "0")}/` +
        d.getFullYear();
    }
  }

  // ── Periphery flag (code 016) — "X" if eligible postcode ──────────────────
  // Mirror the lookup in calculateTax.calculateFullRefund step 4b. The form
  // wants a checkbox mark here; rendering "X" matches Israeli convention.
  let peripheryFlag = "";
  if (taxpayer.postcode) {
    const postcodes = (peripheryData as { postcodes: Record<string, { tier: number }> })
      .postcodes;
    const entry = postcodes[taxpayer.postcode];
    if (entry && (entry.tier === 1 || entry.tier === 2)) {
      peripheryFlag = "X";
    }
  }

  // ── Residency flag (code 014) — Hebrew "כן" / "לא" ────────────────────────
  // Defaults to "כן" (full-year resident); a non-empty `aliyahDate` for the
  // current tax year flips this to "לא" (partial-year). The questionnaire
  // does not yet capture an explicit residency toggle; aliyah is the only
  // current signal. Phase 1 §1.A will introduce a dedicated toggle.
  const residencyAnswer = aliyahFormatted ? "לא" : "כן";

  // ── Marital status checkbox label (code 020) — Hebrew label ───────────────
  const maritalLabel = maritalMap[taxpayer.maritalStatus];

  // ── Signature / declaration (Phase 0 §0.D — text-only sig line on p.4) ────
  const today = new Date();
  const signatureDate =
    `${String(today.getDate()).padStart(2, "0")}/` +
    `${String(today.getMonth() + 1).padStart(2, "0")}/` +
    today.getFullYear();
  const sigName =
    taxpayer.fullName?.includes(" - ")
      ? (taxpayer.fullName.split(" - ")[1] ?? "")
      : (taxpayer.fullName ?? "");

  return {
    // Personal — Hebrew strings in raw logical Unicode order
    "012": taxpayer.idNumber ?? "",
    "013": taxpayer.spouseId ?? "",
    "031": taxpayer.firstName ?? nameParts[0] ?? "",
    "032": taxpayer.lastName  ?? nameParts[1] ?? "",
    "022": taxpayer.address?.city        ?? "",
    "023": taxpayer.address?.street      ?? "",
    "024": taxpayer.address?.houseNumber ?? "",
    maritalStatusLabel: maritalLabel,

    // Residency / aliyah / periphery
    "020": maritalLabel,
    "014": residencyAnswer,
    aliyahDate: aliyahFormatted,
    peripheryFlag,

    // Employment — numeric strings (formatted with commas)
    "158": formatIlsForPdf(totalGross),
    "042": formatIlsForPdf(totalTax),
    "045": formatIlsForPdf(totalPension),
    "272": formatIlsForPdf(taxpayer.lifeEvents?.taxableSeverancePay),
    "069": formatIlsForPdf(secondaryTax || undefined),
    // Code 086 — מענק פטור per סעיף 9(7א). Phase 0 keeps the user-entered
    // exempt portion at 0 because F-013 (severance §9(7א) auto-exemption) is
    // Phase 1 scope; surface as empty for now to avoid stamping a bogus 0.
    // TODO Phase 1 §1.A — wire to taxpayer.lifeEvents.exemptSeveranceGrant.
    "086": "",

    // Capital gains — numeric
    "256": formatIlsForPdf(cg?.totalRealizedProfit),
    "166": formatIlsForPdf(cg?.totalRealizedLoss),
    "055": formatIlsForPdf(cg?.foreignTaxWithheld),
    "117": formatIlsForPdf(cg?.dividends),
    // Code 124 — ריבית ני"ע סחירים. The IBKR parser does not yet split
    // interest from dividends; surface "" rather than mis-stamping
    // dividends in the interest field.
    // TODO Phase 1 §1.K — split interest/dividend on the IBKR parser.
    "124": "",

    // Deductions — numeric
    "037": formatIlsForPdf(donations),
    "036": formatIlsForPdf(lifeIns),
    "135": formatIlsForPdf(indPension),

    // Credit-points printed on the form
    spouseCreditPoints,
    "245": childCreditPointsCount > 0 ? String(childCreditPointsCount) : "",

    // Bank — IDs are numeric, name is Hebrew
    bank_number:    taxpayer.bank?.bankId   ?? "",
    bank_name:      taxpayer.bank?.bankName ?? "",
    branch_number:  taxpayer.bank?.branch   ?? "",
    account_number: taxpayer.bank?.account  ?? "",

    // Summary
    estimatedRefund: formatIlsForPdf(financials.estimatedRefund),
    taxYear:         String(financials.taxYears?.[0] ?? new Date().getFullYear() - 1),

    // Extended (Phase 3)
    pensionFundName: taxpayer.employers?.find((e) => e.isMainEmployer)?.pensionFundName ?? "",
    pensionFundId:   taxpayer.employers?.find((e) => e.isMainEmployer)?.pensionFundId ?? "",
    carriedForwardLoss: formatIlsForPdf(cg?.carriedForwardLoss),
    foreignSourceCountry: cg?.foreignSourceCountry ?? "",
    spouseGrossSalary: taxpayer.maritalStatus === "married" && taxpayer.spouseHasIncome
      ? formatIlsForPdf((taxpayer as unknown as { spouseGrossSalary?: number }).spouseGrossSalary)
      : "",

    // Signature block (text only — NOT a digital signature)
    signatureName: sigName,
    signatureDate,
    declarationMark: taxpayer.idNumber ? "X" : "",
  };
}

/**
 * Phase 3 — bbox collision detection for calibration-mode PDF overlays.
 *
 * pdf-lib draws text at arbitrary (x,y) without overlap detection. When a
 * caller knows the approximate text width (via `font.widthOfTextAtSize`) and
 * height, this helper flags any pair of fields whose bounding boxes overlap.
 *
 * Callers pass an array of {id, page, x, y, width, height}. Returns the list
 * of overlapping pairs — an empty array means the layout is clean.
 */
export interface FieldBBox {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldOverlap {
  a: string;
  b: string;
  page: number;
}

export function detectFieldCollisions(fields: FieldBBox[]): FieldOverlap[] {
  const overlaps: FieldOverlap[] = [];
  for (let i = 0; i < fields.length; i++) {
    const a = fields[i];
    for (let j = i + 1; j < fields.length; j++) {
      const b = fields[j];
      if (a.page !== b.page) continue;
      if (a.x + a.width  <= b.x) continue;
      if (b.x + b.width  <= a.x) continue;
      if (a.y + a.height <= b.y) continue;
      if (b.y + b.height <= a.y) continue;
      overlaps.push({ a: a.id, b: b.id, page: a.page });
    }
  }
  return overlaps;
}
