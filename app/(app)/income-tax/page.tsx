"use client";
import IncomeTaxDashboard from "@/components/income-tax/IncomeTaxDashboard";
import { AuthGate } from "@/components/auth/AuthGate";

export default function IncomeTaxPage() {
  return (
    <AuthGate>
      <IncomeTaxDashboard />
    </AuthGate>
  );
}
