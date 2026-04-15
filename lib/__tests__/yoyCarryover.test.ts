import { describe, it, expect } from "vitest";
import { carryForwardFromPriorDraft } from "../yoyCarryover";
import type { TaxYearDraft, TaxPayer } from "@/types";
import { INITIAL_TAXPAYER, INITIAL_FINANCIALS } from "../initialState";

function makeDraft(year: number, taxpayer: Partial<TaxPayer>): TaxYearDraft {
  return {
    id: `draft-${year}`,
    taxYear: year,
    status: "draft",
    questionnaire: { step: 1, completed: false },
    taxpayer: { ...INITIAL_TAXPAYER, ...taxpayer },
    financials: INITIAL_FINANCIALS,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("carryForwardFromPriorDraft", () => {
  it("returns blank taxpayer when no drafts", () => {
    const res = carryForwardFromPriorDraft({}, 2025, "draft-new");
    expect(res.sourceDraftId).toBeNull();
    expect(res.taxpayer.idNumber).toBe("");
    expect(Object.keys(res.provenance)).toHaveLength(0);
  });

  it("ignores drafts from the same or future year", () => {
    const drafts = {
      a: makeDraft(2025, { idNumber: "111" }),
      b: makeDraft(2026, { idNumber: "222" }),
    };
    const res = carryForwardFromPriorDraft(drafts, 2025, "draft-new");
    expect(res.sourceDraftId).toBeNull();
    expect(res.taxpayer.idNumber).toBe("");
  });

  it("picks the most recent prior year and carries persistent fields", () => {
    const drafts = {
      old: makeDraft(2023, { idNumber: "111", firstName: "A" }),
      mid: makeDraft(2024, {
        idNumber: "999",
        firstName: "נעמה",
        lastName: "כהן",
        profession: "מהנדסת",
        maritalStatus: "married",
        address: { city: "תל אביב", street: "הרצל", houseNumber: "1" },
        bank: { bankId: "12", bankName: "הפועלים", branch: "600", account: "123456" },
        children: [{ id: "c1", birthDate: "2020-05-01", inDaycare: true }],
      }),
    };
    const res = carryForwardFromPriorDraft(drafts, 2025, "draft-new");
    expect(res.sourceDraftId).toBe("draft-2024");
    expect(res.sourceTaxYear).toBe(2024);
    expect(res.taxpayer.idNumber).toBe("999");
    expect(res.taxpayer.firstName).toBe("נעמה");
    expect(res.taxpayer.maritalStatus).toBe("married");
    expect(res.taxpayer.address?.city).toBe("תל אביב");
    expect(res.taxpayer.bank?.account).toBe("123456");
    expect(res.taxpayer.children).toHaveLength(1);
    // Provenance tagged for each carried field
    expect(res.provenance["taxpayer.idNumber"]).toMatchObject({
      sourceDocId: "prior-year:2024",
      confidence: "high",
    });
    expect(res.provenance["taxpayer.bank.account"]).toBeDefined();
    expect(res.provenance["taxpayer.children[0].birthDate"]).toBeDefined();
  });

  it("does NOT carry employers, deductions, or life events", () => {
    const drafts = {
      prior: makeDraft(2024, {
        idNumber: "555",
        employers: [
          { id: "e1", name: "חברה א", isMainEmployer: true, monthsWorked: 12, grossSalary: 100000 },
        ],
        personalDeductions: [
          { id: "d1", type: "donation_sec46", amount: 500, providerName: "עמותה" },
        ],
        lifeEvents: { changedJobs: true, pulledSeverancePay: true, hasForm161: true },
      }),
    };
    const res = carryForwardFromPriorDraft(drafts, 2025, "draft-new");
    expect(res.taxpayer.idNumber).toBe("555");
    expect(res.taxpayer.employers).toEqual([]);
    expect(res.taxpayer.personalDeductions).toEqual([]);
    expect(res.taxpayer.lifeEvents).toEqual({
      changedJobs: false,
      pulledSeverancePay: false,
      hasForm161: false,
    });
    // No provenance for year-specific fields
    expect(res.provenance["taxpayer.employers[0].name"]).toBeUndefined();
  });

  it("does not copy empty-string persistent fields", () => {
    const drafts = {
      prior: makeDraft(2024, { idNumber: "", firstName: "A" }),
    };
    const res = carryForwardFromPriorDraft(drafts, 2025, "draft-new");
    expect(res.provenance["taxpayer.idNumber"]).toBeUndefined();
    expect(res.provenance["taxpayer.firstName"]).toBeDefined();
  });
});
