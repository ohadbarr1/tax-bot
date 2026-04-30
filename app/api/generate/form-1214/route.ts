/**
 * POST /api/generate/form-1214 — Income-spreading election PDF (טופס 1214)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SCOPE — Phase 1 §1.E (re-introduction of a real implementation;
 * Phase 0 §0.I removed the `not_implemented` 501 stub)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Form 1214 is the ITA election form a taxpayer files to spread an irregular
 * lump (annual bonus, accumulated overtime, retroactive pay, severance
 * portion not handled by Form 161) across multiple tax years under סעיף
 * 8(ג)(1) / 8(ג)(2). The route:
 *
 *   (1) Returns a PDF (replacing the prior `not_implemented` stub).
 *   (2) Spreads forward from `receivedYear + 1`, mirroring Form 161's
 *       direction. (Per ITA practice, 1214 spreading is forward; the
 *       8(ג)(1) backward-spread for retroactive arrears is an explicit
 *       opt-in deferred to a future iteration once user demand surfaces it.)
 *   (3) Uses a per-year income forecast where supplied; falls back to a
 *       single `baselineIncome` field with a warn when not.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TEMPLATE-MISSING POLICY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The official 2025 blank PDF (`public/templates/form_1214_2025.pdf`) is
 * NOT shipped with this repo. When absent, the route returns
 * 503 SERVICE_UNAVAILABLE / TEMPLATE_MISSING (matches form-135's pattern).
 * Run `npm run forms:rebuild-maps` after dropping the template at the path
 * above to auto-generate `templates/maps/1214_2025.json`.
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
import { loadYearData } from "@/lib/calculateTax";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  invalidInput,
  invalidInputFromZod,
  internalError,
  serviceUnavailable,
} from "@/lib/api/errorEnvelope";
import { Form1214PayloadSchema } from "@/lib/api/schemas/generate";

const FORM_ID       = "1214_2025";
const TEMPLATE_PATH = path.join(process.cwd(), "public/templates/form_1214_2025.pdf");
const FONT_TTF      = path.join(process.cwd(), "public/fonts/Assistant-Regular.ttf");
const FONT_WOFF     = path.join(process.cwd(), "public/fonts/Assistant-Regular.woff2");

const TEXT_COLOR = rgb(0.05, 0.2, 0.7);
const CAL_COLOR  = rgb(0.9, 0, 0);

// Hebrew label per income kind (rendered RTL via hebrewForPdf).
const KIND_LABEL: Record<"severance" | "bonus" | "retro" | "other", string> = {
  severance: "פיצויי פיטורין",
  bonus:     "מענק / בונוס",
  retro:     "תשלום רטרואקטיבי",
  other:     "אחר",
};

// ── Spread-math types (1214 mirrors 161's slice shape) ──────────────────────

export interface SpreadYearSlice {
  year: number;
  taxableAmount: number;
  marginalRate: number;
  taxLiability: number;
  forecastIncome: number;
}

export interface SpreadResult {
  spreadSchedule: SpreadYearSlice[];
  totalTaxWithSpreading: number;
  usedPerYearForecast: boolean;
}

// ── Spread-math helpers (exported for testing) ──────────────────────────────

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

function marginalRateAt(income: number, year: number): number {
  const brackets = loadYearData(year).tax_brackets;
  for (const b of brackets) {
    if (income <= b.max) return b.rate;
  }
  return brackets[brackets.length - 1]?.rate ?? 0.5;
}

/**
 * Forward-spread an irregular lump across `spreadYears` years from
 * `receivedYear + 1`. Per סעיף 8(ג).
 */
export function computeIncomeSpread(
  amount: number,
  receivedYear: number,
  spreadYears: number,
  perYearIncomeForecast: number[] | undefined,
  baselineIncome: number,
): SpreadResult {
  const years = Math.max(1, Math.min(6, Math.floor(spreadYears)));
  const slice = amount / years;

  const usedForecast =
    Array.isArray(perYearIncomeForecast) &&
    perYearIncomeForecast.length === years;

  const schedule: SpreadYearSlice[] = [];
  let totalTax = 0;
  for (let i = 0; i < years; i++) {
    const sliceYear = receivedYear + 1 + i;
    const baseIncome = usedForecast
      ? perYearIncomeForecast![i]
      : baselineIncome;
    const taxBefore = bracketTax(baseIncome, sliceYear);
    const taxAfter = bracketTax(baseIncome + slice, sliceYear);
    const sliceTax = Math.max(0, taxAfter - taxBefore);
    const mRate = marginalRateAt(baseIncome + slice / 2, sliceYear);
    schedule.push({
      year: sliceYear,
      taxableAmount: Math.round(slice),
      marginalRate: mRate,
      taxLiability: sliceTax,
      forecastIncome: Math.round(baseIncome),
    });
    totalTax += sliceTax;
  }
  return {
    spreadSchedule: schedule,
    totalTaxWithSpreading: Math.round(totalTax),
    usedPerYearForecast: usedForecast,
  };
}

// ── Draw + positional lists (will be exercised once the template ships) ─────

