"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Sparkles } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { cn } from "@/lib/utils";

/**
 * LiveRefundCounter — header pill that ticks upward as documents are mined.
 *
 * The tax engine recalculates inside applyMiningResult, so every successful
 * mining pass bumps `state.financials.estimatedRefund`. We smoothly animate
 * the integer from the previous value to the new one and flash a "+₪N" diff
 * so the user feels the causal loop between upload and refund growth.
 *
 * Intentionally compact — sits above the onboarding panels, not a full hero.
 */
export function LiveRefundCounter() {
  const { state } = useApp();
  const target = Math.max(0, Math.round(state.financials?.estimatedRefund ?? 0));

  const [displayed, setDisplayed] = useState(target);
  const [diff, setDiff] = useState(0);
  const prevRef = useRef(target);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === target) return;
    const delta = target - prev;
    prevRef.current = target;
    setDiff(delta);

    // Tween the displayed integer over ~800ms
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(prev + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const clearDiff = setTimeout(() => setDiff(0), 1800);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(clearDiff);
    };
  }, [target]);

  const hasValue = displayed > 0;

  return (
    <div
      dir="rtl"
      className={cn(
        "mx-auto mb-6 max-w-md rounded-2xl border-2 px-5 py-3 flex items-center gap-3",
        hasValue
          ? "border-emerald-300 bg-emerald-50/80 text-emerald-900"
          : "border-dashed border-border bg-muted/40 text-muted-foreground"
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
          hasValue ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
        )}
      >
        {hasValue ? <TrendingUp className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
          החזר צפוי
        </p>
        <p className="text-xl font-bold tabular-nums leading-tight">
          ₪{displayed.toLocaleString("he-IL")}
        </p>
      </div>
      {diff > 0 && (
        <motion.div
          key={diff}
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          className="text-xs font-bold text-emerald-700 bg-white/70 rounded-full px-2 py-1 shrink-0"
        >
          +₪{diff.toLocaleString("he-IL")}
        </motion.div>
      )}
    </div>
  );
}
