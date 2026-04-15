"use client";
import { WhatIfSimulator } from "@/components/WhatIfSimulator";
import { AuthGate } from "@/components/auth/AuthGate";

export default function TaxCalculatorPage() {
  return (
    <AuthGate>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <WhatIfSimulator />
      </div>
    </AuthGate>
  );
}