export interface FieldDraw {
  key: string;
  valueKey: string;
  code: string;
  size?: number;
  heb?: boolean;
  align?: "right" | "left";
}

export const DRAW_LIST_1214: ReadonlyArray<FieldDraw> = [
  { key: "taxpayerName",     valueKey: "taxpayerName",     code: "name",        size: 10, heb: true, align: "left" },
  { key: "idNumber",         valueKey: "idNumber",         code: "012",         size: 10, align: "right" },
  { key: "incomeKindLabel",  valueKey: "incomeKindLabel",  code: "kind",        size: 10, heb: true, align: "left" },
  { key: "amount",           valueKey: "amount",           code: "amt",         size: 11, align: "right" },
  { key: "receivedYear",     valueKey: "receivedYear",     code: "rcvYear",     size: 10, align: "right" },
  { key: "spreadYearsCount", valueKey: "spreadYearsCount", code: "spreadCount", size: 10, align: "right" },
  { key: "totalSpreadTax",   valueKey: "totalSpreadTax",   code: "totalSpread", size: 11, align: "right" },
];

export interface PositionalDraw {
  key: string;
  valueKey: string;
  code: string;
  page: number;
  x: number;
  y: number;
  size?: number;
  heb?: boolean;
  reverse?: boolean;
}

export const POSITIONAL_DRAWS_1214: ReadonlyArray<PositionalDraw> = [
  { key: "spreadY1Year",   valueKey: "spread_y1_year",   code: "y1",     page: 0, x: 480, y: 560, size: 9 },
  { key: "spreadY1Amount", valueKey: "spread_y1_amount", code: "y1amt",  page: 0, x: 360, y: 560, size: 9 },
  { key: "spreadY1Rate",   valueKey: "spread_y1_rate",   code: "y1rate", page: 0, x: 240, y: 560, size: 9 },
  { key: "spreadY1Tax",    valueKey: "spread_y1_tax",    code: "y1tax",  page: 0, x: 120, y: 560, size: 9 },
  { key: "spreadY2Year",   valueKey: "spread_y2_year",   code: "y2",     page: 0, x: 480, y: 540, size: 9 },
  { key: "spreadY2Amount", valueKey: "spread_y2_amount", code: "y2amt",  page: 0, x: 360, y: 540, size: 9 },
  { key: "spreadY2Rate",   valueKey: "spread_y2_rate",   code: "y2rate", page: 0, x: 240, y: 540, size: 9 },
  { key: "spreadY2Tax",    valueKey: "spread_y2_tax",    code: "y2tax",  page: 0, x: 120, y: 540, size: 9 },
  { key: "spreadY3Year",   valueKey: "spread_y3_year",   code: "y3",     page: 0, x: 480, y: 520, size: 9 },
  { key: "spreadY3Amount", valueKey: "spread_y3_amount", code: "y3amt",  page: 0, x: 360, y: 520, size: 9 },
  { key: "spreadY3Rate",   valueKey: "spread_y3_rate",   code: "y3rate", page: 0, x: 240, y: 520, size: 9 },
  { key: "spreadY3Tax",    valueKey: "spread_y3_tax",    code: "y3tax",  page: 0, x: 120, y: 520, size: 9 },
  { key: "spreadY4Year",   valueKey: "spread_y4_year",   code: "y4",     page: 0, x: 480, y: 500, size: 9 },
  { key: "spreadY4Amount", valueKey: "spread_y4_amount", code: "y4amt",  page: 0, x: 360, y: 500, size: 9 },
  { key: "spreadY4Rate",   valueKey: "spread_y4_rate",   code: "y4rate", page: 0, x: 240, y: 500, size: 9 },
  { key: "spreadY4Tax",    valueKey: "spread_y4_tax",    code: "y4tax",  page: 0, x: 120, y: 500, size: 9 },
  { key: "spreadY5Year",   valueKey: "spread_y5_year",   code: "y5",     page: 0, x: 480, y: 480, size: 9 },
  { key: "spreadY5Amount", valueKey: "spread_y5_amount", code: "y5amt",  page: 0, x: 360, y: 480, size: 9 },
  { key: "spreadY5Rate",   valueKey: "spread_y5_rate",   code: "y5rate", page: 0, x: 240, y: 480, size: 9 },
  { key: "spreadY5Tax",    valueKey: "spread_y5_tax",    code: "y5tax",  page: 0, x: 120, y: 480, size: 9 },
  { key: "spreadY6Year",   valueKey: "spread_y6_year",   code: "y6",     page: 0, x: 480, y: 460, size: 9 },
  { key: "spreadY6Amount", valueKey: "spread_y6_amount", code: "y6amt",  page: 0, x: 360, y: 460, size: 9 },
  { key: "spreadY6Rate",   valueKey: "spread_y6_rate",   code: "y6rate", page: 0, x: 240, y: 460, size: 9 },
  { key: "spreadY6Tax",    valueKey: "spread_y6_tax",    code: "y6tax",  page: 0, x: 120, y: 460, size: 9 },

  { key: "justification", valueKey: "justification", code: "just",    page: 0, x: 100, y: 320, size: 9, heb: true, reverse: true },
  { key: "signatureName", valueKey: "signatureName", code: "sig",     page: 0, x: 100, y: 80,  size: 10, heb: true, reverse: true },
  { key: "signatureDate", valueKey: "signatureDate", code: "sigDate", page: 0, x: 280, y: 80,  size: 10 },
];

