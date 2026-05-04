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
import { auditLog } from "@/lib/audit/auditEvents";
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

export interface FieldDraw {
  key:    string;        // logical name for logs + calibration labels
  /**
   * The value-key the route reads from `buildForm135Fields(...)`. Stored on
   * the draw entry rather than read inline so the coverage test can validate
   * `DRAW_LIST_135` statically without invoking the engine.
   */
  valueKey: string;
  code:   string;        // 3-digit code in templates/maps/135_2025.json
  column?: string | null;
  size?:  number;
  heb?:   boolean;
  /** Align text: "right" (numbers, RTL), "left" (Hebrew text flows naturally). */
  align?: "right" | "left";
}

/**
 * Static draw-list — every code stamped on Form 135. Phase 0 §0.D expanded
 * this from 24 → ≥30 entries to cover all P0 fields enumerated in
 * audits/generation.md §1.1 (residency, marital, multi-employer secondary
 * tax, dividend, child credit-points). Codes NOT in this list MUST appear
 * either in `EXCLUDED_CODES_135` (with a justification) or in
 * `POSITIONAL_DRAWS_135` (for codes the auto-scanner could not anchor).
 *
 * The `lib/__tests__/form135Coverage.test.ts` regression test enforces this
 * "drawn-or-justified" invariant.
 */
export const DRAW_LIST_135: ReadonlyArray<FieldDraw> = [
  // ── Personal section (page 2) ──────────────────────────────────────────────
  { key: "idPersonal",  valueKey: "012", code: "012", size: 10, align: "right" },
  // 031 / 032 — first/last name. Drawn positionally (see POSITIONAL_DRAWS_135)
  // because the auto-scanner did not detect them as 3-digit codes.
  { key: "city",        valueKey: "022", code: "022", size: 10, heb: true, align: "left" },
  { key: "street",      valueKey: "023", code: "023", size: 10, heb: true, align: "left" },
  { key: "houseNumber", valueKey: "024", code: "024", size: 10, align: "right" },
  // 020 — מצב משפחתי checkbox row (Hebrew label of marital status)
  { key: "maritalStatus", valueKey: "020", code: "020", size: 9, heb: true, align: "left" },
  // 014 — תושב ישראל לכל השנה (כן/לא)
  { key: "residencyYesNo", valueKey: "014", code: "014", size: 10, heb: true, align: "left" },

  // ── Employment — page 1 (right column = main employer) ────────────────────
  { key: "grossSalary", valueKey: "158", code: "158", size: 11, align: "right" },
  { key: "taxWithheld", valueKey: "042", code: "068", size: 11, align: "right" },
  { key: "pension",     valueKey: "045", code: "258", size: 10, align: "right" },
  // Severance — left column (2nd employer)
  { key: "severance",   valueKey: "272", code: "272", size: 10, align: "right" },
  // 069 — מס שנוכה — מעסיק שני (left column)
  { key: "taxWithheld2nd", valueKey: "069", code: "069", size: 11, align: "right" },
  // 086 — מענק פטור (סעיף 9(7א)) on page 2
  { key: "exemptGrant", valueKey: "086", code: "086", size: 10, align: "right" },

  // ── Capital gains — page 1/3 ──────────────────────────────────────────────
  { key: "capitalGain", valueKey: "256", code: "060", size: 11, align: "right" },
  { key: "capitalLoss", valueKey: "166", code: "067", size: 11, align: "right" },
  { key: "foreignTax",  valueKey: "055", code: "157", size: 10, align: "right" },
  // 117 — דיבידנד (page 2)
  { key: "dividends", valueKey: "117", code: "117", size: 10, align: "right" },
  // 124 — ריבית ני"ע סחירים (page 2). Engine surfaces "" today; keep the
  // draw entry so future IBKR-parser splits land here without a route change.
  { key: "securitiesInterest", valueKey: "124", code: "124", size: 10, align: "right" },

  // ── Deductions — page 1 ───────────────────────────────────────────────────
  { key: "donations",     valueKey: "037", code: "078", size: 10, align: "right" },
  { key: "lifeInsurance", valueKey: "036", code: "126", size: 10, align: "right" },
  { key: "indPension",    valueKey: "135", code: "142", size: 10, align: "right" },

  // ── Credit-points — page 2 ────────────────────────────────────────────────
  // 245 — ילדים (count of credit-points)
  { key: "childCreditPoints", valueKey: "245", code: "245", size: 10, align: "right" },

  // ── Summary totals (page 2) ───────────────────────────────────────────────
  { key: "taxWithheldSummary", valueKey: "042", code: "042", size: 10, align: "right" },
  { key: "pensionSummary",     valueKey: "045", code: "045", size: 10, align: "right" },
  { key: "donationsSummary",   valueKey: "037", code: "037", size: 10, align: "right" },
  { key: "lifeInsSummary",     valueKey: "036", code: "036", size: 10, align: "right" },

  // ── Bank (page 2) ─────────────────────────────────────────────────────────
  { key: "bankNumber",    valueKey: "bank_number",    code: "274", size: 10, align: "right" },
  { key: "branchNumber",  valueKey: "branch_number",  code: "273", size: 10, align: "right" },
  { key: "accountNumber", valueKey: "account_number", code: "044", size: 10, align: "right" },
];

