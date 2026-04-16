/**
 * POST /api/generate/form-1301 — Static PDF Overlay Architecture
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ARCHITECTURE NOTES
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The official Form 1301 (2025) PDF has ZERO AcroForm fields — it is a
 * fully static visual document (4 pages, A4: 595.275 x 841.89 pts).
 * We overlay text at exact coordinates using pdf-lib drawText().
 *
 * Same overlay architecture as Form 135 — see that route for full
 * commentary on font strategy, RTL handling, and calibration mode.
 *
 * KEY DIFFERENCE from Form 135:
 *   - 4 pages instead of 1
 *   - 3-column layout on page 1 (right/center/left)
 *   - Employment income split: main employer vs. 2nd employer columns
 *   - Business income section (section 2)
 *   - Expanded capital gains fields
 *   - Deductions appear on both page 1 and page 3 (cross-check)
 *   - Bank details on page 3 (not page 0)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CALIBRATION MODE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Add "calibrate": true to the POST body to overlay each field with a
 * red label (e.g. "→grossSalaryMain") so you can visually verify positions.
 */

import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { buildForm1301Fields, hebrewForPdf } from "@/lib/pdfUtils";
import { isValidTZ } from "@/lib/validateTZ";
import type { Form135Payload } from "@/types";

// ─── Asset paths ──────────────────────────────────────────────────────────────

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public", "templates", "form1301_2025.pdf"
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
  /** If set, draw a white rectangle over this area before drawing text (for year overlay). */
  cover?: { x: number; y: number; w: number; h: number };
}

// ─── Field coordinate map ────────────────────────────────────────────────────
//
// Positions derived from label coordinates in the PDF content stream using
// the standard data offset pattern:
//   Right column: data_x = label_x - 77, data_y = label_y + 3
//   Center column: data_x = label_x - 77, data_y = label_y + 3
//   Left column: data_x = label_x - 79, data_y = label_y + 3

