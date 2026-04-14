import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/MarketingNavbar";

export const metadata: Metadata = {
  title: { default: "TaxBack IL — החזר מס חכם", template: "%s | TaxBack IL" },
  description: "פלטפורמה לאוטומציה של החזרי מס בישראל. מקסמו את ההחזר שלכם בקלות.",
  openGraph: {
    siteName: "TaxBack IL",
    locale: "he_IL",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNavbar />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>© 2025 TaxBack IL · <a href="/privacy" className="hover:text-foreground">פרטיות</a> · <a href="/terms" className="hover:text-foreground">תנאי שימוש</a></p>
      </footer>
    </div>
  );
}
