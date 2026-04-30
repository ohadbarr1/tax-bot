#!/usr/bin/env node
/**
 * smoke-generate.mjs — Exercise the field-mapped stamper end-to-end.
 *
 * Mirrors the route handler logic so we can verify the auto-map pipeline
 * works without spinning up Next.js. Writes sample PDFs to /tmp.
 *
 * Phase 1 §1.J: after stamping, re-extract the rendered PDF via pdf-parse
 * and surface the per-page stamped values + codes-seen so CI smoke is at
 * parity with `lib/__tests__/semanticGolden.test.ts`. A regression that
 * silently moves a value to the wrong page surfaces here too.
 *
 * Usage: node scripts/smoke-generate.mjs
 *        node scripts/smoke-generate.mjs --reextract  # also dump per-page values
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const REEXTRACT = process.argv.includes("--reextract");

// pdf-parse uses pdfjs-dist which expects browser globals — same shim the
// test helper applies (lib/pdfReExtract.ts).
function installPdfjsDomStubs() {
  if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = class {};
  if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = class {};
  if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = class {};
}

const NUMERIC_VALUE_RE = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+$/;

/**
 * Tail-of-page stamped-value extractor — duplicated from
 * `lib/pdfReExtract.ts:extractStampedValuesFromPage`. The smoke runs as
 * plain ESM (no TS), so we cannot import the TS module directly. Keep the
 * two implementations in sync; the test in `lib/__tests__/semanticGolden.test.ts`
 * is authoritative for the behavior.
 */
function isStampedLine(line) {
  const tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return false;
  for (const tok of tokens) {
    if (NUMERIC_VALUE_RE.test(tok)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(tok)) continue;
    if (tok === "X" || tok === "x") continue;
    if (/^[֐-׿]+$/.test(tok)) continue;
    return false;
  }
  return true;
}
function extractStampedFromPage(pageText) {
  const lines = pageText.split(/\r?\n/);
  const tail = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === "") continue;
    if (isStampedLine(line)) tail.unshift(line);
    else break;
  }
  const out = [];
  for (const line of tail) {
    for (const tok of line.split(/\s+/).map((t) => t.trim()).filter(Boolean)) {
      out.push(tok);
    }
  }
  return out;
}
async function reextract(bytes) {
  installPdfjsDomStubs();
  const { PDFParse } = await import("pdf-parse");
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parser = new PDFParse({ data: u8 });
  try {
    const result = await parser.getText();
    const pages = result.pages.map((p) => extractStampedFromPage(p.text));
    return { pages };
  } finally {
    await parser.destroy();
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

const TEXT_COLOR = rgb(0.05, 0.2, 0.7);

function loadMap(formId) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "templates/maps", `${formId}.json`), "utf-8"));
}

function findField(map, code) {
  if (map.fields[code]) return map.fields[code];
  for (const k of Object.keys(map.fields)) if (map.fields[k].code === code) return map.fields[k];
  return null;
}

async function stamp(templatePath, formId, draws) {
  const map   = loadMap(formId);
  const pdfDoc = await PDFDocument.load(fs.readFileSync(templatePath), { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let drawn = 0, missing = 0;
  for (const d of draws) {
    const f = findField(map, d.code);
    if (!f) { missing++; continue; }
    const page = pdfDoc.getPage(f.page - 1);
    const size = d.size ?? 10;
    const y    = map.page_size.height - f.value_box.y_bottom + 2;
    const w    = bold.widthOfTextAtSize(d.text, size);
    const x    = f.value_box.x_right - w - 2;
    page.drawText(d.text, { x, y, font: bold, size, color: TEXT_COLOR });
    drawn++;
  }
  return { bytes: await pdfDoc.save(), drawn, missing, total: draws.length };
}

// Sample values based on the golden-test fixture
const SAMPLE_135 = [
  { code: "158", text: "540,000" },
  { code: "068", text: "108,000" },
  { code: "258", text:  "36,600" },
  { code: "272", text:       "0" },
  { code: "060", text:  "50,000" },
  { code: "067", text:   "8,000" },
  { code: "157", text:   "1,500" },
  { code: "078", text:   "5,000" },
  { code: "126", text:   "2,400" },
  { code: "142", text:   "7,200" },
  { code: "012", text: "123456789" },
  { code: "274", text:      "12" },
  { code: "273", text:     "123" },
  { code: "044", text:  "456789" },
];

const SAMPLE_1301 = [
  { code: "158", text: "480,000" },
  { code: "172", text:  "60,000" },
  { code: "068", text:  "96,000" },
  { code: "069", text:  "12,000" },
  { code: "258", text:  "33,600" },
  { code: "060", text:  "50,000" },
  { code: "067", text:   "8,000" },
  { code: "141", text:  "12,000" },
  { code: "078", text:   "5,000" },
  { code: "126", text:   "2,400" },
  { code: "142", text:   "7,200" },
  { code: "335", text:  "14,600" },
  { code: "036", text:   "2,400" },
  { code: "045", text:  "36,600" },
  { code: "037", text:   "5,000" },
  { code: "278", text: "123456789" },
  { code: "277", text: "987654321" },
  { code: "012", text: "123456789" },
  { code: "274", text:      "12" },
  { code: "273", text:     "123" },
  { code: "044", text:  "456789" },
];

const jobs = [
  { form: "135_2025",  template: "public/templates/form135_2025.pdf",  draws: SAMPLE_135,  out: "/tmp/smoke_135.pdf"  },
  { form: "1301_2025", template: "public/templates/form1301_2025.pdf", draws: SAMPLE_1301, out: "/tmp/smoke_1301.pdf" },
];

for (const j of jobs) {
  const r = await stamp(path.join(ROOT, j.template), j.form, j.draws);
  fs.writeFileSync(j.out, Buffer.from(r.bytes));
  const pct = Math.round((r.drawn / r.total) * 100);
  console.log(`${j.form}: drawn ${r.drawn}/${r.total} (${pct}%) missing ${r.missing} → ${j.out} ${r.bytes.length}B`);

  if (REEXTRACT) {
    // Re-extract via pdf-parse for CI parity with semanticGolden.test.ts.
    // The full helper lives in lib/pdfReExtract.ts (TS-only, used by tests);
    // we inline a minimal duplicate here so the smoke can run without ts-node.
    const result = await reextract(Buffer.from(r.bytes));
    console.log(`  re-extracted pages=${result.pages.length}`);
    result.pages.forEach((page, i) => {
      console.log(`    page ${i + 1}: stamped=${JSON.stringify(page)}`);
    });
  }
}
