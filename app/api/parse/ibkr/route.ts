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
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploadLimits";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  IbkrUploadMetaSchema,
  ibkrFileAccepted,
} from "@/lib/api/schemas/parse";

async function handle(
  request: NextRequest,
): Promise<NextResponse<IbkrParseResponse>> {
  // ── 1. Extract file ───────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "פורמט הבקשה אינו תקין." },
      { status: 400 },
    );
  }
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: "לא סופק קובץ. אנא בחר קובץ CSV." },
      { status: 400 }
    );
  }

  // ── 2. Validate metadata via Zod (size + name length) ─────────────────────
  const metaParsed = IbkrUploadMetaSchema.safeParse({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (!metaParsed.success) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: `הקובץ חורג מהמגבלה של ${MAX_UPLOAD_LABEL}.` },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { success: false, error: "מטא-נתוני הקובץ אינם תקינים." },
      { status: 400 },
    );
  }

  // ── 3. Validate file type ─────────────────────────────────────────────────
  if (!ibkrFileAccepted(file.name, file.type)) {
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

// Auth + rate-limit. Closes F-1, F-2, F1.2.4.
export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "parse-ibkr", limit: 30 }),
);
