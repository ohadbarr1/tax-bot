/**
 * POST /api/parse/form-106
 *
 * Accepts a multipart/form-data upload of a Form 106 (Israeli employer annual
 * salary summary) as PDF or image. For PDFs, extracts embedded text via
 * pdf-parse (Node-compatible wrapper around pdfjs-dist legacy build — the
 * stock pdfjs-dist v5+ ESM entry crashes in Node with "DOMMatrix is not
 * defined"). For images (JPG/PNG/TIFF), runs Tesseract.js Hebrew + English OCR.
 *
 * Supported inputs:
 *   • PDF  — text extracted via pdf-parse (all pages)
 *   • Image — JPG, PNG, TIFF (Tesseract OCR)
 *
 * Field extraction strategy (Phase 1 §1.C):
 *   Two layout-aware extractors live in `lib/form106Parser.ts` — line-per-
 *   field (Phoenix/Hilan) and columnar (university תוסף 106). The route runs
 *   both and validates the merged result against `Form106ExtractedSchema`
 *   (Zod). The full canonical ITA-code set is extracted now, not just the
 *   original 3 — closes ingestion-F-1 (3-of-14) and ingestion-F-2 (158-vs-158
 *   silent ambiguity).
 *
 * Fields returned (legacy + new):
 *   - employerName, monthsWorked
 *   - 158 (regular) → grossSalary
 *   - 158 (תיאום)  → field158Coordinated   ← F-2 fix
 *   - 042 → taxWithheld
 *   - 045 → pensionDeduction
 *   - 086 → nationalInsuranceWithheld
 *   - 219/218 → studyFundSalary / studyFundEmployer
 *   - 245/244 → pensionInsuredSalary / severanceMargin
 *   - 249/248 → employerPensionTotal / employerPensionDeduct
 *   - 272 → severanceTaxable
 *   - 037 → employerDonations
 *   - 044 → creditPointsValue / creditPointsCount
 *   - 004 → taxFileNumber
 *   - 033 → incomeType
 *   - 089/090 → exemptionSection9a / exemptionSection9b
 *
 * Fallback: If a field isn't found, the field is omitted from the response
 * (client handles missing fields gracefully).
 */

import { NextRequest, NextResponse } from "next/server";
import type { Form106ParseResponse } from "@/types";
import path from "path";
import { extractForm106Fields } from "@/lib/form106Parser";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploadLimits";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  Form106UploadMetaSchema,
  form106ExtensionAccepted,
  Form106ExtractedSchema,
} from "@/lib/api/schemas/parse";

// Accepted MIME types now live in lib/api/schemas/parse.ts
// (form106ExtensionAccepted helper).

// Field extraction lives in `lib/form106Parser.ts` — handles both line-per-
// field (Phoenix/Hilan) and columnar (university "תוסף 106") layouts and is
// covered by golden tests in `lib/__tests__/form106Parser.test.ts`.

// ─── PDF text extraction ──────────────────────────────────────────────────────

/**
 * pdfjs-dist v5+ (bundled by pdf-parse v2) evaluates `DOMMatrix`, `ImageData`,
 * and `Path2D` at module-load time. Node.js has none of these; in a local dev
 * server the references are lazy enough that text extraction works, but on
 * Firebase App Hosting Next.js loads the externalized package through a
 * wrapper that throws `ReferenceError: DOMMatrix is not defined` *at import*,
 * before we ever call getText(). Install minimal stubs — text extraction never
 * invokes methods on these, so empty classes are sufficient.
 */
