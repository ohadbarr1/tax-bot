"use client";

import { useEffect, useState } from "react";
import {
  Users as UsersIcon,
  UserPlus,
  HardDrive,
  FileText,
  CheckCircle,
  Upload,
} from "lucide-react";
import { StatsTile } from "@/components/admin/StatsTile";
import { authedFetch } from "@/lib/admin/adminFetch";

interface AdminStats {
  totalUsers: number;
  newSignups: { today: number; d7: number; d30: number };
  providers: { anonymous: number; google: number; other: number };
  storage: { totalBytes: number; totalObjects: number };
  onboarding: {
    started: number;
    sourcesSelected: number;
    detailsConfirmed: number;
    questionnaireCompleted: number;
    firstDocUploaded: number;
    filingComplete: number;
  };
  generatedAt: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authedFetch("/api/admin/stats", { method: "GET" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as AdminStats;
        setStats(body);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "טעינה נכשלה");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">סקירת מערכת</h1>
        {stats && (
          <p className="text-xs text-muted-foreground mt-1">
            עודכן: {new Date(stats.generatedAt).toLocaleString("he-IL")}
          </p>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="text-sm text-muted-foreground">טוען…</div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatsTile
              label="סך המשתמשים"
              value={stats.totalUsers.toLocaleString("he-IL")}
              icon={<UsersIcon className="w-4 h-4" />}
              sub={
                <>
                  anon: {stats.providers.anonymous} · google: {stats.providers.google} · אחר: {stats.providers.other}
                </>
              }
            />
            <StatsTile
              label="הרשמות חדשות"
              value={stats.newSignups.d30.toLocaleString("he-IL")}
              icon={<UserPlus className="w-4 h-4" />}
              sub={<>היום {stats.newSignups.today} · 7ד {stats.newSignups.d7} · 30ד {stats.newSignups.d30}</>}
            />
            <StatsTile
              label="אחסון"
              value={formatBytes(stats.storage.totalBytes)}
              icon={<HardDrive className="w-4 h-4" />}
              sub={<>{stats.storage.totalObjects.toLocaleString("he-IL")} קבצים</>}
            />
            <StatsTile
              label="העלו מסמכים"
              value={stats.onboarding.firstDocUploaded.toLocaleString("he-IL")}
              icon={<Upload className="w-4 h-4" />}
            />
            <StatsTile
              label="השלימו שאלון"
              value={stats.onboarding.questionnaireCompleted.toLocaleString("he-IL")}
              icon={<FileText className="w-4 h-4" />}
            />
            <StatsTile
              label="הגישו דוח"
              value={stats.onboarding.filingComplete.toLocaleString("he-IL")}
              icon={<CheckCircle className="w-4 h-4" />}
            />
          </div>

          <FunnelChart onboarding={stats.onboarding} />
        </>
      )}
    </div>
  );
}

function FunnelChart({ onboarding }: { onboarding: AdminStats["onboarding"] }) {
  const rows: Array<{ label: string; value: number }> = [
    { label: "התחילו", value: onboarding.started },
    { label: "בחרו מקורות", value: onboarding.sourcesSelected },
    { label: "אישרו פרטים", value: onboarding.detailsConfirmed },
    { label: "השלימו שאלון", value: onboarding.questionnaireCompleted },
    { label: "העלו מסמך", value: onboarding.firstDocUploaded },
    { label: "הגישו דוח", value: onboarding.filingComplete },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold text-foreground">משפך Onboarding</h2>
      <div className="space-y-2">
        {rows.map((r) => {
          const pct = Math.round((r.value / max) * 100);
          return (
            <div key={r.label} className="flex items-center gap-3">
              <span className="w-28 text-xs text-muted-foreground shrink-0">{r.label}</span>
              <div className="flex-1 h-6 bg-muted/50 rounded-lg overflow-hidden">
                <div
                  className="h-full bg-primary/80 rounded-lg flex items-center justify-end px-2 text-[10px] font-semibold text-primary-foreground"
                  style={{ width: `${pct}%` }}
                >
                  {r.value > 0 && r.value}
                </div>
              </div>
              <span className="w-12 text-xs tabular-nums text-foreground shrink-0 text-end">
                {r.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}
