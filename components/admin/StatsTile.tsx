"use client";

import type { ReactNode } from "react";

/**
 * StatsTile — a single metric card on the admin dashboard. Supports an
 * optional sublabel row (e.g. "today · 7d · 30d" for signups).
 */
export function StatsTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && <span className="text-primary">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
