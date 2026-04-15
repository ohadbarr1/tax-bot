"use client";
import TaxCalculator from "@/components/tax-calculator/TaxCalculator";

// Public route — no AuthGate. Guests can play with the standalone calculator
// before committing to onboarding. The CTA inside funnels them to /welcome
// which IS gated.
export default function TaxCalculatorPage() {
  return <TaxCalculator />;
}