/**
 * Positional draws — fields the user must see on the form whose anchor codes
 * are NOT present in the auto-generated `templates/maps/135_2025.json` (the
 * code label was filtered as a section reference, or the cell has no printed
 * code at all — e.g. signature line, declaration checkbox, aliyah-date row).
 *
 * Coordinates calibrated against `public/templates/form135_2025.pdf` page-by-
 * page using `data/form135_2025_fields.json`'s offset rules. These coords
 * MUST be verified against any new annual template revision.
 *
 * Each entry's `valueKey` is read from `buildForm135Fields(...)` output.
 */
export interface PositionalDraw {
  key: string;
  valueKey: string;
  /** ITA code the field corresponds to (for documentation + test cross-ref). */
  code: string;
  /** pdf-lib 0-indexed page. */
  page: number;
  /** pdf-lib bottom-left x. */
  x: number;
  /** pdf-lib bottom-left y. */
  y: number;
  size?: number;
  heb?: boolean;
  /** Set to true if the value is a Hebrew word/phrase needing reversal. */
  reverse?: boolean;
}

export const POSITIONAL_DRAWS_135: ReadonlyArray<PositionalDraw> = [
  // 031 / 032 — name fields. The auto-scanner did not detect a 3-digit "031"
  // or "032" near the value-boxes (the form labels them with Hebrew "שם פרטי"
  // / "שם משפחה" only); coordinates source: data/form135_2025_fields.json
  // (manually calibrated). Phase 1 §1.D will re-run the build script with
  // an expanded label-detection pass.
  { key: "firstName031", valueKey: "031", code: "031", page: 0, x: 435, y: 647, size: 9, heb: true, reverse: true },
  { key: "lastName032",  valueKey: "032", code: "032", page: 0, x: 295, y: 671, size: 9, heb: true, reverse: true },

  // 013 — מספר זהות בן/בת זוג. Auto-scan denylisted "013" because it appears
  // in the form's section-numbering header. Place to the LEFT of code 012's
  // value-box on page 2 (the 2025 form prints the spouse-ID box immediately
  // adjacent to the taxpayer-ID box).
  { key: "spouseId013", valueKey: "013", code: "013", page: 1, x: 165, y: 540, size: 10 },

  // 015 — תאריך עליה (DD/MM/YYYY). Page 2 residency row.
  { key: "aliyahDate015", valueKey: "aliyahDate", code: "015", page: 1, x: 50, y: 56, size: 9 },

  // 016 — תושב יישוב מזכה. Page 2 residency-row checkbox.
  { key: "peripheryFlag016", valueKey: "peripheryFlag", code: "016", page: 1, x: 280, y: 56, size: 10 },

  // 119 — זיכוי בגין בן/בת זוג (count). The 2025 form's credit-points panel
  // lacks an extracted code-rect for this slot; positional draw on page 2.
  { key: "spouseCredit119", valueKey: "spouseCreditPoints", code: "119", page: 1, x: 305, y: 360, size: 9 },

  // Signature block (page 4) — text only, NOT a digital signature. Phase 0
  // delivers a printed name + date in the signature line so SHAAM intake
  // does not flag the form as unsigned. Coordinates per the 2025 template
  // bottom-of-page-4 signature row.
  { key: "signatureName_p4", valueKey: "signatureName", code: "signature-block", page: 3, x: 100, y: 80, size: 10, heb: true, reverse: true },
  { key: "signatureDate_p4", valueKey: "signatureDate", code: "signature-block", page: 3, x: 280, y: 80, size: 10 },

  // Declaration checkbox (page 4) — "אני מצהיר שכל הפרטים נכונים…". Stamp X.
  { key: "declarationMark_p4", valueKey: "declarationMark", code: "declaration-checkbox", page: 3, x: 470, y: 110, size: 12 },
];