function installPdfjsDomStubs(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = class {};
  if (typeof g.ImageData === "undefined") g.ImageData = class {};
  if (typeof g.Path2D    === "undefined") g.Path2D    = class {};
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  installPdfjsDomStubs();

  // pdf-parse v2 bundles pdfjs-dist's Node build internally. See stub
  // explanation above for why we must install browser-global shims first.
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// ─── Image OCR ───────────────────────────────────────────────────────────────

async function runImageOcr(fileBuffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");

  const langPath = path.join(
    process.cwd(),
    "node_modules",
    "tesseract.js-core"
  );

  const worker = await createWorker(["heb", "eng"], 1, {
    corePath: langPath,
    logger: () => {},
  });

  try {
    const { data } = await worker.recognize(fileBuffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

async function handle(
  request: NextRequest,
): Promise<NextResponse<Form106ParseResponse>> {
  // 1. Extract file from multipart
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "פורמט הבקשה אינו תקין." },
      { status: 400 },
    );
  }
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      {
        success: false,
        error: "לא סופק קובץ. אנא בחר קובץ PDF או תמונה של טופס 106.",
      },
      { status: 400 }
    );
  }

  // 2. Validate metadata via Zod (size + name length)
  const metaParsed = Form106UploadMetaSchema.safeParse({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (!metaParsed.success) {
    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: "הקובץ שהועלה ריק. אנא נסה שוב עם קובץ תקין." },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: `הקובץ חורג מהמגבלה של ${MAX_UPLOAD_LABEL}.` },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { success: false, error: "מטא-נתוני הקובץ אינם תקינים." },
      { status: 400 },
    );
  }

  // 3. Validate extension
  if (!form106ExtensionAccepted(file.name)) {
    return NextResponse.json(
      {
        success: false,
        error: "סוג קובץ לא נתמך. יש להעלות קובץ PDF, JPG, PNG, או TIFF.",
      },
      { status: 400 }
    );
  }

  const fileName = file.name.toLowerCase();

  // 4. Extract text
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let ocrText: string;

    if (fileName.endsWith(".pdf")) {
      // Digital PDF → extract embedded text (much more reliable than OCR on PDF)
      const pdfText = await extractTextFromPdf(buffer);
      if (pdfText.replace(/\s+/g, "").length < 100) {
        // Image-only PDF — fall back to Tesseract
        ocrText = await runImageOcr(buffer);
      } else {
        ocrText = pdfText;
      }
    } else {
      // Scanned image → Tesseract OCR
      ocrText = await runImageOcr(buffer);
    }

    const fields = extractForm106Fields(ocrText);

    // Validate the extracted-fields shape via Zod. The schema is intentionally
    // permissive (every field optional) — its job is to catch type drift and
    // out-of-range values (e.g. negative salaries, malformed taxFileNumber).
    // On schema-violation, fail soft: log + drop to legacy 5-field response.
    const parsed = Form106ExtractedSchema.safeParse(fields);
    if (!parsed.success) {
      console.error(
        "[form-106] Form106ExtractedSchema rejected parser output:",
        parsed.error.issues,
      );
    }
    const safe = parsed.success ? parsed.data : {};

    // Closes ingestion-F-1 (only 3/14 fields parsed) and F-2 (158-vs-158
    // ambiguity) — every canonical Form 106 ITA code is now in the response.
    return NextResponse.json<Form106ParseResponse>({
      success: true,
      data: {
        // Legacy fields — back-compat with existing FileDropzone consumer.
        employerName:     safe.employerName     ?? fields.employerName     ?? "",
        monthsWorked:     safe.monthsWorked     ?? fields.monthsWorked     ?? 12,
        grossSalary:      safe.grossSalary      ?? fields.grossSalary      ?? 0,
        taxWithheld:      safe.taxWithheld      ?? fields.taxWithheld      ?? 0,
        pensionDeduction: safe.pensionDeduction ?? fields.pensionDeduction ?? 0,

        // Phase 1 §1.C — new canonical fields (optional; absent = not parsed).
        field158Coordinated:       safe.field158Coordinated,
        nationalInsuranceWithheld: safe.nationalInsuranceWithheld,
        studyFundSalary:           safe.studyFundSalary,
        studyFundEmployer:         safe.studyFundEmployer,
        pensionInsuredSalary:      safe.pensionInsuredSalary,
        severanceMargin:           safe.severanceMargin,
        employerPensionTotal:      safe.employerPensionTotal,
        employerPensionDeduct:     safe.employerPensionDeduct,
        severanceTaxable:          safe.severanceTaxable,
        employerDonations:         safe.employerDonations,
        creditPointsValue:         safe.creditPointsValue,
        creditPointsCount:         safe.creditPointsCount,
        taxFileNumber:             safe.taxFileNumber,
        incomeType:                safe.incomeType,
        exemptionSection9a:        safe.exemptionSection9a,
        exemptionSection9b:        safe.exemptionSection9b,
      },
    });
  } catch (err: unknown) {
    console.error("[form-106] Parse failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: `שגיאה בעיבוד הקובץ: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}

// Auth + rate-limit. Closes F-1, F-2, F1.2.3.
export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "parse-form-106", limit: 20 }),
);
