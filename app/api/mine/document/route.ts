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

// Claude vision schema — intentionally narrow. The model returns only fields
// it's highly confident about; unknowns become nulls and we drop them below.
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
  summary: z.string().max(200).optional(),
  taxpayer: z
    .object({
      idNumber: z.string().nullable().optional(),
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
      address: z
        .object({
          city: z.string().nullable().optional(),
          street: z.string().nullable().optional(),
          houseNumber: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      bank: z
        .object({
          bankId: z.string().nullable().optional(),
          bankName: z.string().nullable().optional(),
          branch: z.string().nullable().optional(),
          account: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
  employer: z
    .object({
      name: z.string().nullable().optional(),
      grossSalary: z.number().nullable().optional(),
      taxWithheld: z.number().nullable().optional(),
      pensionDeduction: z.number().nullable().optional(),
      monthsWorked: z.number().nullable().optional(),
    })
    .optional(),
  capitalGains: z
    .object({
      totalRealizedProfit: z.number().nullable().optional(),
      totalRealizedLoss: z.number().nullable().optional(),
      foreignTaxWithheld: z.number().nullable().optional(),
      dividends: z.number().nullable().optional(),
    })
    .optional(),
  /** Per-field confidence tiers — model picks one of three. */
  confidence: z
    .object({
      identity: z.enum(["high", "medium", "low"]).optional(),
      address: z.enum(["high", "medium", "low"]).optional(),
      bank: z.enum(["high", "medium", "low"]).optional(),
      employer: z.enum(["high", "medium", "low"]).optional(),
      capitalGains: z.enum(["high", "medium", "low"]).optional(),
    })
    .optional(),
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

  const bytes = await file.arrayBuffer();
  const mediaType = normalizeMediaType(file.type, file.name);

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
            {
              type: "image",
              image: new Uint8Array(bytes),
              mediaType,
            },
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
        summary: object.summary,
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
 * Claude vision accepts image/*, application/pdf. HEIC and older formats
 * need server-side conversion (not implemented — flagged as TODO for Phase 4
 * "HEIC support"). For now coerce obvious aliases and fall back to octet-stream
 * so the model errors clearly if the user uploads something weird.
 */
function normalizeMediaType(mime: string, name: string): string {
  if (mime && mime !== "application/octet-stream") return mime;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "application/octet-stream";
}
