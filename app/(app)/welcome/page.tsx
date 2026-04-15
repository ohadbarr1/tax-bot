import type { Metadata } from "next";
import { WelcomeWizard } from "@/components/WelcomeWizard";
import { AuthGate } from "@/components/auth/AuthGate";
export const metadata: Metadata = { title: "ברוכים הבאים" };
export default function WelcomePage() {
  return (
    <AuthGate>
      <WelcomeWizard />
    </AuthGate>
  );
}
