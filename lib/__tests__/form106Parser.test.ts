/**
 * form106Parser.test.ts
 *
 * Golden-file regression tests for `extractForm106Fields`.
 *
 * Two real-world fixture PDFs:
 *   - form106_phoenix.pdf   — Hilan/Phoenix line-per-field layout, primary
 *     employer (11 months, annual gross 290,895 ₪).
 *   - form106_university.pdf — Hebrew University columnar "תוסף 106", secondary
 *     employer (3 months under tax coordination, row "הכנסה חייבת רגילה").
 *
 * These two layouts intentionally exercise both code paths in the parser:
 * single-line "VALUE DESCRIPTION FIELD_CODE" scans, and columnar
 * description/value zipping. The pre-2026-04-15 regex-forward-scan parser
 * returned wrong values on BOTH samples — these tests lock the fix.
 *
 * **Phase 1 §1.C (2026-04-29)**: extended to lock all 14 canonical Form 106
 * ITA codes. Closes ingestion-F-1 (only 3/14 fields parsed), ingestion-F-2
 * (158-vs-158 silent ambiguity), and ingestion-F-3 (>=100 noise filter
 * documented bug). Ground truth verified against the source PDFs via the
 * verification trail in audits/ingestion.md §6.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { extractForm106Fields } from "../form106Parser";

// pdf-parse must run with DOM-shims in place, same as the live route.
function installPdfjsDomStubs(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = class {};
  if (typeof g.ImageData === "undefined") g.ImageData = class {};
  if (typeof g.Path2D === "undefined") g.Path2D = class {};
}

async function extractPdfText(path: string): Promise<string> {
  installPdfjsDomStubs();
  const { PDFParse } = await import("pdf-parse");
  const buf = readFileSync(path);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy();
  }
}

const PHOENIX_PATH = join(__dirname, "fixtures", "form106_phoenix.pdf");
const UNIVERSITY_PATH = join(__dirname, "fixtures", "form106_university.pdf");

describe("extractForm106Fields — Phoenix line-per-field layout", () => {
  let text: string;

  beforeAll(async () => {
    text = await extractPdfText(PHOENIX_PATH);
  });

  it("extracts the correct gross salary (field 172/158 = 290,895)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.grossSalary).toBe(290_895);
  });

  it("extracts the correct tax withheld (field 042 = 44,916)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.taxWithheld).toBe(44_916);
  });

  it("extracts the correct pension deduction (field 086/045 = 16,174)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.pensionDeduction).toBe(16_174);
  });

  it("extracts 11 months worked (not default 12)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.monthsWorked).toBe(11);
  });

  it("extracts the employer name from 'השולח:' label", () => {
    const fields = extractForm106Fields(text);
    // PDF line: "השולח: הפניקס השקעות מתקדמות בע\"מ"
    expect(fields.employerName).toBeDefined();
    expect(fields.employerName).toMatch(/הפניקס/);
  });
});

describe("extractForm106Fields — University columnar layout", () => {
  let text: string;

  beforeAll(async () => {
    text = await extractPdfText(UNIVERSITY_PATH);
  });

  it("extracts the correct gross salary ('הכנסה חייבת רגילה' = 9,253)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.grossSalary).toBe(9_253);
  });

  it("extracts the correct tax withheld ('מס הכנסה שנוכה במקור' = 3,569)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.taxWithheld).toBe(3_569);
  });

  it("extracts the correct pension deduction ('ניכוי לקופת גמל לקצבה' = 648)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.pensionDeduction).toBe(648);
  });

  it("extracts 3 months worked from the 'חודשי עבודה לפי תאום' row", () => {
    const fields = extractForm106Fields(text);
    // Row: "25 25 25 0 0 0 0 0 0 0 0 0" → 3 non-zero months
    expect(fields.monthsWorked).toBe(3);
  });

  it("extracts the employer name from 'מעסיק:' label", () => {
    const fields = extractForm106Fields(text);
    expect(fields.employerName).toBeDefined();
    expect(fields.employerName).toMatch(/העברית|אוניברסיטה/);
  });
});

describe("extractForm106Fields — robustness against noise inputs", () => {
  it("returns all undefined on empty text", () => {
    const fields = extractForm106Fields("");
    expect(fields.grossSalary).toBeUndefined();
    expect(fields.taxWithheld).toBeUndefined();
    expect(fields.pensionDeduction).toBeUndefined();
    expect(fields.monthsWorked).toBeUndefined();
    expect(fields.employerName).toBeUndefined();
  });

  it("does not match field 158 inside '1158' or '1580'", () => {
    const text = "1158 שדה בדיקה 99,999\n1580 שדה נוסף 88,888";
    const fields = extractForm106Fields(text);
    expect(fields.grossSalary).toBeUndefined();
  });

  // F-3 fix (Phase 1 §1.C): the previous test enshrined a bug as expected
  // behaviour ("returns the year 2025 as gross salary"). With the F-2 fix the
  // grossSalary lookup now requires a "רגילה" description label, so a bare
  // "2025 שנת המס 172/158" line is no longer matched.
  it("F-3 does NOT confuse the year token with a salary value", () => {
    const text = "2025 שנת המס 172/158";
    const fields = extractForm106Fields(text);
    expect(fields.grossSalary).toBeUndefined();
  });
});

// ─── Phase 1 §1.C — full 14-code coverage (closes ingestion-F-1, F-2) ─────────

describe("extractForm106Fields — Phoenix full 14-code coverage [F-1]", () => {
  let text: string;
  beforeAll(async () => {
    text = await extractPdfText(PHOENIX_PATH);
  });

  it("F-1 field 219/218 (study-fund salary) = 230,215", () => {
    const fields = extractForm106Fields(text);
    expect(fields.studyFundSalary).toBe(230_215);
  });

  it("F-1 field 245/244 (pension-insured salary) = 231,063", () => {
    const fields = extractForm106Fields(text);
    expect(fields.pensionInsuredSalary).toBe(231_063);
  });

  it("F-1 field 249/248 (employer pension total) = 36,577", () => {
    const fields = extractForm106Fields(text);
    expect(fields.employerPensionTotal).toBe(36_577);
  });

  it("F-1 field 086 (BL + health withheld) = 15,431 + 13,434 = 28,865", () => {
    const fields = extractForm106Fields(text);
    expect(fields.nationalInsuranceWithheld).toBe(15_431 + 13_434);
  });

  it("F-1 field 044 (credit-points value, ILS) = 17,119", () => {
    const fields = extractForm106Fields(text);
    expect(fields.creditPointsValue).toBe(17_119);
  });

  it("F-1 field 044 (credit-points count) = 6.75", () => {
    const fields = extractForm106Fields(text);
    expect(fields.creditPointsCount).toBe(6.75);
  });

  it("F-1 field 004 (תיק ניכויים) = '939387767'", () => {
    const fields = extractForm106Fields(text);
    expect(fields.taxFileNumber).toBe("939387767");
  });

  it("F-1 field 033 (income type) = 1 (regular salary)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.incomeType).toBe(1);
  });

  it("F-2 Phoenix has NO תיאום row → field158Coordinated is undefined", () => {
    const fields = extractForm106Fields(text);
    expect(fields.field158Coordinated).toBeUndefined();
  });

  it("F-1 field 272 (severance taxable) absent on Phoenix → undefined", () => {
    const fields = extractForm106Fields(text);
    expect(fields.severanceTaxable).toBeUndefined();
  });

  it("F-1 field 037 (employer donations) absent on Phoenix → undefined", () => {
    const fields = extractForm106Fields(text);
    expect(fields.employerDonations).toBeUndefined();
  });

  it("F-1 field 089/090 (exemption sections) absent on Phoenix → undefined", () => {
    const fields = extractForm106Fields(text);
    expect(fields.exemptionSection9a).toBeUndefined();
    expect(fields.exemptionSection9b).toBeUndefined();
  });
});

describe("extractForm106Fields — TA/University full 14-code coverage [F-1, F-2]", () => {
  let text: string;
  beforeAll(async () => {
    text = await extractPdfText(UNIVERSITY_PATH);
  });

  // F-2: the canonical bug — 158 emitted twice. grossSalary must be the
  // "רגילה" line (9,253), and field158Coordinated must be the "נוסף\לפי תאום"
  // line (11,455). The legacy parser silently returned only 9,253.
  it("F-2 grossSalary (158 רגילה) = 9,253 (NOT 11,455)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.grossSalary).toBe(9_253);
  });

  it("F-2 field158Coordinated (158 נוסף\\לפי תאום) = 11,455", () => {
    const fields = extractForm106Fields(text);
    expect(fields.field158Coordinated).toBe(11_455);
  });

  it("F-1 field 086 (BL + health) = 802 + 592 = 1,394", () => {
    const fields = extractForm106Fields(text);
    expect(fields.nationalInsuranceWithheld).toBe(802 + 592);
  });

  it("F-1 field 219 (study-fund salary) = 9,253", () => {
    const fields = extractForm106Fields(text);
    expect(fields.studyFundSalary).toBe(9_253);
  });

  it("F-1 field 218 (employer study-fund) = 694", () => {
    const fields = extractForm106Fields(text);
    expect(fields.studyFundEmployer).toBe(694);
  });

  it("F-1 field 245 (pension-insured salary) = 9,253", () => {
    const fields = extractForm106Fields(text);
    expect(fields.pensionInsuredSalary).toBe(9_253);
  });

  it("F-1 field 249 (employer pension total) = 1,249", () => {
    const fields = extractForm106Fields(text);
    expect(fields.employerPensionTotal).toBe(1_249);
  });

  it("F-1 field 004 (תיק ניכויים) = '941180002'", () => {
    const fields = extractForm106Fields(text);
    expect(fields.taxFileNumber).toBe("941180002");
  });

  it("F-1 field 033 (income type) = 1 (regular salary)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.incomeType).toBe(1);
  });

  // The TA fixture has the description "תשלומים פטורים לפי סעיף 9א" but does
  // not pair it with a labeled value on a single line; the parser cannot
  // recover a value here without more layout context. This test locks the
  // graceful degradation (undefined, NOT a wrong value).
  it("F-1 field 089 (exemption 9א) — TA layout: undefined (graceful)", () => {
    const fields = extractForm106Fields(text);
    expect(fields.exemptionSection9a).toBeUndefined();
  });
});

// ─── Synthetic-text edge-case coverage (closes F-2 line-per-field path) ──────

describe("extractForm106Fields — synthetic 158-ambiguity [F-2]", () => {
  // Synthesises the line-per-field layout where BOTH 158 rows live on the
  // same Phoenix-style document (rare but seen on dual-employment payslips).
  // Reproduces the F-2 silent-bug surface.
  it("F-2 line-per-field with both 158 rows: separates רגילה vs תיאום", () => {
    const synthetic = [
      "10,000 הכנסה חייבת רגילה 172/158",
      "8,000 משכורת חייבת במס - נוספת/לפי תאום 158",
      "1,500 מס הכנסה 042",
    ].join("\n");
    const fields = extractForm106Fields(synthetic);
    expect(fields.grossSalary).toBe(10_000);
    expect(fields.field158Coordinated).toBe(8_000);
    expect(fields.taxWithheld).toBe(1_500);
  });

  it("F-1 field 272 (severance) on synthetic 161-style line", () => {
    const synthetic = [
      "150,000 פיצויי פיטורין חייבים במס 272",
    ].join("\n");
    const fields = extractForm106Fields(synthetic);
    expect(fields.severanceTaxable).toBe(150_000);
  });

  it("F-1 field 037 (donations) on synthetic line", () => {
    const synthetic = [
      "2,500 תרומות שהמעסיק העביר לפי סעיף 46 037",
    ].join("\n");
    const fields = extractForm106Fields(synthetic);
    expect(fields.employerDonations).toBe(2_500);
  });

  it("F-1 field 089 (exemption 9א) on synthetic labeled line", () => {
    // Phoenix-like labeled line with code prefix.
    const synthetic = [
      "12,500 חלק פטור לפי סעיף 9א 089",
    ].join("\n");
    const fields = extractForm106Fields(synthetic);
    expect(fields.exemptionSection9a).toBe(12_500);
  });

  it("F-1 field 033 (income type) — pension document → 2", () => {
    const synthetic = [
      "טופס 106 - קצבה לשנת 2025",
      "120,000 הכנסת קצבה 172/158",
    ].join("\n");
    const fields = extractForm106Fields(synthetic);
    expect(fields.incomeType).toBe(2);
  });

  it("F-1 field 033 (income type) — severance document → 5", () => {
    const synthetic = [
      "טופס 106 לשנת 2025",
      "פיצויי פיטורין שולמו לעובד",
      "150,000 פיצויי פיטורין חייבים במס 272",
    ].join("\n");
    const fields = extractForm106Fields(synthetic);
    expect(fields.incomeType).toBe(5);
  });
});
