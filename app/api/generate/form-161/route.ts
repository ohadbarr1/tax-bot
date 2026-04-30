/**
 * POST /api/generate/form-161 — Severance spreading PDF (טופס 161)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SCOPE — Phase 1 §1.E (closes audits/generation.md §1.5 and
 * audits/tax-domain.md F-014)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Form 161 is the ITA form a taxpayer files alongside a Form 135/1301 to
 * declare a SEVERANCE LUMP and to elect spreading under סעיף 8(ג)(3) of
 * פקודת מס הכנסה. The route:
 *
 *   (1) Returns a PDF (not JSON, fixing audits/generation.md §1.5).
 *   (2) Spreads the taxable severance FORWARD from the year following
 *       termination (NOT backward — fixing F-014.1). The statutory window
 *       is up to 6 years.
 *   (3) Computes the marginal-rate slice per spread-year using a per-year
 *       income forecast (fixing F-014.2 — the prior route assumed identical
 *       income across every year of the spread).
 *   (4) When the caller supplies `lastMonthlySalary` + `yearsOfService`,
 *       the route consumes `calculateSeveranceExemption()` from the calc
 *       engine (1.A's exposed function) and embeds the exempt portion on
 *       the form for the §9(7א) line.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TEMPLATE-MISSING POLICY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The official 2025 blank PDF (`public/templates/form_161_2025.pdf`) is
 * NOT shipped with this repo. When absent, the route returns
 * 503 SERVICE_UNAVAILABLE / TEMPLATE_MISSING (mirrors form-135's pattern at
 * route.ts:330-335). This is documented in `data/form161_2025_fields.json`
 * (`_status: "TEMPLATE_MISSING"`) and in
 * `templates/maps/161_2025.json`.
 *
 * Once the official template is dropped at the path above, run
 * `npm run forms:rebuild-maps` to generate the auto-extracted field map at
 * `templates/maps/161_2025.json`. The route then stamps the spreading
 * schedule via the same DRAW_LIST / POSITIONAL_DRAWS / EXCLUDED_CODES
 * architecture used by Form 135.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CALIBRATION MODE — pass { "calibrate": true } to overlay red →code labels.
 */

import { NextRequest } from "next/server";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { hebrewForPdf, formatIlsForPdf } from "@/lib/pdfUtils";
import { isValidTZ } from "@/lib/validateTZ";
import {
  loadFieldMap,
  findField,
  type FieldMap,
} from "@/lib/fieldMap";
import {
  loadYearData,
  calculateSeveranceExemption,
} from "@/lib/calculateTax";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  invalidInput,
  invalidInputFromZod,
  internalError,
  serviceUnavailable,
} from "@/lib/api/errorEnvelope";
import { Form161PayloadSchema } from "@/lib/api/schemas/generate";

const FORM_ID       = "161_2025";
const TEMPLATE_PATH = path.join(process.cwd(), "public/templates/form_161_2025.pdf");
const FONT_TTF      = path.join(process.cwd(), "public/fonts/Assistant-Regular.ttf");
const FONT_WOFF     = path.join(process.cwd(), "public/fonts/Assistant-Regular.woff2");

const TEXT_COLOR = rgb(0.05, 0.2, 0.7); // navy blue (matches 135/1301)
const CAL_COLOR  = rgb(0.9, 0, 0);

// ── Spread-math types ────────────────────────────────────────────────────────

export interface SpreadYearSlice {
  year: number;
  taxableAmount: number;
  marginalRate: number;
  taxLiability: number;
  /** Income assumed for this year (forecast or fallback). Surfaced so the PDF + clients can audit. */
  forecastIncome: number;
}

