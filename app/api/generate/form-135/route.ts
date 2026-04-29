/**
 * POST /api/generate/form-135 — Field-code-mapped PDF overlay
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (per 135_1301 generation task.md)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Form 135 (2025) is a 4-page static PDF with zero AcroForm widgets but
 * a real text layer. Every input box is anchored by a 3-digit numeric
 * "field code" printed next to it (158, 042, 272, 012, 274 …). Those codes
 * are the official Rashut HaMisim (שדה) identifiers and are stable across
 * tax years.
 *
 * Coordinates are NOT hardcoded here. They come from `templates/maps/
 * 135_2025.json`, generated once by `scripts/build-field-map.mjs` by
 * scanning the blank template with pdfjs-dist for 3-digit tokens minus
 * a denylist of form/section references. Rebuild when templates change.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FONT + RTL STRATEGY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Two fonts embed:
 *   1. Assistant-Regular.ttf    → Hebrew text (names, addresses)
 *   2. StandardFonts.HelveticaBold → Numeric (digits missing from Hebrew subset)
 *
 * Hebrew strings pass through `hebrewForPdf()` which pre-reverses glyphs
 * (pdf-lib runs no BiDi algorithm). Numbers render LTR, right-aligned
 * inside each value-box to match Israeli form convention.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CALIBRATION MODE — pass { "calibrate": true } in the body to overlay a
 * red `→code` label above each stamped value for visual verification.
 */

import { NextRequest } from "next/server";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { buildForm135Fields, hebrewForPdf } from "@/lib/pdfUtils";
import { isValidTZ } from "@/lib/validateTZ";
import { loadFieldMap, findField, type FieldMap } from "@/lib/fieldMap";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  invalidInput,
  invalidInputFromZod,
  internalError,
  serviceUnavailable,
} from "@/lib/api/errorEnvelope";
import { Form135PayloadSchema } from "@/lib/api/schemas/generate";

const FORM_ID       = "135_2025";
const TEMPLATE_PATH = path.join(process.cwd(), "public/templates/form135_2025.pdf");
const FONT_TTF      = path.join(process.cwd(), "public/fonts/Assistant-Regular.ttf");
const FONT_WOFF     = path.join(process.cwd(), "public/fonts/Assistant-Regular.woff2");

const TEXT_COLOR = rgb(0.05, 0.2, 0.7); // readable navy blue
const CAL_COLOR  = rgb(0.9, 0, 0);

// ── Draw-list spec: each entry references a field code from the scanned map ──

interface FieldDraw {
  key:    string;        // logical name for logs + calibration labels
  text:   string;        // pre-formatted value (caller applied hebrewForPdf / toLocaleString)
  code:   string;        // 3-digit code in templates/maps/135_2025.json
  column?: string | null;
  size?:  number;
  heb?:   boolean;
  /** Align text: "right" (numbers, RTL), "left" (Hebrew text flows naturally). */
  align?: "right" | "left";
}

// ── Route handler ────────────────────────────────────────────────────────────

