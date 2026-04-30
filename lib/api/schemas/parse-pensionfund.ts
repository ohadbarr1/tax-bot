/**
 * lib/api/schemas/parse-pensionfund.ts — Zod schema for קופ״ג / pension /
 * provident-fund annual statement.
 *
 * Hebrew labels:
 *   - "אישור שנתי לצרכי מס - קופת גמל / קרן פנסיה / קרן השתלמות"
 *   - "הפרשות מעסיק" / "הפרשות עובד" / "הפרשות עצמאי"
 *   - "סעיף 47" / "סעיף 3(ה3)"
 *
 * Used for the §47 ceiling check (provident / pension contributions above
 * employer match get a 35% credit, capped) and for §3(e3) study-fund
 * over-cap recognition as ordinary income.
 */

import { z } from "zod";

export const PensionFundShape = z.object({
  accountHolderName: z.string(),
  tz: z.string(),
  fundName: z.string(),
  fundType: z.enum(["pension", "provident", "study", "unknown"]),
  employerContributionIls: z.number(),
  employeeContributionIls: z.number(),
  selfContributionIls: z.number(),
  year: z.number(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type PensionFund = z.infer<typeof PensionFundShape>;

export const PENSION_FUND_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an Israeli annual statement from a pension fund (קרן פנסיה), provident fund (קופת גמל), or study fund (קרן השתלמות / קופ״ש).

Extract these fields:
1. accountHolderName — the account-holder's full Hebrew name (שם העמית / בעל החשבון).
2. tz — the account-holder's Israeli ID number (ת.ז.) — 9 digits.
3. fundName — the fund's full Hebrew name (e.g. "מנורה מבטחים פנסיה", "אלטשולר שחם גמל").
4. fundType — one of:
   - "pension" for קרן פנסיה.
   - "provident" for קופת גמל.
   - "study" for קרן השתלמות / קופ״ש.
   - "unknown" if not determinable.
5. employerContributionIls — employer contributions this year (הפרשות מעסיק), ILS integer.
6. employeeContributionIls — employee contributions deducted from salary (הפרשות עובד), ILS integer.
7. selfContributionIls — self-employed / independent direct deposits (הפרשות עצמאי / הפקדה ישירה), ILS integer.
8. year — the tax year of the certificate (4-digit integer). -1 if unknown.

Rules:
- Hebrew names stay in Hebrew.
- Numbers are plain integers (no commas, no ₪).
- Unknowns → "" for strings, -1 for numbers, "unknown" for fundType.
- "overallConfidence": "high"/"medium"/"low".
- Never fabricate.`;