export interface SpreadResult {
  /** Spreading slices, ordered chronologically (forward from terminationYear+1). */
  spreadSchedule: SpreadYearSlice[];
  /** Total tax under the spread election. */
  totalTaxWithSpreading: number;
  /** Counter-factual: tax if the lump were fully taxed in the termination year. */
  totalTaxLumpSum: number;
  /** lumpSum minus spread (positive = spread saves tax). */
  savings: number;
  /** Whether per-year forecast was supplied (vs. fallback to current income). */
  usedPerYearForecast: boolean;
}

// ── Spread-math helpers (exported for testing) ───────────────────────────────

/**
 * Compute the bracket tax on `income` for `year`, using the per-year tax data
 * loaded by the calc engine. Mirrors `calculateTaxOnIncome` but without the
 * detailed `byBracket` breakdown — this is a cheap inner loop for spreading.
 */
function bracketTax(income: number, year: number): number {
  if (income <= 0) return 0;
  const brackets = loadYearData(year).tax_brackets;
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (income <= prev) break;
    const top = Math.min(income, b.max);
    tax += (top - prev) * b.rate;
    prev = b.max;
  }
  return Math.round(tax);
}

/**
 * Marginal-rate lookup for the bracket containing `income` in `year`.
 */
function marginalRateAt(income: number, year: number): number {
  const brackets = loadYearData(year).tax_brackets;
  for (const b of brackets) {
    if (income <= b.max) return b.rate;
  }
  // Above the top bracket — use top rate.
  return brackets[brackets.length - 1]?.rate ?? 0.5;
}

/**
 * Compute the §8(ג)(3) FORWARD spread of a taxable severance lump.
 *
 * Per סעיף 8(ג)(3) פקודת מס הכנסה (audit F-014): spreading runs from the
 * year FOLLOWING termination through up to 6 forward years. Each slice is
 * added to that year's expected income; the marginal-rate consumed by the
 * slice is computed against that year's income (NOT a flat current-year
 * income).
 *
 * @param taxableSeverance     Lump amount in ILS that remains after §9(7א).
 * @param terminationYear      Year the employment ended.
 * @param spreadYears          Number of spread years (1..6).
 * @param currentYearIncome    Income in `terminationYear` itself (used only
 *                             to size the lump-sum counterfactual).
 * @param perYearIncomeForecast Optional, length must equal spreadYears.
 *                             When supplied, slice i uses
 *                             perYearIncomeForecast[i] as its base income.
 *                             When absent, falls back to `currentYearIncome`
 *                             for every spread-year and emits a warn.
 */
export function computeSeveranceSpread(
  taxableSeverance: number,
  terminationYear: number,
  spreadYears: number,
  currentYearIncome: number,
  perYearIncomeForecast?: number[],
): SpreadResult {
  const years = Math.max(1, Math.min(6, Math.floor(spreadYears)));
  const annualSlice = taxableSeverance / years;

  const usedForecast =
    Array.isArray(perYearIncomeForecast) &&
    perYearIncomeForecast.length === years;

  if (
    Array.isArray(perYearIncomeForecast) &&
    perYearIncomeForecast.length !== years
  ) {
    // Defensive: forecast length mismatch is treated as "no forecast" (we
    // refuse to silently truncate or pad). Tests assert the warn.
    console.warn(
      `[form-161] perYearIncomeForecast length=${perYearIncomeForecast.length} ` +
        `does not equal spreadYears=${years}; falling back to currentYearIncome.`,
    );
  }

  const spreadSchedule: SpreadYearSlice[] = [];
  let totalSpreadTax = 0;

  for (let i = 0; i < years; i++) {
    // Forward spread: start at terminationYear + 1, run forward.
    // Closes audits/tax-domain.md F-014.1 ("spread backwards" comment was
    // wrong — סעיף 8(ג)(3) requires forward spreading from termination).
    const sliceYear = terminationYear + 1 + i;

    const baseIncome = usedForecast
      ? perYearIncomeForecast![i]
      : currentYearIncome;

    const taxBefore = bracketTax(baseIncome, sliceYear);
    const taxAfter = bracketTax(baseIncome + annualSlice, sliceYear);
    const sliceTax = Math.max(0, taxAfter - taxBefore);

    // Marginal rate at the midpoint of the added slice — gives the rate the
    // user "consumes" by taking the slice in that year. Using the midpoint
    // (rather than the top) avoids understating cost when the slice straddles
    // a bracket boundary.
    const mRate = marginalRateAt(baseIncome + annualSlice / 2, sliceYear);

    spreadSchedule.push({
      year: sliceYear,
      taxableAmount: Math.round(annualSlice),
      marginalRate: mRate,
      taxLiability: sliceTax,
      forecastIncome: Math.round(baseIncome),
    });
    totalSpreadTax += sliceTax;
  }

  // Lump-sum counterfactual (in terminationYear).
  const lumpSumTax =
    bracketTax(currentYearIncome + taxableSeverance, terminationYear) -
    bracketTax(currentYearIncome, terminationYear);

  return {
    spreadSchedule,
    totalTaxWithSpreading: Math.round(totalSpreadTax),
    totalTaxLumpSum: Math.max(0, Math.round(lumpSumTax)),
    savings: Math.round(lumpSumTax - totalSpreadTax),
    usedPerYearForecast: usedForecast,
  };
}

