/**
 * lib/ibkrParser.ts
 *
 * Pure (side-effect-free) Interactive Brokers Activity Statement CSV parser.
 * Extracted from /api/parse/ibkr/route.ts so it can be unit-tested without
 * standing up a server.
 *
 * Real IBKR exports use a "multi-table CSV" format: one file containing many
 * independent sections. Each section has Header rows (col[1]==="Header") and
 * Data rows (col[1]==="Data"). Some exports and the canonical sample at
 * tax-bot/ibkr_sample_activity_statement.csv encode headers as Data rows —
 * we accept both by treating the first row of each section that contains a
 * known column label as the header.
 *
 * Sections consumed (in priority order):
 *   "Trades"                                      → Realized P/L  (spec-primary)
 *   "Realized & Unrealized Performance Summary"   → S/T + L/T Profit/Loss (fallback)
 *   "Dividends"                                   → Amount (positives only)
 *   "Withholding Tax"                             → Amount (negatives only — handles
 *                                                   IBKR's 3-row cancel-and-reissue
 *                                                   pattern correctly)
 */

import Papa from "papaparse";

export interface IbkrParseInput {
  /** Raw CSV text. */
  csv: string;
  /** Optional override for USD→ILS rate. If omitted, derived from detected year. */
  exchangeRate?: number;
}

export interface IbkrParseOutput {
  taxYear: number;
  exchangeRate: number;
  // USD raw (for Recharts + Tax Shield calculator)
  totalProfitUSD: number;
  totalLossUSD: number;
  dividendsUSD: number;
  foreignTaxUSD: number;
  // ILS-converted (for calculateFullRefund)
  totalRealizedProfit: number;
  totalRealizedLoss: number;
  foreignTaxWithheld: number;
  dividendsILS: number;
}

/** Year-sensitive USD→ILS rate (annual average, Bank of Israel). */
export function getExchangeRateForYear(year: number): number {
  if (year === 2025) return 3.65;
  if (year === 2024) return 3.71;
  if (year === 2023) return 3.69;
  return 3.7;
}

