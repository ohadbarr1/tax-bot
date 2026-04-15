"use client";
import TaxCalculator from "@/components/tax-calculator/TaxCalculator";
import { AuthGate } from "@/components/auth/AuthGate";

export default function TaxCalculatorPage() {
  return (
    <AuthGate>
      <TaxCalculator />
    </AuthGate>
  );
}
