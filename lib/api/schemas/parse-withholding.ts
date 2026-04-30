/**
 * lib/api/schemas/parse-withholding.ts — Zod schema for אישור ניכוי במקור.
 *
 * Hebrew labels:
 *   - "אישור ניכוי במקור" / "טופס 60a/60b"
 *   - "המנכה" (payer/withholder), "המקבל" (recipient)
 *   - "סכום ברוטו ששולם", "מס שנוכה במקור"
 *
 * Used for cross-employer reconciliation (multi-employer 47% bracket
 * detection in calculateTax.ts) and for §17 BL base.
 *
 * NOTE: ITA emits these as encrypted PDFs with the recipient's TZ as
 * password. THIS SCHEMA DOES NOT HANDLE DECRYPTION — that is 1.L's scope.
 * Once 1.L lands, this route should accept an optional `password` form-data
 * field and forward it to the PDF preprocessor. See README in the test for
 * the cross-workstream dependency note.
 */

import { z } from "zod";

export const WithholdingCertShape = z.object({
  payerName: z.string(),
  payerTz: z.string(),
  recipientName: z.string(),
  recipientTz: z.string(),
  grossAmountIls: z.number(),
  withheldIls: z.number(),
  year: z.number(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type WithholdingCert = z.infer<typeof WithholdingCertShape>;

export const WITHHOLDING_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an Israeli withholding-at-source certificate (אישור ניכוי במקור — typically Form 60a / 60b emitted by gov.il portal). The form documents that a payer withheld income tax on payments to a recipient.

Extract these fields:
1. payerName — the payer's Hebrew name (המנכה / משלם).
2. payerTz — the payer's tax ID (ת.ז. or ח.פ. — Israeli company number).
3. recipientName — the recipient's Hebrew name (המקבל / נמכה).
4. recipientTz — the recipient's Israeli ID number (ת.ז.) — 9 digits.
5. grossAmountIls — the gross amount paid (סכום ברוטו / סך תשלומים) ILS, integer.
6. withheldIls — the amount withheld at source (מס שנוכה / סכום ניכוי), ILS, integer.
7. year — the tax year (4-digit integer). -1 if unknown.

Rules:
- Hebrew names stay in Hebrew.
- Numbers are plain integers (no commas, no ₪).
- Unknowns → "" for strings, -1 for numbers.
- "overallConfidence": "high"/"medium"/"low".
- Never fabricate.`;
