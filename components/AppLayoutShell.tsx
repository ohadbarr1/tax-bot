"use client";
import { AppProvider } from "@/lib/appContext";
import { AuthProvider } from "@/lib/firebase/authContext";
import { FlowChrome } from "@/components/FlowChrome";
import { AdvisorChat } from "@/components/advisor/AdvisorChat";
import { AuthErrorToast } from "@/components/auth/AuthErrorToast";
import { IdleLogout } from "@/components/IdleLogout";

interface Props { children: React.ReactNode; }

export default function AppLayoutShell({ children }: Props) {
  return (
    <AuthProvider>
    <AppProvider>
      {/* RTL: nav first in DOM + row-reverse → nav visually on RIGHT. FlowChrome
          renders the gated stepper on flow routes, the hub Sidebar elsewhere. */}
      <div className="flex min-h-screen bg-background">
        <FlowChrome />
        <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>
        <AdvisorChat />
        <AuthErrorToast />
        <IdleLogout />
      </div>
    </AppProvider>
    </AuthProvider>
  );
}
