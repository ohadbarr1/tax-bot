/**
 * lib/api/schemas/parse-lifeins.ts — Zod schema for life-insurance / LTC cert.
 *
 * Hebrew labels:
 *   - "אישור שנתי לצרכי מס"
 *   - "ביטוח חיים" (life), "ביטוח אובדן כושר עבודה" (disability), "ביטוח סיעודי" (LTC)
 *   - "מספר פוליסה", "פרמיה שנתית"
 *
 * Used for Sec. 45a credit (25% credit on private life-insurance + LTC
 * premiums, capped).
 */

import { z } from "zod";

export const LifeInsuranceShape = z.object({
  policyholderName: z.string(),
  tz: z.string(),
  insurerName: z.string(),
  policyNumber: z.string(),
  policyType: z.enum(["life", "disability", "ltc", "unknown"]),
  annualPremiumIls: z.number(),
  policyYear: z.number(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type LifeInsurance = z.infer<typeof LifeInsuranceShape>;

export const LIFE_INS_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an Israeli life-insurance / disability / long-term-care annual certificate (אישור שנתי לצרכי מס לפי סעיף 45א לפקודת מס הכנסה).

Extract these fields:
1. policyholderName — the policyholder's full Hebrew name (שם המבוטח).
2. tz — the policyholder's Israeli ID number (ת.ז.) — 9 digits.
3. insurerName — the Hebrew name of the insurance company (חברת הביטוח), e.g. "הראל", "מגדל", "כלל", "מנורה", "הפניקס", "איילון".
4. policyNumber — the policy / contract number (מספר פוליסה).
5. policyType — one of:
   - "life" for ביטוח חיים (pure life cover).
   - "disability" for ביטוח אובדן כושר עבודה.
   - "ltc" for ביטוח סיעודי / long-term care.
   - "unknown" if not determinable.
6. annualPremiumIls — annual premium paid this year, ILS, integer.
7. policyYear — the tax year of the certificate (4-digit integer). -1 if unknown.

Rules:
- Hebrew names stay in Hebrew.
- Integers only for numbers (no commas, no ₪).
- Unknowns → "" for strings, -1 for numbers, "unknown" for policyType.
- "overallConfidence": "high"/"medium"/"low".
- Never fabricate.`;
