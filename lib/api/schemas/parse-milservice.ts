/**
 * lib/api/schemas/parse-milservice.ts — Zod schema for תעודת שחרור / military
 * service certificate.
 *
 * Hebrew labels:
 *   - "תעודת שחרור" / "תעודת חוגר"
 *   - "תאריך גיוס", "תאריך שחרור"
 *   - "שירות חובה" (regular conscription), "שירות מילואים" (reserves)
 *
 * Drives the post-discharge credit-points (1-2 points for 2-3 years
 * post-discharge per Israeli ITA rule, gender-adjusted).
 */

import { z } from "zod";

export const MilServiceShape = z.object({
  personName: z.string(),
  tz: z.string(),
  serviceStart: z.string(),
  serviceEnd: z.string(),
  serviceMonths: z.number(),
  gender: z.enum(["m", "f", "unknown"]),
  serviceType: z.enum(["regular", "reserve", "unknown"]),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type MilService = z.infer<typeof MilServiceShape>;

export const MIL_SERVICE_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an Israeli military / national-service discharge certificate (תעודת שחרור / תעודת חוגר / אישור שירות לאומי).

Extract these fields:
1. personName — the person's full Hebrew name.
2. tz — the person's Israeli ID number (ת.ז.) — 9 digits.
3. serviceStart — the conscription / service start date, ISO YYYY-MM-DD. "" if unknown.
4. serviceEnd — the discharge date, ISO YYYY-MM-DD. "" if unknown.
5. serviceMonths — the total service length in whole months (integer). -1 if unknown.
6. gender — one of "m" (זכר), "f" (נקבה), or "unknown".
7. serviceType — one of:
   - "regular" for שירות חובה / שירות לאומי-אזרחי / standard military service.
   - "reserve" for שירות מילואים פעיל.
   - "unknown" if not determinable.

Rules:
- Hebrew text stays in Hebrew.
- serviceMonths is an integer count (e.g. a service from 2020-08-01 to 2023-02-01 ≈ 30 months).
- Unknowns → "" for strings, -1 for numbers, "unknown" for enums.
- "overallConfidence": "high"/"medium"/"low".
- Never guess.`;