async function handle(req: NextRequest): Promise<Response> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    return serviceUnavailable(
      "תבנית הטופס אינה זמינה כרגע.",
      "TEMPLATE_MISSING",
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidInput("גוף הבקשה אינו JSON תקין.");
  }
  const parsed = Form135PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidInputFromZod(parsed.error.issues, "פורמט הבקשה אינו תקין.");
  }
  const body = parsed.data;

  try {
    // Zod's parsed output is a structural subset of the app types
    // (insights/actionItems are accepted as `unknown[]` since the PDF doesn't
    // render their internals). Cast back to the canonical types.
    const taxpayer = body.taxpayer as unknown as import("@/types").TaxPayer;
    const financials = body.financials as unknown as import("@/types").FinancialData;

    if (taxpayer.idNumber && !isValidTZ(taxpayer.idNumber)) {
      return invalidInput("מספר תעודת זהות לא תקין — ספרת ביקורת שגויה");
    }

    const calibrate = !!body.calibrate;

    // ── Load template + field map ─────────────────────────────────────────────
    const map: FieldMap = loadFieldMap(FORM_ID);
    const pdfDoc = await PDFDocument.load(fs.readFileSync(TEMPLATE_PATH), { ignoreEncryption: true });
    pdfDoc.registerFontkit(fontkit);

    const fontPath    = fs.existsSync(FONT_TTF) ? FONT_TTF : FONT_WOFF;
    const hebrewFont  = await pdfDoc.embedFont(fs.readFileSync(fontPath), { subset: false });
    const latinBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const latinReg    = await pdfDoc.embedFont(StandardFonts.Helvetica);

    console.log(
      `[form-135] template=${path.basename(TEMPLATE_PATH)} pages=${pdfDoc.getPageCount()} ` +
      `map_codes=${Object.keys(map.fields).length} calibrate=${calibrate}`,
    );

    // ── Build value set ───────────────────────────────────────────────────────
    const vals = buildForm135Fields(taxpayer, financials);

    // Draw-list — each field references the official ITA code. Coordinates
    // resolve from the auto-generated map at draw time.
    const draws: FieldDraw[] = [
      // Personal section (page 2)
      { key: "idPersonal",  text: vals["012"],                code: "012", size: 10, align: "right" },
      { key: "firstName",   text: hebrewForPdf(vals["031"]),  code: "031", size: 10, heb: true, align: "left" },
      { key: "lastName",    text: hebrewForPdf(vals["032"]),  code: "032", size: 10, heb: true, align: "left" },
      { key: "city",        text: hebrewForPdf(vals["022"]),  code: "022", size: 10, heb: true, align: "left" },
      { key: "street",      text: hebrewForPdf(vals["023"]),  code: "023", size: 10, heb: true, align: "left" },
      { key: "houseNumber", text: vals["024"],                code: "024", size: 10, align: "right" },

      // Employment — page 1 (right column = main employer)
      { key: "grossSalary", text: vals["158"],                code: "158", size: 11, align: "right" },
      { key: "taxWithheld", text: vals["042"],                code: "068", size: 11, align: "right" },
      { key: "pension",     text: vals["045"],                code: "258", size: 10, align: "right" },
      // Severance — left column (2nd employer)
      { key: "severance",   text: vals["272"],                code: "272", size: 10, align: "right" },

      // Capital gains — page 1
      { key: "capitalGain", text: vals["256"],                code: "060", size: 11, align: "right" },
      { key: "capitalLoss", text: vals["166"],                code: "067", size: 11, align: "right" },
      { key: "foreignTax",  text: vals["055"],                code: "157", size: 10, align: "right" },

      // Deductions — page 1
      { key: "donations",     text: vals["037"],              code: "078", size: 10, align: "right" },
      { key: "lifeInsurance", text: vals["036"],              code: "126", size: 10, align: "right" },
      { key: "indPension",    text: vals["135"],              code: "142", size: 10, align: "right" },

      // Summary totals (page 2)
      { key: "taxWithheldSummary", text: vals["042"],         code: "042", size: 10, align: "right" },
      { key: "pensionSummary",     text: vals["045"],         code: "045", size: 10, align: "right" },
      { key: "donationsSummary",   text: vals["037"],         code: "037", size: 10, align: "right" },
      { key: "lifeInsSummary",     text: vals["036"],         code: "036", size: 10, align: "right" },

      // Bank (page 2)
      { key: "bankNumber",    text: vals.bank_number,         code: "274", size: 10, align: "right" },
      { key: "branchNumber",  text: vals.branch_number,       code: "273", size: 10, align: "right" },
      { key: "accountNumber", text: vals.account_number,      code: "044", size: 10, align: "right" },
    ];

    const pageHeight = map.page_size.height;
    const drawn: { key: string; code: string; page: number }[] = [];
    const missing: string[] = [];

    for (const d of draws) {
      if (!d.text || d.text === "0") continue;

      const field = findField(map, d.code, d.column);
      if (!field) {
        missing.push(`${d.key}(${d.code})`);
        continue;
      }

      // pdf-lib page index is 0-based; scanner pages are 1-based
      const page   = pdfDoc.getPage(field.page - 1);
      const font: PDFFont = d.heb ? hebrewFont : latinBold;
      const size   = d.size ?? 10;

      // Convert value_box (top-left origin) → pdf-lib (bottom-left) baseline
      const yBaseline = pageHeight - field.value_box.y_bottom + 2;

      // Right-align numeric text inside the value box; left-align Hebrew
      let x = field.value_box.x_left + 2;
      if ((d.align ?? "right") === "right") {
        const width = font.widthOfTextAtSize(d.text, size);
        x = field.value_box.x_right - width - 2;
      }

      try {
        page.drawText(d.text, { x, y: yBaseline, font, size, color: TEXT_COLOR });
        drawn.push({ key: d.key, code: d.code, page: field.page });
      } catch (e) {
        console.warn(`[form-135] field "${d.key}"(${d.code}): ${e instanceof Error ? e.message : e}`);
      }

      if (calibrate) {
        try {
          page.drawText(`→${d.key}:${d.code}`, {
            x:    field.value_box.x_left,
            y:    yBaseline + size + 1,
            font: latinReg,
            size: 6,
            color: CAL_COLOR,
          });
        } catch { /* non-critical */ }
      }
    }

    // ── Tax-year header overlay (not in field-code map — cover + redraw) ──────
    if (vals.taxYear) {
      const page1 = pdfDoc.getPage(0);
      page1.drawRectangle({ x: 191, y: 816, width: 42, height: 14, color: rgb(1, 1, 1), borderWidth: 0 });
      page1.drawText(vals.taxYear, {
        x: 193, y: 820, font: latinBold, size: 10, color: TEXT_COLOR,
      });
    }

    // ── Serialize ─────────────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    const buffer   = Buffer.from(pdfBytes.buffer as ArrayBuffer);

    const mode = calibrate ? "calibration" : "final";
    console.log(`[form-135] ${mode} ${buffer.byteLength}B — drawn=${drawn.length} missing=${missing.length}`);
    if (missing.length) console.log(`[form-135] codes not in map: ${missing.join(", ")}`);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="form_135_${mode}.pdf"`,
        "Content-Length":      String(buffer.byteLength),
        "Cache-Control":       "no-store",
        "X-PDF-Mode":          "overlay-field-mapped",
        "X-PDF-Drawn":         String(drawn.length),
        "X-PDF-Missing":       String(missing.length),
      },
    });

  } catch (err: unknown) {
    console.error("[form-135] Generation failed:", err);
    return internalError(
      "יצירת ה-PDF נכשלה. נסה שוב מאוחר יותר.",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// withRateLimitForUser ∘ withUser — every request must carry a valid Bearer
// ID token AND fall within the per-user/IP quota. Closes F-1, F-2, F1.2.6.
export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "generate-form-135", limit: 30 }),
);