// ── Draw lists (will be exercised once the official template ships) ─────────

export interface FieldDraw {
  key: string;
  valueKey: string;
  /** Field-code or registry-key in templates/maps/161_2025.json. */
  code: string;
  size?: number;
  heb?: boolean;
  align?: "right" | "left";
}

/**
 * Static draw-list — every code stamped on Form 161. References codes in the
 * field-map produced by `scripts/build-field-map.mjs` once the official
 * template is acquired. Until then `findField(...)` returns null for every
 * entry and `missing[]` accumulates — the route still returns a PDF (the
 * blank template stamped with positional draws), surfaced via X-PDF-Missing.
 */
export const DRAW_LIST_161: ReadonlyArray<FieldDraw> = [
  { key: "taxpayerName",      valueKey: "taxpayerName",     code: "name",        size: 10, heb: true, align: "left" },
  { key: "idNumber",          valueKey: "idNumber",         code: "012",         size: 10, align: "right" },
  { key: "terminationYear",   valueKey: "terminationYear",  code: "termYear",    size: 10, align: "right" },
  { key: "taxableSeverance",  valueKey: "taxableSeverance", code: "272",         size: 11, align: "right" },
  { key: "exemptSeverance",   valueKey: "exemptSeverance",  code: "086",         size: 11, align: "right" },
  { key: "spreadYearsCount",  valueKey: "spreadYearsCount", code: "spreadCount", size: 10, align: "right" },
  { key: "totalSpreadTax",    valueKey: "totalSpreadTax",   code: "totalSpread", size: 11, align: "right" },
  { key: "lumpSumTax",        valueKey: "lumpSumTax",       code: "totalLump",   size: 11, align: "right" },
  { key: "savings",           valueKey: "savings",          code: "savings",     size: 11, align: "right" },
];

export interface PositionalDraw {
  key: string;
  valueKey: string;
  /** ITA / registry code (for documentation + test cross-ref). */
  code: string;
  page: number;
  x: number;
  y: number;
  size?: number;
  heb?: boolean;
  reverse?: boolean;
}

/**
 * Positional draws — one row per spreading-schedule slice (year/amount/
 * marginal-rate/tax-liability). The schedule has 1..6 rows; the route fills
 * only the rows the spread produced and leaves the rest blank.
 *
 * Coordinates source: `data/form161_2025_fields.json` (placeholders pending
 * a real template). They MUST be re-calibrated once the official 2025 PDF
 * lands at `public/templates/form_161_2025.pdf`.
 */
