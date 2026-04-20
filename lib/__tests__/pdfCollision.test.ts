import { describe, it, expect } from "vitest";
import { detectFieldCollisions } from "../pdfUtils";

describe("detectFieldCollisions", () => {
  it("returns empty for disjoint fields", () => {
    expect(
      detectFieldCollisions([
        { id: "a", page: 0, x: 0, y: 0, width: 50, height: 10 },
        { id: "b", page: 0, x: 60, y: 0, width: 50, height: 10 },
      ]),
    ).toEqual([]);
  });

  it("flags overlapping fields on same page", () => {
    const r = detectFieldCollisions([
      { id: "a", page: 0, x: 0, y: 0, width: 60, height: 10 },
      { id: "b", page: 0, x: 30, y: 5, width: 50, height: 10 },
    ]);
    expect(r).toEqual([{ a: "a", b: "b", page: 0 }]);
  });

  it("ignores overlap across pages", () => {
    expect(
      detectFieldCollisions([
        { id: "a", page: 0, x: 0, y: 0, width: 60, height: 10 },
        { id: "b", page: 1, x: 30, y: 5, width: 50, height: 10 },
      ]),
    ).toEqual([]);
  });

  it("treats touching edges as non-overlapping", () => {
    expect(
      detectFieldCollisions([
        { id: "a", page: 0, x: 0, y: 0, width: 50, height: 10 },
        { id: "b", page: 0, x: 50, y: 0, width: 50, height: 10 },
      ]),
    ).toEqual([]);
  });
});
