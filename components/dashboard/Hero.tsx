"use client";

import { motion } from "framer-motion";
import { Sparkles, AlertCircle, Scissors, ArrowLeft } from "lucide-react";
import type { TaxPayer, FinancialData } from "@/types";

function formatILS(n: number) {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

interface HeroProps {
  financials: FinancialData;
  taxpayer: TaxPayer;
  hasOverlap: boolean;
  completedActions: number;
  totalActions: number;
  pendingActions: number;
  onUpload: () => void;
  onQuestionnaire: () => void;
}

export function Hero({
  financials,
  taxpayer,
  hasOverlap,
  completedActions,
  totalActions,
  pendingActions,
  onUpload,
  onQuestionnaire,
}: HeroProps) {
  return (
    <motion.div variants={fadeUp}>
      {/* Hero card */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-900 text-white p-8 md:p-10 shadow-[var(--shadow-card)]">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          {/* Refund amount */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-white/60" />
              <span className="text-white/70 text-sm font-medium">
                החזר מס משוער
              </span>
            </div>
            <div className="font-numeric text-5xl md:text-6xl font-bold text-accent-500 tabular-nums tracking-tight">
              {formatILS(financials.estimatedRefund)}
            </div>
            <p className="mt-1.5 text-white/60 text-xs">
              לשנת המס {financials.taxYears[financials.taxYears.length - 1]} ·{" "}
              {taxpayer.fullName.split(" - ")[1]}
            </p>

            {/* Breakdown chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {taxpayer.employers.length > 0 && (
                <span className="rounded-full bg-white/10 text-white/80 text-xs px-3 py-1">
                  מעסיק
                </span>
              )}
              {financials.hasForeignBroker && (
                <span className="rounded-full bg-white/10 text-white/80 text-xs px-3 py-1">
                  שוק הון
                </span>
              )}
              {taxpayer.personalDeductions.length > 0 && (
                <span className="rounded-full bg-white/10 text-white/80 text-xs px-3 py-1">
                  ניכויים
                </span>
              )}
              {taxpayer.degrees.length > 0 && (
                <span className="rounded-full bg-white/10 text-white/80 text-xs px-3 py-1">
                  נקודות זיכוי
                </span>
              )}
            </div>

            {/* Overlap warning */}
            {hasOverlap && (
              <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/30 text-amber-100 text-xs font-medium px-3 py-1.5 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                חפיפת מעסיקים ללא תיאום מס — נדרשת בדיקה
              </div>
            )}

            {/* Severance warning */}
            {taxpayer.lifeEvents?.pulledSeverancePay && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/30 text-amber-100 text-xs font-medium px-3 py-1.5 rounded-xl">
                <Scissors className="w-3.5 h-3.5 flex-shrink-0" />
                פיצויים חייבים — מומלץ פריסת מס (סעיף 8ג)
              </div>
            )}
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-2.5 min-w-[210px]">
            {[
              {
                label: "שנות מס",
                value: financials.taxYears.length,
                sub: financials.taxYears.join(", "),
              },
              {
                label: "מעסיקים",
                value: taxpayer.employers.length,
                sub: hasOverlap ? "חפיפה זוהתה" : "ללא חפיפה",
                alert: hasOverlap,
              },
              {
                label: "ניכויים",
                value: taxpayer.personalDeductions.length,
                sub: "סעיפים 45א, 46",
              },
              {
                label: "השלמות",
                value: `${completedActions}/${totalActions}`,
                sub: `${pendingActions} ממתינות`,
                alert: pendingActions > 0,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-xl p-3 border ${
                  kpi.alert
                    ? "bg-amber-400/15 border-amber-400/25"
                    : "bg-white/10 border-white/10"
                }`}
              >
                <p className="text-[10px] text-white/50 leading-tight">{kpi.label}</p>
                <p
                  className={`text-xl font-bold leading-tight ${
                    kpi.alert ? "text-amber-300" : "text-white"
                  }`}
                >
                  {kpi.value}
                </p>
                <p className="text-[10px] text-white/40">{kpi.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA row */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-2">
          <button
            onClick={onUpload}
            className="flex items-center gap-2 bg-accent-500 hover:bg-amber-400 transition-colors text-ink-950 text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            המשך להעלאת מסמכים
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onQuestionnaire}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors text-white text-sm font-medium px-5 py-2.5 rounded-xl"
          >
            ערוך שאלון
          </button>
        </div>
      </div>
    </motion.div>
  );
}
