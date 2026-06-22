/**
 * Hebrew PDF shaping (T6.1). Pure-Hebrew strings shape correctly via fontkit
 * (verified by rasterizing — names/cities render RTL). The defect is embedded
 * MULTI-digit runs in mixed strings rendering reversed; reverseDigitRuns fixes
 * it so the renderer's reversal cancels out. Verified visually with pdftoppm +
 * macOS CoreGraphics during the loop.
 */
import { describe, it, expect } from "vitest";
import { shapeForPdf, reverseDigitRuns, hasHebrew, RTL_MARK } from "../bidi";

describe("reverseDigitRuns", () => {
  it("reverses multi-digit runs, leaves single digits + non-digits", () => {
    expect(reverseDigitRuns("אלנבי 112 דירה 3")).toBe("אלנבי 211 דירה 3");
    expect(reverseDigitRuns("ת.ד. 1234")).toBe("ת.ד. 4321");
    expect(reverseDigitRuns("בן יהודה 5")).toBe("בן יהודה 5"); // single digit untouched
    expect(reverseDigitRuns("רחוב הרצל")).toBe("רחוב הרצל"); // no digits
  });
});

describe("shapeForPdf", () => {
  it("pure Hebrew → logical order + RTL mark (fontkit shapes it correctly)", () => {
    expect(shapeForPdf("אוהד בר")).toBe(RTL_MARK + "אוהד בר");
  });
  it("non-Hebrew passes through unchanged", () => {
    expect(shapeForPdf("Google")).toBe("Google");
    expect(shapeForPdf("12345")).toBe("12345");
  });
  it("mixed Hebrew+digits → digit runs pre-reversed so they render correctly", () => {
    expect(shapeForPdf("אלנבי 112")).toBe(RTL_MARK + "אלנבי 211");
  });
  it("hasHebrew detects the Hebrew block", () => {
    expect(hasHebrew("שלום")).toBe(true);
    expect(hasHebrew("hello 5")).toBe(false);
  });
});
