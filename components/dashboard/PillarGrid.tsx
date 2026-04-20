"use client";

import {
  Baby, BarChart3, Briefcase, HandCoins, Scissors, ArrowLeft,
} from "lucide-react";
import type { TaxInsight, InsightPillar } from "@/types";

function formatILS(n: number) {
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

const PILLAR_META: Record<InsightPillar, {
  label: string;
  icon: React.ReactNode;
  bg: string;
  accent: string;
}> = {
  credit_points: {
    label: "נקודות זיכוי",
    icon: <Baby className="w-[22px] h-[22px]" />,
    bg: "var(--kc-grape-soft)",
    accent: "var(--kc-grape)",
  },
  coordination: {
    label: "תיאום מס",
    icon: <Briefcase className="w-[22px] h-[22px]" />,
    bg: "var(--kc-peach-soft)",
    accent: "var(--kc-peach)",
  },
  deductions: {
    label: "ניכויים וזיכויים",
    icon: <HandCoins className="w-[22px] h-[22px]" />,
    bg: "var(--kc-coral-soft)",
    accent: "var(--kc-coral)",
  },
  severance: {
    label: "פיצויים",
    icon: <Scissors className="w-[22px] h-[22px]" />,
    bg: "var(--kc-sky-soft)",
    accent: "var(--kc-sky)",
  },
  capital_markets: {
    label: "שוק ההון",
    icon: <BarChart3 className="w-[22px] h-[22px]" />,
    bg: "var(--kc-lime-soft)",
    accent: "var(--kc-lime-dark)",
  },
};

interface Props {
  insightsByPillar: Record<InsightPillar, TaxInsight[]>;
  activePillars: InsightPillar[];
  totalRefund: number;
}

export function PillarGrid({ insightsByPillar, activePillars, totalRefund }: Props) {
  const covered = activePillars.reduce(
    (s, p) => s + insightsByPillar[p].reduce((a, i) => a + (i.value ?? 0), 0),
    0
  );
  return (
    <section>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <div
            className="font-extrabold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-figtree)", fontSize: 28, color: "var(--kc-ink)" }}
          >
            מאיפה החזר?
          </div>
          <div className="text-[14px] mt-1" style={{ color: "var(--kc-ink-dim)" }}>
            {activePillars.length} מקורות שזוהו אצלך · {formatILS(covered)} מתוך {formatILS(totalRefund)}
          </div>
        </div>
        <button
          className="flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--kc-ink)" }}
        >
          הצג הכל <ArrowLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {activePillars.map((p) => {
          const meta = PILLAR_META[p];
          const insights = insightsByPillar[p];
          const amount = insights.reduce((s, i) => s + (i.value ?? 0), 0);
          const top = insights[0];
          return (
            <div
              key={p}
              className="relative overflow-hidden p-[18px] flex flex-col gap-3.5 cursor-pointer transition-all duration-[220ms] hover:-translate-y-[3px]"
              style={{
                background: "var(--kc-card)",
                borderRadius: 22,
                border: "1px solid var(--kc-rule)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 12px 30px rgba(26,26,31,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <div
                className="w-[46px] h-[46px] rounded-[14px] grid place-items-center"
                style={{ background: meta.bg, color: meta.accent }}
              >
                {meta.icon}
              </div>
              <div className="text-[13px] font-medium" style={{ color: "var(--kc-ink-dim)" }}>
                {meta.label}
              </div>
              <div
                className="font-extrabold tracking-[-0.02em] leading-none tabular-nums whitespace-nowrap"
                style={{ fontFamily: "var(--font-figtree)", fontSize: 24, color: "var(--kc-ink)" }}
              >
                {formatILS(amount)}
              </div>
              <div
                className="self-start text-[11.5px] font-semibold rounded-full"
                style={{
                  background: meta.bg,
                  color: meta.accent,
                  padding: "4px 9px",
                }}
              >
                {insights.length} תובנות
              </div>
              {top && (
                <div className="text-[12px] leading-[1.5]" style={{ color: "var(--kc-ink-dim)" }}>
                  {top.title}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
