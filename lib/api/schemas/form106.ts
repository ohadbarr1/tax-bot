/**
 * lib/api/schemas/form106.ts
 *
 * Zod schema for the canonical Form 106 (Israeli annual employer salary
 * statement) extracted-fields payload. Closes ingestion-F-1 (only 3/14 fields
 * parsed) and ingestion-F-2 (158-vs-158 silent ambiguity).
 *
 * The schema is the single source of truth for the response shape of
 * `POST /api/parse/form-106` (`data` body) and the cross-check schema for any
 * future Claude-vision consolidation of the same form (audit recommendation
 * F-8 / Workstream A in audits/ingestion.md).
 *
 * Every field is OPTIONAL because real-world 106s in the wild may omit any
 * one of them depending on the employer's payroll house and the employee's
 * profile (severance recipient ↔ pension ↔ regular salary). The route caller
 * applies sensible defaults for back-compat.
 *
 * **Field map (all values in ILS unless noted):**
 *
 * | Code      | Hebrew                                            | Field name                |
 * |-----------|---------------------------------------------------|---------------------------|
 * | 158/172   | משכורת חייבת רגילה                              | grossSalary               |
 * | 158 (תיאום)| משכורת חייבת במס - נוספת/לפי תאום              | field158Coordinated       |
 * | 042       | מס הכנסה שנוכה במקור                              | taxWithheld               |
 * | 045       | ניכוי לקופ"ג לקצבה כעמית שכיר                     | pensionDeduction          |
 * | 086       | דמי ביטוח לאומי + מס בריאות שנוכו                | nationalInsuranceWithheld |
 * | 219       | משכורת לצורך הפקדות לקרן השתלמות (שכר)            | studyFundSalary (219)     |
 * | 218       | הפרשת המעסיק לקרן השתלמות                         | studyFundEmployer (218)   |
 * | 245       | משכורת מבוטחת לקופ"ג לקצבה                        | pensionInsuredSalary (245)|
 * | 244       | מענק שולי / חד-פעמי                               | severanceMargin (244)     |
 * | 249       | סך הפרשות מעסיק לקצבה                             | employerPensionTotal (249)|
 * | 248       | הפרשות מעסיק לקצבה - ניכוי                        | employerPensionDeduct (248)|
 * | 272       | פיצויי פיטורין חייבים במס                         | severanceTaxable          |
 * | 037       | תרומות שהמעסיק העביר                              | employerDonations         |
 * | 044       | נקודות זיכוי שניתנו                               | creditPointsValue         |
 * | 004       | מספר תיק ניכויים                                  | taxFileNumber             |
 * | 033       | סוג הכנסה (1=שכר, 2=פנסיה, 5=פיצויים)            | incomeType                |
 * | 089       | חלק פטור לפי סע' 9א/9(7א)/9(5)                   | exemptionSection9a (089)  |
 * | 090       | חלק פטור (שני)                                    | exemptionSection9b (090)  |
 *
 * **Ambiguity resolution (F-2)**: Form 106 emits "158" twice for tax-coordinated
 * employees — once as "הכנסה חייבת רגילה" (regular taxable salary) and once as
 * "משכורת חייבת במס - נוספת/לפי תאום" (additional/coordinated salary). The
 * legacy parser silently picked the first stream-order hit. The new schema
 * exposes both via `grossSalary` (regular) + `field158Coordinated` (תיאום).
 * Downstream tax-engine consumers should sum them when both are present.
 */

import { z } from "zod";

/**
 * Income-type codes per ITA Form 106 field 033:
 *   1 = שכר (regular salary)
 *   2 = פנסיה (pension)
 *   3 = קצבת זקנה / שאירים
 *   5 = פיצויי פיטורים
 *   8 = הכנסה אחרת
 */
export const Form106IncomeType = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
]);

/** Non-negative integer used for every monetary field. */
const Money = z.number().int().nonnegative();

