#!/usr/bin/env node
/**
 * calibrate-form.js — Calibration verification for Form 135 (2025)
 *
 * Loads the 2025 template PDF, reads the field coordinate map,
 * draws sample data at every mapped position, and adds red labels
 * for visual verification.
 *
 * Usage:  node scripts/calibrate-form.js
 * Output: /tmp/form135_calibration_output.pdf
 */

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "public", "templates", "form135_2025.pdf");
const FIELD_MAP_PATH = path.join(ROOT, "data", "form135_2025_fields.json");
const FONT_PATH = path.join(ROOT, "public", "fonts", "Assistant-Regular.ttf");
const OUTPUT_PATH = "/tmp/form135_calibration_output.pdf";

// ── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_DATA = {
  taxYear:       "2025",
  idNumber:      "123456789",
  spouseId:      "987654321",
  firstName:     "ישראל",
  lastName:      "ישראלי",
  city:          "תל אביב",
  street:        "הרצל",
  houseNumber:   "42",
  grossSalary:   "240,000",
  taxWithheld:   "48,000",
  pension:       "18,000",
  severance:     "50,000",
  capitalGain:   "35,000",
  capitalLoss:   "12,000",
  foreignTax:    "5,000",
  donations:     "8,000",
  lifeInsurance: "3,600",
  indPension:    "6,000",
  bankNumber:    "12",
  branchNumber:  "345",
  accountNumber: "678901",
};

// ── Hebrew reversal for pdf-lib (no BiDi engine) ────────────────────────────

function hebrewReverse(text) {
  if (!text) return "";
  return text.split("").reverse().join("");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate inputs exist
  for (const [label, p] of [["Template", TEMPLATE_PATH], ["Field map", FIELD_MAP_PATH], ["Font", FONT_PATH]]) {
    if (!fs.existsSync(p)) {
      console.error(`ERROR: ${label} not found at ${p}`);
      process.exit(1);
    }
  }

  // Load field map
  const fieldMap = JSON.parse(fs.readFileSync(FIELD_MAP_PATH, "utf-8"));
  const fields = fieldMap.fields;

  // Load template
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

  console.log(`Template: ${TEMPLATE_PATH}`);
  console.log(`Pages: ${pdfDoc.getPageCount()}`);
  const pg0 = pdfDoc.getPage(0);
  const { width, height } = pg0.getSize();
  console.log(`Page 0 size: ${width} x ${height}`);

  // Embed fonts
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(FONT_PATH);
  const hebrewFont = await pdfDoc.embedFont(fontBytes, { subset: false });
  const latinBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const labelFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Draw each field
  let drawn = 0;
  for (const [key, spec] of Object.entries(fields)) {
    const sampleText = SAMPLE_DATA[key];
    if (!sampleText) {
      console.warn(`  SKIP: no sample data for "${key}"`);
      continue;
    }

    const page = pdfDoc.getPage(spec.pg);
    const fontSize = spec.sz || 10;
    const isHebrew = spec.font === "hebrew";
    const font = isHebrew ? hebrewFont : latinBold;
    const displayText = isHebrew ? hebrewReverse(sampleText) : sampleText;

    // For taxYear: cover existing printed year with white rectangle
    if (key === "taxYear" && spec.cover) {
      page.drawRectangle({
        x: spec.cover.x,
        y: spec.cover.y,
        width: spec.cover.w,
        height: spec.cover.h,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }

    // Draw the sample data in blue so it stands out from the form
    try {
      page.drawText(displayText, {
        x: spec.x,
        y: spec.y,
        font,
        size: fontSize,
        color: rgb(0, 0, 0.8),
      });
    } catch (e) {
      console.warn(`  ERR drawing "${key}": ${e.message}`);
      continue;
    }

    // Draw red calibration label above the data
    try {
      page.drawText(`[${key}]`, {
        x: spec.x,
        y: spec.y + fontSize + 2,
        font: labelFont,
        size: 5,
        color: rgb(0.9, 0, 0),
      });
    } catch { /* non-critical */ }

    // Draw a small crosshair at the exact coordinate
    const cx = spec.x;
    const cy = spec.y;
    page.drawLine({ start: { x: cx - 3, y: cy }, end: { x: cx + 3, y: cy }, thickness: 0.3, color: rgb(1, 0, 0) });
    page.drawLine({ start: { x: cx, y: cy - 3 }, end: { x: cx, y: cy + 3 }, thickness: 0.3, color: rgb(1, 0, 0) });

    drawn++;
    console.log(`  OK: ${key} @ (${spec.x}, ${spec.y}) sz=${fontSize} font=${spec.font}`);
  }

  // Save
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(OUTPUT_PATH, Buffer.from(pdfBytes));
  console.log(`\nDrawn ${drawn}/${Object.keys(fields).length} fields`);
  console.log(`Output: ${OUTPUT_PATH} (${pdfBytes.byteLength} bytes)`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
