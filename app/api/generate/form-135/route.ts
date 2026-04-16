/**
 * POST /api/generate/form-135 — Static PDF Overlay Architecture
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ARCHITECTURE NOTES
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The official Form 135 (2025) PDF has ZERO AcroForm fields — it is a
 * fully static visual document. The ITA delivers a scanned/vector PDF
 * with no interactive widgets. Therefore:
 *
 *   WRONG: PDFDocument.load(template) → form.getTextField(name)  [no fields]
 *   RIGHT: PDFDocument.load(template) → page.drawText(value, {x,y})
 *
 * Field positions were determined by analysing the raw PDF content streams:
 *   - TT1-font text (numeric labels like "158", "272") was extracted with
 *     their Tm-operator (x,y) positions.
 *   - Data is drawn just to the RIGHT of each label in PDF coordinates
 *     (label is at the bottom-left corner of its input box).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FONT STRATEGY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Two fonts are used:
 *   1. Assistant-Regular.ttf  — Hebrew text (names, addresses, labels)
 *      Must be subset:false to embed full glyph set.
 *   2. StandardFonts.Helvetica — Numbers, IDs, amounts
 *      Hebrew-subset fonts lack digits → renders as "1111". Helvetica fixes this.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RTL STRATEGY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * drawText() in pdf-lib does NOT run the Unicode BiDi algorithm.
 * Hebrew text must be stored in LOGICAL order with a leading U+200F mark.
 * hebrewForPdf() from pdfUtils.ts handles this.
 * Numbers are NEVER reversed.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CALIBRATION MODE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Add ?calibrate=1 to the POST body to overlay each field with a label
 * (e.g. "→158") drawn in red so you can visually verify positions.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FIELD POSITION MAP  (x,y in PDF points; origin = bottom-left of page)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Confirmed from content-stream analysis (TT1 font Tm operators) — 2025 template:
 *
 *   LABEL           LABEL POS     DATA DRAW POS    NOTES
 *   ─────────────────────────────────────────────────────────────────────
 *   158 (gross)     (221.8,343)   (144.8,346)       main employer gross
 *   068 (tax wthld) (221.8,323.9) (144.8,326.9)     main employer tax
 *   258 (pension)   (221.8,304.9) (144.8,307.9)     pension / comp
 *   272 (severance) (119.0,304.9) ( 40.0,307.9)     taxable severance (2nd col)
 *   060 (cap gain)  (221.8,227.6) (144.8,230.6)     capital gains profit
 *   067 (cap loss)  (221.8,208.5) (144.8,211.5)     capital losses
 *   157 (fgn tax)   (221.8,189.8) (144.8,192.8)     foreign withholding
 *   078 (donations) (221.8,133.7) (144.8,136.7)     Sec 46 donations
 *   126 (life ins)  (221.8,115.0) (144.8,118.0)     Sec 45a life ins
 *   142 (ind pen)   (221.8, 96.2) (144.8, 99.2)     Sec 47 pension
 *   012 (ID)        ( 88.5,450.3) ( 11.5,453.3)     taxpayer ID
 *   013 (spouse ID) (208.5,450.3) (131.5,453.3)     spouse ID
 *   header year     (195, 817)    (193, 820)        tax year (covered+redrawn)
 *
 * Personal-info rows (section ב. פרטים אישיים) — calibrated for 2025 template:
 *   idPersonal (מספר זהות): x=398, y=671  — in ID input box (label at 473,668)
 *   lastName   (שם משפחה):  x=295, y=671  — in name box (label at 340,668)
 *   firstName  (שם פרטי):   x=435, y=647  — in first-name box (label at 478,644)
 *   city/street/house:       y=583         — address input row (between labels@595 and phone@571)
 */

import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { buildForm135Fields, hebrewForPdf } from "@/lib/pdfUtils";
import { isValidTZ } from "@/lib/validateTZ";
import type { Form135Payload } from "@/types";