/**
 * Codes that exist in `templates/maps/135_2025.json` but are intentionally NOT
 * stamped at runtime. Each entry MUST carry a one-line justification for the
 * coverage test to accept it. Add new exclusions sparingly and prefer adding
 * to `DRAW_LIST_135` over expanding this list.
 *
 * Categories:
 *  - "spouse-column": spouse-attributed mirrors of taxpayer fields. Phase 0
 *    only fills the taxpayer-side; spouse data populates the
 *    `_registered_spouse` / `_spouse` keyed entries. Phase 1 §1.A wires these.
 *  - "computation-row": form rows the ITA scanner fills server-side from the
 *    primary fields (e.g. tax-after-credits subtotals on page 2).
 *  - "phase-1": fields planned but out-of-scope for Phase 0.
 *  - "form-internal": codes that are ITA-scanner-only / SHAAM-internal.
 */
export const EXCLUDED_CODES_135: Readonly<Record<string, string>> = {
  // Spouse column mirrors (column-keyed; Phase 1 §1.A spouse-side)
  "026_registered_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "026_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "040_registered_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "040_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "042_registered_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "042_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "043_registered_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "043_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "260_registered_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "260_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "332_registered_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",
  "332_spouse": "spouse-column — Phase 1 §1.A spouse-data plumbing",

  // Computation rows / sub-totals (ITA scanner derives from primary fields)
  "109": "computation-row — page-2 tax-after-credits subtotal, derived",
  "111": "computation-row — page-2 calc subtotal, derived",
  "112": "computation-row — page-2 calc subtotal, derived",
  "113": "computation-row — page-2 calc subtotal, derived",
  "139": "computation-row — page-2 calc subtotal, derived",
  "140": "computation-row — page-2 calc subtotal, derived",
  "180": "computation-row — page-2 capital-gain subtotal, derived",
  "183": "computation-row — page-2 sub-total, derived",
  "206": "computation-row — page-2 sub-total, derived",
  "232": "computation-row — page-2 sub-total, derived",
  "237": "computation-row — page-2 sub-total, derived",
  "240": "computation-row — page-2 sub-total, derived",
  "268": "computation-row — page-2 sub-total, derived",
  "269": "computation-row — page-2 sub-total, derived",
  "287": "computation-row — page-2 sub-total, derived",
  "295": "computation-row — page-2 sub-total, derived",
  "296": "computation-row — page-2 sub-total, derived",
  "307": "computation-row — page-2 sub-total, derived",
  "309": "computation-row — page-2 sub-total, derived",
  "324": "computation-row — page-2 sub-total, derived",
  "327": "computation-row — page-2 sub-total, derived",

  // Page-3 / page-4 derived totals (ITA scanner / page-1 cross-check)
  "050": "computation-row — page-3 capital-gain net subtotal",
  "054": "computation-row — page-4 sub-total",
  "141": "phase-1 — Form 1301 'הכנסות אחרות' code; out-of-scope for 135",
  "167": "computation-row — page-3 sub-total, derived",
  "207": "computation-row — page-4 sub-total, derived",
  "209": "computation-row — page-4 sub-total, derived",
  "222": "computation-row — page-3 sub-total, derived",
  "227": "computation-row — page-3 sub-total, derived",
  "256": "computation-row — page-4 capital-gain duplicate (drawn at code 060)",
  "335": "phase-1 — total deductions sub-total, computed by ITA scanner",
  "294": "computation-row — page-4 sub-total, derived",
  "166": "computation-row — page-4 capital-loss duplicate (drawn at code 067)",
  "277": "phase-1 — page-3 spouse ID duplicate (drawn positionally as 013)",
  "278": "phase-1 — page-3 taxpayer ID duplicate (drawn at code 012)",

  // Phase-1 / out-of-scope fields
  "026": "phase-1 — marital-status checkbox sub-row (root); primary marital label drawn at code 020",
  "010": "phase-1 — phone (home) capture; Phase 1 §1.A questionnaire add",
  "011": "phase-1 — phone (mobile) capture; Phase 1 §1.A questionnaire add",
  "021": "phase-1 — birthDate field; Phase 1 §1.A questionnaire add",
  "028": "phase-1 — alternate residency reason; Phase 1 §1.A",
  "029": "phase-1 — alternate residency reason; Phase 1 §1.A",
  "030": "phase-1 — pension type subdivision",
  "038": "phase-1 — credit-point sub-classification box",
  "040": "phase-1 — page-4 spouse credit-points footer",
  "043": "phase-1 — page-4 spouse-side footer",
  "081": "phase-1 — life-insurance sub-classification",
  "082": "phase-1 — pension sub-classification",
  "088": "phase-1 — page-2 footer Yes/No row",
  "089": "phase-1 — page-2 footer Yes/No row",
  "093": "phase-1 — page-2 footer Yes/No row",
  "096": "phase-1 — page-2 footer Yes/No row",
  "129": "phase-1 — page-2 alternate-income sub-row",
  "132": "phase-1 — page-2 alternate-income sub-row",
  "153": "phase-1 — page-2 alternate-income sub-row",
  "170": "phase-1 — page-1 secondary-employer column gross",
  "172": "phase-1 — page-1 secondary-employer column gross (multi-employer 135)",
  "182": "phase-1 — page-2 alternate-income sub-row",
  "190": "phase-1 — page-2 partial-year months",
  "193": "phase-1 — page-2 sub-row",
  "194": "phase-1 — page-1 secondary-employer pension",
  "196": "phase-1 — page-1 secondary-employer pension",
  "213": "phase-1 — page-1 deductions sub-row",
  "235": "phase-1 — page-2 footer",
  "236": "phase-1 — page-2 footer",
  "244": "phase-1 — קה\"ש פטורה (Form 106 expansion needed)",
  "248": "phase-1 — קה\"ש חייבת חלק מעסיק (Form 106 expansion needed)",
  "249": "phase-1 — קה\"ש חייבת חלק עובד (Form 106 expansion needed)",
  "250": "phase-1 — page-1 secondary-employer net",
  "262": "phase-1 — page-2 sub-row",
  "270": "phase-1 — page-1 secondary-employer net",
  "291": "phase-1 — page-2 sub-row",
  "313": "phase-1 — page-1 deductions sub-row",
  "332": "phase-1 — page-2/4 footer",
  "361": "phase-1 — page-2 sub-row",
  "362": "phase-1 — page-2 sub-row",

  // SHAAM-internal / form-internal codes
  "837": "form-internal — SHAAM scanner reference, never stamped by filer",
  "858": "form-internal — SHAAM scanner reference, never stamped by filer",
};

