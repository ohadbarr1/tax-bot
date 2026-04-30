/**
 * lib/api/schemas/parse-tuition.ts — Zod schema for אישור על שכר לימוד.
 *
 * Hebrew labels:
 *   - "אישור על תשלום שכר לימוד"
 *   - "תואר ראשון" (BA), "תואר שני" (MA), "תואר שלישי / דוקטורט" (PHD)
 *   - "תעודה / הסמכה" (certificate)
 *   - "שנת סיום לימודים" / "סיום תואר"
 *   - "שם הסטודנט/ית", "מוסד / אוניברסיטה / מכללה"
 *
 * Used to compute BA / MA / PHD credit-points (1 + 0.5 + 1 over 3 years
 * post-degree per the Israeli ITA rule).
 */

import { z } from "zod";

export const UNKNOWN_NUM = -1;

export const TuitionReceiptShape = z.object({
  studentName: z.string(),
  institutionName: z.string(),
  programName: z.string(),
  degreeLevel: z.enum(["BA", "MA", "PHD", "certificate", "unknown"]),
  completionYear: z.number(),
  amountIls: z.number(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type TuitionReceipt = z.infer<typeof TuitionReceiptShape>;

export const TUITION_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of a tuition certificate (אישור על תשלום שכר לימוד / סיום תואר אקדמי) from an Israeli university or college.

Extract these fields:
1. studentName — the student's full Hebrew name (שם הסטודנט/ית).
2. institutionName — the university / college Hebrew name (אוניברסיטה / מכללה).
3. programName — the program / department name (חוג / תוכנית לימודים).
4. degreeLevel — one of "BA"/"MA"/"PHD"/"certificate"/"unknown":
   - "BA" for תואר ראשון.
   - "MA" for תואר שני.
   - "PHD" for תואר שלישי / דוקטורט / Ph.D.
   - "certificate" for תעודה / הסמכה מקצועית without academic degree.
   - "unknown" if you cannot determine the level.
5. completionYear — the year the degree was completed (4-digit integer, e.g. 2024). If only a tuition year is shown, use that. -1 if unknown.
6. amountIls — the total tuition amount paid in ILS. Integer.

Rules:
- Hebrew text stays in Hebrew.
- Numbers are plain integers (no commas, no ₪).
- Unknowns → "" for strings, -1 for numbers, "unknown" for degreeLevel.
- "overallConfidence": "high"/"medium"/"low".
- Never guess.`;
