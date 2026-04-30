/**
 * lib/api/schemas/parse-donation.ts — Zod schema for קבלת תרומה לפי סעיף 46.
 *
 * Hebrew labels the model should look for:
 *   - "קבלה" / "Receipt"
 *   - "ע״ר" / "מלכ״ר" / "מוסד ציבורי לפי סעיף 46"
 *   - "סכום התרומה"
 *   - "מספר אישור 46" / "מספר תיק"
 *
 * The schema is FLAT, NO nullables / NO optionals — Anthropic structured-
 * output tool grammar caps unions and the existing `mine/document` schema
 * has the same constraint (see `mine/document/route.ts` header comment).
 * Missing values come back as "" or -1; the route filters those out.
 */

import { z } from "zod";

export const UNKNOWN_NUM = -1;

export const DonationReceiptShape = z.object({
  amountIls: z.number(),
  donorName: z.string(),
  donorTz: z.string(),
  recipientName: z.string(),
  recipient46Number: z.string(),
  dateIssued: z.string(),
  receiptNumber: z.string(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type DonationReceipt = z.infer<typeof DonationReceiptShape>;

export const DONATION_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an Israeli donation receipt (קבלה לפי סעיף 46 לפקודת מס הכנסה). The receipt is issued by a public-benefit institution (מוסד ציבורי / ע״ר / מלכ״ר) recognized under Section 46.

Extract these fields:
1. amountIls — the donation amount in ILS (₪). Look for "סכום" / "סכום התרומה" / "סך הכל" / a numeric value next to ₪. Integer (no decimals).
2. donorName — the donor's full Hebrew name (תורם / שם התורם).
3. donorTz — the donor's Israeli ID number (ת.ז. / מס׳ זהות) — 9 digits.
4. recipientName — the recognized institution's full Hebrew name.
5. recipient46Number — the institution's סעיף 46 approval number (מספר אישור 46 / מספר תיק עמותה).
6. dateIssued — the date on the receipt in ISO format (YYYY-MM-DD).
7. receiptNumber — the printed receipt serial number.

Rules:
- Return integers for amounts (no commas, no ₪ sign).
- For unknown string fields return "".
- For unknown number fields return -1.
- Hebrew names stay in Hebrew; do NOT translate.
- "overallConfidence" — your overall read of the document: "high"/"medium"/"low".
- Never fabricate. If you can't read a field clearly, return the sentinel.`;
