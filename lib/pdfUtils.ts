/**
 * pdfUtils.ts — Phase 3 PDF Utilities
 *
 * RTL STRATEGY (revised after empirical testing):
 *
 *   Problem 1 — "111111 ₪":
 *     The @fontsource/assistant Hebrew-subset woff2 contains ONLY Hebrew Unicode
 *     block glyphs (U+0590–U+05FF). Digits 0–9 and Latin characters are absent,
 *     so pdf-lib maps them to the "missing glyph" slot which renders as "1".
 *     Fix: Use StandardFonts.Helvetica for all numeric / Latin content.
 *
 *   Problem 2 — "דהוא" instead of "אוהד":
 *     macOS Preview / Chrome PDF viewer do NOT automatically apply Unicode BiDi
 *     to embedded-font text streams. Our previous character-by-character reversal
 *     stored "דהוא" and the viewer displayed it LTR — visually wrong.
 *     Fix: Store Hebrew strings in logical Unicode order (no reversal).
 *          Prepend U+200F (RIGHT-TO-LEFT MARK) so viewers that DO support BiDi
 *          apply correct visual ordering, and viewers that don't will still show
 *          natural Hebrew glyph shapes at worst.
 *
 *   prepareHebrewTextForPdf() is kept as a no-op for API compatibility.
 */

import type { TaxPayer, FinancialData } from "@/types";

// ─── 1. RTL Text Helpers ──────────────────────────────────────────────────────

/** Unicode RIGHT-TO-LEFT MARK — signals bidirectional context to PDF viewers */
const RTL_MARK = "\u200F";

/**
 * Reverse Hebrew characters for visual RTL order in pdf-lib.
 * pdf-lib's drawText() renders LTR only — it does NOT run the Unicode
 * BiDi algorithm. We reverse the string so that the visual output
 * reads right-to-left as expected.
 */
export function hebrewForPdf(text: string): string {
  if (!text) return "";
  // pdf-lib draws LTR only; reverse characters for visual RTL order in PDF
  return text.split("").reverse().join("");
}

/**
 * Kept for backward compatibility. Now a no-op — reversal is NOT applied
 * because PDF viewers show pre-reversed strings LTR (visually wrong).
 */
export function prepareHebrewTextForPdf(text: string): string {
  return text ?? "";
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

  // §2 Employment income
  "158": string; // Total gross salary
  "042": string; // Total income tax withheld
  "045": string; // Total pension deduction
  "272": string; // Taxable severance pay

  // §3 Capital gains & foreign income
  "256": string;
  "166": string;
  "055": string;

  // §4 Personal deductions
  "037": string;
  "036": string;
  "135": string;

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

  return {
    // Personal — Hebrew strings in raw logical Unicode order
    "012": taxpayer.idNumber ?? "",
    "013": taxpayer.spouseId ?? "",
    "031": taxpayer.firstName ?? nameParts[0] ?? "",
    "032": taxpayer.lastName  ?? nameParts[1] ?? "",
    "022": taxpayer.address?.city        ?? "",
    "023": taxpayer.address?.street      ?? "",
    "024": taxpayer.address?.houseNumber ?? "",
    maritalStatusLabel: maritalMap[taxpayer.maritalStatus],

    // Employment — numeric strings (formatted with commas)
    "158": formatIlsForPdf(totalGross),
    "042": formatIlsForPdf(totalTax),
    "045": formatIlsForPdf(totalPension),
    "272": formatIlsForPdf(taxpayer.lifeEvents?.taxableSeverancePay),

    // Capital gains — numeric
    "256": formatIlsForPdf(cg?.totalRealizedProfit),
    "166": formatIlsForPdf(cg?.totalRealizedLoss),
    "055": formatIlsForPdf(cg?.foreignTaxWithheld),

    // Deductions — numeric
    "037": formatIlsForPdf(donations),
    "036": formatIlsForPdf(lifeIns),
    "135": formatIlsForPdf(indPension),

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
