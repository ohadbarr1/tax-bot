"use client";

import { use } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UserDetailPanel } from "@/components/admin/UserDetailPanel";

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = use(params);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin/users" className="hover:text-foreground">
          משתמשים
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-mono">{uid}</span>
      </div>
      <UserDetailPanel uid={uid} />
    </div>
  );
}
