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
import type { IbkrParseResponse } from "@/types";
import { parseIbkrCsv } from "@/lib/ibkrParser";

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
    ACCEPTED_MIME.includes(file.type);

  if (!isCSV) {
    return NextResponse.json(
      { success: false, error: "סוג קובץ לא נתמך. יש להעלות קובץ CSV מ-Interactive Brokers." },
      { status: 400 }
    );
  }

  // ── 3. Read into memory & parse ───────────────────────────────────────────
  const bytes   = await file.arrayBuffer();
  const csvText = Buffer.from(bytes).toString("utf-8");

  const result = parseIbkrCsv({ csv: csvText });

  return NextResponse.json<IbkrParseResponse>({
    success: true,
    data: {
      totalProfitUSD:      result.totalProfitUSD,
      totalLossUSD:        result.totalLossUSD,
      dividendsUSD:        result.dividendsUSD,
      foreignTaxUSD:       result.foreignTaxUSD,
      exchangeRate:        result.exchangeRate,
      totalRealizedProfit: result.totalRealizedProfit,
      totalRealizedLoss:   result.totalRealizedLoss,
      foreignTaxWithheld:  result.foreignTaxWithheld,
      dividendsILS:        result.dividendsILS,
    },
  });
}
