/**
 * lib/api/schemas/generate.ts — Zod schemas for the PDF-generation routes.
 *
 * Each route receives a TaxPayer + FinancialData payload (Form 135 / 1301) or
 * a flat severance struct (Form 161). Bounded array sizes prevent
 * memory-exhaustion attacks on the PDF stamper:
 *
 *   employers          ≤ 20
 *   personalDeductions ≤ 50
 *   lifeEvents.* — flat (single record, no array)
 *
 * Numbers are clamped to the [0, 1e9] ILS range — anything beyond that is
 * implausible for an Israeli salary form and a strong signal of garbage input.
 */

import { z } from "zod";

const MAX_EMPLOYERS = 20;
const MAX_PERSONAL_DEDUCTIONS = 50;
const MAX_CHILDREN = 30;
const MAX_DEGREES = 10;
const MAX_LIFE_EVENT_AMOUNT = 1e9;
const MAX_AMOUNT = 1e9;

const NonNegAmount = z.number().min(0).max(MAX_AMOUNT);
const OptionalAmount = NonNegAmount.optional();
const OptionalString = z.string().max(255).optional();
const OptionalShortString = z.string().max(64).optional();

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const ChildSchema = z.object({
  id: z.string().max(64),
  birthDate: z.string().max(32),
  inDaycare: z.boolean().optional(),
});

const DegreeSchema = z.object({
  type: z.enum(["BA", "MA", "PHD"]),
  institution: z.string().max(255),
  completionYear: z.number().int().min(1900).max(2100),
});

const EmployerSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(255),
  isMainEmployer: z.boolean(),
  monthsWorked: z.number().min(0).max(12),
  startMonth: z.number().int().min(1).max(12).optional(),
  endMonth: z.number().int().min(1).max(12).optional(),
  grossSalary: OptionalAmount,
  taxWithheld: OptionalAmount,
  pensionDeduction: OptionalAmount,
  pensionFundName: OptionalString,
  pensionFundId: OptionalShortString,
});

const PersonalDeductionSchema = z.object({
  id: z.string().max(64),
  type: z.enum([
    "donation_sec46",
    "life_insurance_sec45a",
    "pension_sec47",
    "ltc_insurance_sec45a",
    "disabled_child_sec45",
    "study_fund_sec3e3",
    "provident_fund_sec47",
    "self_employed_pension_sec47",
    "alimony_sec9a",
  ]),
  amount: NonNegAmount,
  providerName: z.string().max(255),
  pensionClassification: z.enum(["grant", "monthly", "other"]).optional(),
});

const LifeEventSchema = z.object({
  changedJobs: z.boolean(),
  pulledSeverancePay: z.boolean(),
  hasForm161: z.boolean(),
  taxableSeverancePay: z.number().min(0).max(MAX_LIFE_EVENT_AMOUNT).optional(),
});

const AddressSchema = z.object({
  city: z.string().max(255),
  street: z.string().max(255),
  houseNumber: z.string().max(32),
});

const BankDetailsSchema = z.object({
  bankId: z.string().max(8),
  bankName: z.string().max(255),
  branch: z.string().max(8),
  account: z.string().max(32),
});

const CapitalGainsSchema = z.object({
  totalRealizedProfit: NonNegAmount,
  totalRealizedLoss: NonNegAmount,
  foreignTaxWithheld: NonNegAmount,
  dividends: OptionalAmount,
  carriedForwardLoss: OptionalAmount,
  foreignSourceCountry: z.string().max(8).optional(),
});

const BusinessIncomeSchema = z.object({
  mainRevenue: OptionalAmount,
  mainExpenses: OptionalAmount,
  secondaryRevenue: OptionalAmount,
  secondaryExpenses: OptionalAmount,
  mainDescription: z.string().max(255).optional(),
  secondaryDescription: z.string().max(255).optional(),
});

const TaxPayerSchema = z.object({
  id: z.string().max(64),
  idNumber: z.string().max(16).optional(),
  spouseId: z.string().max(16).optional(),
  spouse: z.object({
    firstName: z.string().max(64).optional(),
    lastName: z.string().max(64).optional(),
    idNumber: z.string().max(16).optional(),
  }).optional(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  fullName: z.string().max(128),
  phone: z.string().max(32).optional(),
  email: z.string().max(255).optional(),
  birthDate: z.string().max(32).optional(),
  profession: z.string().max(128),
  maritalStatus: z.enum(["single", "married", "divorced", "widowed"]),
  spouseHasIncome: z.boolean().optional(),
  paysAlimony: z.boolean().optional(),
  children: z.array(ChildSchema).max(MAX_CHILDREN),
  degrees: z.array(DegreeSchema).max(MAX_DEGREES),
  employers: z.array(EmployerSchema).max(MAX_EMPLOYERS),
  personalDeductions: z.array(PersonalDeductionSchema).max(MAX_PERSONAL_DEDUCTIONS),
  lifeEvents: LifeEventSchema,
  address: AddressSchema.optional(),
  bank: BankDetailsSchema.optional(),
  capitalGains: CapitalGainsSchema.optional(),
  businessIncome: BusinessIncomeSchema.optional(),
  dischargeYear: z.number().int().min(1900).max(2100).optional(),
  gender: z.enum(["male", "female"]).optional(),
  aliyahDate: z.string().max(32).optional(),
  disabilityType: z.enum(["work_injury", "general", "ita_recognized"]).optional(),
  disabilityPercent: z.number().min(0).max(100).optional(),
  postcode: z.string().max(16).optional(),
  kibbutzMember: z.boolean().optional(),
});

const FinancialDataSchema = z.object({
  taxYears: z.array(z.number().int().min(2000).max(2100)).max(20),
  employersCount: z.number().int().min(0).max(MAX_EMPLOYERS),
  hasForeignBroker: z.boolean(),
  brokerName: z.string().max(64).optional(),
  estimatedRefund: z.number().min(-MAX_AMOUNT).max(MAX_AMOUNT),
  insights: z.array(z.unknown()).max(100),
  actionItems: z.array(z.unknown()).max(100),
  // calculationResult / ibkrData are computed objects — pass through.
  calculationResult: z.unknown().optional(),
  ibkrData: z.unknown().optional(),
});

// ─── Public payload schemas ──────────────────────────────────────────────────

export const Form135PayloadSchema = z.object({
  taxpayer: TaxPayerSchema,
  financials: FinancialDataSchema,
  calibrate: z.boolean().optional(),
});
export type Form135PayloadParsed = z.infer<typeof Form135PayloadSchema>;

export const Form1301PayloadSchema = Form135PayloadSchema;
export type Form1301PayloadParsed = z.infer<typeof Form1301PayloadSchema>;

export const Form161PayloadSchema = z.object({
  taxableSeverance: z.number().min(0.01).max(MAX_AMOUNT),
  currentYear: z.number().int().min(2000).max(2100).optional(),
  spreadYears: z.number().int().min(1).max(6).optional(),
  currentYearIncome: z.number().min(0).max(MAX_AMOUNT).optional(),
  taxpayerName: z.string().max(128).optional(),
  idNumber: z.string().max(16).optional(),
});
export type Form161PayloadParsed = z.infer<typeof Form161PayloadSchema>;