const F: Record<string, FieldSpec> = {
  // ═══ PAGE 0 — Personal details ════════════════════════════════════════════

  taxYear:       { pg: 0, x: 193, y: 820, sz: 10, heb: false, bold: true,
                   cover: { x: 191, y: 816, w: 42, h: 14 } },

  // Personal info — ID fields (bank section + file number)
  idNumber:      { pg: 0, x: 136.6, y: 634.1, sz:  9, heb: false, bold: true  },
  taxpayerId278: { pg: 0, x: 140.7, y: 157.2, sz:  9, heb: false, bold: true  },
  spouseId277:   { pg: 0, x: 260.0, y: 157.4, sz:  9, heb: false, bold: true  },
  payerId143:    { pg: 0, x: 409.5, y:  40.2, sz:  9, heb: false, bold: true  },

  // Section ב. פרטים אישיים — calibrated for 2025 template:
  //   "מספר זהות" label at (391, 399)  → ID input box at x≈330
  //   "שם משפחה" label at (369, 367)   → name input at x≈320
  //   "שם פרטי"  label at (290, 367)   → first-name input at x≈240
  //   Address row: "כתובת מגורים" label at (106, 311)
  idPersonal:    { pg: 0, x: 330, y: 402, sz:  9, heb: false, bold: true  },
  firstName:     { pg: 0, x: 240, y: 370, sz:  9, heb: true  },
  lastName:      { pg: 0, x: 320, y: 370, sz:  9, heb: true  },
  city:          { pg: 0, x: 440, y: 318, sz:  8, heb: true  },
  street:        { pg: 0, x: 350, y: 318, sz:  8, heb: true  },
  houseNumber:   { pg: 0, x: 310, y: 318, sz:  8, heb: false, bold: true  },

  // ═══ PAGE 1 — Income sections (3-column layout) ═══════════════════════════

  // Employment — main employer (center column, x≈217 → data at ~141)
  grossSalaryMain: { pg: 1, x: 140.9, y: 732.3, sz: 11, heb: false, bold: true  },
  taxWithheldMain: { pg: 1, x: 140.9, y: 715.3, sz: 11, heb: false, bold: true  },
  pensionMain:     { pg: 1, x: 140.9, y: 698.6, sz: 10, heb: false, bold: true  },

  // Employment — 2nd employer (left column, x≈115 → data at ~37)
  grossSalary2nd:  { pg: 1, x: 36.8, y: 732.3, sz: 11, heb: false, bold: true  },
  taxWithheld2nd:  { pg: 1, x: 36.8, y: 715.3, sz: 11, heb: false, bold: true  },
  severance:       { pg: 1, x: 36.8, y: 698.6, sz: 10, heb: false, bold: true  },

  // Business income (section 2)
  bizIncomeMain:   { pg: 1, x: 140.5, y: 606.4, sz: 11, heb: false, bold: true  },
  bizIncome2nd:    { pg: 1, x: 36.7,  y: 606.4, sz: 11, heb: false, bold: true  },

  // Capital gains (right column, x≈320 → data at ~243)
  capitalGainRight:  { pg: 1, x: 242.7, y: 486.4, sz: 11, heb: false, bold: true  },
  capitalGainCenter: { pg: 1, x: 139.9, y: 486.4, sz: 11, heb: false, bold: true  },
  capitalLoss:       { pg: 1, x: 242.5, y: 470.0, sz: 11, heb: false, bold: true  },
  foreignTax:        { pg: 1, x: 242.5, y: 452.8, sz: 10, heb: false, bold: true  },
  otherIncome:       { pg: 1, x: 242.5, y: 418.5, sz: 10, heb: false, bold: true  },
  field055:          { pg: 1, x: 242.5, y: 400.3, sz: 10, heb: false, bold: true  },

  // Deductions (right column)
  donations:       { pg: 1, x: 242.9, y: 349.7, sz: 10, heb: false, bold: true  },
  lifeInsurance:   { pg: 1, x: 242.9, y: 332.4, sz: 10, heb: false, bold: true  },
  indPension:      { pg: 1, x: 243.0, y: 315.2, sz: 10, heb: false, bold: true  },
  totalDeductions: { pg: 1, x: 243.0, y: 246.3, sz: 10, heb: false, bold: true  },

  // ═══ PAGE 2 — Additional details ═════════════════════════════════════════

  field260:        { pg: 2, x: 196.9, y: 741.8, sz: 10, heb: false, bold: true  },

  // ═══ PAGE 3 — Deductions (cont.) + Bank + Signature ══════════════════════

  lifeInsP3:         { pg: 3, x: 144.8, y: 800.4, sz: 10, heb: false, bold: true  },
  pensionDeductionP3:{ pg: 3, x: 144.8, y: 764.9, sz: 10, heb: false, bold: true  },
  donationsP3:       { pg: 3, x: 144.8, y: 713.0, sz: 10, heb: false, bold: true  },
  taxCode042:        { pg: 3, x: 42.0,  y: 522.6, sz: 10, heb: false, bold: true  },

  // Bank details (page 3)
  bankNumber:        { pg: 3, x: 30.0,  y: 302.9, sz: 10, heb: false, bold: true  },
  branchNumber:      { pg: 3, x: 110.2, y: 301.0, sz: 10, heb: false, bold: true  },
  accountNumber:     { pg: 3, x: 110.2, y: 269.1, sz: 10, heb: false, bold: true  },
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {

  // ── Gate ──────────────────────────────────────────────────────────────────
  if (!fs.existsSync(TEMPLATE_PATH)) {
    return Response.json(
      {
        error:        "TEMPLATE_MISSING",
        message:      "form1301_2025.pdf not found at public/templates/",
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

    const pageCount = pdfDoc.getPageCount();
    if (pageCount < 4) {
      console.warn(`[form-1301] Template has ${pageCount} pages (expected 4)`);
    }

    // ── 3. Embed fonts ────────────────────────────────────────────────────────
    pdfDoc.registerFontkit(fontkit);

    // Hebrew font — prefer TTF (full glyph set), fall back to woff2.
    const fontPath  = fs.existsSync(FONT_TTF_PATH) ? FONT_TTF_PATH : FONT_WOFF_PATH;
    const fontBytes = fs.readFileSync(fontPath);
    const hebrewFont = await pdfDoc.embedFont(fontBytes, { subset: false });

    // HelveticaBold for all numeric values
    const latinBoldFont    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // Regular Helvetica for calibration labels
    const latinRegularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    console.log(`[form-1301] Font: ${path.basename(fontPath)} (Hebrew) + HelveticaBold (numeric), pages: ${pageCount}, calibrate: ${calibrate}`);

    // ── 4. Build flat field value map ────────────────────────────────────────
    const vals = buildForm1301Fields(taxpayer, financials);

    // ── 5. Build draw-list ───────────────────────────────────────────────────
    // Maps field keys to their text values and coordinate specs.
    // Fields span all 4 pages via the pg property in FieldSpec.

    const draws: { key: string; text: string; spec: FieldSpec }[] = [
      // ── Page 0 — Personal details ──────────────────────────────────────────
      { key: "taxYear",       text: vals.taxYear,                    spec: F.taxYear       },
      { key: "idNumber",      text: vals["012"],                     spec: F.idNumber      },
      { key: "taxpayerId278", text: vals["012"],                     spec: F.taxpayerId278 },
      { key: "spouseId277",   text: vals["013"],                     spec: F.spouseId277   },
      // Section ב — personal details (green area)
      { key: "idPersonal",    text: vals["012"],                     spec: F.idPersonal    },
      { key: "firstName",     text: hebrewForPdf(vals["031"]),       spec: F.firstName     },
      { key: "lastName",      text: hebrewForPdf(vals["032"]),       spec: F.lastName      },
      { key: "city",          text: hebrewForPdf(vals["022"]),       spec: F.city          },
      { key: "street",        text: hebrewForPdf(vals["023"]),       spec: F.street        },
      { key: "houseNumber",   text: vals["024"],                     spec: F.houseNumber   },

      // ── Page 1 — Employment income ─────────────────────────────────────────
      { key: "grossSalaryMain", text: vals["158_main"],              spec: F.grossSalaryMain },
      { key: "grossSalary2nd",  text: vals["172_2nd"],               spec: F.grossSalary2nd  },
      { key: "taxWithheldMain", text: vals["068_main"],              spec: F.taxWithheldMain },
      { key: "taxWithheld2nd",  text: vals["069_2nd"],               spec: F.taxWithheld2nd  },
      { key: "pensionMain",     text: vals["258_main"],              spec: F.pensionMain     },
      { key: "severance",       text: vals["272"],                   spec: F.severance       },

      // ── Page 1 — Business income ───────────────────────────────────────────
      { key: "bizIncomeMain",   text: vals["201"],                   spec: F.bizIncomeMain   },
      { key: "bizIncome2nd",    text: vals["301"],                   spec: F.bizIncome2nd    },

      // ── Page 1 — Capital gains ─────────────────────────────────────────────
      { key: "capitalGainRight",  text: vals["060"],                 spec: F.capitalGainRight  },
      { key: "capitalGainCenter", text: vals["211"],                 spec: F.capitalGainCenter },
      { key: "capitalLoss",       text: vals["067"],                 spec: F.capitalLoss       },
      { key: "foreignTax",        text: vals["157"],                 spec: F.foreignTax        },
      { key: "otherIncome",       text: vals["141"],                 spec: F.otherIncome       },
      { key: "field055",          text: vals["055_1301"],            spec: F.field055          },

      // ── Page 1 — Deductions ────────────────────────────────────────────────
      { key: "donations",       text: vals["078"],                   spec: F.donations       },
      { key: "lifeInsurance",   text: vals["126"],                   spec: F.lifeInsurance   },
      { key: "indPension",      text: vals["142"],                   spec: F.indPension      },
      { key: "totalDeductions", text: vals["335"],                   spec: F.totalDeductions },

      // ── Page 3 — Deductions (duplicated for ITA cross-check) ───────────────
      { key: "lifeInsP3",          text: vals["036_p3"],             spec: F.lifeInsP3          },
      { key: "pensionDeductionP3", text: vals["045_p3"],             spec: F.pensionDeductionP3 },
      { key: "donationsP3",        text: vals["037_p3"],             spec: F.donationsP3        },
      { key: "taxCode042",         text: vals["042_p3"],             spec: F.taxCode042         },

      // ── Page 3 — Bank details ──────────────────────────────────────────────
      { key: "bankNumber",    text: vals["274"],                     spec: F.bankNumber    },
      { key: "branchNumber",  text: vals["273"],                     spec: F.branchNumber  },
      { key: "accountNumber", text: vals["044"],                     spec: F.accountNumber },
    ];

    // ── 6. Draw all fields ───────────────────────────────────────────────────
    for (const { key, text, spec } of draws) {
      if (!text || text === "0") continue; // skip empty / zero values

      const pageIdx = Math.min(spec.pg, pageCount - 1);
      const page    = pdfDoc.getPage(pageIdx);
      const font    = spec.heb ? hebrewFont : (spec.bold !== false ? latinBoldFont : latinRegularFont);
      const fontSize = spec.sz ?? 10;

      // Cover pre-printed content with a white rectangle (e.g. tax year)
      if (spec.cover) {
        page.drawRectangle({
          x:      spec.cover.x,
          y:      spec.cover.y,
          width:  spec.cover.w,
          height: spec.cover.h,
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
        console.warn(`[form-1301] field "${key}" (pg ${spec.pg}): ${e instanceof Error ? e.message : e}`);
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
    console.log(`[form-1301] Generated (${mode}) — ${buffer.byteLength} bytes, ${pageCount} pages`);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="form_1301_${mode}.pdf"`,
        "Content-Length":      String(buffer.byteLength),
        "Cache-Control":       "no-store",
        "X-PDF-Mode":          "overlay",
        "X-PDF-Pages":         String(pageCount),
      },
    });

  } catch (err: unknown) {
    console.error("[form-1301] Generation failed:", err);
    return Response.json(
      { error: "PDF_GENERATION_FAILED", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
