/**
 * fieldMap.ts — Load + query auto-generated field-code maps.
 *
 * Maps are produced by `scripts/build-field-map.mjs` from the blank ITA
 * template PDFs. Each map keys 3-digit field codes to their page + value-box
 * rectangle so runtime stampers can place text deterministically.
 *
 * Coordinate system: pdfplumber top-left origin (task.md convention). Use
 * `pdfLibStampPosition()` to convert to pdf-lib's bottom-left origin.
 */
import fs from "node:fs";
import path from "node:path";

export interface ValueBox {
  x_left:   number;
  x_right:  number;
  y_top:    number;
  y_bottom: number;
}

export interface FieldEntry {
  code:      string;
  page:      number;
  code_rect: { x0: number; x1: number; top: number; bottom: number };
  value_box: ValueBox;
  column:    string | null;
}

export interface FieldMap {
  form_id:   string;
  template:  string;
  page_size: { width: number; height: number };
  generated: string;
  fields:    Record<string, FieldEntry>;
}

const cache = new Map<string, FieldMap>();

function mapPath(formId: string): string {
  return path.join(process.cwd(), "templates/maps", `${formId}.json`);
}

export function hasFieldMap(formId: string): boolean {
  return fs.existsSync(mapPath(formId));
}

export function loadFieldMap(formId: string): FieldMap {
  const cached = cache.get(formId);
  if (cached) return cached;
  const raw = fs.readFileSync(mapPath(formId), "utf-8");
  const map = JSON.parse(raw) as FieldMap;
  cache.set(formId, map);
  return map;
}

/**
 * Find a field entry by code. If `column` is given and a column-qualified
 * entry exists (e.g. "158_registered_spouse"), prefer it. Otherwise fall
 * back to the first matching code.
 */
export function findField(
  map: FieldMap,
  code: string,
  column?: string | null,
): FieldEntry | null {
  if (column) {
    const keyed = map.fields[`${code}_${column}`];
    if (keyed) return keyed;
  }
  const direct = map.fields[code];
  if (direct) return direct;
  for (const key of Object.keys(map.fields)) {
    const f = map.fields[key];
    if (f.code === code && (!column || f.column === column)) return f;
  }
  return null;
}

/**
 * Convert a value-box (pdfplumber top-left) to a pdf-lib drawText position
 * (bottom-left). Text is right-aligned inside the box — call sites should
 * subtract `font.widthOfTextAtSize(text, size)` from `x` before drawing
 * for numeric RTL alignment, or pass `x` directly for left-aligned Hebrew.
 */
export function pdfLibStampPosition(
  box: ValueBox,
  pageHeight: number,
  opts: { baselinePad?: number } = {},
): { xLeft: number; xRight: number; y: number } {
  const baselinePad = opts.baselinePad ?? 2;
  const y = pageHeight - box.y_bottom + baselinePad;
  return { xLeft: box.x_left, xRight: box.x_right, y };
}

/**
 * Check whether a hardcoded pdf-lib stamp position falls inside the scanned
 * value-box. Used by regression tests to catch template drift.
 */
export function isInsideBox(
  box: ValueBox,
  pageHeight: number,
  pdfLibX: number,
  pdfLibY: number,
): boolean {
  const yBottomBl = pageHeight - box.y_bottom;
  const yTopBl    = pageHeight - box.y_top;
  return (
    pdfLibX >= box.x_left - 2 &&
    pdfLibX <= box.x_right + 4 &&
    pdfLibY >= yBottomBl - 4 &&
    pdfLibY <= yTopBl    + 4
  );
}
