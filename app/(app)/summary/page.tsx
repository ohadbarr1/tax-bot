"use client";
import { AuthGate } from "@/components/auth/AuthGate";
import { SummaryView } from "@/components/SummaryView";

export default function SummaryPage() {
  return (
    <AuthGate>
      <SummaryView />
    </AuthGate>
  );
}