/**
 * Scan the "Statement" section for a 4-digit year in the period cell.
 * Falls back to current calendar year.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectYear(rows: any[][]): number {
  for (const row of rows) {
    const section = String(row[0] ?? "").trim();
    const type    = String(row[1] ?? "").trim();
    if (section === "Statement" && type === "Data") {
      for (let i = 2; i < row.length; i++) {
        const m = String(row[i] ?? "").match(/\b(20\d{2})\b/);
        if (m) return parseInt(m[1], 10);
      }
    }
  }
  return new Date().getFullYear();
}

const parseNum = (v: unknown): number =>
  parseFloat(String(v ?? "0").replace(/,/g, "")) || 0;

const isTotalRow = (row: unknown[]): boolean =>
  row.includes("Total") ||
  String(row[2] ?? "").includes("Total") ||
  String(row[3] ?? "").includes("Total");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findCol = (row: any[], label: string): number =>
  row.findIndex((c: unknown) => String(c ?? "").trim() === label);

export function parseIbkrCsv({ csv, exchangeRate }: IbkrParseInput): IbkrParseOutput {
  const parsed = Papa.parse(csv, { header: false, skipEmptyLines: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = parsed.data as any[][];

  const taxYear = detectYear(rows);
  const rate    = exchangeRate ?? getExchangeRateForYear(taxYear);

  let tradesProfit = 0, tradesLoss = 0;
  let perfProfit   = 0, perfLoss   = 0;
  let totalDividends = 0;
  let foreignTaxWithheld = 0;

  let tradesRealizedPLIdx = -1;
  let stProfitIdx = -1, stLossIdx = -1, ltProfitIdx = -1, ltLossIdx = -1;
  let divAmtIdx = -1;
  let taxAmtIdx = -1;

  rows.forEach((row) => {
    if (!row || row.length < 2) return;

    const section = String(row[0]).trim();
    const type    = String(row[1]).trim();

    // ── Trades (spec-primary) ───────────────────────────────────────────────
    if (section === "Trades") {
      if (tradesRealizedPLIdx < 0) {
        const idx = findCol(row, "Realized P/L");
        if (idx >= 0) {
          tradesRealizedPLIdx = idx;
          return; // header row — skip data extraction
        }
      }
      if (type === "Data" && tradesRealizedPLIdx >= 0) {
        if (isTotalRow(row)) return;
        const pl = parseNum(row[tradesRealizedPLIdx]);
        if (pl > 0) tradesProfit += pl;
        else if (pl < 0) tradesLoss += Math.abs(pl);
      }
    }

    // ── Realized & Unrealized Performance Summary (fallback) ────────────────
    if (section === "Realized & Unrealized Performance Summary") {
      if (stProfitIdx < 0 && ltProfitIdx < 0) {
        const sp = findCol(row, "Realized S/T Profit");
        const sl = findCol(row, "Realized S/T Loss");
        const lp = findCol(row, "Realized L/T Profit");
        const ll = findCol(row, "Realized L/T Loss");
        if (sp >= 0 || lp >= 0) {
          stProfitIdx = sp; stLossIdx = sl;
          ltProfitIdx = lp; ltLossIdx = ll;
          return;
        }
      }
      if (type === "Data" && stProfitIdx >= 0) {
        if (isTotalRow(row)) return;
        const stP = stProfitIdx >= 0 ? parseNum(row[stProfitIdx]) : 0;
        const stL = stLossIdx   >= 0 ? parseNum(row[stLossIdx])   : 0;
        const ltP = ltProfitIdx >= 0 ? parseNum(row[ltProfitIdx]) : 0;
        const ltL = ltLossIdx   >= 0 ? parseNum(row[ltLossIdx])   : 0;
        perfProfit += stP + ltP;
        perfLoss   += Math.abs(stL + ltL);
      }
    }

    // ── Dividends ───────────────────────────────────────────────────────────
    if (section === "Dividends") {
      if (divAmtIdx < 0) {
        const idx = findCol(row, "Amount");
        if (idx >= 0) { divAmtIdx = idx; return; }
      }
      if (type === "Data" && divAmtIdx >= 0) {
        if (isTotalRow(row)) return;
        const amt = parseNum(row[divAmtIdx]);
        if (amt > 0) totalDividends += amt;
      }
    }

    // ── Withholding Tax ─────────────────────────────────────────────────────
    // IBKR emits 3 rows per WHT event:
    //   1. original charge  (negative)
    //   2. reversal credit  (positive)  ← cancel-and-reissue
    //   3. net charge       (negative)  ← the real WHT
    // Sum only negatives for the true net.
    if (section === "Withholding Tax") {
      if (taxAmtIdx < 0) {
        const idx = findCol(row, "Amount");
        if (idx >= 0) { taxAmtIdx = idx; return; }
      }
      if (type === "Data" && taxAmtIdx >= 0) {
        if (isTotalRow(row)) return;
        const amt = parseNum(row[taxAmtIdx]);
        if (amt < 0) foreignTaxWithheld += Math.abs(amt);
      }
    }
  });

  // Trades section wins if present; otherwise fall back to Performance Summary.
  const totalProfit = (tradesProfit > 0 || tradesLoss > 0) ? tradesProfit : perfProfit;
  const totalLoss   = (tradesProfit > 0 || tradesLoss > 0) ? tradesLoss   : perfLoss;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    taxYear,
    exchangeRate: rate,
    totalProfitUSD: r2(totalProfit),
    totalLossUSD:   r2(totalLoss),
    dividendsUSD:   r2(totalDividends),
    foreignTaxUSD:  r2(foreignTaxWithheld),
    totalRealizedProfit: Math.round(totalProfit        * rate),
    totalRealizedLoss:   Math.round(totalLoss          * rate),
    foreignTaxWithheld:  Math.round(foreignTaxWithheld * rate),
    dividendsILS:        Math.round(totalDividends     * rate),
  };
}
