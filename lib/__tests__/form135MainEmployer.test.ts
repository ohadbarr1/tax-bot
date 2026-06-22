/**
 * T6.2 — Form 135 fields 158/042/045 hold the MAIN employer only; the secondary
 * employer's tax goes to 069. Regression against the old bug where 158/042/045
 * held the SUM, double-counting the secondary tax that also appears in 069.
 * (ASSUMPTION pending real-form verification — see DEFERRED_ACTIONS.md.)
 */
import { describe, it, expect } from "vitest";
import { buildForm135Fields } from "../pdfUtils";
import { INITIAL_TAXPAYER, INITIAL_FINANCIALS } from "../initialState";

describe("buildForm135Fields — main employer vs total", () => {
  it("two employers: 158/042/045 = main only, 069 = secondary tax", () => {
    const taxpayer = {
      ...INITIAL_TAXPAYER,
      employers: [
        { id: "m", name: "ראשי", isMainEmployer: true, monthsWorked: 12, grossSalary: 480000, taxWithheld: 96000, pensionDeduction: 33600 },
        { id: "s", name: "משני", isMainEmployer: false, monthsWorked: 6, grossSalary: 60000, taxWithheld: 12000, pensionDeduction: 3000 },
      ],
    };
    const f = buildForm135Fields(taxpayer, INITIAL_FINANCIALS);
    expect(f["158"]).toBe("480,000"); // main gross, not 540,000
    expect(f["042"]).toBe("96,000"); // main tax, not 108,000
    expect(f["045"]).toBe("33,600"); // main pension, not 36,600
    expect(f["069"]).toBe("12,000"); // secondary tax — total still reconstructs to 108,000
  });

  it("single employer: main == only employer (unchanged behavior)", () => {
    const taxpayer = {
      ...INITIAL_TAXPAYER,
      employers: [{ id: "m", name: "ראשי", isMainEmployer: true, monthsWorked: 12, grossSalary: 300000, taxWithheld: 70000, pensionDeduction: 20000 }],
    };
    const f = buildForm135Fields(taxpayer, INITIAL_FINANCIALS);
    expect(f["158"]).toBe("300,000");
    expect(f["042"]).toBe("70,000");
  });
});
