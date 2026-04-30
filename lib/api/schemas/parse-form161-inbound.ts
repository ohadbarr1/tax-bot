/**
 * lib/api/schemas/parse-form161-inbound.ts — Zod schema for inbound (already-
 * issued) Form 161 from a former employer.
 *
 * Hebrew labels:
 *   - "טופס 161" / "הודעת מעביד על תשלום מענק עקב פרישה"
 *   - "פיצויים חייבים", "פיצויים פטורים"
 *   - "תקופת עבודה במעסיק"
 *
 * Drives §9(7א) severance exemption + §8(g) spreading. Distinguished
 * from the *generated* Form 161 (`/api/generate/form-161`) which we
 * produce in-house — the inbound parser handles employer-supplied 161s.
 */

import { z } from "zod";

export const Form161InboundShape = z.object({
  employerName: z.string(),
  employerTik: z.string(),
  employeeName: z.string(),
  tz: z.string(),
  severanceTotalIls: z.number(),
  taxableSeveranceIls: z.number(),
  exemptSeveranceIls: z.number(),
  monthsService: z.number(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type Form161Inbound = z.infer<typeof Form161InboundShape>;

export const FORM161_INBOUND_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an employer-issued טופס 161 — "הודעת מעביד על תשלום מענק עקב פרישה" (severance grant notification).

Extract these fields:
1. employerName — the employer's Hebrew name (השולח / שם המעביד).
2. employerTik — the employer's tax-deduction file number (תיק ניכויים / מספר תיק).
3. employeeName — the employee's full Hebrew name.
4. tz — the employee's Israeli ID number (ת.ז.) — 9 digits.
5. severanceTotalIls — total severance paid (סך כל הפיצויים), ILS, integer.
6. taxableSeveranceIls — the taxable portion (פיצויים חייבים במס / חלק חייב), ILS, integer.
7. exemptSeveranceIls — the exempt portion under §9(7א) (פיצויים פטורים / חלק פטור), ILS, integer.
8. monthsService — total months of service at this employer (integer). Convert years × 12 + months if shown that way.

Rules:
- Hebrew names stay in Hebrew.
- Numbers are plain integers (no commas, no ₪).
- The taxable + exempt portions should approximately sum to the total — if you can read the total but not the split, fill what you can read and leave the rest as -1.
- Unknowns → "" for strings, -1 for numbers.
- "overallConfidence": "high"/"medium"/"low".
- Never fabricate.`;
