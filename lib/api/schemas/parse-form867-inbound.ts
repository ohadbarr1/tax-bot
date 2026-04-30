/**
 * lib/api/schemas/parse-form867-inbound.ts — Zod schema for inbound Form 867
 * (Israeli broker / bank annual capital-gains tax certificate).
 *
 * Hebrew labels:
 *   - "אישור שנתי לבעל ני״ע" / "טופס 867" / "יומן עסקאות"
 *   - "רווח הון מומש" / "הפסד הון מומש"
 *   - "דיבידנדים", "ריבית", "ניכוי במקור זר"
 *
 * Used for capital-gains / dividend / interest reporting on Form 1301
 * §15 / §17. Distinct from the IBKR CSV parser (`/api/parse/ibkr`) which
 * handles Interactive Brokers' English multi-table CSV format.
 */

import { z } from "zod";

export const Form867InboundShape = z.object({
  brokerName: z.string(),
  accountHolderName: z.string(),
  tz: z.string(),
  year: z.number(),
  realizedGainsIls: z.number(),
  realizedLossesIls: z.number(),
  dividendsIls: z.number(),
  interestIls: z.number(),
  foreignWithholdingIls: z.number(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export type Form867Inbound = z.infer<typeof Form867InboundShape>;

export const FORM867_INBOUND_SYSTEM_PROMPT = `You are a structured-extraction model for Israeli tax documents.

You receive an image or PDF of an Israeli broker / bank annual securities tax certificate (אישור שנתי לבעל ני״ע / טופס 867 / יומן עסקאות), e.g. from בנק הפועלים, בנק לאומי, מזרחי טפחות, IBI, פסגות, מיטב דש, אלטשולר שחם.

Extract these fields:
1. brokerName — the issuing institution's Hebrew name.
2. accountHolderName — the account-holder's full Hebrew name.
3. tz — the account-holder's Israeli ID number (ת.ז.) — 9 digits.
4. year — the tax year of the certificate (4-digit integer). -1 if unknown.
5. realizedGainsIls — total realized capital gains (סך רווח הון מומש), ILS, integer.
6. realizedLossesIls — total realized capital losses (סך הפסד הון מומש), ILS POSITIVE integer (do not return as a negative).
7. dividendsIls — total dividends received (סך דיבידנדים), ILS, integer.
8. interestIls — total interest income (סך ריבית), ILS, integer.
9. foreignWithholdingIls — foreign tax withheld at source (ניכוי במקור — חו״ל / מס חוץ), ILS, integer.

Rules:
- Hebrew text stays in Hebrew.
- All amounts in ILS; if the certificate shows USD, return -1 (this is an Israeli broker certificate — currency mismatch is a red flag).
- Numbers are plain POSITIVE integers (no commas, no ₪, no minus signs).
- Unknowns → "" for strings, -1 for numbers.
- "overallConfidence": "high"/"medium"/"low".
- Never fabricate.`;
