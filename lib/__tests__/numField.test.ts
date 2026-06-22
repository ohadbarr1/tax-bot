/**
 * T7.1 — numField never yields NaN (the root of "NaN ₪" on the dashboard).
 */
import { describe, it, expect } from "vitest";
import { numField, finiteOr0 } from "../utils";

describe("numField", () => {
  it("empty/blank → undefined", () => {
    expect(numField("")).toBeUndefined();
    expect(numField("   ")).toBeUndefined();
  });
  it("non-numeric → undefined (never NaN)", () => {
    expect(numField("abc")).toBeUndefined();
    expect(numField("1e")).toBeUndefined();
    expect(numField("12,34")).toBeUndefined(); // ambiguous → reject
  });
  it("valid numbers parse", () => {
    expect(numField("90000")).toBe(90000);
    expect(numField("0")).toBe(0);
    expect(numField("-5")).toBe(-5);
  });
});

describe("finiteOr0", () => {
  it("coerces non-finite to 0", () => {
    expect(finiteOr0(NaN)).toBe(0);
    expect(finiteOr0(undefined)).toBe(0);
    expect(finiteOr0(Infinity)).toBe(0);
    expect(finiteOr0(42)).toBe(42);
  });
});