/** Months worked in the tax year (1..12). */
const Months = z.number().int().min(1).max(12);

/** Credit-point unit count (e.g. "6.75" — float, not integer). */
const CreditPoints = z.number().nonnegative();

/**
 * Canonical extracted-fields payload from a parsed Form 106. The route
 * forwards the regex-parser output through this schema; the Claude-vision
 * cross-check (when ANTHROPIC_API_KEY is provisioned) emits the same shape.
 *
 * Every field is `.optional()` — the parser cannot guarantee any single
 * field on real-world 106s; missing values default at the consumer layer.
 */
export const Form106ExtractedSchema = z.object({
  // ─── Existing fields (legacy back-compat) ──────────────────────────────────
  /** Employer name (multi-label: "שם המעסיק" / "מעסיק:" / "השולח:"). */
  employerName: z.string().min(1).max(200).optional(),
  /** Months worked in the tax year. */
  monthsWorked: Months.optional(),
  /** Field 158 / 172 — משכורת חייבת רגילה (regular taxable salary). */
  grossSalary: Money.optional(),
  /** Field 042 — מס הכנסה שנוכה במקור (income tax withheld). */
  taxWithheld: Money.optional(),
  /** Field 045 — ניכוי לקופ"ג לקצבה כ"עמית שכיר" (pension employee deduction). */
  pensionDeduction: Money.optional(),

  // ─── New fields (closes F-1, F-2) ───────────────────────────────────────────
  /**
   * Field 158 (תיאום) — משכורת חייבת במס - נוספת/לפי תאום.
   * Present only when the employer ran a tax coordination for the employee.
   * MUST be summed with `grossSalary` for total taxable salary.
   * Closes ingestion-F-2.
   */
  field158Coordinated: Money.optional(),
  /** Field 086 — דמי ביטוח לאומי + מס בריאות שנוכו (sum of BL + health withheld). */
  nationalInsuranceWithheld: Money.optional(),
  /** Field 219 — משכורת לצורך הפקדות לקרן השתלמות. */
  studyFundSalary: Money.optional(),
  /** Field 218 — הפרשת המעסיק לקרן השתלמות. */
  studyFundEmployer: Money.optional(),
  /** Field 245 — משכורת מבוטחת לקופ"ג לקצבה. */
  pensionInsuredSalary: Money.optional(),
  /** Field 244 — מענק שולי / חד-פעמי. */
  severanceMargin: Money.optional(),
  /** Field 249 — סך הפרשות מעסיק לקצבה (total). */
  employerPensionTotal: Money.optional(),
  /** Field 248 — הפרשות מעסיק לקצבה - ניכוי (deduction portion). */
  employerPensionDeduct: Money.optional(),
  /** Field 272 — פיצויי פיטורין חייבים במס (taxable severance). */
  severanceTaxable: Money.optional(),
  /** Field 037 — תרומות שהמעסיק העביר (employer-channeled donations). */
  employerDonations: Money.optional(),
  /** Field 044 — ערך נקודות זיכוי שניתנו (credit-points monetary value). */
  creditPointsValue: Money.optional(),
  /**
   * Field 044 (count) — count of credit points (e.g. "6.75").
   * Distinct from `creditPointsValue` (the ILS value of those points).
   */
  creditPointsCount: CreditPoints.optional(),
  /** Field 004 — מספר תיק ניכויים (tax-deductions file number, 9 digits). */
  taxFileNumber: z.string().regex(/^\d{6,12}$/).optional(),
  /** Field 033 — סוג הכנסה (income type code). */
  incomeType: Form106IncomeType.optional(),
  /** Field 089 — חלק פטור לפי סע' 9א/9(7א)/9(5) (first exemption slot). */
  exemptionSection9a: Money.optional(),
  /** Field 090 — חלק פטור (שני) (second exemption slot). */
  exemptionSection9b: Money.optional(),
});

export type Form106Extracted = z.infer<typeof Form106ExtractedSchema>;
