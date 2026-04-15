"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Lightbulb, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/appContext";
import type { TaxInsight } from "@/types";

/**
 * AdvisorNudgeRail — lightweight side column for /details.
 *
 * Scans the current taxpayer + calculationResult for obvious gaps and
 * surfaces inline "nudges" — each is either an info card or a direct link
 * to a missing-data section. The real (Phase 3) state-mutating advisor
 * tools will layer on top; this is the deterministic scaffold that the
 * Claude-backed advisor will augment with freeform suggestions.
 *
 * Deterministic rules (local, no API call):
 *  - if any required identity field is empty → nudge to upload 106
 *  - if taxpayer has no bank set → nudge to add bank
 *  - if insights exist from the engine → surface the top 2
 */
export function AdvisorNudgeRail() {
  const { state } = useApp();
  const { taxpayer, financials } = state;

  const nudges = useMemo(() => {
    const out: Array<{
      id: string;
      tone: "info" | "warn";
      title: string;
      body: string;
      cta?: { label: string; href: string };
    }> = [];

    if (!taxpayer.idNumber || !taxpayer.firstName || !taxpayer.lastName) {
      out.push({
        id: "missing-identity",
        tone: "warn",
        title: "חסרים פרטי זהות",
        body: "אפשר להעלות טופס 106 ושם ות.ז יתמלאו אוטומטית.",
        cta: { label: "חזרה להעלאת מסמכים", href: "/welcome" },
      });
    }

    if (!taxpayer.bank?.account) {
      out.push({
        id: "missing-bank",
        tone: "info",
        title: "פרטי בנק להחזר",
        body: "חשבון בנק נדרש כדי שרשות המיסים תוכל להעביר אלייך את ההחזר.",
      });
    }

    const insights: TaxInsight[] = financials.insights ?? [];
    for (const ins of insights.slice(0, 2)) {
      out.push({
        id: `ins-${ins.id}`,
        tone: "info",
        title: ins.title,
        body: ins.description,
      });
    }

    return out;
  }, [taxpayer, financials.insights]);

  if (nudges.length === 0) return null;

  return (
    <aside dir="rtl" className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
          הצעות של היועצת
        </h2>
      </div>

      {nudges.map((n, i) => (
        <motion.div
          key={n.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={
            n.tone === "warn"
              ? "rounded-2xl border border-amber-300 bg-amber-50/60 p-4 text-right"
              : "rounded-2xl border border-border bg-card p-4 text-right"
          }
        >
          <div className="flex items-start gap-2">
            {n.tone === "warn" ? (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{n.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
              {n.cta && (
                <Link
                  href={n.cta.href}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80"
                >
                  {n.cta.label}
                  <ArrowLeft className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </aside>
  );
}