export const POSITIONAL_DRAWS_161: ReadonlyArray<PositionalDraw> = [
  // Spread row 1
  { key: "spreadY1Year",   valueKey: "spread_y1_year",   code: "y1",     page: 0, x: 480, y: 560, size: 9 },
  { key: "spreadY1Amount", valueKey: "spread_y1_amount", code: "y1amt",  page: 0, x: 360, y: 560, size: 9 },
  { key: "spreadY1Rate",   valueKey: "spread_y1_rate",   code: "y1rate", page: 0, x: 240, y: 560, size: 9 },
  { key: "spreadY1Tax",    valueKey: "spread_y1_tax",    code: "y1tax",  page: 0, x: 120, y: 560, size: 9 },
  // Spread row 2
  { key: "spreadY2Year",   valueKey: "spread_y2_year",   code: "y2",     page: 0, x: 480, y: 540, size: 9 },
  { key: "spreadY2Amount", valueKey: "spread_y2_amount", code: "y2amt",  page: 0, x: 360, y: 540, size: 9 },
  { key: "spreadY2Rate",   valueKey: "spread_y2_rate",   code: "y2rate", page: 0, x: 240, y: 540, size: 9 },
  { key: "spreadY2Tax",    valueKey: "spread_y2_tax",    code: "y2tax",  page: 0, x: 120, y: 540, size: 9 },
  // Spread row 3
  { key: "spreadY3Year",   valueKey: "spread_y3_year",   code: "y3",     page: 0, x: 480, y: 520, size: 9 },
  { key: "spreadY3Amount", valueKey: "spread_y3_amount", code: "y3amt",  page: 0, x: 360, y: 520, size: 9 },
  { key: "spreadY3Rate",   valueKey: "spread_y3_rate",   code: "y3rate", page: 0, x: 240, y: 520, size: 9 },
  { key: "spreadY3Tax",    valueKey: "spread_y3_tax",    code: "y3tax",  page: 0, x: 120, y: 520, size: 9 },
  // Spread row 4
  { key: "spreadY4Year",   valueKey: "spread_y4_year",   code: "y4",     page: 0, x: 480, y: 500, size: 9 },
  { key: "spreadY4Amount", valueKey: "spread_y4_amount", code: "y4amt",  page: 0, x: 360, y: 500, size: 9 },
  { key: "spreadY4Rate",   valueKey: "spread_y4_rate",   code: "y4rate", page: 0, x: 240, y: 500, size: 9 },
  { key: "spreadY4Tax",    valueKey: "spread_y4_tax",    code: "y4tax",  page: 0, x: 120, y: 500, size: 9 },
  // Spread row 5
  { key: "spreadY5Year",   valueKey: "spread_y5_year",   code: "y5",     page: 0, x: 480, y: 480, size: 9 },
  { key: "spreadY5Amount", valueKey: "spread_y5_amount", code: "y5amt",  page: 0, x: 360, y: 480, size: 9 },
  { key: "spreadY5Rate",   valueKey: "spread_y5_rate",   code: "y5rate", page: 0, x: 240, y: 480, size: 9 },
  { key: "spreadY5Tax",    valueKey: "spread_y5_tax",    code: "y5tax",  page: 0, x: 120, y: 480, size: 9 },
  // Spread row 6
  { key: "spreadY6Year",   valueKey: "spread_y6_year",   code: "y6",     page: 0, x: 480, y: 460, size: 9 },
  { key: "spreadY6Amount", valueKey: "spread_y6_amount", code: "y6amt",  page: 0, x: 360, y: 460, size: 9 },
  { key: "spreadY6Rate",   valueKey: "spread_y6_rate",   code: "y6rate", page: 0, x: 240, y: 460, size: 9 },
  { key: "spreadY6Tax",    valueKey: "spread_y6_tax",    code: "y6tax",  page: 0, x: 120, y: 460, size: 9 },

  // Signature block — text only. The user signs in the ITA portal upon
  // upload (audits/generation.md §1.8 — no qualified-signature today).
  { key: "signatureName", valueKey: "signatureName", code: "sig",     page: 0, x: 100, y: 80, size: 10, heb: true, reverse: true },
  { key: "signatureDate", valueKey: "signatureDate", code: "sigDate", page: 0, x: 280, y: 80, size: 10 },
];

