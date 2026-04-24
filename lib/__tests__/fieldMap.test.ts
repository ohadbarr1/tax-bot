import { describe, it, expect } from "vitest";
import { loadFieldMap, findField, hasFieldMap } from "../fieldMap";

describe("auto-generated field-code maps", () => {
  it("135_2025 map exists and is well-formed", () => {
    expect(hasFieldMap("135_2025")).toBe(true);
    const map = loadFieldMap("135_2025");
    expect(map.form_id).toBe("135_2025");
    expect(map.page_size.width).toBeCloseTo(595.275, 0);
    expect(map.page_size.height).toBeCloseTo(841.89, 0);
  });

  it("1301_2025 map exists and is well-formed", () => {
    expect(hasFieldMap("1301_2025")).toBe(true);
    const map = loadFieldMap("1301_2025");
    expect(map.form_id).toBe("1301_2025");
  });

  // Acceptance criteria from 135_1301 generation task.md:
  //   "Each generated map contains 100+ field codes for Form 1301 and 80+
  //    for Form 135 across all pages."
  it("135_2025 map has 80+ field codes across all pages", () => {
    const map = loadFieldMap("135_2025");
    expect(Object.keys(map.fields).length).toBeGreaterThanOrEqual(80);
  });

  it("1301_2025 map has 100+ field codes across all pages", () => {
    const map = loadFieldMap("1301_2025");
    expect(Object.keys(map.fields).length).toBeGreaterThanOrEqual(100);
  });

  // Pin known field codes so a silently-shifted template fails loud.
  it("135_2025 code 158 (main gross salary) is on page 1 in expected region", () => {
    const map = loadFieldMap("135_2025");
    const f = findField(map, "158");
    expect(f).not.toBeNull();
    expect(f!.page).toBe(1);
    // Code label should be in the right-hand column near y≈500 (top-left origin)
    expect(f!.code_rect.x0).toBeGreaterThan(200);
    expect(f!.code_rect.x0).toBeLessThan(240);
    expect(f!.code_rect.top).toBeGreaterThan(490);
    expect(f!.code_rect.top).toBeLessThan(520);
  });

  it("135_2025 code 272 (severance, 2nd employer column) anchors left column", () => {
    const map = loadFieldMap("135_2025");
    const f = findField(map, "272");
    expect(f).not.toBeNull();
    // Left column: x in ~100-125 range
    expect(f!.code_rect.x0).toBeGreaterThan(100);
    expect(f!.code_rect.x0).toBeLessThan(140);
  });

  it("denylist excludes form-number references like 106 on page 1 of 1301", () => {
    const map = loadFieldMap("1301_2025");
    // 106 appears as a form reference ("צרף טופס 106"), not a field code
    const f = findField(map, "106");
    expect(f).toBeNull();
  });

  it("value_box sits to the LEFT of code_rect with ~90pt width (RTL convention)", () => {
    const map = loadFieldMap("135_2025");
    const f = findField(map, "158")!;
    expect(f.value_box.x_right).toBeLessThanOrEqual(f.code_rect.x0);
    const boxWidth = f.value_box.x_right - f.value_box.x_left;
    expect(boxWidth).toBeGreaterThanOrEqual(80);
    expect(boxWidth).toBeLessThanOrEqual(100);
  });
});
