/**
 * POST /api/parse/ibkr
 *
 * Accepts a multipart/form-data upload containing an IBKR Activity Statement
 * CSV file. IBKR exports are "Multi-Table CSVs" — a single file containing
 * multiple independent sections, each with its own embedded header row.
 *
 * Parser strategy (robust against asymmetrical rows and dynamic column order):
 *   • Papa.parse with { header: false, skipEmptyLines: true }  — NO dynamicTyping
 *     so all values remain strings; we parseFloat() them ourselves with comma-stripping.
 *   • row[0] = section name, row[1] = row type ("Header" | "Data")
 *   • On "Header" rows: locate column indices by exact/partial label match.
 *   • On "Data" rows: skip any row that contains the string "Total" anywhere,
 *     or has "Total" in col[2] or col[3].
 *
 * Sections consumed:
 *   "Realized & Unrealized Performance Summary"
 *       Separate Profit and Loss columns:
 *         "Realized S/T Profit", "Realized S/T Loss",
 *         "Realized L/T Profit", "Realized L/T Loss"
 *   "Dividends"         — "Amount" column (positive values only)
 *   "Withholding Tax"   — "Amount" column (only NEGATIVE amounts summed;
 *                         IBKR emits 3 rows per WHT event: original-negative,
 *                         reversal-positive, net-negative — summing positives
 *                         would cancel the net, Math.abs() would triple-count it)
 *
 * FX rate: detected from the CSV "Period" header field; defaults to year-sensitive
 * rates (2025 → 3.65, 2024 → 3.71, older → 3.7).
 *
 * Returns raw USD values (charts / Tax Shield) and ILS values (tax engine).
 */

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import type { IbkrParseResponse } from "@/types";

/** Year-sensitive USD→ILS rates (annual average from Bank of Israel). */
function getExchangeRate(year: number): number {
  if (year === 2025) return 3.65;
  if (year === 2024) return 3.71;
  if (year === 2023) return 3.69;
  return 3.7; // fallback
}

