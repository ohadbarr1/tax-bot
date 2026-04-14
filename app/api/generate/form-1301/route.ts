import { NextResponse } from "next/server";
import type { TaxPayer, FinancialData } from "@/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taxpayer, financials, taxYear } = body as {
      taxpayer: TaxPayer;
      financials: FinancialData;
      taxYear: number;
    };

    // Build Form 1301 sections
    const totalGross = taxpayer.employers.reduce((s, e) => s + (e.grossSalary ?? 0), 0);
    const totalTaxPaid = taxpayer.employers.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);
    const result = financials.calculationResult;

    const sections = {
      personal: {
        fullName: taxpayer.fullName,
        idNumber: taxpayer.idNumber ?? "",
        taxYear,
        maritalStatus: taxpayer.maritalStatus,
        address: taxpayer.address ?? null,
      },
      employment: {
        employers: taxpayer.employers.map((e) => ({
          name: e.name,
          grossSalary: e.grossSalary ?? 0,
          taxWithheld: e.taxWithheld ?? 0,
          pensionDeduction: e.pensionDeduction ?? 0,
          monthsWorked: e.monthsWorked,
        })),
        totalGrossIncome: totalGross,
        totalTaxPaid,
      },
      creditPoints: {
        count: result?.creditPointsCount ?? 0,
        annualValue: result?.creditPointsValue ?? 0,
        breakdown: result?.breakdown.creditPointsBreakdown ?? {},
      },
      deductions: {
        total: result?.deductionCredits ?? 0,
        breakdown: result?.breakdown.deductionsBreakdown ?? {},
      },
      capitalGains: taxpayer.capitalGains ?? null,
      summary: {
        grossTax: result?.calculatedTax ?? 0,
        netTaxOwed: result?.netTaxOwed ?? 0,
        taxPaid: result?.taxPaid ?? 0,
        refundOrOwed: result?.netRefund ?? 0,
      },
      bankDetails: taxpayer.bank ?? null,
    };

    return NextResponse.json({ success: true, sections, message: "Form 1301 data compiled — PDF generation available in Phase 6" });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 400 });
  }
}
