import { NextResponse } from "next/server";

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

  // Tax brackets 2024
  const brackets = [
    { max: 84120, rate: 0.10 },
    { max: 120720, rate: 0.14 },
    { max: 193800, rate: 0.20 },
    { max: 269280, rate: 0.31 },
    { max: 560520, rate: 0.35 },
    { max: 721560, rate: 0.47 },
    { max: 9999999, rate: 0.50 },
  ];

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
    const spreading = calculateSeveranceSpreading(
      taxableSeverance,
      currentYear ?? 2024,
      years,
      currentYearIncome ?? 0
    );

    return NextResponse.json({
      success: true,
      form161: {
        taxpayerName,
        idNumber,
        taxYear: currentYear ?? 2024,
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