// ── Route handler ────────────────────────────────────────────────────────────

async function handle(req: NextRequest, ctx: { uid: string; requestId: string }): Promise<Response> {
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

    // Helper: resolve a draw's text from the buildForm135Fields output. The
    // valueKey indirection lets the coverage test validate the draw-list
    // structure without invoking the engine.
    const valueFor = (
      key: string,
      heb: boolean | undefined,
    ): string => {
      const v = (vals as unknown as Record<string, string | undefined>)[key] ?? "";
      return heb ? hebrewForPdf(v) : v;
    };

    const pageHeight = map.page_size.height;
    const drawn: { key: string; code: string; page: number }[] = [];
    const missing: string[] = [];

    // ── Coordinate-anchored draws (resolved through the field-code map) ──────
    for (const d of DRAW_LIST_135) {
      const text = valueFor(d.valueKey, d.heb);
      if (!text || text === "0") continue;

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
        const width = font.widthOfTextAtSize(text, size);
        x = field.value_box.x_right - width - 2;
      }

      try {
        page.drawText(text, { x, y: yBaseline, font, size, color: TEXT_COLOR });
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

    // ── Positional draws (codes the auto-scanner could not anchor) ────────────
    // These codes are not in the field-code map (013/015/016/119) or are
    // page-4 signature/declaration overlays. Coordinates are calibrated
    // against the 2025 template; verify before adopting a new annual PDF.
    for (const p of POSITIONAL_DRAWS_135) {
      const raw = valueFor(p.valueKey, p.reverse);
      if (!raw) continue;
      if (p.page < 0 || p.page >= pdfDoc.getPageCount()) continue;

      const page = pdfDoc.getPage(p.page);
      const font: PDFFont = p.heb ? hebrewFont : latinBold;
      const size = p.size ?? 10;
      try {
        page.drawText(raw, { x: p.x, y: p.y, font, size, color: TEXT_COLOR });
        drawn.push({ key: p.key, code: p.code, page: p.page + 1 });
      } catch (e) {
        console.warn(`[form-135] positional "${p.key}"(${p.code}): ${e instanceof Error ? e.message : e}`);
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

    if (!calibrate) {
      void auditLog({
        uid: ctx.uid,
        requestId: ctx.requestId,
        action: "form_135_generated",
        metadata: { bytes: buffer.byteLength, drawn: drawn.length, missing: missing.length },
      });
    }

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
