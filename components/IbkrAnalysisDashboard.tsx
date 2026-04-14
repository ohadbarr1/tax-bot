"use client";

/**
 * IbkrAnalysisDashboard
 *
 * Full-screen sub-dashboard for Interactive Brokers analysis. Rendered when
 * `state.currentView === "ibkr"`. Reads its data from global state
 * (state.financials.ibkrData) — populated by FileDropzone after a successful
 * POST /api/parse/ibkr call.
 *
 * If no IBKR data has been uploaded yet, renders a friendly empty state with
 * a redirect to the upload view.
 */

import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  ArrowRight,
  BarChart2,
  Upload,
  FileText,
} from "lucide-react";
import { useApp } from "@/lib/appContext";
import IbkrSummaryCards from "@/components/ibkr/IbkrSummaryCards";
import IbkrCharts from "@/components/ibkr/IbkrCharts";
import IbkrTaxShield from "@/components/ibkr/IbkrTaxShield";

// ─── Animation Variants ───────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

const stagger: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09 },
  },
};

// ─── Empty State ──────────────────────────────────────────────────────────────

function NoDataState({ onUpload }: { onUpload: () => void }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center justify-center gap-6 py-24 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
        <FileText className="w-8 h-8 text-purple-500" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-bold text-slate-800">
          לא נמצא דוח IBKR
        </h3>
        <p className="text-sm text-slate-500">
          העלה Activity Statement מ-Interactive Brokers (קובץ CSV) כדי לראות
          את ניתוח הרווחים, מיסים, ומחשבון מגן המס.
        </p>
      </div>
      <button
        onClick={onUpload}
        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800
                   text-white font-semibold px-6 py-3 rounded-2xl shadow-md
                   transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
      >
        <Upload className="w-4 h-4" />
        <span>העלה Activity Statement</span>
      </button>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IbkrAnalysisDashboard() {
  const { state, setView } = useApp();
  const data = state.financials.ibkrData;

  return (
    <div
      className="max-w-5xl mx-auto px-4 sm:px-6 py-8"
      dir="rtl"
    >
      {/* ── Top navigation bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        {/* Back button */}
        <button
          onClick={() => setView("dashboard")}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground
                     hover:text-foreground bg-card border border-border
                     hover:border-muted-foreground/40 px-4 py-2.5 rounded-xl shadow-sm
                     transition-all duration-150 hover:shadow"
        >
          {/* In RTL layout, "back" arrow points right */}
          <ArrowRight className="w-4 h-4" />
          <span>חזור ללוח הבקרה הראשי</span>
        </button>

        {/* Header identity */}
        <div className="flex items-center gap-3">
          <div className="text-end">
            <h1 className="text-lg font-bold text-slate-900">
              ניתוח ברוקר זר מתקדם
            </h1>
            <p className="text-xs text-slate-500">
              Interactive Brokers · שנת מס {state.financials.taxYears[0] ?? 2024}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-5 h-5 text-purple-600" />
          </div>
        </div>
      </div>

      {/* ── Content: empty state OR full dashboard ─────────────────────────── */}
      <AnimatePresence mode="wait">
        {!data ? (
          <NoDataState key="empty" onUpload={() => setView("upload")} />
        ) : (
          <motion.div
            key="dashboard"
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-6"
          >
            {/* Row 1 — Summary metric cards */}
            <motion.div variants={fadeUp}>
              <IbkrSummaryCards
                totalProfitUSD={data.totalProfitUSD}
                totalLossUSD={data.totalLossUSD}
                dividendsUSD={data.dividendsUSD}
                foreignTaxUSD={data.foreignTaxUSD}
                exchangeRate={data.exchangeRate}
              />
            </motion.div>

            {/* Row 2 — Recharts visualisations */}
            <motion.div variants={fadeUp}>
              <IbkrCharts
                totalProfitUSD={data.totalProfitUSD}
                totalLossUSD={data.totalLossUSD}
                dividendsUSD={data.dividendsUSD}
                foreignTaxUSD={data.foreignTaxUSD}
                exchangeRate={data.exchangeRate}
              />
            </motion.div>

            {/* Row 3 — Interactive Tax Shield calculator */}
            <motion.div variants={fadeUp}>
              <IbkrTaxShield
                parsedProfit={data.totalProfitUSD}
                parsedLoss={data.totalLossUSD}
                parsedDividends={data.dividendsUSD}
                parsedForeignTax={data.foreignTaxUSD}
                exchangeRate={data.exchangeRate}
              />
            </motion.div>

            {/* Footer action */}
            <motion.div
              variants={fadeUp}
              className="flex justify-end pt-2"
            >
              <button
                onClick={() => setView("dashboard")}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 active:bg-black
                           text-white font-semibold px-6 py-3 rounded-2xl shadow-md
                           transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
              >
                <ArrowRight className="w-4 h-4" />
                <span>חזור ללוח הבקרה הראשי</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
