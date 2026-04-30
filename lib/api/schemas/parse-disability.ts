/**
 * lib/api/schemas/parse-disability.ts — Zod schema for תעודת נכות.
 *
 * Hebrew labels:
 *   - "תעודת נכה" / "אישור נכות"
 *   - "אחוזי נכות"
 *   - "פגיעה בעבודה" / "נכות כללית" / "אישור רשות המסים לפי סעיף 9(5)"
 *
 * Drives the §9(5) full-income exemption (calculateDisabilityExemption()
 * in calculateTax.ts — already shipped in Phase 0 §0.C).
 */

import { z } from "zod";

export const DisabilityCertShape = z.object({
  personName: z.string(),
  tz: z.string(),
  disabilityPercent: z.number(),
  cause: z.enum(["work_injury", "general", "ita_recognized", "unknown"]),
  effectiveFrom: z.string(),
  effectiveTo: z.string(),
  issuingAuthority: z.string(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type DisabilityCert = z.infer<typeof DisabilityCertShape>;

export const DISABILITY_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an Israeli disability certificate (תעודת נכה / אישור על אחוזי נכות) issued by המוסד לביטוח לאומי or by Rashut HaMisim under §9(5) לפקודת מס הכנסה.

Extract these fields:
1. personName — the person's full Hebrew name.
2. tz — the person's Israeli ID number (ת.ז.) — 9 digits.
3. disabilityPercent — the certified disability percentage as an integer 0-100 (אחוז נכות). -1 if unknown.
4. cause — one of:
   - "work_injury" for נפגע עבודה / פגיעה בעבודה.
   - "general" for נכות כללית / נפגעי פעולות איבה / נכות רגילה.
   - "ita_recognized" for אישור רשות המסים לפי סעיף 9(5) — explicit Section-9(5) recognition.
   - "unknown" if not determinable.
5. effectiveFrom — the date the disability rating becomes effective, ISO YYYY-MM-DD. "" if unknown.
6. effectiveTo — the end date of the rating (if open-ended, return ""). ISO YYYY-MM-DD.
7. issuingAuthority — the Hebrew name of the issuing body (e.g. "המוסד לביטוח לאומי", "ועדה רפואית", "רשות המסים").

Rules:
- Hebrew text stays in Hebrew.
- disabilityPercent is an integer; reject decimals.
- Unknowns → "" for strings, -1 for numbers, "unknown" for cause.
- "overallConfidence": "high"/"medium"/"low".
- Never guess.`;
