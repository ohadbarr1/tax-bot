import { z } from "zod";

/**
 * Zod schema for Claude-backed advisor nudges. Shared between the
 * /api/advisor/nudges route (for structured output) and the AdvisorNudgeRail
 * client dispatcher.
 *
 * The action.kind union is the whitelist of state mutations the model is
 * allowed to propose — anything outside this list will fail validation at
 * the API boundary and be dropped. DO NOT widen this without updating the
 * dispatcher at components/details/AdvisorNudgeRail.tsx.
 */

export const DEDUCTION_TYPES = [
  "donation_sec46",
  "life_insurance_sec45a",
  "pension_sec47",
  "ltc_insurance_sec45a",
  "study_fund_sec3e3",
  "provident_fund_sec47",
  "alimony_sec9a",
] as const;

export const DOC_TYPES_FOR_UPLOAD = [
  "form106",
  "form867",
  "ibkr",
  "receipt",
  "pension",
] as const;

export const MARITAL_STATUSES = ["single", "married", "divorced", "widowed"] as const;

const NudgeAction = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("nav_upload_doc"),
    docType: z.enum(DOC_TYPES_FOR_UPLOAD),
  }),
  z.object({
    kind: z.literal("set_marital_status"),
    value: z.enum(MARITAL_STATUSES),
  }),
  z.object({
    kind: z.literal("add_child"),
    inDaycare: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("set_aliyah_year"),
    year: z.number().int().min(1990).max(2030),
  }),
  z.object({
    kind: z.literal("set_discharge_year"),
    year: z.number().int().min(1990).max(2030),
  }),
  z.object({
    kind: z.literal("add_deduction"),
    deductionType: z.enum(DEDUCTION_TYPES),
    providerName: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("focus_field"),
    path: z.string().min(1).max(120),
  }),
]);

export const AdvisorNudgeSchema = z.object({
  id: z.string().min(1).max(60),
  tone: z.enum(["info", "warn"]),
  title: z.string().min(1).max(50),
  body: z.string().min(1).max(240),
  action: NudgeAction.optional(),
});

export const AdvisorNudgeListSchema = z.object({
  nudges: z.array(AdvisorNudgeSchema).max(4),
});

export type AdvisorNudge = z.infer<typeof AdvisorNudgeSchema>;
export type AdvisorNudgeAction = z.infer<typeof NudgeAction>;
export type AdvisorNudgeListResponse = z.infer<typeof AdvisorNudgeListSchema>;