/**
 * Codes that exist in the future field-map but are intentionally NOT stamped
 * by this route — every entry MUST carry a justification.
 *
 * Empty today (every documented field is in DRAW_LIST_161 or
 * POSITIONAL_DRAWS_161). When the real template lands and the auto-scan
 * surfaces ITA-internal-only codes (SHAAM scanner refs / page-number tokens),
 * add them here with a one-line reason.
 */
export const EXCLUDED_CODES_161: Readonly<Record<string, string>> = {};

// ── Value builder ───────────────────────────────────────────────────────────

interface BuildValuesInput {
  taxpayerName?: string;
  idNumber?: string;
  terminationYear: number;
  taxableSeverance: number;
  exemptSeverance: number;
  spread: SpreadResult;
  signatureDate: string;
}

/**
 * Build the flat key→string dictionary the route's draw + positional code
 * paths read from. Mirrors `buildForm135Fields` in spirit (keys match
 * `data/form161_2025_fields.json`).
 */
export function buildForm161Fields(input: BuildValuesInput): Record<string, string> {
  const vals: Record<string, string> = {
    taxpayerName: input.taxpayerName ?? "",
    idNumber: input.idNumber ?? "",
    terminationYear: String(input.terminationYear),
    taxableSeverance: formatIlsForPdf(input.taxableSeverance),
    exemptSeverance: formatIlsForPdf(input.exemptSeverance),
    spreadYearsCount: String(input.spread.spreadSchedule.length),
    totalSpreadTax: formatIlsForPdf(input.spread.totalTaxWithSpreading),
    lumpSumTax: formatIlsForPdf(input.spread.totalTaxLumpSum),
    savings: formatIlsForPdf(input.spread.savings),
    signatureName: input.taxpayerName ?? "",
    signatureDate: input.signatureDate,
  };

  for (let i = 0; i < 6; i++) {
    const slice = input.spread.spreadSchedule[i];
    const idx = i + 1;
    if (slice) {
      vals[`spread_y${idx}_year`] = String(slice.year);
      vals[`spread_y${idx}_amount`] = formatIlsForPdf(slice.taxableAmount);
      vals[`spread_y${idx}_rate`] = `${(slice.marginalRate * 100).toFixed(0)}%`;
      vals[`spread_y${idx}_tax`] = formatIlsForPdf(slice.taxLiability);
    } else {
      vals[`spread_y${idx}_year`] = "";
      vals[`spread_y${idx}_amount`] = "";
      vals[`spread_y${idx}_rate`] = "";
      vals[`spread_y${idx}_tax`] = "";
    }
  }
  return vals;
}

// ── Route handler ───────────────────────────────────────────────────────────

