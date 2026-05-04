"use client";

/**
 * /status — public, unauthenticated status page.
 *
 * Phase 2 §2.F. Polls /api/health and renders the SLO snapshot + commit + ts.
 * Static-rendered shell; client-side fetch keeps it dynamic without server cost.
 *
 * For higher-fidelity status (incident history, post-mortems), promote to a
 * managed page (statuspage.io / instatus). This MVP is "is it up + what are
 * we measuring + is it filing season" — enough for Phase 2 sign-off.
 */

import { useEffect, useState } from "react";

interface Slo {
  id: string;
  label: string;
  target: number;
  unit: "ratio" | "ms";
  window: string;
  severity: "critical" | "warning";
}

interface HealthSnapshot {
  status: string;
  commit?: string;
  ts: number;
  slo: {
    filing_season: boolean;
    availability_target: number;
    slos: Slo[];
  };
}

function formatTarget(s: Slo): string {
  if (s.unit === "ratio") return `${(s.target * 100).toFixed(2)}%`;
  return `${s.target.toLocaleString()} ms`;
}

export default function StatusPage() {
  const [data, setData] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = (await r.json()) as HealthSnapshot;
        if (!cancelled) {
          setData(j);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }
    void pull();
    const id = window.setInterval(pull, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-kc-ink">סטטוס המערכת</h1>
        <p className="mt-2 text-sm text-slate-500">
          רענון אוטומטי כל 30 שניות. נתונים נמשכים מ-/api/health.
        </p>
      </header>

      {error && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          לא ניתן לקבל סטטוס כרגע: <code className="font-mono">{error}</code>
        </section>
      )}

      {data && (
        <>
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700">סטטוס נוכחי</div>
                <div className="text-lg font-semibold text-emerald-800">
                  {data.status === "ok" ? "פעיל" : data.status}
                </div>
              </div>
              <div className="text-xs text-emerald-700 text-left">
                {new Date(data.ts).toLocaleString("he-IL")}
                {data.commit && (
                  <div className="font-mono text-emerald-600">{data.commit.slice(0, 7)}</div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-kc-ink">יעדי SLO</h2>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  data.slo.filing_season
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {data.slo.filing_season ? "עונת ההגשות (יעדים מוקשחים)" : "מחוץ לעונת ההגשות"}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {data.slo.slos.map((s) => (
                <li key={s.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-kc-ink">{s.label}</div>
                    <div className="text-xs text-slate-500">{s.window}</div>
                  </div>
                  <div className="font-mono text-slate-700">{formatTarget(s)}</div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
