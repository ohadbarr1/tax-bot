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

// Claude vision schema — every field is required-with-null rather than
// `optional()` because Anthropic's tool-grammar compiler caps structured
// outputs at 24 optional parameters, and this schema originally had 31.
// `nullable()` does not count against the limit: the model must always
// emit the key, but may return `null` for unknowns.
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
  summary: z.string().max(200).nullable(),
  taxpayer: z
    .object({
      idNumber: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      address: z
        .object({
          city: z.string().nullable(),
          street: z.string().nullable(),
          houseNumber: z.string().nullable(),
        })
        .nullable(),
      bank: z
        .object({
          bankId: z.string().nullable(),
          bankName: z.string().nullable(),
          branch: z.string().nullable(),
          account: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable(),
  employer: z
    .object({
      name: z.string().nullable(),
      grossSalary: z.number().nullable(),
      taxWithheld: z.number().nullable(),
      pensionDeduction: z.number().nullable(),
      monthsWorked: z.number().nullable(),
    })
    .nullable(),
  capitalGains: z
    .object({
      totalRealizedProfit: z.number().nullable(),
      totalRealizedLoss: z.number().nullable(),
      foreignTaxWithheld: z.number().nullable(),
      dividends: z.number().nullable(),
    })
    .nullable(),
  /** Per-field confidence tiers — model picks one of three. */
  confidence: z
    .object({
      identity: z.enum(["high", "medium", "low"]).nullable(),
      address: z.enum(["high", "medium", "low"]).nullable(),
      bank: z.enum(["high", "medium", "low"]).nullable(),
      employer: z.enum(["high", "medium", "low"]).nullable(),
      capitalGains: z.enum(["high", "medium", "low"]).nullable(),
    })
    .nullable(),
});

type MinedShape = z.infer<typeof MinedShape>;

const SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive a single image or PDF of a tax document (usually in Hebrew, sometimes mixed English/Hebrew). Your job is to extract the fields defined in the output schema and return them as JSON.

Rules:
1. Extract ONLY values you can read directly from the document. Never guess or synthesize.
2. For numeric fields, return plain integers (no thousand separators, no currency symbols). All amounts are in ILS (₪) unless the document is from Interactive Brokers, in which case convert USD→ILS using an implicit 3.6 rate — but prefer returning null if uncertain about the currency.
3. For each top-level group (identity, address, bank, employer, capitalGains), set the matching key in "confidence" to one of:
   - "high": you read the value clearly and cross-checked an explicit label (e.g. "שם עובד", "ברוטו", "שדה 158").
   - "medium": the value is readable but the label is ambiguous or partially occluded.
   - "low": you're inferring from position only — the UI will show this as "found something, please verify".
4. If a field is absent or unreadable, return null — do NOT fabricate.
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
 * Flatten the nested mining result into a list of MinedField entries with
 * their target state paths. The /lib/appContext.applyMiningResult action
 * uses these to write into taxpayer/financials via setPath.
 *
 * Only non-null values are emitted — a null means "model couldn't read it".
 */
function toMinedFields(mined: MinedShape): MinedField[] {
  const out: MinedField[] = [];
  const push = (fieldPath: string, value: unknown, confidence: ProvenanceConfidence) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim() === "") return;
    out.push({ fieldPath, value, confidence });
  };

  const tpConf = (k: "identity" | "address" | "bank"): ProvenanceConfidence =>
    normalizeConfidence(mined.confidence?.[k]);

  // Identity
  push("taxpayer.idNumber", mined.taxpayer?.idNumber, tpConf("identity"));
  push("taxpayer.firstName", mined.taxpayer?.firstName, tpConf("identity"));
  push("taxpayer.lastName", mined.taxpayer?.lastName, tpConf("identity"));
  if (mined.taxpayer?.firstName && mined.taxpayer?.lastName) {
    push("taxpayer.fullName", `${mined.taxpayer.firstName} ${mined.taxpayer.lastName}`, tpConf("identity"));
  }

  // Address
  push("taxpayer.address.city", mined.taxpayer?.address?.city, tpConf("address"));
  push("taxpayer.address.street", mined.taxpayer?.address?.street, tpConf("address"));
  push("taxpayer.address.houseNumber", mined.taxpayer?.address?.houseNumber, tpConf("address"));

  // Bank
  push("taxpayer.bank.bankId", mined.taxpayer?.bank?.bankId, tpConf("bank"));
  push("taxpayer.bank.bankName", mined.taxpayer?.bank?.bankName, tpConf("bank"));
  push("taxpayer.bank.branch", mined.taxpayer?.bank?.branch, tpConf("bank"));
  push("taxpayer.bank.account", mined.taxpayer?.bank?.account, tpConf("bank"));

  // Employer — written as first employer in the array. The details page lets
  // the user merge/replace across multiple form 106 uploads. A post-mining
  // consolidation pass happens in the client (see appContext.applyMiningResult).
  const empConf = normalizeConfidence(mined.confidence?.employer);
  if (mined.employer) {
    push("taxpayer.employers[0].id", `employer-${Date.now()}`, empConf);
    push("taxpayer.employers[0].name", mined.employer.name ?? null, empConf);
    push("taxpayer.employers[0].isMainEmployer", true, empConf);
    push("taxpayer.employers[0].monthsWorked", mined.employer.monthsWorked ?? null, empConf);
    push("taxpayer.employers[0].grossSalary", mined.employer.grossSalary ?? null, empConf);
    push("taxpayer.employers[0].taxWithheld", mined.employer.taxWithheld ?? null, empConf);
    push("taxpayer.employers[0].pensionDeduction", mined.employer.pensionDeduction ?? null, empConf);
  }

  // Capital gains
  const cgConf = normalizeConfidence(mined.confidence?.capitalGains);
  if (mined.capitalGains) {
    push("taxpayer.capitalGains.totalRealizedProfit", mined.capitalGains.totalRealizedProfit ?? null, cgConf);
    push("taxpayer.capitalGains.totalRealizedLoss", mined.capitalGains.totalRealizedLoss ?? null, cgConf);
    push("taxpayer.capitalGains.foreignTaxWithheld", mined.capitalGains.foreignTaxWithheld ?? null, cgConf);
    push("taxpayer.capitalGains.dividends", mined.capitalGains.dividends ?? null, cgConf);
  }

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
        summary: object.summary ?? undefined,
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