/**
 * Detect tax year from IBKR CSV.
 * Looks for the "Statement" section header row where column[3] typically contains
 * a period string like "January 1, 2025 - December 31, 2025".
 * Falls back to current year.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectYear(rows: any[][]): number {
  for (const row of rows) {
    const section = String(row[0] ?? "").trim();
    const type    = String(row[1] ?? "").trim();
    if (section === "Statement" && type === "Data") {
      // Scan each cell for a 4-digit year
      for (let i = 2; i < row.length; i++) {
        const cell = String(row[i] ?? "");
        const m = cell.match(/\b(20\d{2})\b/);
        if (m) return parseInt(m[1], 10);
      }
    }
  }
  return new Date().getFullYear();
}

const ACCEPTED_MIME = [
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

export async function POST(
  request: NextRequest
): Promise<NextResponse<IbkrParseResponse>> {
  // ── 1. Extract file ───────────────────────────────────────────────────────
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: "לא סופק קובץ. אנא בחר קובץ CSV." },
      { status: 400 }
    );
  }

  // ── 2. Validate file type ─────────────────────────────────────────────────
  const isCSV =
    file.name.toLowerCase().endsWith(".csv") ||
    ACCEPTED_MIME.some((m) => file.type.startsWith(m.split("/")[0]));

  if (!isCSV) {
    return NextResponse.json(
      { success: false, error: "סוג קובץ לא נתמך. יש להעלות קובץ CSV מ-Interactive Brokers." },
      { status: 400 }
    );
  }

  // ── 3. Read into memory ───────────────────────────────────────────────────
  const bytes = await file.arrayBuffer();
  const csvText = Buffer.from(bytes).toString("utf-8");

  // ── 4. PapaParse — no headers, no dynamic typing ─────────────────────────
  // dynamicTyping is intentionally OFF: IBKR numbers sometimes contain commas
  // (e.g. "1,234.56") which PapaParse won't strip, causing NaN. We parseFloat
  // manually after removing commas.
  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = parsed.data as any[][];

  // ── 5. Detect year and FX rate ────────────────────────────────────────────
  const taxYear      = detectYear(rows);
  const USD_ILS_RATE = getExchangeRate(taxYear);

  // ── 6. Extraction — exact algorithm as specified ──────────────────────────
  let totalProfit = 0;
  let totalLoss = 0;
  let totalDividends = 0;
  let foreignTaxWithheld = 0;

  let stProfitIdx = -1, stLossIdx = -1, ltProfitIdx = -1, ltLossIdx = -1;
  let divAmtIdx = -1;
  let taxAmtIdx = -1;

  rows.forEach((row) => {
    if (!row || row.length < 2) return;

    const section = String(row[0]).trim();
    const type    = String(row[1]).trim();

    // ── Realized & Unrealized Performance Summary ───────────────────────────
    if (section === "Realized & Unrealized Performance Summary") {
      if (type === "Header") {
        // Separate profit and loss live in their own columns in this section
        stProfitIdx = row.indexOf("Realized S/T Profit");
        stLossIdx   = row.indexOf("Realized S/T Loss");
        ltProfitIdx = row.indexOf("Realized L/T Profit");
        ltLossIdx   = row.indexOf("Realized L/T Loss");
      } else if (type === "Data") {
        // Skip sub-total / grand-total rows
        if (
          row.includes("Total") ||
          String(row[2]).includes("Total") ||
          String(row[3]).includes("Total")
        ) return;

        const parse = (idx: number) =>
          parseFloat(String(row[idx] ?? "0").replace(/,/g, "")) || 0;

        const stP = stProfitIdx >= 0 ? parse(stProfitIdx) : 0;
        const stL = stLossIdx   >= 0 ? parse(stLossIdx)   : 0;
        const ltP = ltProfitIdx >= 0 ? parse(ltProfitIdx) : 0;
        const ltL = ltLossIdx   >= 0 ? parse(ltLossIdx)   : 0;

        totalProfit += stP + ltP;
        totalLoss   += Math.abs(stL + ltL);
      }
    }

    // ── Dividends ───────────────────────────────────────────────────────────
    if (section === "Dividends") {
      if (type === "Header") {
        divAmtIdx = row.findIndex((c: unknown) => String(c).includes("Amount"));
      } else if (type === "Data") {
        if (
          row.includes("Total") ||
          String(row[2]).includes("Total") ||
          String(row[3]).includes("Total")
        ) return;
        if (divAmtIdx < 0) return;

        const amt =
          parseFloat(String(row[divAmtIdx] ?? "0").replace(/,/g, "")) || 0;
        // Only count positive amounts (dividends are credits to account)
        if (amt > 0) totalDividends += amt;
      }
    }

    // ── Withholding Tax ─────────────────────────────────────────────────────
    // IBKR emits 3 rows per WHT event:
    //   1. original charge  (negative, e.g. -39.59)
    //   2. reversal credit  (positive, e.g. +39.59)  ← cancel-and-reissue
    //   3. net charge       (negative, e.g. -66.01)  ← the real WHT
    // Only sum NEGATIVE amounts to get the true net WHT paid.
    if (section === "Withholding Tax") {
      if (type === "Header") {
        taxAmtIdx = row.findIndex((c: unknown) => String(c).includes("Amount"));
      } else if (type === "Data") {
        if (
          row.includes("Total") ||
          String(row[2]).includes("Total") ||
          String(row[3]).includes("Total")
        ) return;
        if (taxAmtIdx < 0) return;

        const amt =
          parseFloat(String(row[taxAmtIdx] ?? "0").replace(/,/g, "")) || 0;
        // Only negative amounts represent actual tax withheld
        if (amt < 0) foreignTaxWithheld += Math.abs(amt);
      }
    }
  });

  // ── 7. Round USD to 2 d.p., convert to ILS ───────────────────────────────
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json<IbkrParseResponse>({
    success: true,
    data: {
      // Raw USD — for Recharts charts and the interactive Tax Shield calculator
      totalProfitUSD: r2(totalProfit),
      totalLossUSD:   r2(totalLoss),
      dividendsUSD:   r2(totalDividends),
      foreignTaxUSD:  r2(foreignTaxWithheld),
      exchangeRate:   USD_ILS_RATE,
      // ILS-converted — fed directly into calculateFullRefund()
      totalRealizedProfit: Math.round(totalProfit        * USD_ILS_RATE),
      totalRealizedLoss:   Math.round(totalLoss          * USD_ILS_RATE),
      foreignTaxWithheld:  Math.round(foreignTaxWithheld * USD_ILS_RATE),
      dividendsILS:        Math.round(totalDividends     * USD_ILS_RATE),
    },
  });
}
