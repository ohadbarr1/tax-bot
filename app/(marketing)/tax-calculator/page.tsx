"use client";
import dynamic from "next/dynamic";

/**
 * Public tax calculator on the marketing site — no auth, no app shell.
 * Linked from MarketingNavbar. The (app) version at the same path passes
 * `showBackLink` for the dashboard back-link; this one omits it.
 *
 * Phase 3 §3.B: lazy-loaded (recharts is ~150KB) so the marketing nav stays
 * cheap; users who never click the calculator never pay the bundle cost.
 */
const TaxCalculator = dynamic(
  () => import("@/components/tax-calculator/TaxCalculator"),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-sm text-muted-foreground">
        טוען מחשבון…
      </div>
    ),
  },
);

export default function TaxCalculatorMarketingPage() {
  return <TaxCalculator />;
}
