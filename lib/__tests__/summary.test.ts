import { describe, it, expect } from "vitest";
import { buildSummary, sourceBadge } from "../summary";
import { markManualPaths, MANUAL_DOC_ID } from "../provenance";
import { INITIAL_TAXPAYER } from "../initialState";
import type { FieldProvenance } from "@/types";

const NOW = "2026-06-22T00:00:00.000Z";

describe("sourceBadge (Output 1 attribution)", () => {
  it("no provenance → manual", () => {
    expect(sourceBadge(undefined)).toMatchObject({ manual: true, overrode: false });
  });
  it("mined, not confirmed → document", () => {
    const e: FieldProvenance = { fieldPath: "x", sourceDocId: "d1", sourceLabel: "טופס 106", confidence: "high", minedAt: NOW };
    expect(sourceBadge(e)).toMatchObject({ manual: false, overrode: false, label: "טופס 106" });
  });
  it("manual override of a mined value → flagged as overriding the doc", () => {
    const e = markManualPaths(
      { x: { fieldPath: "x", sourceDocId: "d1", sourceLabel: "טופס 106", confidence: "high", minedAt: NOW } },
      ["x"],
      NOW,
    ).x;
    const b = sourceBadge(e);
    expect(b.manual).toBe(true);
    expect(b.overrode).toBe(true);
    expect(b.label).toContain("טופס 106");
  });
  it("pure manual entry → manual, not overriding", () => {
    const e = markManualPaths({}, ["x"], NOW).x;
    expect(e.sourceDocId).toBe(MANUAL_DOC_ID);
    expect(sourceBadge(e)).toMatchObject({ manual: true, overrode: false });
  });
});

describe("buildSummary", () => {
  it("groups provided data and omits empty rows", () => {
    const taxpayer = {
      ...INITIAL_TAXPAYER,
      firstName: "דוד",
      lastName: "כהן",
      idNumber: "123456782",
      employers: [{ id: "e0", name: "מעסיק א'", isMainEmployer: true, monthsWorked: 12, grossSalary: 90000, taxWithheld: 12000 }],
    };
    const sections = buildSummary(taxpayer);
    const personal = sections.find((s) => s.title === "פרטים אישיים")!;
    expect(personal.rows.find((r) => r.label === "שם מלא")!.value).toBe("דוד כהן");
    const work = sections.find((s) => s.title === "הכנסה מעבודה")!;
    expect(work.rows.some((r) => r.value === "₪90,000")).toBe(true);
    // no degrees / capital → those sections absent
    expect(sections.find((s) => s.title === "השכלה")).toBeUndefined();
  });
});
