import { describe, it, expect } from "vitest";
import { buildForm135Fields, buildForm1301Fields } from "../pdfUtils";
import type { TaxPayer, FinancialData } from "@/types";

const sampleTaxpayer: TaxPayer = {
  id: "fixture-1",
  idNumber: "123456789",
  spouseId: "987654321",
  firstName: "אוהד",
  lastName: "בר",
  fullName: "Ohad Bar - אוהד בר",
  profession: "Software Engineer",
  maritalStatus: "married",
  spouseHasIncome: true,
  children: [],
  degrees: [],
  employers: [
    {
      id: "emp-main",
      name: "Acme Ltd",
      monthsWorked: 12,
      grossSalary: 480000,
      taxWithheld: 96000,
      pensionDeduction: 33600,
      isMainEmployer: true,
    },
    {
      id: "emp-2",
      name: "Side Co",
      monthsWorked: 6,
      grossSalary: 60000,
      taxWithheld: 12000,
      pensionDeduction: 3000,
      isMainEmployer: false,
    },
  ],
  personalDeductions: [
    { id: "d1", type: "donation_sec46", amount: 5000, providerName: "Zaka" },
    { id: "d2", type: "life_insurance_sec45a", amount: 2400, providerName: "Migdal" },
    { id: "d3", type: "pension_sec47", amount: 7200, providerName: "Clal" },
  ],
  lifeEvents: {
    changedJobs: false,
    pulledSeverancePay: false,
    hasForm161: false,
    taxableSeverancePay: 0,
  },
  address: { city: "תל אביב", street: "דיזנגוף", houseNumber: "100" },
  bank: { bankId: "12", bankName: "הפועלים", branch: "123", account: "456789" },
  capitalGains: {
    totalRealizedProfit: 50000,
    totalRealizedLoss: 8000,
    foreignTaxWithheld: 1500,
    dividends: 12000,
  },
} as unknown as TaxPayer;

const sampleFinancials: FinancialData = {
  taxYears: [2024],
  employersCount: 2,
  hasForeignBroker: true,
  estimatedRefund: 18000,
  insights: [],
  actionItems: [],
} as unknown as FinancialData;

describe("PDF golden field snapshots", () => {
  it("Form 135 field output is stable", () => {
    const f = buildForm135Fields(sampleTaxpayer, sampleFinancials);
    // Strip dynamic fields (date-dependent) before snapshotting.
    const stable = { ...f };
    delete (stable as { signatureDate?: string }).signatureDate;
    expect(stable).toMatchInlineSnapshot(`
      {
        "012": "123456789",
        "013": "987654321",
        "014": "כן",
        "020": "נשוי/נשואה",
        "022": "תל אביב",
        "023": "דיזנגוף",
        "024": "100",
        "031": "אוהד",
        "032": "בר",
        "036": "2,400",
        "037": "5,000",
        "042": "108,000",
        "045": "36,600",
        "055": "1,500",
        "069": "12,000",
        "086": "",
        "117": "12,000",
        "124": "",
        "135": "7,200",
        "158": "540,000",
        "166": "8,000",
        "245": "",
        "256": "50,000",
        "272": "0",
        "account_number": "456789",
        "aliyahDate": "",
        "bank_name": "הפועלים",
        "bank_number": "12",
        "branch_number": "123",
        "carriedForwardLoss": "0",
        "declarationMark": "X",
        "estimatedRefund": "18,000",
        "foreignSourceCountry": "",
        "maritalStatusLabel": "נשוי/נשואה",
        "pensionFundId": "",
        "pensionFundName": "",
        "peripheryFlag": "",
        "signatureName": "אוהד בר",
        "spouseCreditPoints": "",
        "spouseGrossSalary": "0",
        "taxYear": "2024",
      }
    `);
  });

  it("Form 1301 field output is stable", () => {
    const f = buildForm1301Fields(sampleTaxpayer, sampleFinancials);
    // Strip dynamic fields (date-dependent) before snapshotting.
    const stable = { ...f };
    delete (stable as { signatureDate?: string }).signatureDate;
    expect(stable).toMatchInlineSnapshot(`
      {
        "012": "123456789",
        "013": "987654321",
        "014": "כן",
        "020": "נשוי/נשואה",
        "022": "תל אביב",
        "023": "דיזנגוף",
        "024": "100",
        "031": "אוהד",
        "032": "בר",
        "036": "2,400",
        "036_p3": "2,400",
        "037": "5,000",
        "037_p3": "5,000",
        "042": "108,000",
        "042_p3": "108,000",
        "044": "456789",
        "045": "36,600",
        "045_p3": "36,600",
        "055": "1,500",
        "055_1301": "1,500",
        "060": "50,000",
        "067": "8,000",
        "068_main": "96,000",
        "069": "12,000",
        "069_2nd": "12,000",
        "078": "5,000",
        "086": "",
        "117": "12,000",
        "124": "",
        "126": "2,400",
        "135": "7,200",
        "141": "12,000",
        "142": "7,200",
        "157": "1,500",
        "158": "540,000",
        "158_main": "480,000",
        "166": "8,000",
        "172_2nd": "60,000",
        "201": "0",
        "211": "0",
        "245": "",
        "256": "50,000",
        "258_main": "33,600",
        "272": "0",
        "273": "123",
        "274": "12",
        "301": "0",
        "335": "14,600",
        "account_number": "456789",
        "aliyahDate": "",
        "bank_name": "הפועלים",
        "bank_number": "12",
        "branch_number": "123",
        "carriedForwardLoss": "0",
        "declarationMark": "X",
        "estimatedRefund": "18,000",
        "foreignSourceCountry": "",
        "maritalStatusLabel": "נשוי/נשואה",
        "pensionFundId": "",
        "pensionFundName": "",
        "peripheryFlag": "",
        "signatureName": "אוהד בר",
        "spouseCreditPoints": "",
        "spouseGrossSalary": "0",
        "taxYear": "2024",
      }
    `);
  });

  it("Form 135 field count does not regress (≥38 after Phase 0 §0.D)", () => {
    const f = buildForm135Fields(sampleTaxpayer, sampleFinancials);
    expect(Object.keys(f).length).toBeGreaterThanOrEqual(38);
  });

  it("Form 1301 field count does not regress (≥55 after Phase 0 §0.D)", () => {
    const f = buildForm1301Fields(sampleTaxpayer, sampleFinancials);
    expect(Object.keys(f).length).toBeGreaterThanOrEqual(55);
  });
});
