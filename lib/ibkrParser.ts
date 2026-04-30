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
 *
 * Per F-017 (`audits/tax-domain.md` §F-017): each row's USD→ILS conversion
 * uses the **transaction-date** Bank-of-Israel publish rate via
 * `lib/fx.ts#getFxRate`, not an annual mean. סעיף 91(ג) + תקנות מס הכנסה
 * (המרה למטבע ישראלי) דורשים שער יום העסקה.
 */

import Papa from "papaparse";
import { getFxRate } from "./fx";

export interface IbkrParseInput {
  /** Raw CSV text. */
  csv: string;
  /** Optional override for USD→ILS rate. If supplied, applied uniformly to
   *  every row (legacy mode — only retained for backward-compat unit tests). */
  exchangeRate?: number;
}

export interface IbkrParseOutput {
  taxYear: number;
  /** Year-end ILS-per-USD reference rate (annual mean). Per-row ILS values
   *  in this struct were computed against the per-trade-date publish rate;
   *  this field is retained for display + back-compat only. */
  exchangeRate: number;
  // USD raw (for Recharts + Tax Shield calculator)
  totalProfitUSD: number;
  totalLossUSD: number;
  dividendsUSD: number;
  foreignTaxUSD: number;
  // ILS-converted (for calculateFullRefund) — summed from per-trade conversions
  totalRealizedProfit: number;
  totalRealizedLoss: number;
  foreignTaxWithheld: number;
  dividendsILS: number;
}

/**
 * @deprecated Per F-017, use `getFxRate("USD", txDate)` instead. Returns the
 * documented BoI annual-mean rate; retained only so legacy callers keep
 * compiling during the migration.
 */
export function getExchangeRateForYear(year: number): number {
  // Mirror the historical hardcoded values for back-compat with old tests
  // that snapshot specific rates. New code MUST go through `getFxRate`.
  if (year === 2025) return 3.65;
  if (year === 2024) return 3.71;
  if (year === 2023) return 3.69;
  return 3.7;
}

/**
 * Scan the "Statement" section for a 4-digit year in the period cell.
 * Falls back to current calendar year.
 */
