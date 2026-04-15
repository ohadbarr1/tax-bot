import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { DocMineResponse, VaultDocType, MinedField, ProvenanceConfidence } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ERROR_MISSING_KEY = "שירות הזיהוי אינו זמין כרגע.";
const ERROR_PARSE = "לא הצלחנו לקרוא את המסמך. נסה שוב או מלא ידנית.";
const ERROR_TOO_BIG = "הקובץ גדול מדי (עד 10MB).";
const MAX_BYTES = 10 * 1024 * 1024;

// Claude vision schema — flat, NO nullables and NO optionals. Anthropic's
// tool-grammar compiler caps structured outputs at 24 optional parameters
// AND 16 union-typed parameters (nullable counts as a union). Flat string/
// number fields with sentinel "unknowns" keep both counts at zero. Missing
// strings come back as "" and missing numbers as -1; toMinedFields() filters
// those before they reach the app state.
const UNKNOWN_NUM = -1;
const MinedShape = z.object({
  detectedType: z.enum([
    "form106",
    "form135",
    "form867",
    "ibkr",
    "pension",
    "receipt",
    "bank_statement",
    "rsu_grant",
    "rental_contract",
    "other",
  ]),
  summary: z.string().max(200),
  idNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  addressCity: z.string(),
  addressStreet: z.string(),
  addressHouseNumber: z.string(),
  bankId: z.string(),
  bankName: z.string(),
  bankBranch: z.string(),
  bankAccount: z.string(),
  employerName: z.string(),
  grossSalary: z.number(),
  taxWithheld: z.number(),
  pensionDeduction: z.number(),
  monthsWorked: z.number(),
  cgRealizedProfit: z.number(),
  cgRealizedLoss: z.number(),
  cgForeignTaxWithheld: z.number(),
  cgDividends: z.number(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

type MinedShape = z.infer<typeof MinedShape>;

const SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive a single image or PDF of a tax document (usually in Hebrew, sometimes mixed English/Hebrew). Your job is to extract the fields defined in the output schema and return them as JSON.

Rules:
1. Extract ONLY values you can read directly from the document. Never guess or synthesize.
2. For numeric fields, return plain integers (no thousand separators, no currency symbols). All amounts are in ILS (₪) unless the document is from Interactive Brokers, in which case convert USD→ILS using an implicit 3.6 rate — but prefer returning -1 if uncertain about the currency.
3. UNKNOWN VALUES — the schema has no nullable fields. For any field you cannot read:
   - String fields → return an empty string "".
   - Number fields → return -1.
   Do NOT fabricate or guess values just to fill the field.
4. "overallConfidence" — one of "high"/"medium"/"low" reflecting your overall read of the document.
5. "detectedType" — pick the type that best matches:
   - "form106": Israeli annual salary slip (טופס 106) from an employer. Header usually says "טופס 106 - ריכוז משכורת ונכויים".
   - "form867": Israeli bank/broker annual tax statement for capital gains.
   - "ibkr": Interactive Brokers activity statement (English, tables of trades).
   - "pension": a monthly or annual pension/קצבה slip from a pension fund.
   - "rental_contract": a lease / rental contract.
   - "form135": תאום מס / Israeli refund form 135 itself.
   - Otherwise pick the closest match or "other".
6. "summary" — one short Hebrew sentence for the advisor nudge rail. Example: "מצאתי טופס 106 ממעסיק 'חברת דוגמה' עם ברוטו 120,000 ₪ ל-12 חודשים."
7. Do not translate Hebrew names. Keep them in Hebrew.
8. Never output commentary, markdown, or anything outside the structured fields.`;

function normalizeConfidence(c: unknown): ProvenanceConfidence {
  return c === "high" || c === "medium" || c === "low" ? c : "medium";
}

/**
 * Flatten the mining result into MinedField entries with target state paths.
 * Sentinel filter: "" (string) and -1 (number) mean "model couldn't read it".
 */
function toMinedFields(mined: MinedShape): MinedField[] {
  const out: MinedField[] = [];
  const conf = normalizeConfidence(mined.overallConfidence);
  const pushStr = (fieldPath: string, value: string) => {
    if (!value || value.trim() === "") return;
    out.push({ fieldPath, value, confidence: conf });
  };
  const pushNum = (fieldPath: string, value: number) => {
    if (value === UNKNOWN_NUM || Number.isNaN(value)) return;
    out.push({ fieldPath, value, confidence: conf });
  };
  const pushBool = (fieldPath: string, value: boolean) => {
    out.push({ fieldPath, value, confidence: conf });
  };
  const pushAny = (fieldPath: string, value: string) => {
    out.push({ fieldPath, value, confidence: conf });
  };

  // Identity
  pushStr("taxpayer.idNumber", mined.idNumber);
  pushStr("taxpayer.firstName", mined.firstName);
  pushStr("taxpayer.lastName", mined.lastName);
  if (mined.firstName && mined.lastName) {
    pushStr("taxpayer.fullName", `${mined.firstName} ${mined.lastName}`);
  }

  // Address
  pushStr("taxpayer.address.city", mined.addressCity);
  pushStr("taxpayer.address.street", mined.addressStreet);
  pushStr("taxpayer.address.houseNumber", mined.addressHouseNumber);

  // Bank
  pushStr("taxpayer.bank.bankId", mined.bankId);
  pushStr("taxpayer.bank.bankName", mined.bankName);
  pushStr("taxpayer.bank.branch", mined.bankBranch);
  pushStr("taxpayer.bank.account", mined.bankAccount);

  // Employer — written as first employer in the array. Only emit if we have
  // at least a name or a salary figure, otherwise the consolidation pass
  // ends up with an empty shell employer.
  const hasEmployer =
    mined.employerName.trim() !== "" ||
    mined.grossSalary !== UNKNOWN_NUM ||
    mined.taxWithheld !== UNKNOWN_NUM;
  if (hasEmployer) {
    pushAny("taxpayer.employers[0].id", `employer-${Date.now()}`);
    pushStr("taxpayer.employers[0].name", mined.employerName);
    pushBool("taxpayer.employers[0].isMainEmployer", true);
    pushNum("taxpayer.employers[0].monthsWorked", mined.monthsWorked);
    pushNum("taxpayer.employers[0].grossSalary", mined.grossSalary);
    pushNum("taxpayer.employers[0].taxWithheld", mined.taxWithheld);
    pushNum("taxpayer.employers[0].pensionDeduction", mined.pensionDeduction);
  }

  // Capital gains
  pushNum("taxpayer.capitalGains.totalRealizedProfit", mined.cgRealizedProfit);
  pushNum("taxpayer.capitalGains.totalRealizedLoss", mined.cgRealizedLoss);
  pushNum("taxpayer.capitalGains.foreignTaxWithheld", mined.cgForeignTaxWithheld);
  pushNum("taxpayer.capitalGains.dividends", mined.cgDividends);

  return out;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ success: false, error: ERROR_MISSING_KEY }, 501);
  }

  const form = await safeFormData(request);
  if (!form) return json({ success: false, error: ERROR_PARSE }, 400);

  const file = form.get("file");
  if (!(file instanceof File)) return json({ success: false, error: ERROR_PARSE }, 400);
  if (file.size > MAX_BYTES) return json({ success: false, error: ERROR_TOO_BIG }, 413);

  const hintedType = (form.get("type") as VaultDocType | null) ?? undefined;

  let bytes: ArrayBuffer;
  let mediaType: string;
  try {
    ({ bytes, mediaType } = await loadAndMaybeConvert(file));
  } catch (err) {
    console.error("[mine/document] preprocessing failed:", err);
    return json({ success: false, error: ERROR_PARSE }, 400);
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Claude vision accepts PDFs via the `file` content part (NOT `image`). Mixing
  // them up returns an opaque schema error and the user sees "can't read it".
  // Images still go through the `image` part.
  const isPdf = mediaType === "application/pdf";
  const filePart = isPdf
    ? ({
        type: "file" as const,
        data: new Uint8Array(bytes),
        mediaType,
      })
    : ({
        type: "image" as const,
        image: new Uint8Array(bytes),
        mediaType,
      });

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: MinedShape,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: hintedType
                ? `The user uploaded this file and labeled it as "${hintedType}". Extract all supported fields.`
                : `Extract all supported fields from this document.`,
            },
            filePart,
          ],
        },
      ],
      maxOutputTokens: 2048,
    });

    const fields = toMinedFields(object);

    const response: DocMineResponse = {
      success: true,
      data: {
        detectedType: object.detectedType,
        fields,
        summary: object.summary && object.summary.trim() !== "" ? object.summary : undefined,
        backend: "claude-vision",
      },
    };
    return json(response, 200);
  } catch (err) {
    console.error("[mine/document] generateObject failed:", err);
    const debug = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: `${ERROR_PARSE} (${debug})` }, 500);
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

/**
 * Claude vision accepts image/{jpeg,png,gif,webp} and application/pdf — no
 * HEIC. iOS users routinely upload HEIC straight from Photos, so we detect
 * those (by mime OR by extension OR by magic bytes) and transcode to JPEG
 * server-side via heic-convert (pure JS, no native deps).
 *
 * Other image types / PDFs pass through untouched.
 */
async function loadAndMaybeConvert(
  file: File
): Promise<{ bytes: ArrayBuffer; mediaType: string }> {
  const raw = await file.arrayBuffer();
  const declared = normalizeMediaType(file.type, file.name);

  const isHeic =
    declared === "image/heic" ||
    declared === "image/heif" ||
    looksLikeHeic(raw);

  if (!isHeic) return { bytes: raw, mediaType: declared };

  // Dynamic import so cold starts that never see a HEIC don't pay the cost.
  // heic-convert has no types — pin the signature we use.
  type HeicConvertArgs = { buffer: Uint8Array; format: "JPEG" | "PNG"; quality?: number };
  type HeicConvert = (args: HeicConvertArgs) => Promise<ArrayBuffer | Uint8Array>;
  const mod = (await import("heic-convert")) as unknown as { default: HeicConvert };
  const heicConvert = mod.default;

  const jpeg = await heicConvert({
    buffer: new Uint8Array(raw),
    format: "JPEG",
    quality: 0.92,
  });
  const jpegU8 = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
  // Re-slice to a clean ArrayBuffer so downstream consumers don't see the
  // original HEIC backing store behind the view.
  const jpegBuf = jpegU8.buffer.slice(jpegU8.byteOffset, jpegU8.byteOffset + jpegU8.byteLength) as ArrayBuffer;
  return { bytes: jpegBuf, mediaType: "image/jpeg" };
}

function normalizeMediaType(mime: string, name: string): string {
  if (mime && mime !== "application/octet-stream") return mime;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "application/octet-stream";
}

/**
 * HEIC files are ISOBMFF containers — bytes 4..8 are "ftyp" and the next
 * 4 bytes encode the brand. Detect the common HEIC brands even when the
 * browser reports a generic mime (Safari sometimes sends empty/wrong mime).
 */
function looksLikeHeic(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const view = new Uint8Array(buf, 0, 12);
  const ftyp = String.fromCharCode(view[4], view[5], view[6], view[7]);
  if (ftyp !== "ftyp") return false;
  const brand = String.fromCharCode(view[8], view[9], view[10], view[11]);
  return (
    brand === "heic" ||
    brand === "heix" ||
    brand === "mif1" ||
    brand === "msf1" ||
    brand === "heis" ||
    brand === "hevc" ||
    brand === "hevx"
  );
}
