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
 * Field extraction strategy:
 *   Regex patterns match the field number followed by a numeric value nearby.
 *   Fields targeted: 158 (gross), 042 (tax withheld), 045 (pension).
 *   Patterns require word boundaries to avoid false matches on longer numbers.
 *
 * Fallback: If a field isn't found, the field is omitted from the response
 * (client handles missing fields gracefully).
 */

import { NextRequest, NextResponse } from "next/server";
import type { Form106ParseResponse } from "@/types";
import path from "path";
import { extractForm106Fields } from "@/lib/form106Parser";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploadLimits";

// Accepted MIME types
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"];

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

export async function POST(
  request: NextRequest
): Promise<NextResponse<Form106ParseResponse>> {
  // 1. Extract file from multipart
  const formData = await request.formData();
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

  // 2. Validate extension
  const fileName = file.name.toLowerCase();
  const isAccepted = ACCEPTED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  if (!isAccepted) {
    return NextResponse.json(
      {
        success: false,
        error: "סוג קובץ לא נתמך. יש להעלות קובץ PDF, JPG, PNG, או TIFF.",
      },
      { status: 400 }
    );
  }

  // 3. Confirm non-empty and within limit
  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: "הקובץ שהועלה ריק. אנא נסה שוב עם קובץ תקין." },
      { status: 400 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { success: false, error: `הקובץ חורג מהמגבלה של ${MAX_UPLOAD_LABEL}.` },
      { status: 413 }
    );
  }

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

    return NextResponse.json<Form106ParseResponse>({
      success: true,
      data: {
        employerName:     fields.employerName     ?? "",
        monthsWorked:     fields.monthsWorked     ?? 12,
        grossSalary:      fields.grossSalary      ?? 0,
        taxWithheld:      fields.taxWithheld      ?? 0,
        pensionDeduction: fields.pensionDeduction ?? 0,
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
