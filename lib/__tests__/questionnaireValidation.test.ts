import { describe, it, expect } from "vitest";
import { validateStep, type StepValidationInput } from "../questionnaireValidation";
import { isValidTZ } from "../validateTZ";

function base(overrides: Partial<StepValidationInput> = {}): StepValidationInput {
  return {
    firstName: "דוד",
    lastName: "כהן",
    idNumber: "123456782", // valid checksum
    address: { city: "תל אביב", street: "הרצל", houseNumber: "1" },
    bank: { bankId: "12", bankName: "הפועלים", branch: "600", account: "123" },
    maritalStatus: "single",
    spouseFirstName: "",
    spouseLastName: "",
    spouseIdNumber: "",
    children: [],
    hasDegree: false,
    degrees: [],
    investsCapital: false,
    portfolioLocation: null,
    selectedBroker: "",
    employers: [{ id: "e0", name: "מעסיק", isMainEmployer: true, monthsWorked: 12 }],
    hasOverlap: false,
    deductions: [],
    isOleh: false,
    aliyahDate: "",
    servedInArmy: false,
    dischargeYear: undefined,
    hasDisability: false,
    disabilityPercent: 0,
    ...overrides,
  };
}

describe("validateStep — onboarding gating (T1)", () => {
  it("personal: valid input passes", () => {
    expect(validateStep("personal", base())).toEqual([]);
  });

  it("personal: blocks empty name + invalid/empty TZ", () => {
    expect(validateStep("personal", base({ firstName: "" })).length).toBeGreaterThan(0);
    expect(validateStep("personal", base({ idNumber: "" })).length).toBeGreaterThan(0);
    expect(validateStep("personal", base({ idNumber: "111111111" })).length).toBeGreaterThan(0);
  });

  it("family: married requires valid spouse identity", () => {
    expect(validateStep("family", base({ maritalStatus: "married" })).length).toBeGreaterThan(0);
    const ok = base({
      maritalStatus: "married",
      spouseFirstName: "שרה",
      spouseLastName: "כהן",
      spouseIdNumber: "123456782",
    });
    expect(validateStep("family", ok)).toEqual([]);
  });

  it("capital: foreign broker requires a broker name", () => {
    expect(
      validateStep("capital", base({ investsCapital: true, portfolioLocation: "foreign_broker" })).length,
    ).toBeGreaterThan(0);
    expect(
      validateStep("capital", base({ investsCapital: true, portfolioLocation: "bank" })),
    ).toEqual([]);
  });

  it("employers: blocks overlapping periods", () => {
    expect(validateStep("employers", base({ hasOverlap: true }))).toHaveLength(1);
  });

  it("deductions: blocks negative / NaN amounts", () => {
    expect(
      validateStep("deductions", base({ deductions: [{ id: "d", type: "donation_sec46", amount: NaN, providerName: "" }] })).length,
    ).toBeGreaterThan(0);
    expect(
      validateStep("deductions", base({ deductions: [{ id: "d", type: "donation_sec46", amount: -5, providerName: "" }] })).length,
    ).toBeGreaterThan(0);
  });

  it("credit-points: disability needs a valid percent", () => {
    expect(
      validateStep("credit-points", base({ hasDisability: true, disabilityPercent: 0 })).length,
    ).toBeGreaterThan(0);
    expect(
      validateStep("credit-points", base({ hasDisability: true, disabilityPercent: 50 })),
    ).toEqual([]);
  });
});

describe("isValidTZ — hardened (T1/T7)", () => {
  it("rejects empty, all-zeros, and non-numeric", () => {
    expect(isValidTZ("")).toBe(false);
    expect(isValidTZ("000000000")).toBe(false);
    expect(isValidTZ("abc")).toBe(false);
  });
  it("accepts a valid ID (incl. leading-zero form)", () => {
    expect(isValidTZ("123456782")).toBe(true);
    expect(isValidTZ("000000018")).toBe(true);
  });
});

import { firstIncompleteStepSlug } from "../questionnaireValidation";
import { INITIAL_TAXPAYER, INITIAL_FINANCIALS } from "../initialState";

describe("firstIncompleteStepSlug — resume point (new-flow bug)", () => {
  it("empty data resumes at step 1 (personal), never an advanced step", () => {
    expect(firstIncompleteStepSlug(INITIAL_TAXPAYER, INITIAL_FINANCIALS)).toBe("personal");
  });
  it("personal filled → resumes at the next incomplete step, not the last visited", () => {
    const tp = { ...INITIAL_TAXPAYER, firstName: "דוד", lastName: "כהן", idNumber: "123456782" };
    // personal now valid; family (single, no kids) valid; education valid; capital valid;
    // employers valid (no overlap); deductions valid (none); life-events valid →
    // first incomplete is the last slug (ready to finish), NOT a jumped-to middle step.
    expect(firstIncompleteStepSlug(tp, INITIAL_FINANCIALS)).toBe("credit-points");
  });
});
