#!/usr/bin/env node
/**
 * scripts/build-periphery-list.mjs
 *
 * Idempotent ingest of the canonical "ישובים מזכים" list (eligible periphery
 * communities) from צו מס הכנסה (קביעת ישובים מזכים), התשפ"ד-2024 — סעיף 11
 * לפקודת מס הכנסה.
 *
 * Closes the data half of audit F-007 (`audits/tax-domain.md` §F-007):
 *   "Periphery flat-points model + 40-postcode subset" → "percentage-discount
 *    model + 408-community list".
 *
 * The math model itself was fixed in Phase 0 §0.C (see
 * `lib/calculateTax.ts:calculatePeripheryDiscount`); this script only feeds
 * the data side.
 *
 * ─── Why a script instead of a hand-edit ─────────────────────────────────────
 *
 * 1. The gov.il list is updated annually (typically a תיקון לצו every Q1).
 *    A scriptable ingest means each year's update is a one-liner, not a
 *    mass JSON edit.
 * 2. Postcodes ↔ communities is many-to-many in Israel — one community
 *    (e.g. רעננה) can span several postcodes; one postcode (regional council)
 *    can serve dozens of small yishuvim. The script handles fan-out
 *    consistently rather than relying on hand-curation.
 * 3. The downstream consumers (`lib/calculateTax.ts`, `lib/pdfUtils.ts`,
 *    `lib/optimizer.ts`) all read `data.postcodes[postcode] → { city, tier }`.
 *    The script preserves that exact shape and only ADDS sibling fields
 *    (`communities`, `_meta`) that are safe for old readers to ignore.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/build-periphery-list.mjs --input <path> [--dry-run]
 *
 * --input   Path to the source extract. Supported formats:
 *            • .json — already-structured array of records (see SHAPE below)
 *            • .tsv  — tab-separated columns: name, tier, postcodes (semicolon
 *              joined), region (optional). Header row required.
 *            • .csv  — comma-separated, same columns.
 *
 * --dry-run Log the merge plan without writing.
 *
 * ─── Source extract SHAPE (what `--input` must look like, .json variant) ─────
 *
 *   [
 *     { "name": "דימונה",     "tier": 1, "postcodes": ["86100"], "region": "south" },
 *     { "name": "קריית שמונה", "tier": 1, "postcodes": ["12000","12200"], "region": "north" },
 *     ...
 *   ]
 *
 * For .tsv / .csv:
 *
 *   name<TAB>tier<TAB>postcodes<TAB>region
 *   דימונה<TAB>1<TAB>86100<TAB>south
 *   קריית שמונה<TAB>1<TAB>12000;12200<TAB>north
 *
 * ─── Where do you get the source extract? ────────────────────────────────────
 *
 * The canonical list lives in:
 *
 *   צו מס הכנסה (קביעת ישובים מזכים), התשפ"ד-2024
 *   https://www.gov.il/he/Departments/General/peripheral-localities-list
 *   https://www.nevo.co.il (paywalled HTML mirror — search "ישובים מזכים")
 *
 * The list is Hebrew-text only and is published as a PDF appendix. Steps to
 * produce a `--input` file:
 *
 *   1. Download the PDF from gov.il / nevo / Reshumot.
 *   2. OCR with Tesseract (`tesseract israeli-periphery.pdf - -l heb` works).
 *   3. Hand-clean into the .tsv shape above (or generate via your favourite
 *      table-extractor — Tabula, pdfplumber, etc.).
 *   4. Run this script with `--input cleaned.tsv`.
 *
 * Idempotency: re-running with the same input is a no-op. Re-running with a
 * superset adds the new entries; re-running with a tier change updates
 * (with a console warning so you notice silent drift between צו revisions).
 *
 * ─── Effective year & tier semantics ─────────────────────────────────────────
 *
 * The output's `model`, `effective_year`, and percentage-cap fields are
 * informational; the *math* lives in `lib/calculateTax.ts:147-159` (caps,
 * pcts) and is consumed via `calculatePeripheryDiscount`. tier-1 = 13%,
 * tier-2 = 11% per צו 2023 §3.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "periphery_postcodes.json");

const SOURCE_CITATION =
  'צו מס הכנסה (קביעת ישובים מזכים) (תיקון), התשפ"ד-2024 — סעיף 11 לפקודה';
const GOV_URL =
  "https://www.gov.il/he/Departments/General/peripheral-localities-list";

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { input: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/build-periphery-list.mjs --input <path> [--dry-run]\n" +
          "  --input <path>   .json | .tsv | .csv extract of צו 2024 list\n" +
          "  --dry-run        log plan without writing\n"
      );
      process.exit(0);
    }
  }
  if (!args.input) {
    console.error(
      "[build-periphery] --input <path> is REQUIRED. See file header for format."
    );
    process.exit(2);
  }
  return args;
}

// ─── Input parsers ───────────────────────────────────────────────────────────

function parseJsonInput(text) {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) {
    throw new Error("JSON input must be an array of community records");
  }
  return arr.map(normalizeRecord);
}

function parseDsvInput(text, delimiter) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("DSV input has no data rows");
  const header = lines[0].split(delimiter).map((s) => s.trim().toLowerCase());
  const idx = {
    name: header.indexOf("name"),
    tier: header.indexOf("tier"),
    postcodes: header.indexOf("postcodes"),
    region: header.indexOf("region"),
  };
  if (idx.name < 0 || idx.tier < 0 || idx.postcodes < 0) {
    throw new Error(
      "DSV header must include 'name', 'tier', 'postcodes' (region optional)"
    );
  }
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    out.push(
      normalizeRecord({
        name: cols[idx.name],
        tier: cols[idx.tier],
        postcodes: cols[idx.postcodes],
        region: idx.region >= 0 ? cols[idx.region] : undefined,
      })
    );
  }
  return out;
}

function normalizeRecord(rec) {
  const name = String(rec.name ?? "").trim();
  if (!name) throw new Error(`Record missing 'name': ${JSON.stringify(rec)}`);
  const tierNum = Number(rec.tier);
  if (tierNum !== 1 && tierNum !== 2) {
    throw new Error(`Record '${name}' has invalid tier (must be 1 or 2)`);
  }
  let postcodes;
  if (Array.isArray(rec.postcodes)) {
    postcodes = rec.postcodes;
  } else if (typeof rec.postcodes === "string") {
    postcodes = rec.postcodes.split(/[;,]/);
  } else {
    postcodes = [];
  }
  postcodes = postcodes
    .map((p) => String(p).replace(/\D/g, ""))
    .filter((p) => p.length === 5 || p.length === 7);
  const region = rec.region ? String(rec.region).trim() : undefined;
  return { name, tier: tierNum, postcodes, region };
}

async function loadInput(path) {
  const ext = extname(path).toLowerCase();
  const text = await readFile(path, "utf-8");
  if (ext === ".json") return parseJsonInput(text);
  if (ext === ".tsv") return parseDsvInput(text, "\t");
  if (ext === ".csv") return parseDsvInput(text, ",");
  throw new Error(`Unsupported input extension: ${ext}`);
}

// ─── Existing dataset ────────────────────────────────────────────────────────

async function readExisting() {
  if (!existsSync(DATA_PATH)) {
    return null;
  }
  const raw = await readFile(DATA_PATH, "utf-8");
  return JSON.parse(raw);
}

// ─── Merge ───────────────────────────────────────────────────────────────────

function mergePostcodes(existing, records) {
  const out = { ...(existing?.postcodes ?? {}) };
  let added = 0,
    updated = 0,
    unchanged = 0;
  for (const rec of records) {
    for (const pc of rec.postcodes) {
      const prev = out[pc];
      const next = { city: rec.name, tier: rec.tier };
      if (rec.region) next.region = rec.region;
      if (!prev) {
        out[pc] = next;
        added++;
      } else if (prev.tier !== next.tier || prev.city !== next.city) {
        if (prev.tier !== next.tier) {
          console.warn(
            `[build-periphery] tier change for postcode ${pc}: ${prev.city} t${prev.tier} → ${next.city} t${next.tier}`
          );
        }
        out[pc] = next;
        updated++;
      } else {
        unchanged++;
      }
    }
  }
  return { postcodes: out, added, updated, unchanged };
}

function mergeCommunities(existing, records) {
  // Maintain a deduplicated `communities` array keyed by name. Useful for
  // name-based eligibility checks where the user has not entered a postcode
  // (used by `lib/optimizer.ts`).
  const byName = new Map();
  for (const c of existing?.communities ?? []) {
    byName.set(c.name, c);
  }
  for (const rec of records) {
    const merged = byName.get(rec.name) ?? {
      name: rec.name,
      tier: rec.tier,
      postcodes: [],
    };
    merged.tier = rec.tier;
    if (rec.region) merged.region = rec.region;
    const set = new Set([...(merged.postcodes ?? []), ...rec.postcodes]);
    merged.postcodes = [...set].sort();
    byName.set(rec.name, merged);
  }
  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "he")
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[build-periphery] input=${args.input} dryRun=${args.dryRun}`
  );

  const records = await loadInput(args.input);
  console.log(`[build-periphery] parsed ${records.length} community records`);

  const existing = await readExisting();
  const { postcodes, added, updated, unchanged } = mergePostcodes(
    existing,
    records
  );
  const communities = mergeCommunities(existing, records);

  const tier1 = communities.filter((c) => c.tier === 1).length;
  const tier2 = communities.filter((c) => c.tier === 2).length;

  const out = {
    description:
      "Israeli periphery-eligible communities per ITA Section 11 + צו 2023/2024.",
    source: SOURCE_CITATION,
    source_url: GOV_URL,
    last_updated: new Date().toISOString().slice(0, 10),
    model: "percentage_discount",
    model_description:
      "Periphery benefit is a percentage discount on personal-effort income up to an annual cap (סעיף 11 + צו 2023/2024). tier 1 = 13%, tier 2 = 11%. NOT credit-points. Caps and rates live in lib/calculateTax.ts (PERIPHERY_INCOME_CAP, PERIPHERY_DISCOUNT_PCT).",
    effective_year: 2024,
    tiers: {
      tier1: { discount_pct: 0.13, cap_2024: 236_520, cap_2025: 241_920 },
      tier2: { discount_pct: 0.11, cap_2024: 236_520, cap_2025: 241_920 },
    },
    _meta: {
      community_count: communities.length,
      tier1_count: tier1,
      tier2_count: tier2,
      postcode_count: Object.keys(postcodes).length,
      expected_full_count: existing?._meta?.expected_full_count ?? 408,
    },
    postcodes,
    communities,
  };

  // Carry forward the data-gap annotation if we still don't have all 408.
  if (communities.length < 408) {
    out.data_gap = `Currently ${communities.length} of ~408 communities. Re-run scripts/build-periphery-list.mjs with the full צו 2024 extract to close. See script header for source URLs.`;
  }

  console.log(
    `[build-periphery] postcodes: +${added} added, ${updated} updated, ${unchanged} unchanged`
  );
  console.log(
    `[build-periphery] communities: ${communities.length} (tier1=${tier1}, tier2=${tier2})`
  );

  if (args.dryRun) {
    console.log("[build-periphery] --dry-run, not writing.");
    return;
  }

  await writeFile(DATA_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`[build-periphery] wrote ${DATA_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
