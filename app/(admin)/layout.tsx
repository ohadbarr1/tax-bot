import { AdminShell } from "@/components/admin/AdminShell";

// Force dynamic so the admin shell never gets statically cached — every
// request re-mounts the client-side admin gate and hits /api/admin/whoami.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
