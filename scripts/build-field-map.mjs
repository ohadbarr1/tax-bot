#!/usr/bin/env node
/**
 * build-field-map.mjs — Auto-scan blank ITA form PDFs for 3-digit field codes.
 *
 * Reads a blank template, extracts every text item with its (x,y) position,
 * filters tokens matching /^\d{3}$/ minus a denylist of form/section refs,
 * and writes a JSON map: field code → page + value_box (input area).
 *
 * Spec comes from 135_1301 generation task.md:
 *   - Field-code labels sit at the RIGHT edge of the value box (RTL form)
 *   - Value box extends ~88 pt to the left of the code
 *   - 2-col rows have paired codes at same y, ~102 pt apart
 *
 * Usage:
 *   node scripts/build-field-map.mjs public/templates/form135_2025.pdf \
 *     templates/maps/135_2025.json
 *
 * Or rebuild all known templates:
 *   node scripts/build-field-map.mjs --all
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");

// ── Denylist: 3-digit tokens that appear on ITA forms but are NOT field codes ──
const DENYLIST = new Set([
  // Form-number references ("צרף טופס 106", "ראה טופס 161" …)
  "106", "116", "119", "127", "134", "135", "150", "161",
  "857", "867", "991",
  // Israeli Tax Ordinance section references ("סעיף 125ד" …)
  "125", "144", "224", "131", "143",
  // Page numbers / form metadata
  "001", "002", "003", "004",
]);

// Form-id tokens >3 digits aren't matched by /^\d{3}$/, no need to list.

// ── Main ──────────────────────────────────────────────────────────────────────

async function loadPdfjs() {
  // pdfjs-dist is bundled by pdf-parse; use its legacy build for Node.
  const pdfjs = await import(
    path.join(ROOT, "node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.mjs")
  );
  return pdfjs;
}

/**
 * Parse a blank template PDF and return an array of field-code entries.
 * Each entry: { code, page, code_rect: {x0,x1,top,bottom}, value_box: {x_left,x_right,y_top,y_bottom} }
 */
async function scanPdf(pdfPath) {
  const pdfjs = await loadPdfjs();
  const data  = new Uint8Array(fs.readFileSync(pdfPath));
  const doc   = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const entries = [];
  let pageSize = { width: 595.275, height: 841.89 };

  for (let p = 1; p <= doc.numPages; p++) {
    const page    = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    if (p === 1) pageSize = { width: viewport.width, height: viewport.height };
    const content = await page.getTextContent();

    for (const item of content.items) {
      const text = (item.str ?? "").trim();
      if (!/^\d{3}$/.test(text)) continue;
      if (DENYLIST.has(text)) continue;

      // pdf.js transform = [scaleX, skewY, skewX, scaleY, tx, ty]
      // ty is bottom-left origin (pdf-lib convention).
      const tx = item.transform[4];
      const ty = item.transform[5];
      const w  = item.width  ?? 12;
      const h  = item.height ?? 10;

      const code_rect = {
        x0: tx,
        x1: tx + w,
        // pdfplumber-style top-left system (task.md uses this)
        top:    pageSize.height - ty - h,
        bottom: pageSize.height - ty,
      };

      // Value-box: 88pt to the left of code label
      const value_box = {
        x_left:    code_rect.x0 - 90,
        x_right:   code_rect.x0 - 2,
        y_top:     code_rect.top - 2,
        y_bottom:  code_rect.bottom + 2,
      };

      entries.push({ code: text, page: p, code_rect, value_box });
    }
  }

  await doc.cleanup();
  await doc.destroy();

  return { entries, pageSize };
}

/**
 * Group duplicate codes by page. Within a page, keep both entries and
 * tag column: right-positioned → registered_spouse, left → spouse.
 */
function assignColumns(entries) {
  const byCodePage = new Map();
  for (const e of entries) {
    const key = `${e.code}__${e.page}`;
    if (!byCodePage.has(key)) byCodePage.set(key, []);
    byCodePage.get(key).push(e);
  }

  const out = [];
  for (const [, group] of byCodePage) {
    if (group.length === 1) {
      out.push({ ...group[0], column: null });
    } else {
      // Sort by x descending; right-most = registered_spouse
      group.sort((a, b) => b.code_rect.x0 - a.code_rect.x0);
      out.push({ ...group[0], column: "registered_spouse" });
      for (let i = 1; i < group.length; i++) {
        out.push({ ...group[i], column: i === 1 ? "spouse" : `col_${i}` });
      }
    }
  }
  return out;
}

function writeMap(pdfPath, outPath, formId, scan) {
  const withCols = assignColumns(scan.entries);
  withCols.sort((a, b) => a.page - b.page
    || a.code_rect.top - b.code_rect.top
    || b.code_rect.x0 - a.code_rect.x0,
  );

  const fields = {};
  for (const e of withCols) {
    const key = e.column ? `${e.code}_${e.column}` : e.code;
    fields[key] = {
      code:       e.code,
      page:       e.page,
      code_rect:  e.code_rect,
      value_box:  e.value_box,
      column:     e.column,
    };
  }

  const doc = {
    form_id:    formId,
    template:   path.basename(pdfPath),
    page_size:  scan.pageSize,
    generated:  new Date().toISOString(),
    fields,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), "utf-8");
  return doc;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const jobs = [];
  if (args[0] === "--all") {
    jobs.push({
      pdf:    path.join(ROOT, "public/templates/form135_2025.pdf"),
      out:    path.join(ROOT, "templates/maps/135_2025.json"),
      formId: "135_2025",
    });
    jobs.push({
      pdf:    path.join(ROOT, "public/templates/form1301_2025.pdf"),
      out:    path.join(ROOT, "templates/maps/1301_2025.json"),
      formId: "1301_2025",
    });
  } else if (args.length === 2) {
    jobs.push({
      pdf:    path.resolve(args[0]),
      out:    path.resolve(args[1]),
      formId: path.basename(args[1], ".json"),
    });
  } else {
    console.error("Usage: node scripts/build-field-map.mjs <blank.pdf> <out.json>");
    console.error("   or: node scripts/build-field-map.mjs --all");
    process.exit(1);
  }

  for (const job of jobs) {
    if (!fs.existsSync(job.pdf)) {
      console.error(`SKIP: ${job.pdf} not found`);
      continue;
    }
    process.stdout.write(`Scanning ${path.relative(ROOT, job.pdf)} ... `);
    const scan = await scanPdf(job.pdf);
    const doc  = writeMap(job.pdf, job.out, job.formId, scan);
    const n    = Object.keys(doc.fields).length;
    console.log(`${n} field codes → ${path.relative(ROOT, job.out)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
