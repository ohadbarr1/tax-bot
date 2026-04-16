"use client";
import TaxCalculator from "@/components/tax-calculator/TaxCalculator";

/**
 * Public tax calculator on the marketing site — no auth, no app shell.
 * Linked from MarketingNavbar. The (app) version at the same path passes
 * `showBackLink` for the dashboard back-link; this one omits it.
 */
export default function TaxCalculatorMarketingPage() {
  return <TaxCalculator />;
}