export const EXCLUDED_CODES_1214: Readonly<Record<string, string>> = {};

// ── Value builder ───────────────────────────────────────────────────────────

interface BuildValuesInput {
  taxpayerName?: string;
  idNumber?: string;
  incomeKind: "severance" | "bonus" | "retro" | "other";
  amount: number;
  receivedYear: number;
  spread: SpreadResult;
  justification?: string;
  signatureDate: string;
}

export function buildForm1214Fields(input: BuildValuesInput): Record<string, string> {
  const vals: Record<string, string> = {
    taxpayerName: input.taxpayerName ?? "",
    idNumber: input.idNumber ?? "",
    incomeKindLabel: KIND_LABEL[input.incomeKind] ?? "אחר",
    amount: formatIlsForPdf(input.amount),
    receivedYear: String(input.receivedYear),
    spreadYearsCount: String(input.spread.spreadSchedule.length),
    totalSpreadTax: formatIlsForPdf(input.spread.totalTaxWithSpreading),
    justification: input.justification ?? "",
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
  // Body validation runs FIRST so callers get a precise 400 even when the
  // template asset is missing. TEMPLATE_MISSING 503 fires only after the
  // request has been structurally validated.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidInput("גוף הבקשה אינו JSON תקין.");
  }

  const parsed = Form1214PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidInputFromZod(parsed.error.issues, "פורמט הבקשה אינו תקין.");
  }

  const body = parsed.data;

  if (body.idNumber && !isValidTZ(body.idNumber)) {
    return invalidInput("מספר תעודת זהות לא תקין — ספרת ביקורת שגויה.");
  }

  if (
    body.perYearIncomeForecast !== undefined &&
    body.perYearIncomeForecast.length !== body.spreadYears
  ) {
    return invalidInput(
      `אורך תחזית הכנסה לכל שנה (${body.perYearIncomeForecast.length}) חייב להתאים למספר שנות הפריסה (${body.spreadYears}).`,
    );
  }

  if (
    body.perYearIncomeForecast === undefined &&
    body.baselineIncome === undefined
  ) {
    return invalidInput(
      "יש לציין תחזית הכנסה לכל שנה (perYearIncomeForecast) או הכנסה בסיסית (baselineIncome).",
    );
  }

  // Template-missing gate — runs AFTER body validation. The official ITA
  // blank PDF is not shipped with this repo (Phase 1 §1.E data gap; see
  // audits/generation.md §1.4 — Form 1214 was a 501 stub deleted in
  // Phase 0 §0.I). Once public/templates/form_1214_2025.pdf is added this
  // branch becomes unreachable.
  if (!fs.existsSync(TEMPLATE_PATH)) {
    return serviceUnavailable(
      "תבנית טופס 1214 אינה זמינה כרגע.",
      "TEMPLATE_MISSING",
    );
  }

  try {
    const spread = computeIncomeSpread(
      body.amount,
      body.receivedYear,
      body.spreadYears,
      body.perYearIncomeForecast,
      body.baselineIncome ?? 0,
    );

    const calibrate = !!body.calibrate;

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
      `[form-1214] template=${path.basename(TEMPLATE_PATH)} ` +
        `pages=${pdfDoc.getPageCount()} ` +
        `map_codes=${Object.keys(map.fields).length} calibrate=${calibrate} ` +
        `spreadYears=${spread.spreadSchedule.length} forecast=${spread.usedPerYearForecast}`,
    );

    const vals = buildForm1214Fields({
      taxpayerName: body.taxpayerName,
      idNumber: body.idNumber,
      incomeKind: body.incomeKind,
      amount: body.amount,
      receivedYear: body.receivedYear,
      spread,
      justification: body.justification,
      signatureDate: new Date().toLocaleDateString("en-GB"),
    });

    const pageHeight = map.page_size.height;
    const drawn: { key: string; code: string; page: number }[] = [];
    const missing: string[] = [];

    const valueFor = (k: string, heb?: boolean): string => {
      const v = vals[k] ?? "";
      return heb ? hebrewForPdf(v) : v;
    };

    for (const d of DRAW_LIST_1214) {
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
          `[form-1214] field "${d.key}"(${d.code}): ${e instanceof Error ? e.message : e}`,
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

    for (const p of POSITIONAL_DRAWS_1214) {
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
          `[form-1214] positional "${p.key}"(${p.code}): ${e instanceof Error ? e.message : e}`,
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
      `[form-1214] ${mode} ${buffer.byteLength}B — drawn=${drawn.length} missing=${missing.length}`,
    );
    if (missing.length) {
      console.log(`[form-1214] codes not in map: ${missing.join(", ")}`);
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="form_1214_${mode}.pdf"`,
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
    console.error("[form-1214] generation failed:", err);
    return internalError(
      "יצירת ה-PDF נכשלה. נסה שוב מאוחר יותר.",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "generate-form-1214", limit: 30 }),
);
