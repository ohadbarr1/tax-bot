"use client";
import { AppProvider } from "@/lib/appContext";
import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
import { AdvisorChat } from "@/components/advisor/AdvisorChat";

interface Props { children: React.ReactNode; }

export default function AppLayoutShell({ children }: Props) {
  return (
    <AppProvider>
      {/* RTL: sidebar is FIRST in DOM = visually on the RIGHT */}
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <AdvisorChat />
          <footer className="hidden md:block border-t border-border py-3 text-center text-xs text-muted-foreground">
            TaxBack IL · כל הזכויות שמורות · מאובטח בהצפנת TLS 1.3
          </footer>
        </div>
      </div>
    </AppProvider>
  );
}
