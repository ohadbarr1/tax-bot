"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { LineChart, ArrowRight, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { employersOverlap } from "@/lib/utils";
import type { InsightPillar, TaxInsight } from "@/types";
import { Hero } from "./Hero";
import { PillarGrid } from "./PillarGrid";
import { ActionItems } from "./ActionItems";
import { InsightsList } from "./InsightsList";
import { Optimizer } from "@/components/Optimizer";
import { WhatIfSimulator } from "@/components/WhatIfSimulator";
import { YoYCompare } from "@/components/YoYCompare";
import { DeferredDocReminderBanner } from "@/components/DeferredDocReminderBanner";

const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const PILLAR_ORDER: InsightPillar[] = [
  "coordination",
  "deductions",
  "severance",
  "credit_points",
  "capital_markets",
];

export default function Dashboard() {
  const { state, setView, updateFinancials } = useApp();
  const { financials, taxpayer } = state;
  const router = useRouter();

  const insightsByPillar = PILLAR_ORDER.reduce<Record<InsightPillar, TaxInsight[]>>(
    (acc, p) => {
      acc[p] = financials.insights.filter((i) => i.pillar === p);
      return acc;
    },
    {} as Record<InsightPillar, TaxInsight[]>
  );

  const activePillars = PILLAR_ORDER.filter((p) => insightsByPillar[p].length > 0);
  const completedActions = financials.actionItems.filter((a) => a.completed).length;
  const totalActions = financials.actionItems.length;
  const pendingActions = totalActions - completedActions;
  const hasOverlap = employersOverlap(taxpayer.employers);

  const salaryEmployers = taxpayer.employers.filter(
    (e) => typeof e.grossSalary === "number" && e.grossSalary > 0
  );
  const totalGross = salaryEmployers.reduce((s, e) => s + (e.grossSalary ?? 0), 0);
  const totalWithheld = salaryEmployers.reduce((s, e) => s + (e.taxWithheld ?? 0), 0);
  const hasSalaryData = salaryEmployers.length > 0;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8"
    >
      {/* Deferred-doc reminder — only renders when there's something due */}
      <DeferredDocReminderBanner />

      {/* Hero */}
      <Hero
        financials={financials}
        taxpayer={taxpayer}
        hasOverlap={hasOverlap}
        completedActions={completedActions}
        totalActions={totalActions}
        pendingActions={pendingActions}
        onUpload={() => setView("upload")}
        onQuestionnaire={() => router.push("/questionnaire")}
      />

      {/* IBKR Advanced Analysis Card */}
      {(financials.hasForeignBroker || !!financials.ibkrData) && (
        <motion.div variants={fadeUp}>
          <button
            onClick={() => setView("ibkr")}
            className="w-full group text-start bg-white dark:bg-card rounded-2xl border border-purple-200 dark:border-purple-900/50
                       hover:border-purple-400 dark:hover:border-purple-700 hover:shadow-md transition-all duration-200 p-5"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/30 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50
                                flex items-center justify-center flex-shrink-0 transition-colors">
                  <LineChart className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                {/* Text */}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      ניתוח ברוקר זר מתקדם
                    </p>
                    {financials.ibkrData ? (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                        נתונים נטענו ✓
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        Interactive Brokers
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {financials.ibkrData
                      ? `רווח: $${financials.ibkrData.totalProfitUSD.toLocaleString()} · הפסד: $${financials.ibkrData.totalLossUSD.toLocaleString()} · מחשבון מגן מס אינטראקטיבי`
                      : "ניתוח רווחי הון · קיזוז הפסדים · מחשבון מגן מס (Tax Shield)"}
                  </p>
                </div>
              </div>
              {/* Arrow */}
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/30 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50
                              flex items-center justify-center transition-colors">
                <ArrowRight className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </button>
        </motion.div>
      )}

      {/* Income Tax Analysis Card — Form 106 aggregated view, placed directly below IBKR */}
      {hasSalaryData && (
        <motion.div variants={fadeUp}>
          <button
            onClick={() => router.push("/income-tax")}
            className="w-full group text-start bg-white dark:bg-card rounded-2xl border border-amber-200 dark:border-amber-900/50
                       hover:border-amber-400 dark:hover:border-amber-700 hover:shadow-md transition-all duration-200 p-5"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50
                                flex items-center justify-center flex-shrink-0 transition-colors">
                  <ReceiptText className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      ניתוח מס הכנסה
                    </p>
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      {salaryEmployers.length} מעסיק{salaryEmployers.length > 1 ? "ים" : ""} ✓
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {`ברוטו: ₪${totalGross.toLocaleString("he-IL")} · מס שנוכה: ₪${totalWithheld.toLocaleString("he-IL")} · מדרגות מס ושיעור אפקטיבי`}
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/30 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/50
                              flex items-center justify-center transition-colors">
                <ArrowRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </button>
        </motion.div>
      )}

      {/* Main grid: Pillars + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pillars of Refund */}
        <PillarGrid
          insightsByPillar={insightsByPillar}
          activePillars={activePillars}
          totalRefund={financials.estimatedRefund}
        />

        {/* Right: Action items + Profile + Deductions + FilingKit */}
        <div className="space-y-5">
          <ActionItems
            financials={financials}
            completedActions={completedActions}
            totalActions={totalActions}
            pendingActions={pendingActions}
            updateFinancials={updateFinancials}
          />
          <Optimizer />
          <InsightsList
            taxpayer={taxpayer}
            financials={financials}
            hasOverlap={hasOverlap}
          />
        </div>
      </div>

      {/* Smart tools row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WhatIfSimulator />
        <YoYCompare />
      </div>
    </motion.div>
  );
}
