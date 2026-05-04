"use client";
import dynamic from "next/dynamic";
import { AuthGate } from "@/components/auth/AuthGate";

// Phase 3 §3.B — lazy-load (recharts heavy).
const IncomeTaxDashboard = dynamic(
  () => import("@/components/income-tax/IncomeTaxDashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        טוען נתוני מס…
      </div>
    ),
  },
);

export default function IncomeTaxPage() {
  return (
    <AuthGate>
      <IncomeTaxDashboard />
    </AuthGate>
  );
}
