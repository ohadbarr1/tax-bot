"use client";
import { AppProvider } from "@/lib/appContext";
import { AuthProvider } from "@/lib/firebase/authContext";
import { Sidebar } from "@/components/Sidebar";
import { AdvisorChat } from "@/components/advisor/AdvisorChat";
import { AuthErrorToast } from "@/components/auth/AuthErrorToast";

interface Props { children: React.ReactNode; }

export default function AppLayoutShell({ children }: Props) {
  return (
    <AuthProvider>
    <AppProvider>
      {/* RTL: sidebar first in DOM + row-reverse → sidebar visually on RIGHT */}
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>
        <AdvisorChat />
        <AuthErrorToast />
      </div>
    </AppProvider>
    </AuthProvider>
  );
}