async function handle(req: NextRequest): Promise<Response> {
  // Body validation runs FIRST so that callers get a precise 400 even when
  // the template asset is missing in dev / staging. The TEMPLATE_MISSING
  // 503 fires only after the request has been validated structurally.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidInput("גוף הבקשה אינו JSON תקין.");
  }

  const parsed = Form161PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidInputFromZod(parsed.error.issues, "פורמט הבקשה אינו תקין.");
  }

  const body = parsed.data;

  if (body.idNumber && !isValidTZ(body.idNumber)) {
    return invalidInput("מספר תעודת זהות לא תקין — ספרת ביקורת שגויה.");
  }

  // Per-year forecast length must match spreadYears (when provided) — Zod
  // already caps the array at 6, but length-vs-spreadYears is a structural
  // invariant we surface as 400 INVALID_INPUT for clarity.
  const requestedYears = Math.min(Math.max(1, body.spreadYears ?? 6), 6);
  if (
    body.perYearIncomeForecast !== undefined &&
    body.perYearIncomeForecast.length !== requestedYears
  ) {
    return invalidInput(
      `אורך תחזית הכנסה לכל שנה (${body.perYearIncomeForecast.length}) חייב להתאים למספר שנות הפריסה (${requestedYears}).`,
    );
  }

  // Template-missing gate — mirrors form-135's pattern (route.ts:330-335) but
  // runs AFTER body validation. The official ITA blank PDF is not shipped
  // with this repo (Phase 1 §1.E documented this as a data gap in
  // audits/generation.md §1.4 / §1.5). Once
  // public/templates/form_161_2025.pdf is added, this branch becomes
  // unreachable and the route returns the stamped PDF.
  if (!fs.existsSync(TEMPLATE_PATH)) {
    return serviceUnavailable(
      "תבנית טופס 161 אינה זמינה כרגע.",
      "TEMPLATE_MISSING",
    );
  }

  try {
    // Termination year — `terminationYear` is canonical; `currentYear` is
    // accepted as a back-compat alias from the prior JSON-emitting route.
    const terminationYear =
      body.terminationYear ?? body.currentYear ?? currentTaxYear();

    // §9(7א) exemption — recompute via the calc engine when the caller
    // supplied `lastMonthlySalary` + `yearsOfService`. Coordination with 1.A:
    // `calculateSeveranceExemption()` is exposed at lib/calculateTax.ts:319.
    let exemptSeverance = 0;
    if (
      body.lastMonthlySalary !== undefined &&
      body.lastMonthlySalary > 0 &&
      body.yearsOfService !== undefined &&
      body.yearsOfService > 0
    ) {
      // Engine signature: (grossSeverance, lastMonthlySalary, yearsOfService, year).
      // For the exemption ceiling, "grossSeverance" is the floor — we
      // approximate it as taxableSeverance + (exempt portion the caller
      // did not yet subtract). We deliberately pass a high upper-bound so
      // the engine returns the statutory cap; the route then surfaces it
      // as an informational field, not as a math input to the spread.
      const grossUpperBound = body.taxableSeverance * 10 + 1;
      exemptSeverance = calculateSeveranceExemption(
        grossUpperBound,
        body.lastMonthlySalary,
        body.yearsOfService,
        terminationYear,
      );
    }

    const spread = computeSeveranceSpread(
      body.taxableSeverance,
      terminationYear,
      requestedYears,
      body.currentYearIncome ?? 0,
      body.perYearIncomeForecast,
    );

    const calibrate = !!body.calibrate;

    // ── Load template + field map ───────────────────────────────────────────
    const map: FieldMap = loadFieldMap(FORM_ID);
    const pdfDoc = await PDFDocument.load(fs.readFileSync(TEMPLATE_PATH), {
      ignoreEncryption: true,
    });
    pdfDoc.registerFontkit(fontkit);

    const fontPath = fs.existsSync(FONT_TTF) ? FONT_TTF : FONT_WOFF;
    const hebrewFont = await pdfDoc.embedFont(fs.readFileSync(fontPath), {
      subset: false,
    });
    const latinBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const latinReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    console.log(
      `[form-161] template=${path.basename(TEMPLATE_PATH)} ` +
        `pages=${pdfDoc.getPageCount()} ` +
        `map_codes=${Object.keys(map.fields).length} calibrate=${calibrate} ` +
        `spreadYears=${spread.spreadSchedule.length} forecast=${spread.usedPerYearForecast}`,
    );

    const vals = buildForm161Fields({
      taxpayerName: body.taxpayerName,
      idNumber: body.idNumber,
      terminationYear,
      taxableSeverance: body.taxableSeverance,
      exemptSeverance,
      spread,
      signatureDate: new Date().toLocaleDateString("en-GB"),
    });

    const pageHeight = map.page_size.height;
    const drawn: { key: string; code: string; page: number }[] = [];
    const missing: string[] = [];

    const valueFor = (k: string, heb?: boolean): string => {
      const v = vals[k] ?? "";
      return heb ? hebrewForPdf(v) : v;
    };

    // ── Draw-list — coordinate-anchored via the field-code map ──────────────
    for (const d of DRAW_LIST_161) {
      const text = valueFor(d.valueKey, d.heb);
      if (!text) continue;

      const field = findField(map, d.code);
      if (!field) {
        missing.push(`${d.key}(${d.code})`);
        continue;
      }
      const page = pdfDoc.getPage(field.page - 1);
      const font: PDFFont = d.heb ? hebrewFont : latinBold;
      const size = d.size ?? 10;
      const yBaseline = pageHeight - field.value_box.y_bottom + 2;

      let x = field.value_box.x_left + 2;
      if ((d.align ?? "right") === "right") {
        const width = font.widthOfTextAtSize(text, size);
        x = field.value_box.x_right - width - 2;
      }

      try {
        page.drawText(text, { x, y: yBaseline, font, size, color: TEXT_COLOR });
        drawn.push({ key: d.key, code: d.code, page: field.page });
      } catch (e) {
        console.warn(
          `[form-161] field "${d.key}"(${d.code}): ${e instanceof Error ? e.message : e}`,
        );
      }

      if (calibrate) {
        try {
          page.drawText(`→${d.key}:${d.code}`, {
            x: field.value_box.x_left,
            y: yBaseline + size + 1,
            font: latinReg,
            size: 6,
            color: CAL_COLOR,
          });
        } catch {
          /* non-critical */
        }
      }
    }

    // ── Positional draws (spread schedule rows + signature block) ───────────
    for (const p of POSITIONAL_DRAWS_161) {
      const text = valueFor(p.valueKey, p.reverse);
      if (!text) continue;
      if (p.page < 0 || p.page >= pdfDoc.getPageCount()) continue;

      const page = pdfDoc.getPage(p.page);
      const font: PDFFont = p.heb ? hebrewFont : latinBold;
      const size = p.size ?? 10;
      try {
        page.drawText(text, {
          x: p.x,
          y: p.y,
          font,
          size,
          color: TEXT_COLOR,
        });
        drawn.push({ key: p.key, code: p.code, page: p.page + 1 });
      } catch (e) {
        console.warn(
          `[form-161] positional "${p.key}"(${p.code}): ${e instanceof Error ? e.message : e}`,
        );
      }

      if (calibrate) {
        try {
          page.drawText(`→${p.key}:${p.code}`, {
            x: p.x,
            y: p.y + size + 1,
            font: latinReg,
            size: 6,
            color: CAL_COLOR,
          });
        } catch {
          /* non-critical */
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes.buffer as ArrayBuffer);

    const mode = calibrate ? "calibration" : "final";
    console.log(
      `[form-161] ${mode} ${buffer.byteLength}B — drawn=${drawn.length} missing=${missing.length}`,
    );
    if (missing.length) {
      console.log(`[form-161] codes not in map: ${missing.join(", ")}`);
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="form_161_${mode}.pdf"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
        "X-PDF-Mode": "overlay-field-mapped",
        "X-PDF-Drawn": String(drawn.length),
        "X-PDF-Missing": String(missing.length),
        "X-Spread-Years": String(spread.spreadSchedule.length),
        "X-Spread-Forecast": String(spread.usedPerYearForecast),
      },
    });
  } catch (err) {
    console.error("[form-161] generation failed:", err);
    return internalError(
      "יצירת ה-PDF נכשלה. נסה שוב מאוחר יותר.",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// withRateLimitForUser ∘ withUser — every request must carry a valid Bearer
// ID token AND fall within the per-user/IP quota. Closes F-1, F-2, F1.2.6.
export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "generate-form-161", limit: 30 }),
);
