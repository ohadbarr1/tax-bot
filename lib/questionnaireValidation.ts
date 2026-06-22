/**
 * questionnaireValidation.ts — per-step gating for the onboarding flow (T1).
 *
 * Pure: given a step slug and the questionnaire state, return the list of
 * blocking errors (Hebrew, user-facing). An empty array means the step is valid
 * and the user may advance. The [step] page disables המשך / סיים while errors
 * exist, so the questionnaire can never be finished with invalid/empty PII —
 * the pre-loop bug where the buttons were always enabled.
 */

import { isValidTZ } from "./validateTZ";
import { employersOverlap } from "./utils";
import type {
  Address,
  BankDetails,
  Child,
  Degree,
  Employer,
  PersonalDeduction,
  TaxPayer,
  FinancialData,
} from "@/types";

export interface StepValidationInput {
  firstName: string;
  lastName: string;
  idNumber: string;
  address: Address;
  bank: BankDetails;
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  spouseFirstName: string;
  spouseLastName: string;
  spouseIdNumber: string;
  children: Child[];
  hasDegree: boolean;
  degrees: Degree[];
  investsCapital: boolean;
  portfolioLocation: "bank" | "local_broker" | "foreign_broker" | null;
  selectedBroker: string;
  employers: Employer[];
  hasOverlap: boolean;
  deductions: PersonalDeduction[];
  isOleh: boolean;
  aliyahDate: string;
  servedInArmy: boolean;
  dischargeYear: number | undefined;
  hasDisability: boolean;
  disabilityPercent: number;
}

const isBlank = (v: string | undefined | null) => !v || v.trim() === "";
const isBadNum = (n: number | undefined) =>
  n !== undefined && (!Number.isFinite(n) || n < 0);

export function validateStep(
  slug: string,
  d: StepValidationInput,
): string[] {
  const errors: string[] = [];

  switch (slug) {
    case "personal":
      if (isBlank(d.firstName)) errors.push("יש להזין שם פרטי");
      if (isBlank(d.lastName)) errors.push("יש להזין שם משפחה");
      if (isBlank(d.idNumber)) errors.push("יש להזין תעודת זהות");
      else if (!isValidTZ(d.idNumber)) errors.push("תעודת זהות אינה תקינה");
      break;

    case "family":
      if (d.maritalStatus === "married") {
        if (isBlank(d.spouseFirstName) || isBlank(d.spouseLastName))
          errors.push("יש להזין את שם בן/בת הזוג");
        if (isBlank(d.spouseIdNumber))
          errors.push("יש להזין תעודת זהות של בן/בת הזוג");
        else if (!isValidTZ(d.spouseIdNumber))
          errors.push("תעודת הזהות של בן/בת הזוג אינה תקינה");
      }
      for (const c of d.children) {
        if (isBlank(c.birthDate)) {
          errors.push("יש להזין תאריך לידה לכל ילד");
          break;
        }
      }
      break;

    case "education":
      if (d.hasDegree && d.degrees.length === 0)
        errors.push("יש להוסיף לפחות תואר אחד או לבטל את הסימון");
      break;

    case "capital":
      if (d.investsCapital && !d.portfolioLocation)
        errors.push("יש לבחור היכן מתנהל תיק ההשקעות");
      if (d.investsCapital && d.portfolioLocation === "foreign_broker" && isBlank(d.selectedBroker))
        errors.push("יש לבחור ברוקר זר");
      break;

    case "employers":
      if (d.hasOverlap)
        errors.push("קיימת חפיפה בין תקופות העסקה — יש לתקן את החודשים");
      break;

    case "deductions":
      for (const ded of d.deductions) {
        if (isBadNum(ded.amount) || !ded.amount || ded.amount <= 0) {
          errors.push("יש להזין סכום חיובי לכל ניכוי (או להסירו)");
          break;
        }
      }
      break;

    case "life-events":
      break;

    case "credit-points":
      if (d.hasDisability && (d.disabilityPercent <= 0 || d.disabilityPercent > 100))
        errors.push("יש להזין אחוז נכות בין 1 ל-100");
      if (d.isOleh && isBlank(d.aliyahDate))
        errors.push("יש להזין תאריך עלייה");
      if (d.servedInArmy && !d.dischargeYear)
        errors.push("יש להזין שנת שחרור");
      break;
  }

  return errors;
}

const QUESTIONNAIRE_SLUGS = [
  "personal", "family", "education", "capital",
  "employers", "deductions", "life-events", "credit-points",
] as const;

/** Build the validation input from saved taxpayer/financials (mirrors the
 *  questionnaire context's hydration derivations). */
export function taxpayerToValidationInput(t: TaxPayer, f: FinancialData): StepValidationInput {
  return {
    firstName: t.firstName ?? "",
    lastName: t.lastName ?? "",
    idNumber: t.idNumber ?? "",
    address: t.address ?? { city: "", street: "", houseNumber: "" },
    bank: t.bank ?? { bankId: "", bankName: "", branch: "", account: "" },
    maritalStatus: t.maritalStatus,
    spouseFirstName: t.spouse?.firstName ?? "",
    spouseLastName: t.spouse?.lastName ?? "",
    spouseIdNumber: t.spouse?.idNumber ?? t.spouseId ?? "",
    children: t.children ?? [],
    hasDegree: (t.degrees?.length ?? 0) > 0,
    degrees: t.degrees ?? [],
    investsCapital: !!f.hasForeignBroker,
    portfolioLocation: f.hasForeignBroker ? "foreign_broker" : null,
    selectedBroker: f.brokerName ?? "",
    employers: t.employers ?? [],
    hasOverlap: employersOverlap(t.employers ?? []),
    deductions: t.personalDeductions ?? [],
    isOleh: !!t.aliyahDate,
    aliyahDate: t.aliyahDate ?? "",
    servedInArmy: t.dischargeYear != null,
    dischargeYear: t.dischargeYear,
    hasDisability: t.disabilityType != null || (t.disabilityPercent ?? 0) > 0,
    disabilityPercent: t.disabilityPercent ?? 0,
  };
}

/**
 * The questionnaire slug to RESUME on: the first step that fails validation
 * given the saved data. Empty data → "personal" (step 1), so a new/empty flow
 * never jumps to an advanced step. If every step is valid, returns the last slug
 * (ready to finish).
 */
export function firstIncompleteStepSlug(t: TaxPayer, f: FinancialData): string {
  const input = taxpayerToValidationInput(t, f);
  for (const slug of QUESTIONNAIRE_SLUGS) {
    if (validateStep(slug, input).length > 0) return slug;
  }
  return QUESTIONNAIRE_SLUGS[QUESTIONNAIRE_SLUGS.length - 1];
}
