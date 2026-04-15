import { NextResponse } from "next/server";
import taxData from "@/data/tax_brackets_2024_2025.json";
import { currentTaxYear } from "@/lib/currentTaxYear";

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

export async function POST(request: Request) {
  try {
    const { taxableSeverance, currentYear, spreadYears, currentYearIncome, taxpayerName, idNumber } =
      await request.json();

    if (!taxableSeverance || taxableSeverance <= 0) {
      return NextResponse.json({ success: false, error: "taxableSeverance required" }, { status: 400 });
    }

    const years = Math.min(Math.max(1, spreadYears ?? 3), 6);
    const resolvedYear = currentYear ?? currentTaxYear();
    const spreading = calculateSeveranceSpreading(
      taxableSeverance,
      resolvedYear,
      years,
      currentYearIncome ?? 0
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
        recommendation: spreading.savings > 0
          ? `פריסה על ${years} שנים חוסכת ₪${spreading.savings.toLocaleString("he-IL")} במס`
          : "פריסה אינה מועילה — שלם כסכום חד-פעמי",
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 400 });
  }
}