function detectYear(rows: unknown[][]): number {
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

const findCol = (row: unknown[], label: string): number =>
  row.findIndex((c: unknown) => String(c ?? "").trim() === label);

const ISO_DATE_RE = /(\d{4}-\d{2}-\d{2})/;

/** Extract YYYY-MM-DD from an IBKR cell which may be `2024-03-15` or
 *  `2024-03-15, 09:30:00` (Trades section). Returns undefined if no date. */
function extractIsoDate(cell: unknown): string | undefined {
  const m = String(cell ?? "").match(ISO_DATE_RE);
  return m ? m[1] : undefined;
}

/**
 * Convert a per-row USD amount to ILS using the BoI publish rate for `date`
 * (or the override if supplied). Falls back to the year-mean if no date can
 * be extracted (e.g. summary-only rows in the Performance Summary section).
 */
function rowUsdToIls(
  amountUsd: number,
  date: string | undefined,
  taxYear: number,
  override: number | undefined
): number {
  if (typeof override === "number") return amountUsd * override;
  if (date) return amountUsd * getFxRate("USD", date);
  // No row-level date (Performance Summary fallback) — use year mean.
  return amountUsd * getFxRate("USD", `${taxYear}-06-30`);
}

export function parseIbkrCsv({ csv, exchangeRate }: IbkrParseInput): IbkrParseOutput {
  const parsed = Papa.parse(csv, { header: false, skipEmptyLines: true });
  const rows = parsed.data as unknown[][];

  const taxYear = detectYear(rows);
  // Display-rate (year mean) — kept for the `exchangeRate` field on output.
  const displayRate = exchangeRate ?? getExchangeRateForYear(taxYear);

  // USD totals (for raw display) — summed across rows.
  let tradesProfit = 0, tradesLoss = 0;
  let perfProfit   = 0, perfLoss   = 0;
  let totalDividends = 0;
  let foreignTaxWithheld = 0;

  // ILS totals — summed from per-row conversions at transaction-date rates.
  let tradesProfitIls = 0, tradesLossIls = 0;
  let perfProfitIls   = 0, perfLossIls   = 0;
  let totalDividendsIls = 0;
  let foreignTaxWithheldIls = 0;

  let tradesRealizedPLIdx = -1;
  let tradesDateIdx = -1;
  let stProfitIdx = -1, stLossIdx = -1, ltProfitIdx = -1, ltLossIdx = -1;
  let divAmtIdx = -1, divDateIdx = -1;
  let taxAmtIdx = -1, taxDateIdx = -1;

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
          tradesDateIdx = findCol(row, "Date/Time");
          if (tradesDateIdx < 0) tradesDateIdx = findCol(row, "Date");
          return; // header row — skip data extraction
        }
      }
      if (type === "Data" && tradesRealizedPLIdx >= 0) {
        if (isTotalRow(row)) return;
        const pl = parseNum(row[tradesRealizedPLIdx]);
        const txDate = tradesDateIdx >= 0 ? extractIsoDate(row[tradesDateIdx]) : undefined;
        if (pl > 0) {
          tradesProfit += pl;
          tradesProfitIls += rowUsdToIls(pl, txDate, taxYear, exchangeRate);
        } else if (pl < 0) {
          const abs = Math.abs(pl);
          tradesLoss += abs;
          tradesLossIls += rowUsdToIls(abs, txDate, taxYear, exchangeRate);
        }
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
        const profit = stP + ltP;
        const loss = Math.abs(stL + ltL);
        perfProfit += profit;
        perfLoss   += loss;
        // Performance Summary has no per-row date — use year-mean rate.
        perfProfitIls += rowUsdToIls(profit, undefined, taxYear, exchangeRate);
        perfLossIls   += rowUsdToIls(loss,   undefined, taxYear, exchangeRate);
      }
    }

    // ── Dividends ───────────────────────────────────────────────────────────
    if (section === "Dividends") {
      if (divAmtIdx < 0) {
        const idx = findCol(row, "Amount");
        if (idx >= 0) {
          divAmtIdx = idx;
          divDateIdx = findCol(row, "Date");
          return;
        }
      }
      if (type === "Data" && divAmtIdx >= 0) {
        if (isTotalRow(row)) return;
        const amt = parseNum(row[divAmtIdx]);
        if (amt > 0) {
          totalDividends += amt;
          const txDate = divDateIdx >= 0 ? extractIsoDate(row[divDateIdx]) : undefined;
          totalDividendsIls += rowUsdToIls(amt, txDate, taxYear, exchangeRate);
        }
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
        if (idx >= 0) {
          taxAmtIdx = idx;
          taxDateIdx = findCol(row, "Date");
          return;
        }
      }
      if (type === "Data" && taxAmtIdx >= 0) {
        if (isTotalRow(row)) return;
        const amt = parseNum(row[taxAmtIdx]);
        if (amt < 0) {
          const abs = Math.abs(amt);
          foreignTaxWithheld += abs;
          const txDate = taxDateIdx >= 0 ? extractIsoDate(row[taxDateIdx]) : undefined;
          foreignTaxWithheldIls += rowUsdToIls(abs, txDate, taxYear, exchangeRate);
        }
      }
    }
  });

  // Trades section wins if present; otherwise fall back to Performance Summary.
  const tradesActive = (tradesProfit > 0 || tradesLoss > 0);
  const totalProfit    = tradesActive ? tradesProfit    : perfProfit;
  const totalLoss      = tradesActive ? tradesLoss      : perfLoss;
  const totalProfitIls = tradesActive ? tradesProfitIls : perfProfitIls;
  const totalLossIls   = tradesActive ? tradesLossIls   : perfLossIls;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    taxYear,
    exchangeRate: displayRate,
    totalProfitUSD: r2(totalProfit),
    totalLossUSD:   r2(totalLoss),
    dividendsUSD:   r2(totalDividends),
    foreignTaxUSD:  r2(foreignTaxWithheld),
    totalRealizedProfit: Math.round(totalProfitIls),
    totalRealizedLoss:   Math.round(totalLossIls),
    foreignTaxWithheld:  Math.round(foreignTaxWithheldIls),
    dividendsILS:        Math.round(totalDividendsIls),
  };
}
