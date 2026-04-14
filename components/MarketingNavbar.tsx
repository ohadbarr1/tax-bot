"use client";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_LINKS = [
  { href: "/how-it-works", label: "איך זה עובד" },
  { href: "/pricing", label: "תמחור" },
  { href: "/about", label: "אודות" },
];

export function MarketingNavbar() {
  return (
    <header className="sticky top-0 z-40 h-16 bg-background/80 backdrop-blur-sm border-b border-border flex items-center">
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 flex items-center justify-between">
        {/* RTL: Logo on RIGHT */}
        <div className="flex items-center gap-6 order-last">
          <Link href="/" aria-label="TaxBack IL">
            <Logo />
          </Link>
        </div>
        {/* Nav links CENTER */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
        {/* Actions LEFT */}
        <div className="flex items-center gap-3 order-first">
          <ThemeToggle />
          <Link href="/welcome" className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
            התחל עכשיו
          </Link>
        </div>
      </div>
    </header>
  );
}
