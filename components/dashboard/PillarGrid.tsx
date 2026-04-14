"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  Baby,
  BarChart3,
  Briefcase,
  HandCoins,
  Scissors,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from "lucide-react";
import type { TaxInsight, InsightPillar } from "@/types";

function formatILS(n: number) {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
}

interface PillarMeta {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  barColor: string;
}

const PILLAR_META: Record<InsightPillar, PillarMeta> = {
  credit_points: {
    label: "נקודות זיכוי",
    subtitle: "ילדים · תואר · מצב אישי",
    icon: <Baby className="w-5 h-5" />,
    accentBg: "bg-blue-50",
    accentText: "text-blue-700",
    accentBorder: "border-blue-100",
    barColor: "bg-blue-500",
  },
  coordination: {
    label: "תיאום מס",
    subtitle: "חפיפת מעסיקים · מס שולי",
    icon: <Briefcase className="w-5 h-5" />,
    accentBg: "bg-orange-50",
    accentText: "text-orange-700",
    accentBorder: "border-orange-100",
    barColor: "bg-orange-500",
  },
  deductions: {
    label: "ניכויים וזיכויים",
    subtitle: "תרומות · ביטוח חיים · קרן פנסיה",
    icon: <HandCoins className="w-5 h-5" />,
    accentBg: "bg-violet-50",
    accentText: "text-violet-700",
    accentBorder: "border-violet-100",
    barColor: "bg-violet-500",
  },
  severance: {
    label: "אסטרטגיית פיצויים",
    subtitle: "פריסת מס · סעיף 8ג · טופס 161",
    icon: <Scissors className="w-5 h-5" />,
    accentBg: "bg-rose-50",
    accentText: "text-rose-700",
    accentBorder: "border-rose-100",
    barColor: "bg-rose-500",
  },
  capital_markets: {
    label: "שוק ההון",
    subtitle: "ברוקר זר · קיזוז מס · דיבידנדים",
    icon: <BarChart3 className="w-5 h-5" />,
    accentBg: "bg-purple-50",
    accentText: "text-purple-700",
    accentBorder: "border-purple-100",
    barColor: "bg-purple-500",
  },
};

const CATEGORY_ICON: Record<TaxInsight["category"], React.ReactNode> = {
  credit_point: <GraduationCap className="w-4 h-4" />,
  capital_markets: <BarChart3 className="w-4 h-4" />,
  deduction: <HandCoins className="w-4 h-4" />,
  employer: <Briefcase className="w-4 h-4" />,
  severance: <Scissors className="w-4 h-4" />,
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

interface PillarCardProps {
  pillar: InsightPillar;
  insights: TaxInsight[];
  totalRefund: number;
}

function PillarCard({ pillar, insights, totalRefund }: PillarCardProps) {
  const [open, setOpen] = useState(true);
  const meta = PILLAR_META[pillar];
  const pillarTotal = insights.reduce((s, i) => s + (i.value ?? 0), 0);
  const pct = totalRefund > 0 ? Math.round((pillarTotal / totalRefund) * 100) : 0;

  return (
    <motion.div
      variants={fadeUp}
      className="bg-white dark:bg-card rounded-2xl shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow duration-200 overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent-100/30 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-accent-100 text-accent-500 p-2.5">
            {meta.icon}
          </div>
          <div className="text-start">
            <p className="text-sm font-semibold text-brand-900 dark:text-white">{meta.label}</p>
            <p className="text-xs text-slate-500">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <p className="font-numeric text-sm font-bold text-brand-900 dark:text-white tabular-nums">
              {formatILS(pillarTotal)}
            </p>
            <p className="text-xs text-slate-400">{pct}% מסך ההחזר</p>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          )}
        </div>
      </button>

      {/* Progress bar */}
      <div className="px-5 pb-1">
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
          <motion.div
            className="h-1.5 rounded-full bg-gradient-to-r from-brand-900 to-brand-700"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          />
        </div>
      </div>

      {/* Insight rows */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-border">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="px-5 py-3.5 flex items-start gap-3 hover:bg-accent-100/50 dark:hover:bg-white/5 rounded-xl transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-accent-100 text-accent-500">
                    {CATEGORY_ICON[insight.category]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-brand-900 dark:text-white leading-snug">
                        {insight.title}
                      </p>
                      {insight.value !== undefined && (
                        <span className="flex-shrink-0 font-numeric text-sm font-bold text-success-500 tabular-nums">
                          {formatILS(insight.value)}
                        </span>
                      )}
                    </div>
                    {insight.year && (
                      <span className="inline-block mt-1 text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        שנת {insight.year}
                      </span>
                    )}
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      {insight.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface PillarGridProps {
  insightsByPillar: Record<InsightPillar, TaxInsight[]>;
  activePillars: InsightPillar[];
  totalRefund: number;
}

export function PillarGrid({ insightsByPillar, activePillars, totalRefund }: PillarGridProps) {
  return (
    <motion.div variants={stagger} className="lg:col-span-2 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-brand-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent-500" />
          עמודי ההחזר
        </h2>
        <span className="bg-brand-900 text-white text-xs font-medium px-2 py-0.5 rounded-full">
          {activePillars.length} עמודים
        </span>
      </div>

      {activePillars.map((pillar) => (
        <PillarCard
          key={pillar}
          pillar={pillar}
          insights={insightsByPillar[pillar]}
          totalRefund={totalRefund}
        />
      ))}
    </motion.div>
  );
}