// ─── Asset paths ──────────────────────────────────────────────────────────────

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public", "templates", "form135_2025.pdf"
);
const FONT_TTF_PATH  = path.join(process.cwd(), "public", "fonts", "Assistant-Regular.ttf");
const FONT_WOFF_PATH = path.join(process.cwd(), "public", "fonts", "Assistant-Regular.woff2");

// ─── Field coordinate map ─────────────────────────────────────────────────────
//
// Each entry: { pg: page index (0-based), x, y: text baseline, sz: font size }
// "heb": true  → render with Hebrew font (Assistant)
// "heb": false → render with Helvetica (numbers, IDs)

interface FieldSpec {
  pg: number;
  x: number;
  y: number;
  sz?: number;
  heb?: boolean;
  /** Use bold latin font (HelveticaBold). Ignored when heb:true. Default true for numeric fields. */
  bold?: boolean;
}

// ─── Field coordinate map ────────────────────────────────────────────────────
//
// Font sizing strategy:
//   • Key income/tax fields (158, 042, 045, capital gains): sz 11, bold
//   • Secondary numeric fields (deductions, bank):          sz 10, bold
//   • ID numbers, house number:                             sz  9, bold
//   • Hebrew text fields (names, city, street):             sz 10, regular (TTF)
//   • Tax year header overlay:                              sz 10, bold

