"use client";

import { UsersTable } from "@/components/admin/UsersTable";

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">משתמשים</h1>
      <UsersTable />
    </div>
  );
}
