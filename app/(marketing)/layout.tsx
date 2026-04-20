"use client";
import { MarketingNavbar } from "@/components/MarketingNavbar";
import { usePathname } from "next/navigation";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  // Landing page ships its own nav + footer (KC design)
  if (pathname === "/") return <>{children}</>;

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