const F: Record<string, FieldSpec> = {
  // ── Header ─────────────────────────────────────────────────────────────────
  // "2025" is printed at (195,817). We cover it with white and redraw the year.
  taxYear:       { pg: 0, x: 193, y: 820, sz: 10, heb: false, bold: true  },

  // ── Personal details ───────────────────────────────────────────────────────
  // Bank-section ID fields: label 278 at (88.5,450.3), label 277 at (208.5,450.3).
  idNumber:      { pg: 0, x: 11.5, y: 453.3, sz:  9, heb: false, bold: true  },
  spouseId:      { pg: 0, x: 131.5, y: 453.3, sz:  9, heb: false, bold: true  },

  // Section ב. פרטים אישיים — green area, right column ("בן הזוג הרשום").
  // Calibrated via pdftotext label extraction + overlay verification:
  //   "מספר זהות" label at (473, 668.4)  → ID input box at x≈398
  //   "שם משפחה" label at (340, 668.4)   → name input box at x≈295
  //   "שם פרטי"  label at (478, 643.9)   → first-name box at x≈435
  //   Address row between address labels (y≈595) and phone row (y≈571)
  idPersonal:    { pg: 0, x: 398, y: 671, sz:  9, heb: false, bold: true  },
  firstName:     { pg: 0, x: 435, y: 647, sz:  9, heb: true  },
  lastName:      { pg: 0, x: 295, y: 671, sz:  9, heb: true  },
  city:          { pg: 0, x: 490, y: 583, sz:  8, heb: true  },
  street:        { pg: 0, x: 380, y: 583, sz:  8, heb: true  },
  houseNumber:   { pg: 0, x: 310, y: 583, sz:  8, heb: false, bold: true  },

  // ── Employment income ─────────────────────────────────────────────────────
  // Main employer column: right box. Label x≈221.8, data drawn at x=144.8.
  grossSalary:   { pg: 0, x: 144.8, y: 346.0, sz: 11, heb: false, bold: true  },
  taxWithheld:   { pg: 0, x: 144.8, y: 326.9, sz: 11, heb: false, bold: true  },
  pension:       { pg: 0, x: 144.8, y: 307.9, sz: 10, heb: false, bold: true  },
  // Secondary employer column: left box. Label x≈119.0, data at x=40.0.
  severance:     { pg: 0, x:  40.0, y: 307.9, sz: 10, heb: false, bold: true  },

  // ── Capital gains & foreign income ────────────────────────────────────────
  // Same right box column — capital gains rows.
  capitalGain:   { pg: 0, x: 144.8, y: 230.6, sz: 11, heb: false, bold: true  },
  capitalLoss:   { pg: 0, x: 144.8, y: 211.5, sz: 11, heb: false, bold: true  },
  foreignTax:    { pg: 0, x: 144.8, y: 192.8, sz: 10, heb: false, bold: true  },

  // ── Personal deductions ────────────────────────────────────────────────────
  // Same right box column.
  donations:     { pg: 0, x: 144.8, y: 136.7, sz: 10, heb: false, bold: true  },
  lifeInsurance: { pg: 0, x: 144.8, y: 118.0, sz: 10, heb: false, bold: true  },
  indPension:    { pg: 0, x: 144.8, y:  99.2, sz: 10, heb: false, bold: true  },

  // ── Bank details (bottom section) ─────────────────────────────────────────
  bankNumber:    { pg: 0, x: 430, y: 50, sz: 10, heb: false, bold: true  },
  branchNumber:  { pg: 0, x: 310, y: 50, sz: 10, heb: false, bold: true  },
  accountNumber: { pg: 0, x: 160, y: 50, sz: 10, heb: false, bold: true  },
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {

  // ── Gate ──────────────────────────────────────────────────────────────────
  if (!fs.existsSync(TEMPLATE_PATH)) {
    return Response.json(
      {
        error:        "TEMPLATE_MISSING",
        message:      "form135_2025.pdf not found at public/templates/",
        instructions: "Download from https://www.gov.il/he/departments/guides/guide-1345",
      },
      { status: 503 }
    );
  }

  try {
    // ── 1. Parse body ────────────────────────────────────────────────────────
    const body = (await req.json()) as Form135Payload & { calibrate?: boolean };
    const { taxpayer, financials } = body;

    if (!taxpayer || !financials) {
      return Response.json({ error: "Missing taxpayer or financials" }, { status: 400 });
    }

    if (taxpayer.idNumber && !isValidTZ(taxpayer.idNumber)) {
      return Response.json(
        { error: "INVALID_TZ", message: "מספר תעודת זהות לא תקין — ספרת ביקורת שגויה" },
        { status: 400 }
      );
    }

    const calibrate = !!body.calibrate;

    // ── 2. Load template ──────────────────────────────────────────────────────
    const templateBytes = fs.readFileSync(TEMPLATE_PATH);
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

    // ── 3. Embed fonts ────────────────────────────────────────────────────────
    pdfDoc.registerFontkit(fontkit);

    // Hebrew font — prefer TTF (47KB, full glyph set), fall back to woff2.
    // The woff2 files are ~4KB skeleton subsets — only TTF has all glyphs.
    const fontPath  = fs.existsSync(FONT_TTF_PATH) ? FONT_TTF_PATH : FONT_WOFF_PATH;
    const fontBytes = fs.readFileSync(fontPath);
    const hebrewFont = await pdfDoc.embedFont(fontBytes, { subset: false });

    // HelveticaBold for all numeric values — bold digits are easier to read
    // on the form and avoids "1111" glyph-missing issue from Hebrew subset fonts.
    const latinBoldFont    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // Regular Helvetica kept only for calibration labels (sz 6)
    const latinRegularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    console.log(`[form-135] Font: ${path.basename(fontPath)} (Hebrew) + HelveticaBold (numeric), pages: ${pdfDoc.getPageCount()}, calibrate: ${calibrate}`);

    // ── 4. Build flat field value map ────────────────────────────────────────
    const vals = buildForm135Fields(taxpayer, financials);

    // ── 5. Build draw-list ───────────────────────────────────────────────────
    // { fieldKey, text, spec }
    const draws: { key: string; text: string; spec: FieldSpec }[] = [
      // Header
      { key: "taxYear",       text: vals.taxYear,         spec: F.taxYear       },

      // Personal — bank section IDs
      { key: "idNumber",      text: vals["012"],          spec: F.idNumber      },
      { key: "spouseId",      text: vals["013"],          spec: F.spouseId      },
      // Personal — section ב (green area)
      { key: "idPersonal",    text: vals["012"],          spec: F.idPersonal    },
      { key: "firstName",     text: hebrewForPdf(vals["031"]),  spec: F.firstName     },
      { key: "lastName",      text: hebrewForPdf(vals["032"]),  spec: F.lastName      },
      { key: "city",          text: hebrewForPdf(vals["022"]),  spec: F.city          },
      { key: "street",        text: hebrewForPdf(vals["023"]),  spec: F.street        },
      { key: "houseNumber",   text: vals["024"],          spec: F.houseNumber   },

      // Employment
      { key: "grossSalary",   text: vals["158"],          spec: F.grossSalary   },
      { key: "taxWithheld",   text: vals["042"],          spec: F.taxWithheld   },
      { key: "pension",       text: vals["045"],          spec: F.pension       },
      { key: "severance",     text: vals["272"],          spec: F.severance     },

      // Capital gains
      { key: "capitalGain",   text: vals["256"],          spec: F.capitalGain   },
      { key: "capitalLoss",   text: vals["166"],          spec: F.capitalLoss   },
      { key: "foreignTax",    text: vals["055"],          spec: F.foreignTax    },

      // Deductions
      { key: "donations",     text: vals["037"],          spec: F.donations     },
      { key: "lifeInsurance", text: vals["036"],          spec: F.lifeInsurance },
      { key: "indPension",    text: vals["135"],          spec: F.indPension    },

      // Bank
      { key: "bankNumber",    text: vals.bank_number,     spec: F.bankNumber    },
      { key: "branchNumber",  text: vals.branch_number,   spec: F.branchNumber  },
      { key: "accountNumber", text: vals.account_number,  spec: F.accountNumber },
    ];

    // ── 6. Draw all fields ───────────────────────────────────────────────────
    for (const { key, text, spec } of draws) {
      if (!text || text === "0") continue; // skip empty / zero values

      const page     = pdfDoc.getPage(spec.pg);
      // Hebrew fields → TTF font. Numeric: bold by default (spec.bold !== false).
      const font     = spec.heb ? hebrewFont : (spec.bold !== false ? latinBoldFont : latinRegularFont);
      const fontSize = spec.sz ?? 10;

      // For the tax year: cover existing printed year with a white rectangle.
      // Rectangle is sized to fully erase the pre-printed "2025" (approx 42×14pt).
      if (key === "taxYear") {
        page.drawRectangle({
          x:      191,
          y:      816,
          width:  42,
          height: 14,
          color:  rgb(1, 1, 1),
          borderWidth: 0,
        });
      }

      try {
        page.drawText(text, {
          x:     spec.x,
          y:     spec.y,
          font,
          size:  fontSize,
          color: rgb(0, 0, 0),
        });
      } catch (e) {
        console.warn(`[form-135] ⚠ field "${key}": ${e instanceof Error ? e.message : e}`);
      }

      // Calibration overlay — draw a small red label to identify each field
      if (calibrate) {
        try {
          page.drawText(`→${key}`, {
            x:     spec.x,
            y:     spec.y + 11,
            font:  latinRegularFont,
            size:  6,
            color: rgb(0.9, 0, 0),
          });
        } catch { /* non-critical */ }
      }
    }

    // ── 7. Serialize and return ────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    const buffer   = Buffer.from(pdfBytes.buffer as ArrayBuffer);

    const mode = calibrate ? "calibration" : "final";
    console.log(`[form-135] ✓ Generated (${mode}) — ${buffer.byteLength} bytes`);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="form_135_${mode}.pdf"`,
        "Content-Length":      String(buffer.byteLength),
        "Cache-Control":       "no-store",
        "X-PDF-Mode":          "overlay",
      },
    });

  } catch (err: unknown) {
    console.error("[form-135] Generation failed:", err);
    return Response.json(
      { error: "PDF_GENERATION_FAILED", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
