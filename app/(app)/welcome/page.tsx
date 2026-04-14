import type { Metadata } from "next";
import { WelcomeWizard } from "@/components/WelcomeWizard";
export const metadata: Metadata = { title: "ברוכים הבאים" };
export default function WelcomePage() {
  return <WelcomeWizard />;
}
