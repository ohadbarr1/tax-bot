import { NextResponse, type NextRequest } from "next/server";
import taxData from "@/data/tax_brackets_2024_2025.json";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  invalidInput,
  invalidInputFromZod,
  internalError,
} from "@/lib/api/errorEnvelope";
import { Form161PayloadSchema } from "@/lib/api/schemas/generate";

interface SpreadYear {
  year: number;
  taxableAmount: number;
  marginalRate: number;
  taxLiability: number;
}

function calculateSeveranceSpreading(
  taxableSeverance: number,
  currentYear: number,
  spreadYears: number, // 1-6
  currentYearIncome: number
): {
  spreadSchedule: SpreadYear[];
  totalTaxWithSpreading: number;
  totalTaxLumpSum: number;
  savings: number;
} {
  // Simplified: spread evenly across spreadYears
  const annualAmount = taxableSeverance / spreadYears;

  // Dynamic brackets from tax data
  const safeYear = String(currentYear === 2025 ? 2025 : 2024) as "2024" | "2025";
  const rawBrackets = taxData[safeYear].tax_brackets;
  const brackets = rawBrackets.map((b) => ({ max: b.max, rate: b.rate }));

  function calcTax(income: number): number {
    let tax = 0;
    let prev = 0;
    for (const b of brackets) {
      if (income <= prev) break;
      const top = Math.min(income, b.max);
      tax += (top - prev) * b.rate;
      prev = b.max;
    }
    return Math.round(tax);
  }

  function marginalRate(income: number): number {
    for (const b of brackets) {
      if (income <= b.max) return b.rate;
    }
    return 0.50;
  }

  // Lump sum: add entire severance to current year income
  const lumpSumTax = calcTax(currentYearIncome + taxableSeverance) - calcTax(currentYearIncome);

  // Spread: each year gets annualAmount added to estimated income (use current year income as proxy)
  const spreadSchedule: SpreadYear[] = [];
  let totalSpreadTax = 0;

  for (let i = 0; i < spreadYears; i++) {
    const year = currentYear - i; // spread backwards per ITA rules
    const taxOnSlice = calcTax(currentYearIncome + annualAmount) - calcTax(currentYearIncome);
    const mRate = marginalRate(currentYearIncome + annualAmount / 2);
    spreadSchedule.push({
      year,
      taxableAmount: annualAmount,
      marginalRate: mRate,
      taxLiability: taxOnSlice,
    });
    totalSpreadTax += taxOnSlice;
  }

  return {
    spreadSchedule,
    totalTaxWithSpreading: totalSpreadTax,
    totalTaxLumpSum: lumpSumTax,
    savings: lumpSumTax - totalSpreadTax,
  };
}

async function handle(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidInput("גוף הבקשה אינו JSON תקין.");
  }

  const parsed = Form161PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidInputFromZod(parsed.error.issues, "פורמט הבקשה אינו תקין.");
  }

  try {
    const {
      taxableSeverance,
      currentYear,
      spreadYears,
      currentYearIncome,
      taxpayerName,
      idNumber,
    } = parsed.data;

    const years = Math.min(Math.max(1, spreadYears ?? 3), 6);
    const resolvedYear = currentYear ?? currentTaxYear();
    const spreading = calculateSeveranceSpreading(
      taxableSeverance,
      resolvedYear,
      years,
      currentYearIncome ?? 0,
    );

    return NextResponse.json({
      success: true,
      form161: {
        taxpayerName,
        idNumber,
        taxYear: resolvedYear,
        taxableSeverance,
        spreadYears: years,
        spreading,
        recommendation:
          spreading.savings > 0
            ? `פריסה על ${years} שנים חוסכת ₪${spreading.savings.toLocaleString("he-IL")} במס`
            : "פריסה אינה מועילה — שלם כסכום חד-פעמי",
      },
    });
  } catch (err) {
    console.error("[form-161] severance spread failed:", err);
    return internalError(
      "חישוב פריסת פיצויים נכשל. נסה שוב מאוחר יותר.",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// Auth + rate-limit gate. Closes F-1, F-2, F1.2.6.
export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "generate-form-161", limit: 30 }),
);
