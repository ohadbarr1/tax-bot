"use client";

import { AuthGate } from "@/components/auth/AuthGate";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { AccountActions } from "@/components/profile/AccountActions";

export default function ProfilePage() {
  return (
    <AuthGate>
      <div dir="rtl" className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">פרופיל</h1>
        <ProfileCard />
        <AccountActions />
      </div>
    </AuthGate>
  );
}
